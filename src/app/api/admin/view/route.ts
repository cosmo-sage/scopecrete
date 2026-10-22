import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { readReason } from "@/lib/admin";
import { VIEW_COMPANY_COOKIE, VIEW_COMPANY_MAX_AGE } from "@/lib/view-company";

/**
 * View company (migration 121; src/lib/view-company.ts).
 *
 * POST { org, reason } → a ScopeCrete admin opens that company's app read only:
 *   sc_admin_view_start checks platform_admins, ends any view they had open, records this one
 *   (8 hours) and writes it to admin_audit with the reason; then the cookie is set.
 * DELETE → sc_admin_view_end (audited), and the cookie cleared — even when the session can't be
 *   read, so nobody is left stuck in a view.
 *
 * Session client; no service role. The cookie alone opens nothing: the database honours the
 * company only for an admin with an open view, and only in a read-only transaction.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Host-only, like View as: the view is of this address alone.
const opts = (req: NextRequest, maxAge: number) => ({
  path: "/", httpOnly: true, sameSite: "lax" as const, secure: req.nextUrl.protocol === "https:", maxAge,
});
const missing121 = (m: string | undefined) => /sc_admin_view_(start|end)|admin_company_views/.test(m ?? "");

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof b?.org !== "string" || !UUID.test(b.org)) return bad("Which company?");
  const reason = readReason(b.reason);
  if (!reason) return bad("Give a reason — it goes in the admin log.");
  const { data, error } = await supabase.rpc("sc_admin_view_start", { p_org: b.org, p_reason: reason });
  if (error) {
    if (missing121(error.message)) return bad("View company is waiting for migration 121.", 503);
    return bad(error.message ?? "Couldn't open it.", error.code === "42501" ? 403 : 400);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { org_id: string; name: string | null; expires_at: string } | null;
  if (!row?.org_id) return bad("The view didn't open.", 500);
  const res = NextResponse.json({ viewing_company: row });
  res.cookies.set(VIEW_COMPANY_COOKIE, row.org_id.toLowerCase(), opts(req, VIEW_COMPANY_MAX_AGE));
  return applyCookies(res);
}

export async function DELETE(req: NextRequest) {
  const result = await getApiSession(req);
  if (result.ok) await result.session.supabase.rpc("sc_admin_view_end");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIEW_COMPANY_COOKIE, "", opts(req, 0));
  return result.ok ? result.session.applyCookies(res) : res;
}
