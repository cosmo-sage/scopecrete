import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/api-auth";

/**
 * The invitee's side (migration 062). Signed in, with or without an org.
 *
 * GET  → { invite: { org_name, role, email, invited_by_name, state, email_matches } }
 *        (sc_invite_peek — only for a valid token; nothing else is readable).
 *        `your_name`: the name on your account, if any (Google fills it).
 * POST { name } → { org_id } — sc_accept_invite(): only for the email the
 *        invite was made for, once, before it expires or is withdrawn. The
 *        name (Coy, 2026-10-11: "He should be able to add his name with the
 *        sign up page") is saved on their account first, then as their name in
 *        the org (sc_set_member_name, 102 — skipped before it is applied).
 */
export const dynamic = "force-dynamic";
const TOKEN = /^[0-9a-f]{48}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await getUserSession(req);
  if (!result.ok) return result.response;
  const { supabase, email, applyCookies } = result.session;
  if (!TOKEN.test(token)) return applyCookies(NextResponse.json({ invite: { state: "unknown" }, you: email }));
  const [{ data, error }, { data: u }] = await Promise.all([supabase.rpc("sc_invite_peek", { p_token: token }), supabase.auth.getUser()]);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  const meta = (u.user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const yourName = (meta.full_name ?? meta.name ?? "").trim() || null;
  return applyCookies(NextResponse.json({ invite: (Array.isArray(data) ? data[0] : data) ?? { state: "unknown" }, you: email, your_name: yourName }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await getUserSession(req);
  if (!result.ok) return result.response;
  const { supabase, userId, applyCookies } = result.session;
  if (!TOKEN.test(token)) return applyCookies(NextResponse.json({ error: "That invite link isn't valid." }, { status: 400 }));
  const b = await req.json().catch(() => ({}));
  const name = typeof b?.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 80) return applyCookies(NextResponse.json({ error: "Your name, please (1 to 80 characters)." }, { status: 400 }));
  const saved = await supabase.auth.updateUser({ data: { full_name: name } });
  if (saved.error) return applyCookies(NextResponse.json({ error: saved.error.message }, { status: 400 }));
  const { data, error } = await supabase.rpc("sc_accept_invite", { p_token: token });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  if (data) await supabase.rpc("sc_set_member_name", { p_org: data, p_user: userId, p_name: name });
  return applyCookies(NextResponse.json({ org_id: data }));
}
