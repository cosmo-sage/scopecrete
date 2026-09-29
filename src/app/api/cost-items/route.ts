import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanCard, defaultTaxable, type CostType } from "@/lib/cost-cards";

/**
 * Cost cards (migration 047): Coy's catalog of what he buys and charges for,
 * each tied to its vendor.
 *
 * GET  ?vendor=<contact id>  → { items, groups, vendors } (active cards; one
 *      vendor's price list when named; ?all=1 includes retired cards — the
 *      Price book's "show retired"). Vendors are the org's contacts filed
 *      vendor, for the picker.
 * POST card fields           → the new card.
 *
 * Session client, org from the session (DECISIONS §7); a group or vendor the
 * browser names must be this org's.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_COLUMNS = "id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, markup_pct, vendor_contact_id, vendor_sku, price_as_of, price_source, qty_rule, rule_params, active, sort_order, updated_at, import_id, price_import_id, price_file_id";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const vendor = req.nextUrl.searchParams.get("vendor");
  let q = supabase.from("cost_items").select(ITEM_COLUMNS).eq("org_id", orgId).order("sort_order").order("name");
  if (req.nextUrl.searchParams.get("all") !== "1") q = q.eq("active", true);
  if (vendor) {
    if (!UUID.test(vendor)) return applyCookies(NextResponse.json({ error: "Bad vendor." }, { status: 400 }));
    q = q.eq("vendor_contact_id", vendor);
  }
  const [{ data: items, error }, { data: groups }, { data: vendors }] = await Promise.all([
    q,
    supabase.from("cost_groups").select("id, name, cost_type, default_markup_pct, sort_order").eq("org_id", orgId).order("sort_order").order("name"),
    supabase.from("contacts").select("id, name, phone, contact_subtype").eq("org_id", orgId).eq("contact_type", "vendor")
      .is("merged_into_contact_id", null).or("classification_confirmed_at.not.is.null,auto_classified_at.not.is.null").order("name").limit(500),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: `cost_items: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ items: items ?? [], groups: groups ?? [], vendors: vendors ?? [] }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const c = cleanCard(b);
  if (!c.ok) return bad(c.error);
  const card = c.card;
  if (card.taxable === undefined) card.taxable = defaultTaxable(card.cost_type as CostType);
  if (card.cost_group_id) {
    const { data: g } = await supabase.from("cost_groups").select("id").eq("org_id", orgId).eq("id", card.cost_group_id).maybeSingle();
    if (!g) return bad("No such group.", 404);
  }
  if (card.vendor_contact_id) {
    const { data: v } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", card.vendor_contact_id).maybeSingle();
    if (!v) return bad("No such vendor.", 404);
  }
  const { data, error } = await supabase.from("cost_items").insert({ ...card, org_id: orgId }).select(ITEM_COLUMNS).single();
  if (error || !data) return bad(`Couldn't save the card: ${error?.message ?? "no row"}`, 500);
  return applyCookies(NextResponse.json({ item: data }, { status: 201 }));
}
