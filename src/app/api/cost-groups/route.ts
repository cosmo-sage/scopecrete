import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { COST_TYPES } from "@/lib/cost-cards";

/**
 * Cost groups — how cards are organised (Ready mix, Steel, Forming lumber,
 * Labor, Equipment…), the same groups the budget and the proposal show.
 * POST { name, cost_type, default_markup_pct? }.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: { name?: unknown; cost_type?: unknown; default_markup_pct?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!name) return bad("A group needs a name.");
  if (!(COST_TYPES as readonly string[]).includes(String(b.cost_type))) return bad("Pick a cost type.");
  const m = b.default_markup_pct === null || b.default_markup_pct === undefined || b.default_markup_pct === "" ? null : Number(b.default_markup_pct);
  if (m !== null && (!Number.isFinite(m) || m < 0 || m > 500)) return bad("Markup must be 0 to 500.");
  const { count } = await supabase.from("cost_groups").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { data, error } = await supabase.from("cost_groups")
    .insert({ org_id: orgId, name, cost_type: b.cost_type, default_markup_pct: m, sort_order: count ?? 0 })
    .select("id, name, cost_type, default_markup_pct, sort_order").single();
  if (error || !data) return bad(`Couldn't save the group: ${error?.message ?? "no row"}`, 500);
  return applyCookies(NextResponse.json({ group: data }, { status: 201 }));
}
