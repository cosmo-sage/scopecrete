import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";
import { fileEmail, type FilingRow } from "@/lib/emails-server";
import { conversationsOf, loadMailBox, mailNames, agentMailConfigured } from "@/lib/mail-server";
import { signatureOf } from "@/lib/email-client";
import { myOrgs } from "@/lib/access-server";

/**
 * One email conversation (migration 100).
 *
 * GET → { conversation (folder facts and names), messages (oldest first, each
 *   with its text and files — inline signature images left out, as the mirror
 *   always did), state (Dusty's read, archived, FYI), filing { customer,
 *   contact, job, suggested, note, person_emails }, options { customers,
 *   jobs }, inboxes, ours, signature, can_send }. Opening it marks it read.
 * PATCH { customer_id?, contact_id?, job_id?, accept_suggestion? } — file every
 *   message on it (the same rules as one email's filing);
 *   { archive: bool } · { fyi: bool } · { read: bool }.
 *
 * Session client; org from the session; every id checked against the org.
 */

export const dynamic = "force-dynamic";
const KEY = /^[A-Za-z0-9._:@<>+-]{1,200}$/;

async function stateRow(sb: Parameters<typeof loadMailBox>[0], orgId: string, key: string, patch: Record<string, unknown>) {
  return sb.from("email_conversations").upsert({ org_id: orgId, conversation: key, ...patch, updated_at: new Date().toISOString() }, { onConflict: "org_id,conversation" });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await ctx.params).key);
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const json = (b: unknown, status = 200) => applyCookies(NextResponse.json(b, { status }));
  if (!KEY.test(key)) return json({ error: "No such conversation." }, 404);
  try {
    const box = await loadMailBox(supabase, orgId, { conversation: key });
    if (!box.ready) return json({ error: "Email conversations switch on with migration 100." }, 409);
    if (!box.rows.length) return json({ error: "No such conversation." }, 404);
    const [conv] = conversationsOf(box);
    const ids = box.rows.map((r) => r.id);
    const sentFileIds = [...new Set(box.rows.flatMap((r) => (r.file_ids as string[] | null) ?? []))];
    const [names, { data: atts }, { data: files }, { data: sentFiles }, { data: custs }, { data: vends }, { data: jobs }, { data: st }, { data: drafts }, user, orgs] = await Promise.all([
      mailNames(supabase, orgId, [conv]),
      supabase.from("email_attachments").select("id, email_id, name, mime_type, byte_size, inline, file_id, fetch_state, fetch_error").eq("org_id", orgId).in("email_id", ids).order("created_at"),
      supabase.from("files").select(`${FILE_COLUMNS}, email_id`).eq("org_id", orgId).in("email_id", ids).is("deleted_at", null),
      sentFileIds.length ? supabase.from("files").select(FILE_COLUMNS).eq("org_id", orgId).in("id", sentFileIds) : Promise.resolve({ data: [] }),
      supabase.from("customers").select("id, name").eq("org_id", orgId).is("merged_into_customer_id", null).is("archived_at", null).not("name", "is", null).order("name").limit(500),
      supabase.from("contacts").select("id, name, company_name").eq("org_id", orgId).eq("contact_type", "vendor").is("merged_into_contact_id", null).is("archived_at", null).order("name").limit(500),
      supabase.from("jobs").select("id, title, customer_id, status").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(300),
      supabase.from("email_conversations").select("conversation, summary, asks, triage, read_for, read_by_dusty_at, archived_at, last_read_at").eq("org_id", orgId).eq("conversation", key).maybeSingle(),
      supabase.from("email_drafts").select("id, mode, to_addresses, cc_addresses, subject, body, file_ids, by, reply_to_email_id, updated_at").eq("org_id", orgId).eq("conversation", key).order("updated_at", { ascending: false }),
      supabase.auth.getUser(),
      myOrgs(supabase),
    ]);
    const signed = await signFiles(supabase, [...(files ?? []), ...(sentFiles ?? [])] as Array<Record<string, unknown>>) as Array<Record<string, unknown>>;
    const fileById = new Map(signed.map((f) => [f.id as string, f]));
    const messages = box.rows.map((r) => ({
      ...r,
      attachments: ((atts ?? []) as Array<Record<string, unknown>>).filter((a) => a.email_id === r.id && a.fetch_state !== "skipped")
        .map((a) => ({ ...a, file: a.file_id ? fileById.get(a.file_id as string) ?? null : null })),
      sent_files: ((r.file_ids as string[] | null) ?? []).map((id) => fileById.get(id)).filter(Boolean),
    }));

    // The person it's filed on: their addresses, so the strip can say whether the writer's is on them.
    let personEmails: string[] = [];
    if (conv.contact_id) {
      const [{ data: ce }, { data: pc }] = await Promise.all([
        supabase.from("contact_emails").select("email").eq("org_id", orgId).eq("contact_id", conv.contact_id),
        supabase.from("contacts").select("email").eq("org_id", orgId).eq("id", conv.contact_id).maybeSingle(),
      ]);
      personEmails = [...new Set([...((ce ?? []) as Array<{ email: string }>).map((x) => String(x.email).toLowerCase()), ...(pc?.email ? [String(pc.email).toLowerCase()] : [])])];
    }
    const latestIn = [...box.rows].reverse().find((r) => r.direction !== "out");
    const suggested = latestIn?.suggested_customer_id as string | null | undefined;
    const suggestedName = suggested ? ((custs ?? []) as Array<{ id: string; name: string }>).find((c) => c.id === suggested)?.name ?? null : null;
    const meta = (user.data.user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
    const orgName = orgs.find((o) => o.id === orgId)?.name ?? null;

    // Opening it reads it.
    if (conv.unread) await stateRow(supabase, orgId, key, { last_read_at: new Date().toISOString() });

    return json({
      conversation: {
        ...conv, unread: false,
        customer_name: conv.customer_id ? names.customers.get(conv.customer_id) ?? null : null,
        job_title: conv.job_id ? names.jobs.get(conv.job_id) ?? null : null,
        contact_name: conv.contact_id ? names.people.get(conv.contact_id) ?? null : null,
      },
      messages,
      state: st ?? null,
      filing: {
        match: latestIn?.match ?? null, note: latestIn?.match_note ?? null,
        suggested_customer_id: suggested ?? null, suggested_customer_name: suggestedName, person_emails: personEmails,
      },
      options: {
        customers: custs ?? [], jobs: jobs ?? [],
        vendors: ((vends ?? []) as Array<{ id: string; name: string | null; company_name: string | null }>)
          .map((v) => ({ id: v.id, name: v.company_name?.trim() || v.name?.trim() || "" })).filter((v) => v.name),
      },
      drafts: drafts ?? [],
      inboxes: box.inboxes, ours: box.ours,
      signature: signatureOf({ name: meta.full_name ?? null, org: orgName, phone: meta.phone ?? null }),
      can_send: agentMailConfigured(),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await ctx.params).key);
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const json = (b: unknown, status = 200) => applyCookies(NextResponse.json(b, { status }));
  if (!KEY.test(key)) return json({ error: "No such conversation." }, 404);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return json({ error: "Body must be JSON." }, 400);
  const { data: rows, error } = await supabase.from("emails").select("id, customer_id, contact_id, job_id, suggested_customer_id, status")
    .eq("org_id", orgId).eq("conversation", key).order("created_at");
  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ error: "No such conversation." }, 404);
  const now = new Date().toISOString();

  if (typeof b.archive === "boolean") {
    const { error: e } = await stateRow(supabase, orgId, key, b.archive ? { archived_at: now, archived_by: userId } : { archived_at: null, archived_by: null });
    if (e) return json({ error: e.message }, 500);
  }
  if (typeof b.fyi === "boolean") {
    const { error: e } = await stateRow(supabase, orgId, key, { triage: b.fyi ? "fyi" : "reply" });
    if (e) return json({ error: e.message }, 500);
  }
  if (typeof b.read === "boolean") {
    const { error: e } = await stateRow(supabase, orgId, key, { last_read_at: b.read ? now : null });
    if (e) return json({ error: e.message }, 500);
  }
  if ("customer_id" in b || "contact_id" in b || "job_id" in b || b.accept_suggestion === true) {
    // Only the filing keys go on; an accepted suggestion comes off the newest message that carries one.
    const filing: Record<string, unknown> = {};
    for (const k of ["customer_id", "contact_id", "job_id"]) if (k in b) filing[k] = b[k];
    if (b.accept_suggestion === true) {
      const sug = [...rows].reverse().find((r) => r.suggested_customer_id)?.suggested_customer_id;
      if (!sug) return json({ error: "There is no suggestion to take." }, 400);
      filing.customer_id = sug;
    }
    for (const r of rows as FilingRow[]) {
      const done = await fileEmail(supabase, orgId, userId, r, filing);
      if (!done.ok) return json({ error: done.error }, done.status);
    }
  }
  return json({ ok: true });
}
