import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/** Add cards to an assembly. POST { cost_item_ids: [...] } — each card once; ones already in it are skipped. */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const ids = [...new Set((Array.isArray(b.cost_item_ids) ? b.cost_item_ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 100);
  if (!ids.length) return bad("Pick at least one card.");
  const [{ data: asm }, { data: cards }, { data: have }] = await Promise.all([
    supabase.from("cost_assemblies").select("id").eq("org_id", orgId).eq("id", id).maybeSingle(),
    supabase.from("cost_items").select("id").eq("org_id", orgId).in("id", ids),
    supabase.from("cost_assembly_items").select("cost_item_id, sort_order").eq("org_id", orgId).eq("assembly_id", id),
  ]);
  if (!asm) return bad("No such assembly.", 404);
  if ((cards ?? []).length !== ids.length) return bad("A card isn't one of yours.", 404);
  const already = new Set(((have ?? []) as Array<{ cost_item_id: string }>).map((h) => h.cost_item_id));
  const start = (have ?? []).length;
  const rows = ids.filter((c) => !already.has(c)).map((c, i) => ({ org_id: orgId, assembly_id: id, cost_item_id: c, sort_order: start + i }));
  if (rows.length) {
    const { error } = await supabase.from("cost_assembly_items").insert(rows);
    if (error) return bad(error.message, 500);
  }
  await supabase.from("cost_assemblies").update({ updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id);
  return applyCookies(NextResponse.json({ added: rows.length }, { status: 201 }));
}
