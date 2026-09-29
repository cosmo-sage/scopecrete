import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/** One Dusty conversation of yours: read it, rename it, delete it. RLS: owner only. */

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: conv } = await supabase.from("dusty_conversations")
    .select("id, title, context_kind, context_id, context_label, created_at, updated_at")
    .eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!conv) return applyCookies(NextResponse.json({ error: "Not found." }, { status: 404 }));
  const { data: msgs, error } = await supabase.from("dusty_messages").select("id, role, content, created_at")
    .eq("conversation_id", id).order("created_at", { ascending: true }).limit(500);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ conversation: conv, messages: msgs ?? [] }));
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const b = (await req.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof b.title === "string" ? b.title.replace(/\s+/g, " ").trim() : "";
  if (!title || title.length > 120) return applyCookies(NextResponse.json({ error: "A title needs 1–120 characters." }, { status: 400 }));
  const { data, error } = await supabase.from("dusty_conversations").update({ title })
    .eq("org_id", orgId).eq("id", id).select("id, title").maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "Not found." }, { status: 404 }));
  return applyCookies(NextResponse.json({ conversation: data }));
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("dusty_conversations").delete()
    .eq("org_id", orgId).eq("id", id).select("id").maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "Not found." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
