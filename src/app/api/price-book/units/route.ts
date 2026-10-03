import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanUnit } from "@/lib/units";

/**
 * The Price book's units (Coy, 2026-10-03: "I need to be able to add and edit
 * unit types from this panel and inside the costbook").
 *
 * GET — every unit on the org's items, with how many items use it.
 * PATCH { from, to } — rename a unit on every item (and vendor price) that uses
 * it, e.g. "sqft" → "SF". Budget lines keep their own copies, like a price.
 * Session client, org from the session.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("cost_items").select("unit").eq("org_id", orgId).eq("active", true).limit(5000);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const count = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ unit: string | null }>) {
    const u = (r.unit ?? "").trim();
    if (u) count.set(u, (count.get(u) ?? 0) + 1);
  }
  const units = [...count].map(([unit, n]) => ({ unit, count: n })).sort((a, b) => b.count - a.count || a.unit.localeCompare(b.unit));
  return applyCookies(NextResponse.json({ units }));
}

export async function PATCH(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: { from?: unknown; to?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const from = typeof b.from === "string" ? b.from.trim() : "";
  const to = cleanUnit(b.to);
  if (!from) return bad("Which unit?");
  if (!to) return bad("A unit is 1 to 20 characters.");
  if (from === to) return bad("Nothing to change.");
  const { data, error } = await supabase.from("cost_items").update({ unit: to, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("unit", from).select("id");
  if (error) return bad(error.message, 500);
  const { error: e2 } = await supabase.from("cost_item_sources").update({ unit: to }).eq("org_id", orgId).eq("unit", from);
  if (e2) return bad(e2.message, 500);
  return applyCookies(NextResponse.json({ renamed: (data ?? []).length }));
}
