import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Email drafts (migration 100) — what's being written, shared with the org.
 * Nothing in a draft is ever sent on its own: Send is POST /api/emails/send.
 *
 * POST { id?, mode, conversation?, reply_to_email_id?, to[], cc[], subject,
 *        body, file_ids[], by?: 'coy'|'dusty', customer_id?, contact_id?, job_id? }
 *   → { draft } — a new draft, or the one named by `id` saved over.
 *
 * Session client; org from the session; the table's guard checks every id.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, conversation, reply_to_email_id, mode, to_addresses, cc_addresses, subject, body, file_ids, by, contact_id, customer_id, job_id, updated_at";

const addrs = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 20);
const idOrNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Body must be JSON.");
  const mode = ["new", "reply", "reply_all", "forward"].includes(b.mode as string) ? (b.mode as string) : "new";
  const row = {
    org_id: orgId, mode,
    conversation: typeof b.conversation === "string" && /^[A-Za-z0-9._:@<>+-]{1,200}$/.test(b.conversation) ? b.conversation : null,
    reply_to_email_id: idOrNull(b.reply_to_email_id),
    to_addresses: addrs(b.to), cc_addresses: addrs(b.cc),
    subject: typeof b.subject === "string" ? b.subject.slice(0, 300) : null,
    body: typeof b.body === "string" ? b.body.slice(0, 50_000) : null,
    file_ids: (Array.isArray(b.file_ids) ? b.file_ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 10),
    by: b.by === "dusty" ? "dusty" : "coy",
    customer_id: idOrNull(b.customer_id), contact_id: idOrNull(b.contact_id), job_id: idOrNull(b.job_id),
  };
  if (!row.body?.trim() && !row.subject?.trim() && !row.to_addresses.length) return bad("Nothing to save yet.");
  const id = idOrNull(b.id);
  const q = id
    ? supabase.from("email_drafts").update(row).eq("org_id", orgId).eq("id", id).select(COLS).maybeSingle()
    : supabase.from("email_drafts").insert({ ...row, created_by: userId }).select(COLS).single();
  const { data, error } = await q;
  if (error) return bad(/relation|does not exist/.test(error.message) ? "Drafts switch on with migration 100." : error.message, /relation|does not exist/.test(error.message) ? 409 : 500);
  if (!data) return bad("That draft is gone.", 404);
  return applyCookies(NextResponse.json({ draft: data }));
}
