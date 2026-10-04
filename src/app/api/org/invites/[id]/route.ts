import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/** DELETE → withdraw an invite (sc_revoke_invite: owners only, audited). */
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const { error } = await supabase.rpc("sc_revoke_invite", { p_invite: id });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
