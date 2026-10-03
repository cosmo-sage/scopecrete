import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * A proposal link (migration 075): `{sent: "text" | "email" | "copy"}` records
 * how Coy sent it (ScopeCrete sends nothing — his own phone or mail app does);
 * `{revoke: true}` turns the link off, so the customer sees it is gone.
 * Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIA = new Set(["text", "email", "copy"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!UUID.test(id)) return bad("No such link.", 404);
  const b = (await req.json().catch(() => ({}))) as { sent?: unknown; revoke?: unknown };
  const { data: doc } = await supabase.from("documents").select("id, status, sent_at, sent_via").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!doc) return bad("No such link.", 404);
  const patch: Record<string, unknown> = {};
  if (typeof b.sent === "string" && VIA.has(b.sent)) {
    patch.sent_at = doc.sent_at ?? new Date().toISOString();
    patch.sent_via = [...new Set([...((doc.sent_via as string[] | null) ?? []), b.sent])];
    if (doc.status === "draft") patch.status = "sent";
  }
  if (b.revoke === true) patch.revoked_at = new Date().toISOString();
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data, error } = await supabase.from("documents").update(patch).eq("org_id", orgId).eq("id", id)
    .select("id, status, sent_at, sent_via, view_count, last_viewed_at, revoked_at").single();
  if (error) return bad(error.message, 500);
  return applyCookies(NextResponse.json({ link: data }));
}
