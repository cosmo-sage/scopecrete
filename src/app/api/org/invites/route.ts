import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Settings → Organisation → People: invites (migration 062; Coy, 2026-10-01).
 *
 * GET  → { invites } — this org's invites, newest first (owners only, by RLS;
 *        a member gets none). The token is never stored, so never returned.
 * POST { email, role } → { invite, link } — sc_create_invite(): owners only.
 *        The link carries the token, shown this once for Coy to send himself
 *        (mail or text from his own account — nothing is sent from here).
 *
 * Session client; org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("org_invites")
    .select("id, email, role, created_at, expires_at, accepted_at, revoked_at").eq("org_id", orgId)
    .order("created_at", { ascending: false }).limit(50);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ invites: data ?? [] }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const b = await req.json().catch(() => ({}));
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const role = typeof b?.role === "string" ? b.role : "member";
  if (!email) return applyCookies(NextResponse.json({ error: "Whose email?" }, { status: 400 }));
  const { data, error } = await supabase.rpc("sc_create_invite", { p_org: orgId, p_email: email, p_role: role });
  if (error) {
    const denied = /not allowed/.test(error.message);
    return applyCookies(NextResponse.json({ error: denied ? "Only an owner can invite people." : error.message }, { status: denied ? 403 : 400 }));
  }
  const row = (Array.isArray(data) ? data[0] : data) as { invite_id: string; token: string; expires_at: string };
  const link = `${req.nextUrl.origin}/invite/${row.token}`;
  return applyCookies(NextResponse.json({ invite: { id: row.invite_id, email, role, expires_at: row.expires_at }, link }, { status: 201 }));
}
