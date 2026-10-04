import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Replay event (Logs): file one raw provider event again —
 * sc_replay_raw_event() (migration 077, SECURITY DEFINER, members of the
 * event's org only). The dedupe index makes a second message impossible.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const { data, error } = await supabase.rpc("sc_replay_raw_event", { p_event: id });
  if (error) {
    const missing = /function .*sc_replay_raw_event|does not exist/i.test(error.message);
    return applyCookies(NextResponse.json({ error: missing ? "Replay needs migration 077 applied." : error.message }, { status: missing ? 501 : 400 }));
  }
  const r = data as { ok: boolean; error?: string };
  return applyCookies(NextResponse.json(r, { status: r.ok ? 200 : 422 }));
}
