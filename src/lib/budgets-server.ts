import type { ApiSession } from "@/lib/api-auth";
import { budget, type BudgetLine, type SectionInput } from "@/lib/engine";
import { numLine, workingEstimate } from "@/lib/budget-server";
import { pricingFor } from "@/lib/pricing-server";
import { takeoffTotalsFor } from "@/lib/plans-server";
import { cleanBudgetName, suggestBudgetName } from "@/lib/budgets";

/**
 * A job's budgets (migration 088). The open one is the estimate with status
 * 'draft' — what the budget screen, the proposal, the Dashboard and Dusty
 * read; the others are 'saved', kept whole with their own lines. Opening one
 * puts the open one aside in the same transaction (sc_open_budget). Session
 * client only; every query also filters the org from the session.
 */

type Sb = ApiSession["supabase"];

export const BUDGETS_MISSING = "Saving and naming budgets needs migration 088 — say \"apply 088\".";
export const missing088 = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === "42703" || e.code === "PGRST202" || e.code === "PGRST204" || /\bname\b.*does not exist|sc_open_budget|estimate_id/.test(e.message ?? ""));

export interface BudgetRow {
  id: string; name: string | null; open: boolean; lines: number; total: number | null; partial: boolean
  created_at: string; updated_at: string
}

const LINE_COLS = "id, estimate_id, option_id, section_id, cost_group_id, cost_item_id, name, cost_type, unit, unit_cost, markup_pct, margin_pct, taxable, qty_rule, rule_params, qty_source, quantity, takeoff_parameter_id, show_on_doc";

/** Every budget on the job, the open one first, each with its line count and total. */
export async function listBudgets(sb: Sb, orgId: string, jobId: string) {
  const { data, error } = await sb.from("estimates").select("id, name, status, tax_on, discount_amount, margin_pct, overhead_pct, created_at, updated_at")
    .eq("org_id", orgId).eq("job_id", jobId).in("status", ["draft", "saved"]).order("updated_at", { ascending: false });
  if (missing088(error)) return { ready: false as const, error: BUDGETS_MISSING };
  if (error) return { ready: false as const, error: error.message };
  const ests = (data ?? []) as Array<Record<string, unknown>>;
  const ids = ests.map((e) => e.id as string);
  const [{ data: rows }, { data: secs }, pricing, takeoff] = await Promise.all([
    ids.length ? sb.from("estimate_line_items").select(LINE_COLS).eq("org_id", orgId).in("estimate_id", ids) : Promise.resolve({ data: [] }),
    sb.from("job_sections").select("id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, count_qty, count_unit").eq("org_id", orgId).eq("job_id", jobId),
    pricingFor(sb, orgId, [jobId]),
    takeoffTotalsFor(sb, orgId, jobId),
  ]);
  const lines = ((rows ?? []) as Array<Record<string, unknown>>).map(numLine) as unknown as Array<BudgetLine & { estimate_id: string }>;
  const p = pricing.get(jobId);
  const budgets: BudgetRow[] = ests.map((e) => {
    const mine = lines.filter((l) => l.estimate_id === e.id);
    // Each budget is priced at its own O.H. and margin.
    const own = (v: unknown, d: number | null | undefined) => (v === null || v === undefined ? d ?? null : Number(v));
    const settings = p ? { ...p.settings, margin_pct: own(e.margin_pct, p.settings.margin_pct), overhead_pct: own(e.overhead_pct, p.settings.overhead_pct) } : null;
    const res = p && settings && mine.length ? budget(mine, [], settings as typeof p.settings, (secs ?? []) as SectionInput[], p.days,
      { tax_on: e.tax_on === true, discount: Number(e.discount_amount ?? 0), takeoff: takeoff as never }) : null;
    const tier = res?.tiers[0] ?? null;
    return {
      id: e.id as string, name: (e.name as string | null) ?? null, open: e.status === "draft", lines: mine.length,
      total: tier ? tier.total : null, partial: tier ? !tier.priced : false,
      created_at: e.created_at as string, updated_at: e.updated_at as string,
    };
  }).sort((a, b) => Number(b.open) - Number(a.open));
  const open = budgets.find((b) => b.open) ?? null;
  const others = budgets.filter((b) => !b.open).map((b) => b.name);
  // What to call the open one if it has no name, and what to call a new one.
  const openName = open?.name ?? suggestBudgetName(others);
  return { ready: true as const, budgets, suggest: { open: openName, next: suggestBudgetName([...others, openName]) } };
}

/** Name (or rename) one of the job's budgets. */
export async function renameBudget(sb: Sb, orgId: string, jobId: string, id: string, name: unknown) {
  const n = cleanBudgetName(name);
  if (!n) return { ok: false as const, status: 400, error: "Give it a name." };
  const { data, error } = await sb.from("estimates").update({ name: n, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("job_id", jobId).eq("id", id).in("status", ["draft", "saved"]).select("id");
  if (missing088(error)) return { ok: false as const, status: 503, error: BUDGETS_MISSING };
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!data?.length) return { ok: false as const, status: 404, error: "No such budget." };
  return { ok: true as const };
}

/** Open a saved budget; the open one is kept, under `parkName` if it has no name. */
export async function openBudget(sb: Sb, orgId: string, jobId: string, id: string, parkName: unknown) {
  const { error } = await sb.rpc("sc_open_budget", { p_job: jobId, p_open: id, p_name: cleanBudgetName(parkName) ?? "" });
  if (missing088(error)) return { ok: false as const, status: 503, error: BUDGETS_MISSING };
  if (error) return { ok: false as const, status: /not found/.test(error.message) ? 404 : 500, error: /budget not found/.test(error.message) ? "No such budget." : error.message };
  return { ok: true as const };
}

/**
 * Put the open budget aside (named `parkName` if it has none) and open a new,
 * empty one called `name`, from the job type's (else the org's) O.H. and
 * margin like any new budget. Returns the new budget's id.
 */
export async function startBudget(sb: Sb, orgId: string, jobId: string, name: unknown, parkName: unknown) {
  const cur = await workingEstimate(sb, orgId, jobId, false);
  if (cur) {
    const { error } = await sb.rpc("sc_open_budget", { p_job: jobId, p_open: null, p_name: cleanBudgetName(parkName) ?? "" });
    if (missing088(error)) return { ok: false as const, status: 503, error: BUDGETS_MISSING };
    if (error) return { ok: false as const, status: 500, error: error.message };
  }
  const made = await workingEstimate(sb, orgId, jobId, true);
  if (!made) return { ok: false as const, status: 500, error: "Couldn't start the budget." };
  const n = cleanBudgetName(name);
  if (n) await sb.from("estimates").update({ name: n }).eq("org_id", orgId).eq("id", made.id as string);
  return { ok: true as const, id: made.id as string };
}
