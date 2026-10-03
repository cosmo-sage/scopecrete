import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * A card's price history (migration 049), newest first: every price it has
 * had, when, from where (typed, a quote, an import, a receipt), and the file
 * or import it came from, and whose price it was (migration 051: one row per
 * vendor price). Written by the database, so nothing can change a price
 * without leaving a row here.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: card } = await supabase.from("cost_items").select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!card) return applyCookies(NextResponse.json({ error: "No such card." }, { status: 404 }));
  const { data, error } = await supabase.from("cost_item_prices")
    .select("id, unit_cost, price_as_of, price_source, import_id, source_file_id, recorded_at, source_id, cost_imports(file_name, kind), files(name), source:cost_item_sources(vendor_contact_id, vendor:contacts!cost_item_sources_vendor_contact_id_fkey(name, company_name))")
    .eq("org_id", orgId).eq("cost_item_id", id).order("recorded_at", { ascending: false }).limit(50);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const imp = (Array.isArray(r.cost_imports) ? r.cost_imports[0] : r.cost_imports) as { file_name: string | null; kind: string } | null;
    const f = (Array.isArray(r.files) ? r.files[0] : r.files) as { name: string | null } | null;
    const src = (Array.isArray(r.source) ? r.source[0] : r.source) as { vendor_contact_id: string; vendor: { name: string | null; company_name: string | null } | null } | null;
    return {
      id: r.id, unit_cost: r.unit_cost === null ? null : Number(r.unit_cost), price_as_of: r.price_as_of, price_source: r.price_source,
      recorded_at: r.recorded_at, import_name: imp?.file_name ?? null, file_id: r.source_file_id, file_name: f?.name ?? null,
      vendor_id: src?.vendor_contact_id ?? null, vendor_name: src?.vendor?.name ?? src?.vendor?.company_name ?? null,
    };
  });
  return applyCookies(NextResponse.json({ history: rows }));
}
