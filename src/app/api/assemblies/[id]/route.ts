import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanAssembly } from "@/lib/assemblies";

/** One assembly: change its name, what it applies to, auto-load, reinforcement — or delete it (its cards stay in the Price book). */

export const dynamic = "force-dynamic";
const COLUMNS = "id, name, job_type, work_type, auto_load, reinforcement_item_id, sort_order, updated_at";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const c = cleanAssembly(b, true);
  if (!c.ok) return bad(c.error);
  if (!Object.keys(c.value).length) return bad("Nothing to change.");
  if (c.value.reinforcement_item_id) {
    const { data } = await supabase.from("cost_items").select("id").eq("org_id", orgId).eq("id", c.value.reinforcement_item_id as string).maybeSingle();
    if (!data) return bad("No such card.", 404);
  }
  const { data, error } = await supabase.from("cost_assemblies").update({ ...c.value, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) return bad(error.code === "23505" ? "Another assembly already fills that kind of area on its own — switch one off first." : error.message, error.code === "23505" ? 409 : 500);
  if (!data) return bad("No such assembly.", 404);
  return applyCookies(NextResponse.json({ assembly: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("cost_assemblies").delete().eq("org_id", orgId).eq("id", id).select("id").maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "No such assembly." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
