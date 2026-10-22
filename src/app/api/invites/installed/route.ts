import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { deviceLabel } from "@/lib/invite-funnel";

/**
 * Invite tracking (migration 122): the app was opened from the home screen. The signed-in
 * person's own accepted invite to this company gets "installed", once (sc_invite_installed).
 * Before 122, or with no invite of theirs, nothing happens.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  await supabase.rpc("sc_invite_installed", { p_org: orgId, p_device: deviceLabel(req.headers.get("user-agent")) });
  return applyCookies(NextResponse.json({ ok: true }));
}
