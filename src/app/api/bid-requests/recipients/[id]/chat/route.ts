import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { CHAT_MISSING, cleanWeeks, missing130 } from "@/lib/bid-weeks";

/**
 * Coy's side of the chat on one vendor's bid link (migration 130).
 * GET           → { messages (oldest first, the last 200), availability, availability_at, availability_note }
 * POST { body } → a message from the signed-in member, side "org", under bid_messages' insert policy
 *                 (the trigger checks the link is the org's). Nothing is texted or emailed: the vendor
 *                 reads it on their link.
 * Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  if (!UUID.test(id)) return json({ error: "No such link." }, 404);
  const [{ data: rec, error: re }, { data: msgs, error: me }] = await Promise.all([
    supabase.from("bid_request_recipients").select("id, availability, availability_at, availability_note").eq("org_id", orgId).eq("id", id).maybeSingle(),
    supabase.from("bid_messages").select("id, side, author_name, body, created_at").eq("org_id", orgId).eq("recipient_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  if (missing130(re) || missing130(me)) return json({ missing: CHAT_MISSING });
  if (re || me) return json({ error: (re ?? me)!.message }, 500);
  if (!rec) return json({ error: "No such link." }, 404);
  const r = rec as { availability: unknown; availability_at: string | null; availability_note: string | null };
  const messages = ((msgs ?? []) as Array<{ id: string; side: string; author_name: string | null; body: string; created_at: string }>)
    .reverse().map((m) => ({ id: m.id, side: m.side, name: m.author_name, body: m.body, at: m.created_at }));
  return json({ messages, availability: cleanWeeks(r.availability), availability_at: r.availability_at, availability_note: r.availability_note });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  if (!UUID.test(id)) return json({ error: "No such link." }, 404);
  const b = (await req.json().catch(() => null)) as { body?: unknown } | null;
  const body = typeof b?.body === "string" ? b.body.trim().slice(0, 2000) : "";
  if (!body) return json({ error: "Write a message first." }, 400);
  const { data: people } = await supabase.rpc("sc_org_people", { p_org: orgId });
  const me = ((people ?? []) as Array<{ user_id: string; name: string | null; email: string | null }>).find((p) => p.user_id === userId);
  const name = (me?.name?.trim() || me?.email?.split("@")[0] || null)?.slice(0, 80) ?? null;
  const { data, error } = await supabase.from("bid_messages")
    .insert({ org_id: orgId, recipient_id: id, side: "org", author_id: userId, author_name: name, body })
    .select("id, created_at").single();
  if (missing130(error)) return json({ error: CHAT_MISSING }, 503);
  if (error) return json({ error: error.message }, 400);
  return json({ id: (data as { id: string }).id, at: (data as { created_at: string }).created_at });
}
