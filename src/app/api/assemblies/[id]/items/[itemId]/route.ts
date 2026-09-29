import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * One card in an assembly. PATCH { quantity } — only meaningful for a card
 * counted by hand; blank means the budget asks for it. DELETE takes it out of
 * the assembly (the card stays in the Price book).
 */

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const v = b.quantity;
  const q = v === null || v === undefined || v === "" ? null : Number(v);
  if (q !== null && (!Number.isFinite(q) || q < 0 || q > 1_000_000)) return bad("A quantity is a number, or blank.");
  const { data, error } = await supabase.from("cost_assembly_items").update({ quantity: q })
    .eq("org_id", orgId).eq("assembly_id", id).eq("id", itemId).select("id, quantity").maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad("Not in that assembly.", 404);
  return applyCookies(NextResponse.json({ item: data }));
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("cost_assembly_items").delete()
    .eq("org_id", orgId).eq("assembly_id", id).eq("id", itemId).select("id").maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "Not in that assembly." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
