import { NextRequest, NextResponse } from "next/server";
import { getReaderClient } from "@/lib/api-auth";
import { CHAT_MISSING, cleanWeeks, missing130 } from "@/lib/bid-weeks";

/**
 * The chat and availability on a vendor's bid link (migration 130). No login, no service role: the
 * request's own client calls the token's SECURITY DEFINER doors, which refuse the org's own members
 * (Coy writes from the job's bid request).
 * GET                    → { messages, availability, availability_at, availability_note }
 * POST { body, name? }   → a message from the vendor (sc_bid_message: 2,000 characters, 30 a day)
 * PUT  { weeks, note? }  → the weeks they could do it (sc_bid_availability)
 * Before 130 every call answers { missing } and the page leaves the section out.
 */

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

function setup(req: NextRequest) {
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers }));
  return { supabase, json };
}
const refusal = (e: { message?: string }) => (e.message ?? "").replace(/^.*?ERROR:\s*/, "") || "Couldn't save it.";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, json } = setup(req);
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const { data, error } = await supabase.rpc("sc_bid_chat", { p_token: token });
  if (missing130(error)) return json({ missing: CHAT_MISSING });
  if (error) return json({ error: "Couldn't load the messages." }, 500);
  if (!data) return json({ error: "This link is turned off." }, 404);
  const d = data as { messages?: unknown; availability?: unknown; availability_at?: string | null; availability_note?: string | null };
  return json({ messages: Array.isArray(d.messages) ? d.messages : [], availability: cleanWeeks(d.availability), availability_at: d.availability_at ?? null, availability_note: d.availability_note ?? null });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, json } = setup(req);
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const b = (await req.json().catch(() => null)) as { body?: unknown; name?: unknown } | null;
  const body = typeof b?.body === "string" ? b.body.trim().slice(0, 2000) : "";
  if (!body) return json({ error: "Write a message first." }, 400);
  const name = typeof b?.name === "string" ? b.name.trim().slice(0, 80) : null;
  const { data, error } = await supabase.rpc("sc_bid_message", { p_token: token, p_name: name, p_body: body });
  if (missing130(error)) return json({ missing: CHAT_MISSING }, 503);
  if (error) return json({ error: refusal(error) }, 400);
  return json(data ?? { ok: true });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, json } = setup(req);
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const b = (await req.json().catch(() => null)) as { weeks?: unknown; note?: unknown } | null;
  const weeks = cleanWeeks(b?.weeks);
  const note = typeof b?.note === "string" ? b.note.trim().slice(0, 500) : null;
  const { data, error } = await supabase.rpc("sc_bid_availability", { p_token: token, p_weeks: weeks, p_note: note });
  if (missing130(error)) return json({ missing: CHAT_MISSING }, 503);
  if (error) return json({ error: refusal(error) }, 400);
  return json(data ?? { ok: true });
}
