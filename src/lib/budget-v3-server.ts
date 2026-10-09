/**
 * The readers behind a job's Market rate and Actual costs tabs (Budget v3,
 * src/lib/budget-v3.ts). Session client only — RLS decides; the org comes from
 * the session. Prices come from the engine's budget(), the same numbers as the
 * Proposed budget; nothing here prices anything new.
 */
import type { ApiSession } from "@/lib/api-auth";
import { budget, quantities, type BudgetLine, type SectionInput } from "@/lib/engine";
import { LINE_COLUMNS, numLine, workingEstimate } from "@/lib/budget-server";
import { pricingFor } from "@/lib/pricing-server";
import { takeoffTotalsFor } from "@/lib/plans-server";
import { DRIVEWAY_STEPS, stepsOf } from "@/lib/draft/recipe";
import type { RateLookup } from "@/lib/draft/rates";
import { sheetsFor } from "@/lib/section-sheets";
import { compareActuals, suggestLine, type ChangeOrder, type JobCost } from "@/lib/budget-v3";

type Sb = ApiSession["supabase"];

export const ACTUALS_MISSING = "Actual costs need migration 094 — say \"apply 094\".";
export const missing094 = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST204"
    || /job_costs|change_orders|actual_days|actual_crew_size|actual_hours/.test(e.message ?? ""));

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** The job's open budget, priced by the engine, with its areas' sizes. */
export async function jobBudget(sb: Sb, orgId: string, jobId: string) {
  const est = await workingEstimate(sb, orgId, jobId, false);
  const [{ data: rows }, { data: secs }, pricing, takeoff, { data: groups }, { data: job }] = await Promise.all([
    est ? sb.from("estimate_line_items").select(LINE_COLUMNS).eq("estimate_id", est.id as string).order("sort_order").order("name") : Promise.resolve({ data: [] }),
    sb.from("job_sections").select("*").eq("org_id", orgId).eq("job_id", jobId).order("sort_order"),
    pricingFor(sb, orgId, [jobId]),
    takeoffTotalsFor(sb, orgId, jobId),
    sb.from("cost_groups").select("id, name").eq("org_id", orgId),
    sb.from("jobs").select("*").eq("org_id", orgId).eq("id", jobId).maybeSingle(),
  ]);
  const lines = ((rows ?? []) as Array<Record<string, unknown>>).map(numLine) as unknown as Array<BudgetLine & Record<string, unknown>>;
  const sections = (secs ?? []) as Array<SectionInput & Record<string, unknown>>;
  const p = pricing.get(jobId);
  const discount = Number(est?.discount_amount ?? 0);
  const res = p ? budget(lines, [], p.settings, sections, p.days, { tax_on: est?.tax_on === true, discount, takeoff: takeoff as never }) : null;
  const areas = sections.map((s) => {
    const q = quantities(s);
    const lf = q.count !== null && (q.count_unit ?? "").toUpperCase() === "LF" ? q.count : null;
    return {
      id: s.id as string, name: (s.name as string | null) || "Section", sqft: lf ? null : q.sqft, lf,
      count: lf ? null : q.count, count_unit: q.count_unit ?? null,
      origin: (s.origin as string | null) ?? null, source_ref: (s.source_ref as string | null) ?? null,
    };
  });
  const sqft = areas.reduce((a, x) => a + (x.sqft ?? 0), 0) || null;
  const lf = areas.reduce((a, x) => a + (x.lf ?? 0), 0) || null;
  const gname = new Map(((groups ?? []) as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]));
  const tier = res?.tiers[0] ?? null;
  return {
    est, lines, res, areas, sqft, lf, gname, discount,
    job: (job ?? null) as Record<string, unknown> | null,
    money: { oh: p?.settings.overhead_pct ?? null, margin: p?.settings.margin_pct ?? null },
    totals: tier ? { cost: tier.cost, overhead: tier.overhead, price: tier.price, tax: tier.tax, discount: tier.discount, total: tier.total, profit: tier.profit, priced: tier.priced } : null,
  };
}

const lineOut = (l: BudgetLine & Record<string, unknown>, r: ReturnType<typeof Object> | undefined) => {
  const x = r as { qty: number | null; ext_cost: number | null; ext_price: number | null; unit_price: number | null; overhead: number | null } | undefined;
  return {
    id: l.id, name: l.name, section_id: (l.section_id as string | null) ?? null, cost_type: l.cost_type,
    qty: x?.qty ?? null, unit: (l.unit as string) || "", unit_cost: num(l.unit_cost),
    ext_cost: x?.ext_cost ?? null, ext_price: x?.ext_price ?? null, unit_price: x?.unit_price ?? null, overhead: x?.overhead ?? null,
    description: (l.description as string | null) ?? null, margin_pct: num(l.margin_pct),
    vendor_contact_id: (l.vendor_contact_id as string | null) ?? null,
  };
};

