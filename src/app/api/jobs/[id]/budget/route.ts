import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { ESTIMATE_COLUMNS, LINE_COLUMNS, jobInOrg, numLine, workingEstimate } from "@/lib/budget-server";

/**
 * The job's budget (migration 048): the working estimate, its options (good /
 * better / best) and lines, plus what the maths and the card picker need —
 * the markups, tax and waste from Cost settings, each group's markup, and the
 * active cost cards. The engine prices it (src/lib/engine budget()), in the
 * browser and for Dusty alike, so there is one set of numbers.
 *
 * PATCH { tax_on?, discount_amount?, discount_reason? } — the budget's own switches.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));

  const est = await workingEstimate(supabase, orgId, id, false);
  const [opts, lines, groups, cards, settings] = await Promise.all([
    est ? supabase.from("estimate_options").select("id, label, description, sort_order").eq("org_id", orgId).eq("estimate_id", est.id as string).order("sort_order")
      : Promise.resolve({ data: [] }),
    est ? supabase.from("estimate_line_items").select(LINE_COLUMNS).eq("estimate_id", est.id as string).order("sort_order").order("name")
      : Promise.resolve({ data: [] }),
    supabase.from("cost_groups").select("id, name, cost_type, default_markup_pct, sort_order").eq("org_id", orgId).order("sort_order").order("name"),
    supabase.from("cost_items").select("id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, markup_pct, vendor_contact_id, price_as_of, price_source, qty_rule, rule_params, updated_at")
      .eq("org_id", orgId).eq("active", true).order("sort_order").order("name"),
    supabase.from("org_cost_settings").select("markup_material_pct, markup_labor_pct, markup_equipment_pct, markup_subcontract_pct, sales_tax_pct, concrete_overage_pct, shortload_threshold_cy")
      .eq("org_id", orgId).maybeSingle(),
  ]);
  const vendorIds = [...new Set(((lines.data ?? []) as Array<{ vendor_contact_id: string | null }>).map((l) => l.vendor_contact_id).filter(Boolean) as string[])];
  const { data: vendors } = vendorIds.length
    ? await supabase.from("contacts").select("id, name, phone").eq("org_id", orgId).in("id", vendorIds)
    : { data: [] };
  const s = (settings.data ?? {}) as Record<string, unknown>;
  const n = (k: string) => (s[k] === null || s[k] === undefined ? null : Number(s[k]));
  return applyCookies(NextResponse.json({
    estimate: est ? { ...est, discount_amount: Number(est.discount_amount ?? 0) } : null,
    options: opts.data ?? [],
    lines: ((lines.data ?? []) as Array<Record<string, unknown>>).map(numLine),
    groups: ((groups.data ?? []) as Array<Record<string, unknown>>).map((g) => ({ ...g, default_markup_pct: g.default_markup_pct === null ? null : Number(g.default_markup_pct) })),
    cards: ((cards.data ?? []) as Array<Record<string, unknown>>).map((c) => ({ ...c, unit_cost: c.unit_cost === null ? null : Number(c.unit_cost), markup_pct: c.markup_pct === null ? null : Number(c.markup_pct) })),
    vendors: vendors ?? [],
    settings: {
      markup_material_pct: n("markup_material_pct"), markup_labor_pct: n("markup_labor_pct"), markup_equipment_pct: n("markup_equipment_pct"),
      markup_subcontract_pct: n("markup_subcontract_pct"), sales_tax_pct: n("sales_tax_pct"),
      concrete_overage_pct: n("concrete_overage_pct"), shortload_threshold_cy: n("shortload_threshold_cy"),
    },
  }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const patch: Record<string, unknown> = {};
  if ("tax_on" in b) patch.tax_on = b.tax_on === true;
  if ("discount_amount" in b) {
    const d = b.discount_amount === null || b.discount_amount === "" ? 0 : Number(b.discount_amount);
    // Discount is a positive number taken off the price column only (§3).
    if (!Number.isFinite(d) || d < 0) return bad("A discount is a positive amount.");
    patch.discount_amount = d;
  }
  if ("discount_reason" in b) patch.discount_reason = typeof b.discount_reason === "string" && b.discount_reason.trim() ? b.discount_reason.trim().slice(0, 200) : null;
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const est = await workingEstimate(supabase, orgId, id, true);
  if (!est) return bad("Couldn't open the budget.", 500);
  const { data, error } = await supabase.from("estimates").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", est.id as string).eq("org_id", orgId).select(ESTIMATE_COLUMNS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ estimate: { ...data, discount_amount: Number(data.discount_amount ?? 0) } }));
}
