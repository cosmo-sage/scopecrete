import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getReaderClient } from "@/lib/api-auth";

/**
 * The customer writes back from the proposal link (migration 127; Coy, 2026-10-23: "the customer …
 * can message me back through the app"). Like the link itself, no session and no service role: the
 * request's own client calls sc_proposal_message(), which takes a live link only, refuses anyone
 * signed in to the org, and files the words as a note on the customer's person — their thread's
 * Notes, beside Coy's own. GET lists what was sent from this link (sc_proposal_messages).
 */

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const missing = (e: { message: string } | null) => !!e && /sc_proposal_message/.test(e.message) && /(does not exist|could not find|schema cache)/i.test(e.message);

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const { data, error } = await supabase.rpc("sc_proposal_messages", { p_token: token });
  if (missing(error)) return json({ on: false, messages: [] });
  if (error) return json({ error: "Couldn't load your messages." }, 500);
  return json({ on: true, messages: Array.isArray(data) ? data : [] });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; body?: unknown };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (name.length < 2) return json({ error: "Type your name." }, 400);
  if (!body) return json({ error: "Write a message." }, 400);
  if (body.length > 2000) return json({ error: "Keep it under 2,000 characters." }, 400);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipHash = ip ? createHash("sha256").update(`${ip}|${token}`).digest("hex").slice(0, 16) : null;
  const { data, error } = await supabase.rpc("sc_proposal_message", { p_token: token, p_name: name, p_body: body, p_ip_hash: ipHash, p_ua: req.headers.get("user-agent") });
  if (missing(error)) return json({ error: "Messages from the proposal aren't switched on yet — call or text your contractor." }, 503);
  if (error) {
    const mine = error.code === "22023" || error.code === "42501";
    return json({ error: mine ? error.message : "Couldn't send your message. Try again." }, mine ? 400 : 500);
  }
  return json(data);
}
