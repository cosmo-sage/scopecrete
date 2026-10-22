import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { before120, readAccess, WAITING_120 } from "@/lib/access";

/**
 * Settings → Organization → People: invites (migration 062; Coy, 2026-10-01).
 *
 * GET  → { invites } — this org's invites, newest first (owners only, by RLS;
 *        a member gets none). The token is never stored, so never returned.
 * POST { email, role, contact_id?, pages?, all_jobs?, job_ids? } → { invite, link }
 *        — sc_invite_member() (081): owners only; an onsite estimator ('field')
 *        must be a vendor or a customer's contact (095), with the pages and jobs they may open.
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
  const cols = "id, email, role, created_at, expires_at, accepted_at, revoked_at";
  const list = (c: string) => supabase.from("org_invites").select(c).eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
  let { data, error } = await list(`${cols}, contact_id, pages, all_jobs, job_ids`);
  // Before 081 the access columns aren't there.
  if (error && /column/i.test(error.message)) ({ data, error } = await list(cols));
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ invites: data ?? [] }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const b = await req.json().catch(() => ({}));
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const a = readAccess(b);
  const role = a.role ?? "member";
  if (!email) return applyCookies(NextResponse.json({ error: "Whose email?" }, { status: 400 }));
  // sc_invite_member (081) carries the vendor, pages and jobs; before 081 only sc_create_invite exists,
  // and an onsite estimator can't be invited until it does.
  const invite = (pages: string[]) => supabase.rpc("sc_invite_member", {
    p_org: orgId, p_email: email, p_role: role, p_contact: a.contact_id, p_pages: pages, p_all_jobs: a.all_jobs, p_jobs: a.job_ids });
  let { data, error } = await invite(a.pages);
  if (error && /Unknown page/.test(error.message)) {
    const old = before120(a.pages);
    if (old.blocked.length) return applyCookies(NextResponse.json({ error: WAITING_120 }, { status: 503 }));
    ({ data, error } = await invite(old.pages));
  }
  const missing = !!error && /could not find the function|does not exist/i.test(error.message);
  if (missing && role === "field") return applyCookies(NextResponse.json({ error: "Onsite estimators aren't switched on yet — migration 081 is waiting to be applied." }, { status: 503 }));
  if (missing) ({ data, error } = await supabase.rpc("sc_create_invite", { p_org: orgId, p_email: email, p_role: role }));
  if (error) {
    const denied = /not allowed/.test(error.message);
    return applyCookies(NextResponse.json({ error: denied ? "Only an owner can invite people." : error.message }, { status: denied ? 403 : 400 }));
  }
  const row = (Array.isArray(data) ? data[0] : data) as { invite_id: string; token: string; expires_at: string };
  const link = `${req.nextUrl.origin}/invite/${row.token}`;
  return applyCookies(NextResponse.json({ invite: { id: row.invite_id, email, role, expires_at: row.expires_at }, link }, { status: 201 }));
}
