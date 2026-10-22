import { NextRequest, NextResponse } from "next/server";
import { getReaderClient } from "@/lib/api-auth";
import { deviceLabel } from "@/lib/invite-funnel";

/**
 * Invite tracking (migration 122, src/lib/invite-funnel.ts). The invite page reports a step:
 * POST { step: "opened" | "password_set" } — signed in or not (the link is opened signed out).
 * sc_invite_track decides what counts: only what the token names, never a member of the company
 * or a ScopeCrete admin checking the link, password_set only for the invite's own email.
 * The browser goes in a few words, never the IP. Before 122 it does nothing, quietly.
 */
export const dynamic = "force-dynamic";
const TOKEN = /^[0-9a-f]{48}$/;
const STEPS = new Set(["opened", "password_set"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = (await req.json().catch(() => null)) as { step?: unknown } | null;
  const step = typeof b?.step === "string" ? b.step : "";
  if (!TOKEN.test(token) || !STEPS.has(step)) return NextResponse.json({ ok: false }, { status: 400 });
  const { supabase, applyCookies } = getReaderClient(req);
  await supabase.rpc("sc_invite_track", { p_token: token, p_step: step, p_device: deviceLabel(req.headers.get("user-agent")) });
  return applyCookies(NextResponse.json({ ok: true }));
}
