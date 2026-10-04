import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { SOURCE_COLUMNS, sourcesFor } from "@/lib/sources-server";

/**
 * One vendor's price on one item.
 *
 * PATCH { default: true }            → this vendor's price is the one budgets use
 *       { unit_cost?, vendor_sku?, unit?, note? } → a price typed by hand
 * DELETE → removes this vendor from the item. If they were the default, the
 *          item keeps their last price as its own until another is chosen.
 *
 * Session client, org from the session; the source must be on this item.
 */

export const dynamic = "force-dynamic";

async function load(sb: Parameters<typeof sourcesFor>[0], orgId: string, itemId: string, sourceId: string) {
  const { data } = await sb.from("cost_item_sources").select(SOURCE_COLUMNS).eq("org_id", orgId).eq("cost_item_id", itemId).eq("id", sourceId).maybeSingle();
  return data;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if (!(await load(supabase, orgId, id, sourceId))) return bad("No such vendor price.", 404);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if ("unit_cost" in b) {
    const raw = b.unit_cost;
    const n = raw === null || raw === "" ? null : Number(String(raw).replace(/[$,\s]/g, ""));
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 1_000_000)) return bad("A price must be a number.");
    Object.assign(patch, { unit_cost: n, price_as_of: n === null ? null : now.slice(0, 10), price_source: n === null ? null : "typed", price_file_id: null, price_import_id: null });
  }
  const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
  if ("vendor_sku" in b) patch.vendor_sku = text(b.vendor_sku, 60);
  if ("unit" in b) patch.unit = text(b.unit, 20);
  if ("note" in b) patch.note = text(b.note, 300);
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("cost_item_sources").update({ ...patch, updated_at: now }).eq("org_id", orgId).eq("id", sourceId);
    if (error) return bad(error.message, 500);
  }
  if (b.default === true) {
    const { error } = await supabase.from("cost_items").update({ default_source_id: sourceId, updated_at: now }).eq("org_id", orgId).eq("id", id);
    if (error) return bad(error.message, 500);
  } else if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data: item } = await supabase.from("cost_items").select("id, unit_cost, vendor_contact_id, vendor_sku, price_as_of, price_source, default_source_id").eq("org_id", orgId).eq("id", id).single();
  return applyCookies(NextResponse.json({ item, sources: await sourcesFor(supabase, orgId, [id]) }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await load(supabase, orgId, id, sourceId))) return applyCookies(NextResponse.json({ error: "No such vendor price." }, { status: 404 }));
  // The default vendor leaving: the item keeps the price, no longer theirs.
  await supabase.from("cost_items").update({ default_source_id: null, vendor_contact_id: null, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("id", id).eq("default_source_id", sourceId);
  const { error } = await supabase.from("cost_item_sources").delete().eq("org_id", orgId).eq("id", sourceId);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true, sources: await sourcesFor(supabase, orgId, [id]) }));
}
