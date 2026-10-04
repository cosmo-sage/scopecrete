import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * POST → Undo a bid the reader filed (sc_undo_bid, migration 063): the job it
 * made archived, the Box files it fetched hidden, a person it made back in
 * Unsorted, the email back to Unfiled. Nothing is deleted. Members only.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const { error } = await supabase.rpc("sc_undo_bid", { p_package: id });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