/** Market rate: the budget's lines by recipe step and the going rates the draft looked up. */
export async function marketView(sb: Sb, orgId: string, jobId: string) {
  const b = await jobBudget(sb, orgId, jobId);
  const lines = b.lines.map((l) => lineOut(l, b.res?.lines[l.id]));
  const steps = DRIVEWAY_STEPS.map((s) => ({
    key: s.key, label: s.label,
    line_ids: b.lines.filter((l) => stepsOf({ id: l.id, name: l.name, cost_type: l.cost_type, qty_rule: l.qty_rule,
      section_role: (l.section_role as string | null) ?? null, group_name: l.cost_group_id ? b.gname.get(l.cost_group_id) ?? null : null }).includes(s.key)).map((l) => l.id),
  }));
  // The open budget's latest build carries the last lookup (migration 087/088).
  let rates: RateLookup | null = null;
  const q = () => sb.from("budget_runs").select("made, created_at").eq("org_id", orgId).eq("job_id", jobId).order("created_at", { ascending: false }).limit(5);
  let { data: runs, error } = b.est ? await q().or(`estimate_id.eq.${b.est.id as string},estimate_id.is.null`) : await q();
  if (error && /estimate_id/.test(error.message ?? "")) ({ data: runs, error } = await q());
  for (const r of (runs ?? []) as Array<{ made: { rates?: RateLookup } | null }>) if (r.made?.rates) { rates = r.made.rates; break; }
  // The Market tab's own lookups (094), when newer.
  const { data: ml, error: mle } = await sb.from("market_lookups").select("lookup, created_at").eq("org_id", orgId).eq("job_id", jobId).order("created_at", { ascending: false }).limit(10);
  const own = !mle ? ((ml ?? []) as Array<{ lookup: RateLookup & { kind?: string } }>).find((x) => x.lookup?.kind !== "sections")?.lookup ?? null : null;
  if (own && (!rates || own.asked_at > rates.asked_at)) rates = own;
  const canKeep = !missing094(mle);
  // Going rates for the job's own sections (kind "sections"), newest per section; before 094 on the latest build.
  const sectionRates = new Map<string, { asked_at: string; rates: RateLookup["rates"] }>();
  const takeSections = (l: (RateLookup & { section_ids?: string[] }) | null | undefined) => {
    if (!l || !Array.isArray(l.section_ids)) return;
    for (const id of l.section_ids) {
      const had = sectionRates.get(id);
      if (!had || had.asked_at < l.asked_at) sectionRates.set(id, { asked_at: l.asked_at, rates: l.rates.filter((r) => r.step === id) });
    }
  };
  for (const r of (runs ?? []) as Array<{ made: { section_rates?: RateLookup & { section_ids?: string[] } } | null }>) takeSections(r.made?.section_rates);
  if (!mle) {
    const { data: sl } = await sb.from("market_lookups").select("lookup").eq("org_id", orgId).eq("job_id", jobId).eq("lookup->>kind", "sections").order("created_at", { ascending: false }).limit(20);
    for (const x of (sl ?? []) as Array<{ lookup: RateLookup & { section_ids?: string[] } }>) takeSections(x.lookup);
  }
  const { data: sheetRows } = await sb.from("plan_sheets").select("id, number, title").eq("org_id", orgId).eq("job_id", jobId);
  const sheets = (sheetRows ?? []) as Array<{ id: string; number: string | null; title: string | null }>;
  const sections = b.areas.map((a) => ({
    ...a, sheets: sheetsFor(a.source_ref, sheets).map((x) => ({ id: x.id, number: x.number, title: x.title })),
    rates_at: sectionRates.get(a.id)?.asked_at ?? null,
  }));
  const section_rates = [...sectionRates.values()].flatMap((v) => v.rates);
  const past = await pastJobs(sb, orgId, jobId, (b.job?.job_type as string | null) ?? null);
  return {
    has_budget: !!b.est, job_type: (b.job?.job_type as string | null) ?? null, city: (b.job?.address as string | null) ?? null,
    lines, areas: b.areas, sqft: b.sqft, lf: b.lf, steps, rates, money: b.money, totals: b.totals,
    sections, section_rates,
    days: num(b.job?.duration_days), crew_size: num(b.job?.crew_size),
    past, can_keep: canKeep,
  };
}

