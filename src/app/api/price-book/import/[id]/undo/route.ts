import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Undo an import (migration 049). The cards it created are retired (kept, like
 * any retired card, so a budget that already used one still reads). A card
 * whose price it changed goes back to the price before — but only while the
 * import's price is still the card's price; one Coy changed since is left
 * alone and counted as kept. Nothing is deleted: history records the undo.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));

  const { data: imp } = await supabase.from("cost_imports").select("id, undone_at").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!imp) return bad("No such import.", 404);
  if (imp.undone_at) return bad("Already undone.");
  const now = new Date().toISOString();

  const { data: retired, error: rErr } = await supabase.from("cost_items").update({ active: false, updated_at: now })
    .eq("org_id", orgId).eq("import_id", id).eq("active", true).select("id");
  if (rErr) return bad(rErr.message, 500);
  const made = new Set(((retired ?? []) as Array<{ id: string }>).map((r) => r.id));

  // Price changes still standing: the card's current price is the import's.
  const { data: stamped } = await supabase.from("cost_items").select("id").eq("org_id", orgId).eq("price_import_id", id);
  let restored = 0;
  for (const c of ((stamped ?? []) as Array<{ id: string }>).filter((c) => !made.has(c.id))) {
    const { data: hist } = await supabase.from("cost_item_prices")
      .select("unit_cost, price_as_of, price_source, import_id, source_file_id").eq("org_id", orgId).eq("cost_item_id", c.id)
      .order("recorded_at", { ascending: false }).limit(2);
    const prev = (hist ?? [])[1] as { unit_cost: number | null; price_as_of: string | null; price_source: string | null; import_id: string | null; source_file_id: string | null } | undefined;
    const back = prev
      ? { unit_cost: prev.unit_cost, price_as_of: prev.price_as_of, price_source: prev.price_source, price_import_id: prev.import_id, price_file_id: prev.source_file_id }
      : { unit_cost: null, price_as_of: null, price_source: null, price_import_id: null, price_file_id: null };
    const { error } = await supabase.from("cost_items").update({ ...back, updated_at: now }).eq("org_id", orgId).eq("id", c.id);
    if (error) return bad(error.message, 500);
    restored++;
  }
  const { count: total } = await supabase.from("cost_item_prices").select("cost_item_id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("import_id", id);
  await supabase.from("cost_imports").update({ undone_at: now }).eq("org_id", orgId).eq("id", id);
  return applyCookies(NextResponse.json({ retired: made.size, restored, kept: Math.max(0, (total ?? 0) - made.size - restored) }));
}
