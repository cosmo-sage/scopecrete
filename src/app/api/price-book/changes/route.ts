import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * The Price book's changes, for Logs → Price book (Coy, 2026-10-07: "remove
 * this line and create a tab in the 'logs' page for all the changes").
 *
 * GET → { imports: the last 20 imports, newest first (Undo is
 *         /api/price-book/import/[id]/undo, as before),
 *         prices: the last 80 price changes on any item — the history the
 *         database writes on every price (migration 049), with the item, the
 *         vendor and where it came from }.
 * Session client, org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const [imp, hist] = await Promise.all([
    supabase.from("cost_imports")
      .select("id, kind, file_name, source, created_count, updated_count, unchanged_count, skipped_count, created_at, undone_at")
      .eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
    supabase.from("cost_item_prices")
      .select("id, cost_item_id, unit_cost, price_source, recorded_at, cost_items(name, unit), cost_imports(file_name), files(name), source:cost_item_sources(vendor:contacts!cost_item_sources_vendor_contact_id_fkey(name, company_name))")
      .eq("org_id", orgId).order("recorded_at", { ascending: false }).limit(80),
  ]);
  if (imp.error) return applyCookies(NextResponse.json({ error: imp.error.message }, { status: 500 }));
  if (hist.error) return applyCookies(NextResponse.json({ error: hist.error.message }, { status: 500 }));
  const one = <X,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as X | null;
  const prices = ((hist.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const item = one<{ name: string | null; unit: string | null }>(r.cost_items);
    const im = one<{ file_name: string | null }>(r.cost_imports);
    const f = one<{ name: string | null }>(r.files);
    const src = one<{ vendor: { name: string | null; company_name: string | null } | null }>(r.source);
    const vendor = src ? one<{ name: string | null; company_name: string | null }>(src.vendor) : null;
    return {
      id: r.id, item_id: r.cost_item_id, item: item?.name ?? null, unit: item?.unit ?? null,
      unit_cost: r.unit_cost === null ? null : Number(r.unit_cost), price_source: r.price_source, at: r.recorded_at,
      from: im?.file_name ?? f?.name ?? null, vendor: vendor?.name ?? vendor?.company_name ?? null,
    };
  });
  return applyCookies(NextResponse.json({ imports: imp.data ?? [], prices }));
}