/** Actual costs: every line's budget against what was filed on it, change orders, the job's receipts, the crew. */
export async function actualsView(sb: Sb, orgId: string, jobId: string) {
  const b = await jobBudget(sb, orgId, jobId);
  const lines = b.lines.map((l) => lineOut(l, b.res?.lines[l.id]));
  const [costsR, cosR, filesR] = await Promise.all([
    sb.from("job_costs").select("id, line_id, file_id, kind, vendor, amount, man_hours, rate, note, spent_on, paid_at, created_at").eq("org_id", orgId).eq("job_id", jobId).order("created_at"),
    sb.from("change_orders").select("id, name, note, price, cost, signed_at, created_at").eq("org_id", orgId).eq("job_id", jobId).order("created_at"),
    sb.from("files").select("id, name, kind, category, summary, facts, read_state, created_at").eq("org_id", orgId).eq("job_id", jobId).eq("category", "receipt").is("deleted_at", null).order("created_at", { ascending: false }).limit(60),
  ]);
  const ready = !missing094(costsR.error) && !missing094(cosR.error);
  const costs: JobCost[] = ready ? ((costsR.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string, line_id: (c.line_id as string | null) ?? null, file_id: (c.file_id as string | null) ?? null, kind: c.kind as JobCost["kind"],
    vendor: (c.vendor as string | null) ?? null, amount: Number(c.amount), man_hours: num(c.man_hours), rate: num(c.rate),
    note: (c.note as string | null) ?? null, spent_on: (c.spent_on as string | null) ?? null, paid_at: (c.paid_at as string | null) ?? null,
  })) : [];
  const cos: ChangeOrder[] = ready ? ((cosR.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string, name: c.name as string, note: (c.note as string | null) ?? null, price: Number(c.price), cost: Number(c.cost), signed_at: (c.signed_at as string | null) ?? null,
  })) : [];
  const filedFiles = new Set(costs.map((c) => c.file_id).filter(Boolean));
  const vendorNames = await vendorsOf(sb, orgId, lines.map((l) => l.vendor_contact_id).filter(Boolean) as string[]);
  const withVendor = lines.map((l) => ({ ...l, vendor: l.vendor_contact_id ? vendorNames.get(l.vendor_contact_id) ?? null : null }));
  const receipts = ((filesR.data ?? []) as Array<Record<string, unknown>>).map((f) => {
    const facts = (f.facts ?? {}) as Record<string, unknown>;
    const vd = (facts.vendor_details ?? {}) as Record<string, unknown>;
    const vendor = (typeof vd.name === "string" && vd.name) || (typeof facts.vendor === "string" ? facts.vendor : null);
    const amount = typeof facts.amount === "number" ? facts.amount : null;
    const words = [f.name, f.summary, ...(Array.isArray(facts.price_lines) ? (facts.price_lines as Array<{ name?: string }>).map((x) => x.name ?? "") : [])].join(" ");
    return {
      id: f.id as string, name: f.name as string, kind: f.kind as string, vendor, amount,
      date: typeof facts.date === "string" ? facts.date : null, read_state: f.read_state as string | null,
      filed: filedFiles.has(f.id as string),
      suggested_line_id: filedFiles.has(f.id as string) ? null : suggestLine({ vendor, words }, withVendor),
    };
  });
  const t = b.totals;
  const summary = t ? compareActuals(lines, costs, cos, { price: t.price, discount: t.discount, overhead: t.overhead, net: t.profit }) : null;
  const j = b.job ?? {};
  return {
    ready, error: ready ? null : ACTUALS_MISSING, has_budget: !!b.est,
    lines, areas: b.areas, sqft: b.sqft, costs, change_orders: cos, receipts, totals: t, summary,
    crew: {
      budget: { size: num(j.crew_size), days: num(j.duration_days), hours: num(j.crew_hours) },
      actual: { size: num(j.actual_crew_size), days: num(j.actual_days), hours: num(j.actual_hours) },
    },
  };
}

async function vendorsOf(sb: Sb, orgId: string, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await sb.from("contacts").select("id, name").eq("org_id", orgId).in("id", [...new Set(ids)]);
  return new Map(((data ?? []) as Array<{ id: string; name: string | null }>).filter((c) => c.name).map((c) => [c.id, c.name as string]));
}

/**
 * Finished jobs of the same type with costs filed (094): what they sold for a
 * square foot, their margin on actual cost, how many days. Empty until jobs
 * have actuals — never estimated.
 */
async function pastJobs(sb: Sb, orgId: string, jobId: string, jobType: string | null) {
  let q = sb.from("jobs").select("*").eq("org_id", orgId).in("status", ["complete", "closed"]).neq("id", jobId).is("archived_at", null).order("updated_at", { ascending: false }).limit(12);
  if (jobType) q = q.eq("job_type", jobType);
  const { data: jobs, error } = await q;
  if (error || !jobs?.length) return [];
  const ids = (jobs as Array<{ id: string }>).map((x) => x.id);
  const { data: costed, error: ce } = await sb.from("job_costs").select("job_id").eq("org_id", orgId).in("job_id", ids);
  if (ce || !costed?.length) return [];
  const withCosts = [...new Set((costed as Array<{ job_id: string }>).map((c) => c.job_id))].slice(0, 6);
  const out = [];
  for (const id of withCosts) {
    const a = await actualsView(sb, orgId, id);
    const jj = (jobs as Array<Record<string, unknown>>).find((x) => x.id === id)!;
    if (!a.summary || !a.sqft) continue;
    out.push({
      id, name: (jj.title as string | null) || "Job", sqft: a.sqft,
      days: num(jj.actual_days) ?? num(jj.duration_days), closed_at: (jj.completed_at as string | null) ?? (jj.updated_at as string),
      per_sf: a.summary.soldPrice / a.sqft, margin: a.summary.actualMargin,
    });
  }
  return out;
}
