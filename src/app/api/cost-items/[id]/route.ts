import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanCard } from "@/lib/cost-cards";

/**
 * One cost card: change any field, or retire it. A retired card is kept
 * (active=false) so a budget that already used it still reads; it just leaves
 * the catalog.
 */

export const dynamic = "force-dynamic";
const COLUMNS = "id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, markup_pct, vendor_contact_id, vendor_sku, price_as_of, price_source, qty_rule, rule_params, active, sort_order, updated_at, import_id, price_import_id, price_file_id";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const { data: cur } = await supabase.from("cost_items").select("id, qty_rule").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!cur) return bad("No such card.", 404);
  // Rule numbers are checked against the rule the card will have.
  const c = cleanCard({ ...b, ...("rule_params" in b && !("qty_rule" in b) ? { qty_rule: cur.qty_rule } : {}) }, true);
  if (!c.ok) return bad(c.error);
  const patch: Record<string, unknown> = { ...c.card };
  if ("sort_order" in b && Number.isInteger(b.sort_order)) patch.sort_order = b.sort_order;
  if (patch.cost_group_id) {
    const { data: g } = await supabase.from("cost_groups").select("id").eq("org_id", orgId).eq("id", patch.cost_group_id as string).maybeSingle();
    if (!g) return bad("No such group.", 404);
  }
  if (patch.vendor_contact_id) {
    const { data: v } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", patch.vendor_contact_id as string).maybeSingle();
    if (!v) return bad("No such vendor.", 404);
  }
  if ("active" in b && b.active === true) patch.active = true; // un-retire from the Price book
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  // A price set here is set by hand: history (migration 049) records it as such,
  // not as the import or the vendor quote that set the one before.
  if ("unit_cost" in patch) { patch.price_import_id = null; patch.price_file_id = null; }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("cost_items").update(patch).eq("id", id).eq("org_id", orgId).select(COLUMNS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ item: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("cost_items").update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", orgId).select("id").maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "No such card." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
