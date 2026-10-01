import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/api-auth";

/**
 * The invitee's side (migration 062). Signed in, with or without an org.
 *
 * GET  → { invite: { org_name, role, email, invited_by_name, state, email_matches } }
 *        (sc_invite_peek — only for a valid token; nothing else is readable).
 * POST → { org_id } — sc_accept_invite(): only for the email the invite was
 *        made for, once, before it expires or is withdrawn.
 */
export const dynamic = "force-dynamic";
const TOKEN = /^[0-9a-f]{48}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await getUserSession(req);
  if (!result.ok) return result.response;
  const { supabase, email, applyCookies } = result.session;
  if (!TOKEN.test(token)) return applyCookies(NextResponse.json({ invite: { state: "unknown" }, you: email }));
  const { data, error } = await supabase.rpc("sc_invite_peek", { p_token: token });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  return applyCookies(NextResponse.json({ invite: (Array.isArray(data) ? data[0] : data) ?? { state: "unknown" }, you: email }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await getUserSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  if (!TOKEN.test(token)) return applyCookies(NextResponse.json({ error: "That invite link isn't valid." }, { status: 400 }));
  const { data, error } = await supabase.rpc("sc_accept_invite", { p_token: token });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  return applyCookies(NextResponse.json({ org_id: data }));
}
