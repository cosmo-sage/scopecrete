import type { ApiSession } from "@/lib/api-auth";
import type { BudgetSettings } from "@/lib/engine";
import { addressParts, jobTax, type JobTax, type TaxLookup } from "@/lib/tax";
import { readRisk, riskOf, type RiskSettings } from "@/lib/risk";

/**
 * What each job is priced with (migration 057, Coy 2026-09-30): its budget's
 * O.H. % and margin % — else the org's defaults (Price book → Defaults) — and
 * its sales tax from its parish. One reader for the budget API, the Dashboard
 * totals and Dusty, so all three price a job the same way. Session client;
 * every read filters the org as well as RLS.
 */

type Sb = ApiSession["supabase"];
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export interface MoneySettings {
  default_margin_pct: number | null; default_overhead_pct: number | null; day_minimum: number | null;
  comp_mode: string | null; comp_monthly_draw: number | null; comp_profit_pct: number | null;
}

export async function moneySettings(sb: Sb, orgId: string): Promise<MoneySettings> {
  const { data } = await sb.from("org_money_settings")
    .select("default_margin_pct, default_overhead_pct, day_minimum, comp_mode, comp_monthly_draw, comp_profit_pct").eq("org_id", orgId).maybeSingle();
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    default_margin_pct: num(r.default_margin_pct), default_overhead_pct: num(r.default_overhead_pct), day_minimum: num(r.day_minimum),
    comp_mode: (r.comp_mode as string | null) ?? null, comp_monthly_draw: num(r.comp_monthly_draw), comp_profit_pct: num(r.comp_profit_pct),
  };
}

export interface JobPricing { settings: BudgetSettings; tax: JobTax; days: number | null; day_minimum: number | null;
  /** The budget's risk settings (096); empty before 096 or when none are set. */
  risk: RiskSettings;
  margin_from: "budget" | "default" | null; overhead_from: "budget" | "default" | null }

/**
 * The jobs' pricing fields, with tax_lookup (migration 078) when the column is
 * there — before it is applied the read falls back, so nothing breaks.
 */
async function jobsWithTax(sb: Sb, orgId: string, jobIds: string[]) {
  const base = "id, address, city, state, zip, customer_id, duration_days, tax_parish, tax_rate_pct, tax_rate_source";
  const r = await sb.from("jobs").select(`${base}, tax_lookup`).eq("org_id", orgId).in("id", jobIds);
  if (!r.error) return r;
  return sb.from("jobs").select(base).eq("org_id", orgId).in("id", jobIds);
}

/** Where a job's sales tax is looked up: its own address, else (only when it has none) its customer's. */
export function taxAddress(job: Record<string, unknown>, cust: { address_formatted?: string | null; address_line1?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null) {
  const own = addressParts({ line1: job.address as string | null, city: job.city as string | null, state: job.state as string | null, zip: job.zip as string | null });
  if (own || String(job.address ?? "").trim() || String(job.city ?? "").trim()) return own;
  return addressParts({ line1: job.address as string | null, city: job.city as string | null, state: job.state as string | null, zip: job.zip as string | null })
    ?? (cust ? addressParts({ line1: cust.address_line1 ?? null, city: cust.city ?? null, state: cust.state ?? null, zip: cust.zip ?? null }) ?? addressParts(cust.address_formatted ?? null) : null);
}

/** The open budgets' O.H., margin and risk (096) — without risk until 096 is applied. */
async function estimatesWithRisk(sb: Sb, orgId: string, jobIds: string[]) {
  const q = (cols: string) => sb.from("estimates").select(cols).eq("org_id", orgId).eq("status", "draft").in("job_id", jobIds);
  const r = await q("job_id, margin_pct, overhead_pct, risk");
  if (!r.error) return r;
  return q("job_id, margin_pct, overhead_pct");
}

export async function pricingFor(sb: Sb, orgId: string, jobIds: string[]): Promise<Map<string, JobPricing>> {
  const out = new Map<string, JobPricing>();
  if (!jobIds.length) return out;
  const [money, { data: rates }, { data: jobs }, { data: ests }] = await Promise.all([
    moneySettings(sb, orgId),
    sb.from("tax_parishes").select("parish, rate_pct").eq("org_id", orgId),
    jobsWithTax(sb, orgId, jobIds),
    estimatesWithRisk(sb, orgId, jobIds),
  ]);
  const jobRows = (jobs ?? []) as Array<Record<string, unknown>>;
  const custIds = [...new Set(jobRows.map((j) => j.customer_id as string | null).filter(Boolean))] as string[];
  const { data: custs } = custIds.length
    ? await sb.from("customers").select("id, address_formatted, address_line1, city, state, zip").eq("org_id", orgId).in("id", custIds)
    : { data: [] };
  type Cust = { id: string; address_formatted: string | null; address_line1: string | null; city: string | null; state: string | null; zip: string | null };
  const custRow = new Map(((custs ?? []) as Cust[]).map((c) => [c.id, c]));
  const custAddr = new Map(((custs ?? []) as Cust[]).map((c) => [c.id, c.address_formatted]));
  const rateRows = ((rates ?? []) as Array<{ parish: string; rate_pct: unknown }>).map((r) => ({ parish: r.parish, rate_pct: Number(r.rate_pct) }));
  for (const j of jobRows) {
    const est = ((ests ?? []) as Array<Record<string, unknown>>).find((e) => e.job_id === j.id);
    const em = num(est?.margin_pct), eo = num(est?.overhead_pct);
    const risk = readRisk(est?.risk), rk = riskOf(risk);
    const where = taxAddress(j, j.customer_id ? custRow.get(j.customer_id as string) ?? null : null);
    const tax = jobTax({ tax_rate_pct: num(j.tax_rate_pct), tax_rate_source: j.tax_rate_source as string | null,
      tax_parish: j.tax_parish as string | null, address: j.address as string | null, tax_lookup: (j.tax_lookup as TaxLookup | null | undefined) ?? null },
      String(j.address ?? "").trim() ? null : j.customer_id ? custAddr.get(j.customer_id as string) ?? null : null, rateRows, where?.text ?? null);
    out.set(j.id as string, {
      settings: {
        margin_pct: em ?? money.default_margin_pct, overhead_pct: eo ?? money.default_overhead_pct,
        tax_rate_pct: tax.rate, tax_missing: tax.missing ?? undefined,
        risk_pct: rk.cost_pct, carry_pct: rk.carry_pct, risk_missing: rk.missing,
      },
      risk, tax, days: num(j.duration_days), day_minimum: money.day_minimum,
      margin_from: em !== null ? "budget" : money.default_margin_pct !== null ? "default" : null,
      overhead_from: eo !== null ? "budget" : money.default_overhead_pct !== null ? "default" : null,
    });
  }
  return out;
}
