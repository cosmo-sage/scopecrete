import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanCard } from "@/lib/cost-cards";
import { CARD_COLS, LINE_COLUMNS, cardToLine, jobInOrg, numLine, workingEstimate } from "@/lib/budget-server";
import { paramInJob } from "@/lib/plans-server";

/**
 * Add lines to the job's budget.
 *
 * POST { cost_item_id | cost_group_id (the whole group) | custom card fields,
 *        section_id?, option_id?, takeoff_parameter_id? }
 *
 * With takeoff_parameter_id (the Plan Room's Send to budget, migration 059)
 * the line's quantity is that group's measured total: rule 'from_takeoff',
 * so re-measuring moves the line. One card only.
 *
 * A card is COPIED onto the line — name, unit, unit cost, type, taxed,
 * rule, vendor and price date — so a later change to the card never silently
 * reprices a budget or a quote that went out; the screen offers "update"
 * when the card is newer. The working estimate is made on first use.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

  const sectionId = uuid(b.section_id);
  if (sectionId) {
    const { data: s } = await supabase.from("job_sections").select("id").eq("org_id", orgId).eq("job_id", id).eq("id", sectionId).maybeSingle();
    if (!s) return bad("That area isn't on this job.");
  }
  const est = await workingEstimate(supabase, orgId, id, true);
  if (!est) return bad("Couldn't open the budget.", 500);
  const optionId = uuid(b.option_id);
  if (optionId) {
    const { data: o } = await supabase.from("estimate_options").select("id").eq("org_id", orgId).eq("estimate_id", est.id as string).eq("id", optionId).maybeSingle();
    if (!o) return bad("No such option.");
  }

  const takeoffId = uuid(b.takeoff_parameter_id);
  if (b.takeoff_parameter_id !== undefined && b.takeoff_parameter_id !== null) {
    if (!takeoffId || !(await paramInJob(supabase, orgId, id, takeoffId))) return bad("No such takeoff group on this job.", 404);
    if (uuid(b.cost_group_id)) return bad("Send a takeoff group to one card, not a whole group of cards.");
  }

  // Which cards: one, a whole group, or a one-off typed here.
  let cards: Array<Record<string, unknown>> = [];
  if (uuid(b.cost_item_id)) {
    const { data } = await supabase.from("cost_items").select(CARD_COLS).eq("org_id", orgId).eq("id", b.cost_item_id as string).maybeSingle();
    if (!data) return bad("No such card.", 404);
    cards = [data];
  } else if (uuid(b.cost_group_id)) {
    const { data } = await supabase.from("cost_items").select(CARD_COLS).eq("org_id", orgId).eq("cost_group_id", b.cost_group_id as string)
      .eq("active", true).order("sort_order").order("name");
    cards = data ?? [];
    if (!cards.length) return bad("That group has no cards yet.");
  } else {
    const c = cleanCard(b);
    if (!c.ok) return bad(c.error);
    cards = [{ ...c.card, id: null }];
  }

  const { count } = await supabase.from("estimate_line_items").select("id", { count: "exact", head: true }).eq("estimate_id", est.id as string);
  const rows = cards.map((c, i) => {
    const row = cardToLine(c, { orgId, estimateId: est.id as string, sectionId, optionId, sortOrder: (count ?? 0) + i });
    // Measured on the plans: the group's total, in the card's unit (the engine checks they agree).
    return takeoffId ? { ...row, qty_rule: "from_takeoff", qty_source: "rule", quantity: null, takeoff_parameter_id: takeoffId, section_id: null } : row;
  });
  const { data, error } = await supabase.from("estimate_line_items").insert(rows).select(LINE_COLUMNS);
  if (error) return bad(`Couldn't add: ${error.message}`, 500);
  return applyCookies(NextResponse.json({ lines: ((data ?? []) as Array<Record<string, unknown>>).map(numLine), estimate_id: est.id }, { status: 201 }));
}
