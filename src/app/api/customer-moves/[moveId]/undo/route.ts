import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/** Undo adding a person to a customer, or taking them off (sc_undo_contact_move, migration 055). */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ moveId: string }> }) {
  const { moveId } = await ctx.params;
  if (!UUID.test(moveId)) return NextResponse.json({ error: "Not a move id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, applyCookies } = result.session;
  const { error } = await sb.rpc("sc_undo_contact_move", { p_move: moveId });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: error.code === "P0002" ? 404 : 400 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
