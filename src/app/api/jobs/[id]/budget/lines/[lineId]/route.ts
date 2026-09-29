import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { LINE_COLUMNS, jobInOrg, numLine } from "@/lib/budget-server";

/**
 * One budget line. PATCH what Coy changes in the grid or the phone sheet:
 *   quantity (a typed quantity → qty_source 'set'; { qty_source: 'rule' } goes
 *   back to the rule), unit_cost, markup_pct, taxable, option_id, section_id,
 *   name, description, the show switches — or { refresh: true } to copy the
 *   card's current price onto it. DELETE removes it.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function lineOf(sb: Parameters<typeof jobInOrg>[0], orgId: string, jobId: string, lineId: string) {
  const { data } = await sb.from("estimate_line_items").select("id, estimate_id, cost_item_id, qty_rule, estimates!inner(job_id, org_id)")
    .eq("id", lineId).eq("estimates.job_id", jobId).eq("estimates.org_id", orgId).maybeSingle();
  return data as { id: string; estimate_id: string; cost_item_id: string | null; qty_rule: string } | null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; lineId: string }> }) {
  const { id, lineId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  const line = await lineOf(supabase, orgId, id, lineId);
  if (!line) return bad("No such line.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }

  const patch: Record<string, unknown> = {};
  const numOrNull = (v: unknown, min: number, max: number, label: string): number | null | Error => {
    if (v === null || v === "" || v === undefined) return null;
    const n = Number(String(v).replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) && n >= min && n <= max ? n : new Error(`${label} must be a number from ${min} to ${max}.`);
  };
  if ("quantity" in b) {
    const q = numOrNull(b.quantity, 0, 1_000_000, "Quantity");
    if (q instanceof Error) return bad(q.message);
    patch.quantity = q;
    patch.qty_source = "set";
  }
  if (b.qty_source === "rule") {
    if (line.qty_rule === "manual") return bad("This line has no rule to go back to — type its quantity.");
    patch.qty_source = "rule"; patch.quantity = null;
  }
  if ("unit_cost" in b) { const v = numOrNull(b.unit_cost, 0, 1_000_000, "Unit cost"); if (v instanceof Error) return bad(v.message); patch.unit_cost = v; }
  if ("markup_pct" in b) { const v = numOrNull(b.markup_pct, 0, 500, "Markup"); if (v instanceof Error) return bad(v.message); patch.markup_pct = v; }
  if ("taxable" in b) patch.taxable = b.taxable === true;
  for (const k of ["show_on_doc", "show_qty", "show_price"] as const) if (k in b) patch[k] = b[k] === true;
  if ("name" in b) {
    const n = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (!n) return bad("A line needs a name.");
    patch.name = n;
  }
  if ("description" in b) patch.description = typeof b.description === "string" && b.description.trim() ? b.description.trim().slice(0, 500) : null;
  if ("section_id" in b) {
    if (b.section_id === null) patch.section_id = null;
    else if (typeof b.section_id === "string" && UUID.test(b.section_id)) {
      const { data: s } = await supabase.from("job_sections").select("id").eq("org_id", orgId).eq("job_id", id).eq("id", b.section_id).maybeSingle();
      if (!s) return bad("That area isn't on this job.");
      patch.section_id = s.id;
    } else return bad("Bad area.");
  }
  if ("option_id" in b) {
    if (b.option_id === null) patch.option_id = null;
    else if (typeof b.option_id === "string" && UUID.test(b.option_id)) {
      const { data: o } = await supabase.from("estimate_options").select("id").eq("org_id", orgId).eq("estimate_id", line.estimate_id).eq("id", b.option_id).maybeSingle();
      if (!o) return bad("No such option.");
      patch.option_id = o.id;
    } else return bad("Bad option.");
  }
  if (b.refresh === true) {
    if (!line.cost_item_id) return bad("This line didn't come from a card.");
    const { data: c } = await supabase.from("cost_items").select("unit_cost, price_as_of, price_source, unit").eq("org_id", orgId).eq("id", line.cost_item_id).maybeSingle();
    if (!c) return bad("That card is gone.");
    Object.assign(patch, { unit_cost: c.unit_cost, price_as_of: c.price_as_of, price_source: c.price_source, unit: c.unit });
  }
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("estimate_line_items").update(patch).eq("id", lineId).select(LINE_COLUMNS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ line: numLine(data as Record<string, unknown>) }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; lineId: string }> }) {
  const { id, lineId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const line = await lineOf(supabase, orgId, id, lineId);
  if (!line) return applyCookies(NextResponse.json({ error: "No such line." }, { status: 404 }));
  const { error } = await supabase.from("estimate_line_items").delete().eq("id", lineId);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
