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
