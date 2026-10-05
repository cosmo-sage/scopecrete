import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";

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
  // Each question's files (079), with a short-lived link to show them; without the column before 079 is applied.
  const read = (cols: string) => supabase.from("dusty_messages").select(cols)
    .eq("conversation_id", id).order("created_at", { ascending: true }).limit(500);
  let r = await read("id, role, content, created_at, file_ids");
  if (r.error) r = await read("id, role, content, created_at");
  if (r.error) return applyCookies(NextResponse.json({ error: r.error.message }, { status: 500 }));
  const msgs = (r.data ?? []) as unknown as Array<{ id: string; role: string; content: string; created_at: string; file_ids?: string[] | null }>;
  const ids = [...new Set(msgs.flatMap((m) => m.file_ids ?? []))];
  const files = new Map<string, Record<string, unknown>>();
  if (ids.length) {
    const { data: fs } = await supabase.from("files").select(FILE_COLUMNS).eq("org_id", orgId).in("id", ids).is("deleted_at", null);
    for (const f of await signFiles(supabase, (fs ?? []) as Array<Record<string, unknown>>) as Array<Record<string, unknown>>) files.set(f.id as string, f);
  }
  const out = msgs.map(({ file_ids, ...m }) => ({
    ...m,
    files: (file_ids ?? []).map((fid) => files.get(fid)).filter(Boolean).map((f) => ({
      id: f!.id, name: f!.name, kind: f!.kind, url: f!.url ?? null, job_id: f!.job_id ?? null, contact_id: f!.contact_id ?? null })),
  }));
  return applyCookies(NextResponse.json({ conversation: conv, messages: out }));
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
