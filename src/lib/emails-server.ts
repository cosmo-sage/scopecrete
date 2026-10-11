import type { ApiSession } from "@/lib/api-auth";

/**
 * The email mirror's server side (migration 061): the columns the app reads,
 * and names for an email's customer, contact, job and suggestion. Session
 * client, org filter explicit; RLS is the enforcement.
 */

type Sb = ApiSession["supabase"];
export const EMAIL_COLS = "id, inbox, from_address, from_name, original_from_address, original_from_name, subject, sent_at, created_at, customer_id, contact_id, job_id, suggested_customer_id, match, match_note, status, filed_at";

export async function emailView(sb: Sb, orgId: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const custIds = [...new Set(rows.flatMap((r) => [r.customer_id, r.suggested_customer_id]).filter(Boolean) as string[])];
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean) as string[])];
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean) as string[])];
  const [{ data: atts }, { data: custs }, { data: jobs }, { data: contacts }] = await Promise.all([
    sb.from("email_attachments").select("email_id, fetch_state").eq("org_id", orgId).in("email_id", ids),
    custIds.length ? sb.from("customers").select("id, name").eq("org_id", orgId).in("id", custIds) : Promise.resolve({ data: [] }),
    jobIds.length ? sb.from("jobs").select("id, title").eq("org_id", orgId).in("id", jobIds) : Promise.resolve({ data: [] }),
    contactIds.length ? sb.from("contacts").select("id, name").eq("org_id", orgId).in("id", contactIds) : Promise.resolve({ data: [] }),
  ]);
  const name = (list: unknown, id: unknown, key = "name") => ((list ?? []) as Array<Record<string, unknown>>).find((x) => x.id === id)?.[key] as string | undefined ?? null;
  return rows.map((r) => {
    const mine = ((atts ?? []) as Array<{ email_id: string; fetch_state: string }>).filter((a) => a.email_id === r.id);
    return {
      ...r,
      customer_name: name(custs, r.customer_id), suggested_customer_name: name(custs, r.suggested_customer_id),
      job_title: name(jobs, r.job_id, "title"), contact_name: name(contacts, r.contact_id),
      attachments: { total: mine.filter((a) => a.fetch_state !== "skipped").length, fetched: mine.filter((a) => a.fetch_state === "fetched").length,
        held: mine.filter((a) => a.fetch_state === "held").length, failed: mine.filter((a) => a.fetch_state === "failed").length },
    } as unknown as Record<string, unknown> & { status: string };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface FilingRow { id: string; customer_id: string | null; contact_id: string | null; job_id: string | null; suggested_customer_id: string | null; status: string }

/**
 * Coy's filing of one email (match 'coy'): `{customer_id?, contact_id?,
 * job_id?, accept_suggestion?}`. Filed on a customer with no person (or a
 * person from another customer), it goes on the customer's primary person, so
 * it shows in their Email channel. A job brings its customer when none is
 * named. The email's files follow it — onto the job (PDFs into the Plan
 * Room), the contact and the customer. All three null puts it back to
 * unfiled. Every id is checked against the org. Used by PATCH
 * /api/emails/[id] and, for each message of a conversation, by PATCH
 * /api/emails/threads/[key].
 */
export async function fileEmail(sb: Sb, orgId: string, userId: string, e: FilingRow, b: Record<string, unknown>):
  Promise<{ ok: true; filed: boolean } | { ok: false; error: string; status: number }> {
  const bad = (error: string, status = 400) => ({ ok: false as const, error, status });
  const idOrNull = (v: unknown, what: string): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    if (typeof v !== "string" || !UUID.test(v)) throw new Error(`Bad ${what}.`);
    return v;
  };
  let customer: string | null | undefined, contact: string | null | undefined, job: string | null | undefined;
  try {
    customer = b.accept_suggestion === true ? e.suggested_customer_id : idOrNull(b.customer_id, "customer");
    contact = idOrNull(b.contact_id, "contact");
    job = idOrNull(b.job_id, "job");
  } catch (err) { return bad((err as Error).message); }
  if (b.accept_suggestion === true && !customer) return bad("There is no suggestion to take.");

  if (customer) {
    const { data } = await sb.from("customers").select("id, primary_contact_id").eq("org_id", orgId).eq("id", customer).maybeSingle();
    if (!data) return bad("No such customer.");
    // No person named: the customer's primary person, unless the one it's on already belongs to this customer.
    if (contact === undefined && data.primary_contact_id) {
      let keep = false;
      if (e.contact_id) { const { data: cur } = await sb.from("contacts").select("customer_id").eq("org_id", orgId).eq("id", e.contact_id).maybeSingle(); keep = cur?.customer_id === customer; }
      if (!keep) contact = data.primary_contact_id as string;
    }
  }
  if (contact) {
    const { data } = await sb.from("contacts").select("id, customer_id").eq("org_id", orgId).eq("id", contact).maybeSingle();
    if (!data) return bad("No such contact.");
    if (customer === undefined) customer = (data.customer_id as string | null) ?? null;
  }
  if (job) {
    const { data } = await sb.from("jobs").select("id, customer_id, contact_id").eq("org_id", orgId).eq("id", job).maybeSingle();
    if (!data) return bad("No such job.");
    if (customer === undefined && !e.customer_id) customer = (data.customer_id as string | null) ?? null;
  }

  const next = {
    customer_id: customer === undefined ? e.customer_id : customer,
    contact_id: contact === undefined ? e.contact_id : contact,
    job_id: job === undefined ? e.job_id : job,
  };
  const filed = !!(next.customer_id || next.job_id || next.contact_id);
  const { error } = await sb.from("emails").update({
    ...next, match: filed ? "coy" : "none", status: filed ? "filed" : "unfiled",
    filed_at: filed ? new Date().toISOString() : null, filed_by: filed ? userId : null,
  }).eq("id", e.id).eq("org_id", orgId);
  if (error) return bad(error.message, 500);

  const { data: files } = await sb.from("files").select("id, kind").eq("org_id", orgId).eq("email_id", e.id).is("deleted_at", null);
  for (const f of (files ?? []) as Array<{ id: string; kind: string }>) {
    await sb.from("files").update({
      job_id: next.job_id, contact_id: next.contact_id, customer_id: next.customer_id,
      ...(next.job_id && f.kind === "pdf" ? { in_plan_room: true } : {}),
    }).eq("id", f.id).eq("org_id", orgId);
  }
  return { ok: true, filed };
}
