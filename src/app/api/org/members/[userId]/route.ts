import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * DELETE → take someone out of the org (sc_remove_member: owners only, never
 * yourself, never the last owner; audited). Their account stays; they just
 * stop seeing this org.
 */
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId: who } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { error } = await supabase.rpc("sc_remove_member", { p_org: orgId, p_user: who });
  if (error) {
    // sc_remove_member waits on its own approval (DECISIONS §2g) — say so plainly until it is applied.
    const missing = /could not find the function|does not exist/i.test(error.message);
    return applyCookies(NextResponse.json({ error: missing ? "Removing people isn't switched on yet — its database function is waiting to be applied."
      : /not allowed/.test(error.message) ? "Only an owner can remove people." : error.message }, { status: missing ? 503 : 400 }));
  }
  return applyCookies(NextResponse.json({ ok: true }));
}
