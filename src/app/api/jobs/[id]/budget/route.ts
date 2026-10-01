import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { ESTIMATE_COLUMNS, LINE_COLUMNS, jobInOrg, numLine, workingEstimate } from "@/lib/budget-server";
import { sourcesFor } from "@/lib/sources-server";
import { pricingFor } from "@/lib/pricing-server";
import { takeoffTotalsFor } from "@/lib/plans-server";

/**
 * The job's budget (migration 048): the working estimate, its options (good /
 * better / best) and lines, plus what the maths and the card picker need —
 * the job's pricing (its O.H. and margin, else the org's defaults, and its
 * sales tax from its parish — src/lib/pricing-server.ts), and the active
 * cost cards. The engine prices it (src/lib/engine budget()), in the
 * browser and for Dusty alike, so there is one set of numbers.
 * `sources`: every vendor's price on the items the lines came from — the
 * line's vendor picker (migration 051).
 *
 * PATCH { tax_on?, discount_amount?, discount_reason?, margin_pct?, overhead_pct? }
 *   — the budget's own switches; null margin / O.H. goes back to the default.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));

  const est = await workingEstimate(supabase, orgId, id, false);
  const [opts, lines, groups, cards, pricing, assemblies, takeoff] = await Promise.all([
    est ? supabase.from("estimate_options").select("id, label, description, sort_order").eq("org_id", orgId).eq("estimate_id", est.id as string).order("sort_order")
      : Promise.resolve({ data: [] }),
    est ? supabase.from("estimate_line_items").select(LINE_COLUMNS).eq("estimate_id", est.id as string).order("sort_order").order("name")
      : Promise.resolve({ data: [] }),
    supabase.from("cost_groups").select("id, name, cost_type, default_markup_pct, sort_order").eq("org_id", orgId).order("sort_order").order("name"),
    supabase.from("cost_items").select("id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, markup_pct, vendor_contact_id, price_as_of, price_source, qty_rule, rule_params, updated_at, default_source_id")
      .eq("org_id", orgId).eq("active", true).order("sort_order").order("name"),
    pricingFor(supabase, orgId, [id]),
    supabase.from("cost_assemblies").select("id, name, job_type, work_type").eq("org_id", orgId).order("sort_order").order("name"),
    // Plan Room groups (059): lines counted from a takeoff read these totals.
    takeoffTotalsFor(supabase, orgId, id),
  ]);
  const lineItems = [...new Set(((lines.data ?? []) as Array<{ cost_item_id: string | null }>).map((l) => l.cost_item_id).filter(Boolean) as string[])];
  const sources = await sourcesFor(supabase, orgId, lineItems);
  const vendorIds = [...new Set(((lines.data ?? []) as Array<{ vendor_contact_id: string | null }>).map((l) => l.vendor_contact_id).filter(Boolean) as string[])];
  const { data: vendors } = vendorIds.length
    ? await supabase.from("contacts").select("id, name, phone").eq("org_id", orgId).in("id", vendorIds)
    : { data: [] };
  const p = pricing.get(id);
  return applyCookies(NextResponse.json({
    estimate: est ? { ...est, discount_amount: Number(est.discount_amount ?? 0) } : null,
    options: opts.data ?? [],
    lines: ((lines.data ?? []) as Array<Record<string, unknown>>).map(numLine),
    groups: ((groups.data ?? []) as Array<Record<string, unknown>>).map((g) => ({ ...g, default_markup_pct: g.default_markup_pct === null ? null : Number(g.default_markup_pct) })),
    cards: ((cards.data ?? []) as Array<Record<string, unknown>>).map((c) => ({ ...c, unit_cost: c.unit_cost === null ? null : Number(c.unit_cost), markup_pct: c.markup_pct === null ? null : Number(c.markup_pct) })),
    vendors: vendors ?? [],
    sources,
    assemblies: assemblies.data ?? [],
    settings: p?.settings ?? { margin_pct: null, overhead_pct: null, tax_rate_pct: null },
    pricing: p ? { tax: p.tax, days: p.days, day_minimum: p.day_minimum, margin_from: p.margin_from, overhead_from: p.overhead_from } : null,
    takeoff,
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
  for (const k of ["margin_pct", "overhead_pct"] as const) {
    if (!(k in b)) continue;
    if (b[k] === null || b[k] === "") { patch[k] = null; continue; }
    const v = Number(b[k]);
    const max = k === "margin_pct" ? 99.9 : 200;
    if (!Number.isFinite(v) || v < 0 || v > max) return bad(k === "margin_pct" ? "Margin is 0 to under 100%." : "O.H. is 0 to 200%.");
    patch[k] = v;
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
