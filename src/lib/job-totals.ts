import type { ApiSession } from "@/lib/api-auth";
import { budget, type BudgetLine, type SectionInput } from "@/lib/engine";
import { pricingFor } from "@/lib/pricing-server";
import { loadTakeoff } from "@/lib/plans-server";

/**
 * What jobs are worth, by the same budget() the job page and Dusty use
 * (DECISIONS §3) — for the Dashboard's money tiles. Session client, org from
 * the session; every read is filtered by org as well as RLS.
 *
 * A job's value is the option the customer accepted (`selected_option_id`),
 * else its only option, else — several options and none chosen — the lowest
 * priced one, said as "from". A job with no budget lines, or whose tier is
 * blocked, has NO value: it is counted as unpriced, never as $0.
 */

type Sb = ApiSession["supabase"];
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export interface JobValue { total: number | null; basis: "accepted" | "only" | "lowest" | null; why: string | null }

export async function jobValues(sb: Sb, orgId: string, jobs: Array<{ id: string; duration_days: unknown }>): Promise<Map<string, JobValue>> {
  const out = new Map<string, JobValue>();
  if (!jobs.length) return out;
  const ids = jobs.map((j) => j.id);
  const { data: ests } = await sb.from("estimates").select("id, job_id, tax_on, discount_amount, selected_option_id")
    .eq("org_id", orgId).eq("status", "draft").in("job_id", ids);
  const estRows = (ests ?? []) as Array<{ id: string; job_id: string; tax_on: boolean | null; discount_amount: unknown; selected_option_id: string | null }>;
  const estIds = estRows.map((e) => e.id);
  const [{ data: opts }, { data: rows }, pricing, { data: secs }, takeoff] = await Promise.all([
    estIds.length ? sb.from("estimate_options").select("id, estimate_id").eq("org_id", orgId).in("estimate_id", estIds) : Promise.resolve({ data: [] }),
    estIds.length ? sb.from("estimate_line_items").select("id, estimate_id, name, cost_type, unit, unit_cost, margin_pct, taxable, qty_rule, rule_params, qty_source, quantity, section_id, option_id, cost_group_id, takeoff_parameter_id")
      .in("estimate_id", estIds) : Promise.resolve({ data: [] }),
    pricingFor(sb, orgId, ids),
    sb.from("job_sections").select("id, job_id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi").eq("org_id", orgId).in("job_id", ids),
    // Plan Room groups (059): a line counted from a takeoff reads its measured total.
    estIds.length ? loadTakeoff(sb, orgId, ids) : Promise.resolve({ totals: {} }),
  ]);
  const lineRows = (rows ?? []) as Array<Record<string, unknown>>;
  const optRows = (opts ?? []) as Array<{ id: string; estimate_id: string }>;
  const secRows = (secs ?? []) as Array<Record<string, unknown>>;

  for (const j of jobs) {
    const est = estRows.find((e) => e.job_id === j.id);
    const lines = est ? lineRows.filter((l) => l.estimate_id === est.id).map((r) => ({
      ...r, unit_cost: num(r.unit_cost), margin_pct: num(r.margin_pct), quantity: num(r.quantity),
    })) as unknown as BudgetLine[] : [];
    if (!est || !lines.length) { out.set(j.id, { total: null, basis: null, why: "no budget" }); continue; }
    const sections: SectionInput[] = secRows.filter((r) => r.job_id === j.id).map((r) => ({
      id: r.id as string, name: r.name as string | null, work_type: r.work_type as string,
      length_ft: num(r.length_ft), width_ft: num(r.width_ft), sqft_override: num(r.sqft_override), depth_in: num(r.depth_in), psi: num(r.psi),
    }));
    const optionIds = optRows.filter((o) => o.estimate_id === est.id).map((o) => o.id);
    const st = pricing.get(j.id)?.settings ?? { margin_pct: null, overhead_pct: null, tax_rate_pct: null };
    const res = budget(lines, optionIds, st, sections, num(j.duration_days), {
      tax_on: est.tax_on !== false, discount: Number(est.discount_amount ?? 0), takeoff: takeoff.totals,
    });
    const chosen = est.selected_option_id ? res.tiers.find((t) => t.option_id === est.selected_option_id) : null;
    if (chosen) { out.set(j.id, chosen.priced ? { total: chosen.total, basis: "accepted", why: null } : { total: null, basis: null, why: "blocked" }); continue; }
    if (res.tiers.length === 1) {
      const t = res.tiers[0];
      out.set(j.id, t.priced ? { total: t.total, basis: "only", why: null } : { total: null, basis: null, why: "blocked" });
      continue;
    }
    const priced = res.tiers.filter((t) => t.priced).map((t) => t.total);
    out.set(j.id, priced.length ? { total: Math.min(...priced), basis: "lowest", why: null } : { total: null, basis: null, why: "blocked" });
  }
  return out;
}
