import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Who is in a thread Coy made (migration 073).
 * POST   { contact_ids }      — add them (already there is fine).
 * DELETE ?contact_id=         — take one out. A job thread adds people as they
 *                               join the job; it never takes anyone back out.
 * Session client; org from the session; the database's guard checks both ids.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not a thread id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 })); }
  const ids = Array.isArray(b.contact_ids) ? (b.contact_ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 500) : [];
  if (!ids.length) return applyCookies(NextResponse.json({ error: "Pick someone to add." }, { status: 400 }));
  const { error } = await supabase.from("thread_contacts")
    .upsert(ids.map((contact_id) => ({ thread_id: id, contact_id, org_id: orgId, added_by: "user" })), { onConflict: "thread_id,contact_id", ignoreDuplicates: true });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: error.message.includes("not found") ? 404 : 500 }));
  return applyCookies(NextResponse.json({ ok: true, added: ids.length }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const contactId = req.nextUrl.searchParams.get("contact_id") ?? "";
  if (!UUID.test(id) || !UUID.test(contactId)) return NextResponse.json({ error: "Not an id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("thread_contacts").delete().eq("org_id", orgId).eq("thread_id", id).eq("contact_id", contactId).select("contact_id");
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true, removed: data?.length ?? 0 }));
}
