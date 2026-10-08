import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { BIDS_MISSING, missing091 } from "@/lib/bids-server";

/**
 * One vendor's bid link (migration 091).
 * PATCH { sent: "text" | "email" } → marks it sent that way (after Coy's tap
 *        sent the text through Quo, or opened his mail app).
 * PATCH { revoke: true }          → turns the link off; the page then says so.
 * Members may write only these columns (column grants); the answer is the
 * vendor's alone. Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));
  if (!UUID.test(id)) return fail("No such link.", 404);
  const b = (await req.json().catch(() => ({}))) as { sent?: unknown; revoke?: unknown };
  const { data: row, error } = await supabase.from("bid_request_recipients").select("id, sent_at, sent_via").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (missing091(error)) return fail(BIDS_MISSING, 503);
  if (!row) return fail("No such link.", 404);
  let patch: Record<string, unknown>;
  if (b.revoke === true) patch = { revoked_at: new Date().toISOString() };
  else if (b.sent === "text" || b.sent === "email") {
    const via = [...new Set([...((row.sent_via as string[] | null) ?? []), b.sent])];
    patch = { sent_at: (row.sent_at as string | null) ?? new Date().toISOString(), sent_via: via };
  } else return fail("Say sent or revoke.");
  const { error: uErr } = await supabase.from("bid_request_recipients").update(patch).eq("org_id", orgId).eq("id", id);
  if (uErr) return fail(uErr.message, 500);
  return applyCookies(NextResponse.json({ ok: true, ...patch }));
}
