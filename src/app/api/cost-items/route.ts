import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanCard, defaultTaxable, type CostType } from "@/lib/cost-cards";
import { setVendorPrice } from "@/lib/sources-server";

/**
 * Cost cards (migration 047): Coy's catalog of what he buys and charges for,
 * each tied to its vendor.
 *
 * GET  ?vendor=<contact id>  → { items, groups, vendors } (active cards; one
 *      vendor's price list when named — every item they price, each with
 *      `vendor_source`, that vendor's own price (migration 051); ?all=1 includes retired cards — the
 *      Price book's "show retired"). Vendors are the org's contacts filed
 *      vendor, for the picker.
 * POST card fields           → the new card. A vendor named on it becomes its
 *      first (default) vendor price.
 * Every item carries `default_source_id` and `vendors` (how many price it).
 * ?sources=1 adds `sources`: every vendor price, compact — the Price book's
 * "By vendor" view lists an item under each vendor at that vendor's price.
 *
 * Session client, org from the session (DECISIONS §7); a group or vendor the
 * browser names must be this org's.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_COLUMNS = "id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, markup_pct, vendor_contact_id, vendor_sku, price_as_of, price_source, qty_rule, rule_params, active, sort_order, updated_at, import_id, price_import_id, price_file_id, default_source_id";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const vendor = req.nextUrl.searchParams.get("vendor");
  let q = supabase.from("cost_items").select(ITEM_COLUMNS).eq("org_id", orgId).order("sort_order").order("name");
  if (req.nextUrl.searchParams.get("all") !== "1") q = q.eq("active", true);
  const vendorPrice = new Map<string, Record<string, unknown>>();
  if (vendor) {
    if (!UUID.test(vendor)) return applyCookies(NextResponse.json({ error: "Bad vendor." }, { status: 400 }));
    const { data: src } = await supabase.from("cost_item_sources").select("id, cost_item_id, unit_cost, vendor_sku, unit, price_as_of, price_source, price_file_id")
      .eq("org_id", orgId).eq("vendor_contact_id", vendor).eq("active", true).limit(2000);
    for (const s of (src ?? []) as Array<Record<string, unknown>>) vendorPrice.set(s.cost_item_id as string, { ...s, unit_cost: s.unit_cost === null ? null : Number(s.unit_cost) });
    const ids = [...vendorPrice.keys()];
    q = ids.length ? q.or(`vendor_contact_id.eq.${vendor},id.in.(${ids.slice(0, 500).join(",")})`) : q.eq("vendor_contact_id", vendor);
  }
  const [{ data: items, error }, { data: groups }, { data: vendors }] = await Promise.all([
    q,
    supabase.from("cost_groups").select("id, name, cost_type, default_markup_pct, sort_order").eq("org_id", orgId).order("sort_order").order("name"),
    supabase.from("contacts").select("id, name, phone, contact_subtype").eq("org_id", orgId).eq("contact_type", "vendor")
      .is("merged_into_contact_id", null).or("classification_confirmed_at.not.is.null,auto_classified_at.not.is.null").order("name").limit(500),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: `cost_items: ${error.message}` }, { status: 500 }));
  // How many vendors price each item — the grid's "+2".
  const { data: counts } = await supabase.from("cost_item_sources").select("id, cost_item_id, vendor_contact_id, unit_cost, vendor_sku, price_as_of, price_source")
    .eq("org_id", orgId).eq("active", true).limit(10000);
  const n = new Map<string, number>();
  for (const c of (counts ?? []) as Array<{ cost_item_id: string }>) n.set(c.cost_item_id, (n.get(c.cost_item_id) ?? 0) + 1);
  const list = ((items ?? []) as Array<Record<string, unknown>>).map((i) => ({
    ...i, vendors: n.get(i.id as string) ?? 0, ...(vendor ? { vendor_source: vendorPrice.get(i.id as string) ?? null } : {}),
  }));
  const sources = req.nextUrl.searchParams.get("sources") === "1"
    ? ((counts ?? []) as Array<Record<string, unknown>>).map((c) => ({ ...c, unit_cost: c.unit_cost === null ? null : Number(c.unit_cost) }))
    : undefined;
  return applyCookies(NextResponse.json({ items: list, groups: groups ?? [], vendors: vendors ?? [], ...(sources ? { sources } : {}) }));
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
  // A vendor on a new card is its first vendor price: the card is made without
  // the price, then the vendor's price is set and made default (one history row).
  const vendorId = card.vendor_contact_id ?? null;
  const price = { unit_cost: card.unit_cost ?? null, vendor_sku: card.vendor_sku ?? null, price_as_of: card.price_as_of ?? null, price_source: card.price_source ?? null };
  const insert = vendorId ? { ...card, unit_cost: null, vendor_contact_id: null, price_as_of: null, price_source: null } : card;
  const { data, error } = await supabase.from("cost_items").insert({ ...insert, org_id: orgId }).select(ITEM_COLUMNS).single();
  if (error || !data) return bad(`Couldn't save the card: ${error?.message ?? "no row"}`, 500);
  if (vendorId) {
    const today = new Date().toISOString().slice(0, 10);
    const r = await setVendorPrice(supabase, orgId, data.id as string, vendorId, {
      ...price, price_as_of: price.price_as_of ?? (price.unit_cost === null ? null : today), price_source: price.price_source ?? (price.unit_cost === null ? null : "typed"),
    }, true);
    if (!r.ok) return bad(`Saved the card, but not the vendor's price: ${r.error}`, 500);
    const { data: again } = await supabase.from("cost_items").select(ITEM_COLUMNS).eq("org_id", orgId).eq("id", data.id).single();
    return applyCookies(NextResponse.json({ item: again ?? data }, { status: 201 }));
  }
  return applyCookies(NextResponse.json({ item: data }, { status: 201 }));
}
