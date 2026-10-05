import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { isOwner, orgRow, orgView } from "@/lib/org-server";

/**
 * Settings → Organisation (migration 056; Coy on Vercel, 2026-09-30).
 *
 * GET   → { org, can_edit, people } — people from sc_org_people() (name, email,
 *         role), the only way a teammate's email is read.
 * PATCH { name } → { org } — sc_rename_org(): owners only, 1–120 characters,
 *         audited in org_audit. The name lives once, in orgs.name.
 *
 * Session client; the org comes from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const [row, owner, people] = await Promise.all([
    orgRow(supabase, orgId),
    isOwner(supabase, orgId, userId),
    supabase.rpc("sc_org_people", { p_org: orgId }),
  ]);
  if (!row) return applyCookies(NextResponse.json({ error: "No organisation." }, { status: 404 }));
  return applyCookies(NextResponse.json({
    org: orgView(row), can_edit: owner,
    people: ((people.data ?? []) as Array<Record<string, unknown>>).map((p) => ({ ...p, you: p.user_id === userId })),
  }));
}

export async function PATCH(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 120) return applyCookies(NextResponse.json({ error: "The name must be 1 to 120 characters." }, { status: 400 }));
  const { data, error } = await supabase.rpc("sc_rename_org", { p_org: orgId, p_name: name });
  if (error) {
    const denied = /not allowed/.test(error.message);
    return applyCookies(NextResponse.json({ error: denied ? "Only an owner can rename the organisation." : error.message }, { status: denied ? 403 : 400 }));
  }
  return applyCookies(NextResponse.json({ org: orgView(data as Record<string, unknown>) }));
}
