import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { setVendorPrice, sourcesFor } from "@/lib/sources-server";

/**
 * One item's vendor prices (migration 051).
 *
 * GET  → { sources: [{ …price, vendor: { id, name, service_area } }], default_source_id } — cheapest first.
 * POST { vendor_contact_id, unit_cost, vendor_sku?, unit?, price_as_of?, note?, make_default? }
 *      → adds (or re-prices) that vendor's price by hand. The item's first
 *        vendor becomes its default; otherwise only when asked.
 *
 * Session client, org from the session; the item and vendor must be this org's.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: item } = await supabase.from("cost_items").select("id, default_source_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!item) return applyCookies(NextResponse.json({ error: "No such item." }, { status: 404 }));
  return applyCookies(NextResponse.json({ sources: await sourcesFor(supabase, orgId, [id]), default_source_id: item.default_source_id }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const vendor = typeof b.vendor_contact_id === "string" && UUID.test(b.vendor_contact_id) ? b.vendor_contact_id : null;
  if (!vendor) return bad("Pick a vendor.");
  const { data: v } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", vendor).maybeSingle();
  if (!v) return bad("No such vendor.", 404);
  const raw = b.unit_cost;
  const cost = raw === null || raw === "" || raw === undefined ? null : Number(String(raw).replace(/[$,\s]/g, ""));
  if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000)) return bad("A price must be a number.");
  const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
  const asOf = typeof b.price_as_of === "string" && ISO.test(b.price_as_of) ? b.price_as_of : cost === null ? null : new Date().toISOString().slice(0, 10);
  const r = await setVendorPrice(supabase, orgId, id, vendor, {
    unit_cost: cost, vendor_sku: text(b.vendor_sku, 60), unit: text(b.unit, 20), note: text(b.note, 300),
    price_as_of: asOf, price_source: cost === null ? null : "typed", price_file_id: null, price_import_id: null,
  }, b.make_default === true ? true : "if_none");
  if (!r.ok) return bad(r.error, r.error === "No such item." ? 404 : 500);
  return applyCookies(NextResponse.json({ source: r.source, sources: await sourcesFor(supabase, orgId, [id]) }, { status: 201 }));
}
