import type { ApiSession } from "@/lib/api-auth";
import type { BudgetSettings } from "@/lib/engine";
import { jobTax, type JobTax } from "@/lib/tax";

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
  margin_from: "budget" | "default" | null; overhead_from: "budget" | "default" | null }

export async function pricingFor(sb: Sb, orgId: string, jobIds: string[]): Promise<Map<string, JobPricing>> {
  const out = new Map<string, JobPricing>();
  if (!jobIds.length) return out;
  const [money, { data: rates }, { data: jobs }, { data: ests }] = await Promise.all([
    moneySettings(sb, orgId),
    sb.from("tax_parishes").select("parish, rate_pct").eq("org_id", orgId),
    sb.from("jobs").select("id, address, customer_id, duration_days, tax_parish, tax_rate_pct, tax_rate_source").eq("org_id", orgId).in("id", jobIds),
    sb.from("estimates").select("job_id, margin_pct, overhead_pct").eq("org_id", orgId).eq("status", "draft").in("job_id", jobIds),
  ]);
  const jobRows = (jobs ?? []) as Array<Record<string, unknown>>;
  const custIds = [...new Set(jobRows.map((j) => j.customer_id as string | null).filter(Boolean))] as string[];
  const { data: custs } = custIds.length
    ? await sb.from("customers").select("id, address_formatted").eq("org_id", orgId).in("id", custIds)
    : { data: [] };
  const custAddr = new Map(((custs ?? []) as Array<{ id: string; address_formatted: string | null }>).map((c) => [c.id, c.address_formatted]));
  const rateRows = ((rates ?? []) as Array<{ parish: string; rate_pct: unknown }>).map((r) => ({ parish: r.parish, rate_pct: Number(r.rate_pct) }));
  for (const j of jobRows) {
    const est = ((ests ?? []) as Array<Record<string, unknown>>).find((e) => e.job_id === j.id);
    const em = num(est?.margin_pct), eo = num(est?.overhead_pct);
    const tax = jobTax({ tax_rate_pct: num(j.tax_rate_pct), tax_rate_source: j.tax_rate_source as string | null,
      tax_parish: j.tax_parish as string | null, address: j.address as string | null },
      j.customer_id ? custAddr.get(j.customer_id as string) ?? null : null, rateRows);
    out.set(j.id as string, {
      settings: {
        margin_pct: em ?? money.default_margin_pct, overhead_pct: eo ?? money.default_overhead_pct,
        tax_rate_pct: tax.rate, tax_missing: tax.missing ?? undefined,
      },
      tax, days: num(j.duration_days), day_minimum: money.day_minimum,
      margin_from: em !== null ? "budget" : money.default_margin_pct !== null ? "default" : null,
      overhead_from: eo !== null ? "budget" : money.default_overhead_pct !== null ? "default" : null,
    });
  }
  return out;
}
