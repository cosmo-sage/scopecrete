/**
 * Budget v3 — the Market rate and Actual costs tabs under a job's Budget (Coy,
 * 2026-10-09: "three tabs underneath the budget page … market rates, proposed
 * budget, actual cost"; Claude Design "Budget v3", market-and-actuals.ts).
 * Pure; tests/budget-v3.test.mjs.
 *
 * Market rate reads the going rates the draft looked up (src/lib/draft/rates.ts)
 * against the budget's own lines, step by step. A rate of what a homeowner pays
 * (installed_price) is set beside the line's PRICE; a supply or rental price
 * (cost) beside its COST. "Use" writes a unit cost to the line — an installed
 * price is brought back to cost through the job's O.H. and margin — and never
 * anything else. Actual costs sums what was filed on each line; a line with
 * nothing filed is held at its budget, and said.
 */

import { unitTypeOf } from "./units.ts";
import { BUCKETS, BUCKET_LABEL, bucketOf, type Bucket } from "./cost-analysis.ts";

export type BudgetTab = "market" | "proposed" | "actuals";
export const BUDGET_TABS: Array<{ k: BudgetTab; label: string }> = [
  { k: "market", label: "Market rate" },
  { k: "proposed", label: "Proposed budget" },
  { k: "actuals", label: "Actual costs" },
];
export const tabOf = (v: string | null | undefined): BudgetTab => (v === "market" || v === "actuals" ? v : "proposed");

// ─── Market rate ─────────────────────────────────────────────────────────────

export interface RateLite {
  step: string; what: string; low: number; high: number;
  unit: string; split: string; kind: "installed_price" | "cost";
  url: string; site: string; quote: string;
}
export interface MarketLine {
  id: string; name: string; section_id: string | null; cost_type: string;
  qty: number | null; unit: string; unit_cost: number | null;
  ext_cost: number | null; ext_price: number | null; unit_price: number | null;
  description?: string | null;
}
export interface AreaSize { id: string; sqft: number | null; lf: number | null }
export type RateStatus = "under" | "inside" | "over" | "unpriced";

/** A rate's unit in the app's words: sf → SqFt … */
const RATE_UNIT: Record<string, string> = { sf: "SqFt", sy: "SqYd", lf: "LnFt", cy: "CuYd", each: "Each" };
export const RATE_UNIT_LABEL: Record<string, string> = { sf: "SF", sy: "SY", lf: "LF", cy: "CY", each: "EA", day: "day", ton: "ton", job: "job" };

/** Does the line count in the rate's unit? (SqFt / "sf" / "Square Feet" all match "sf".) */
export function sameUnit(rateUnit: string, lineUnit: string): boolean {
  const want = RATE_UNIT[rateUnit];
  if (want) return unitTypeOf(lineUnit) === want;
  return lineUnit.trim().toLowerCase().replace(/s$/, "") === rateUnit;
}

/** The area a step's lines are spread over: the line's own area, else the whole job. */
function spread(rateUnit: string, area: { sqft: number | null; lf: number | null }): number | null {
  if (rateUnit === "sf") return area.sqft || null;
  if (rateUnit === "sy") return area.sqft ? area.sqft / 9 : null;
  if (rateUnit === "lf") return area.lf || null;
  return null;
}

const areaOf = (line: MarketLine, areas: AreaSize[], job: { sqft: number | null; lf: number | null }) =>
  (line.section_id && areas.find((a) => a.id === line.section_id)) || job;

/**
 * The budget's number in the rate's unit — its price for a rate of what customers
 * pay, its cost for a supply price. One line in the rate's own unit → its unit
 * figure; otherwise the lines' total spread over the area (SF, SY, LF).
 */
export function budgetInRateUnit(rate: Pick<RateLite, "unit" | "kind">, lines: MarketLine[], areas: AreaSize[], job: { sqft: number | null; lf: number | null }): number | null {
  if (!lines.length) return null;
  const price = rate.kind === "installed_price";
  if (lines.length === 1 && sameUnit(rate.unit, lines[0].unit)) {
    const v = price ? lines[0].unit_price : lines[0].unit_cost;
    return v === null || v === undefined ? null : v;
  }
  const ext = lines.map((l) => (price ? l.ext_price : l.ext_cost));
  if (ext.some((v) => v === null || v === undefined)) return null;
  const sum = (ext as number[]).reduce((a, b) => a + b, 0);
  // Every line on one area → that area; otherwise the whole job.
  const one = lines.every((l) => l.section_id && l.section_id === lines[0].section_id);
  const n = spread(rate.unit, one ? areaOf(lines[0], areas, job) : job);
  return n ? sum / n : null;
}

/** 2% each side, so $0.99 against a $1.00 floor doesn't flag. */
export function rateStatus(mine: number | null, low: number, high: number): RateStatus {
  if (mine === null) return "unpriced";
  if (mine < low * 0.98) return "under";
  if (mine > high * 1.02) return "over";
  return "inside";
}

/** A price back to cost through the job's O.H. and margin: price = cost × (1 + O.H.) ÷ (1 − margin). */
export const priceToCost = (price: number, ohPct: number, marginPct: number) => (price * (1 - marginPct / 100)) / (1 + ohPct / 100);

/**
 * "Use $X": the unit cost to write on the line. Only for a step one line prices; a
 * rate per SF (SY, LF) on a line counted otherwise is brought back to the line's
 * own unit over its area, so its quantity stays as measured. null = nothing sensible.
 */
export function unitCostFromRate(value: number, rate: Pick<RateLite, "unit" | "kind">, line: MarketLine, areas: AreaSize[], job: { sqft: number | null; lf: number | null }, money: { oh: number | null; margin: number | null }): number | null {
  let v = value;
  if (rate.kind === "installed_price") {
    if (money.oh === null || money.margin === null) return null;
    v = priceToCost(value, money.oh, money.margin);
  }
  if (sameUnit(rate.unit, line.unit)) return round2(v);
  const n = spread(rate.unit, areaOf(line, areas, job));
  if (!n || !line.qty || line.qty <= 0) return null;
  return round2((v * n) / line.qty);
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface StepRow {
  step: string; label: string;
  lines: MarketLine[];
  rate: RateLite | null;
  more: RateLite[];
  low: number | null; high: number | null; unit: string | null; kind: RateLite["kind"] | null;
  mine: number | null; status: RateStatus | "no_data" | "no_line";
}

/**
 * One row per recipe step that has a rate or a line: the rates kept for it (the
 * range across them, in the unit most of them use), the lines that price it, and
 * where the budget sits. Installed prices are preferred over supply costs when a
 * step has both (one bar never mixes them).
 */
export function marketRows(steps: Array<{ key: string; label: string; line_ids: string[] }>, rates: RateLite[], lines: MarketLine[], areas: AreaSize[], job: { sqft: number | null; lf: number | null }): StepRow[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return steps.map((s) => {
    const ls = s.line_ids.map((id) => byId.get(id)).filter(Boolean) as MarketLine[];
    const all = rates.filter((r) => r.step === s.key);
    const kind: RateLite["kind"] | null = all.some((r) => r.kind === "installed_price") ? "installed_price" : all.length ? "cost" : null;
    const ofKind = all.filter((r) => r.kind === kind);
    const counts = new Map<string, number>();
    for (const r of ofKind) counts.set(r.unit, (counts.get(r.unit) ?? 0) + 1);
    const unit = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const kept = ofKind.filter((r) => r.unit === unit);
    const rate = kept[0] ?? null;
    const low = kept.length ? Math.min(...kept.map((r) => r.low)) : null;
    const high = kept.length ? Math.max(...kept.map((r) => r.high)) : null;
    const mine = rate ? budgetInRateUnit({ unit: unit!, kind: kind! }, ls, areas, job) : null;
    const status: StepRow["status"] = !ls.length ? "no_line" : !rate ? "no_data" : rateStatus(mine, low!, high!);
    return { step: s.key, label: s.label, lines: ls, rate, more: kept.slice(1).concat(all.filter((r) => !kept.includes(r))), low, high, unit, kind, mine, status };
  }).filter((r) => r.rate || r.lines.length);
}

/** The whole job's installed range per unit, from the rates for the whole job ("job" step). */
export function jobRange(rates: RateLite[], unit = "sf"): { low: number; high: number; typical: number; sources: number } | null {
  const rs = rates.filter((r) => r.step === "job" && r.kind === "installed_price" && r.unit === unit);
  if (!rs.length) return null;
  const mids = rs.map((r) => (r.low + r.high) / 2).sort((a, b) => a - b);
  const typical = mids.length % 2 ? mids[(mids.length - 1) / 2] : (mids[mids.length / 2 - 1] + mids[mids.length / 2]) / 2;
  return { low: Math.min(...rs.map((r) => r.low)), high: Math.max(...rs.map((r) => r.high)), typical, sources: rs.length };
}

/** Where the range bar runs: a little past the range and every mark on it. */
export function scaleOf(values: Array<number | null | undefined>): { min: number; max: number } | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.05, 0.01);
  return { min: Math.max(0, lo - pad), max: hi + pad };
}

// ─── Actual costs ────────────────────────────────────────────────────────────

export type CostKind = "receipt" | "bill" | "time_log" | "typed";
export interface JobCost {
  id: string; line_id: string | null; file_id: string | null; kind: CostKind;
  vendor: string | null; amount: number; man_hours: number | null; rate: number | null;
  note: string | null; spent_on: string | null; paid_at: string | null;
}
export interface ChangeOrder { id: string; name: string; note: string | null; price: number; cost: number; signed_at: string | null }
export interface ActualLine { id: string; name: string; cost_type: string; section_id: string | null; ext_cost: number | null }

export interface LineActual { line: ActualLine; costs: JobCost[]; actual: number | null; variance: number | null }
export interface CategoryActual {
  bucket: Bucket; label: string;
  budget: number;
  /** Filed actuals, plus the budget of lines with nothing filed — so the categories add up to the direct cost. */
  actual: number;
  variance: number;
  unfiled: number;
  lines: LineActual[];
}
export interface ActualsSummary {
  categories: CategoryActual[];
  /** Costs filed on no line of the open budget. */
  unbudgeted: JobCost[];
  budgetDirect: number; actualDirect: number;
  changeOrderPrice: number; changeOrderCost: number;
  soldPrice: number; overhead: number;
  budgetNet: number; actualNet: number; actualMargin: number | null;
  filed: number; lines: number;
}

export type ActualsFilter = "all" | "over" | "not_filed";

/**
 * Budget against actual. A line's actual is the sum of what was filed on it; with
 * nothing filed it is held at its budget in every total (never a partial
 * category). Direct = held line actuals + unbudgeted costs + change-order costs.
 * Actual net = sold price (budget price − discount + change orders) − actual
 * direct − the budgeted O.H. (O.H. isn't re-figured from actuals).
 */
export function compareActuals(lines: ActualLine[], costs: JobCost[], cos: ChangeOrder[],
  budget: { price: number; discount: number; overhead: number; net: number }, filter: ActualsFilter = "all", section: string | null = null): ActualsSummary {
  const ids = new Set(lines.map((l) => l.id));
  const per = new Map<string, JobCost[]>();
  for (const c of costs) if (c.line_id && ids.has(c.line_id)) per.set(c.line_id, [...(per.get(c.line_id) ?? []), c]);
  const rows: LineActual[] = lines.map((l) => {
    const cs = per.get(l.id) ?? [];
    const actual = cs.length ? round2(cs.reduce((a, c) => a + c.amount, 0)) : null;
    return { line: l, costs: cs, actual, variance: actual === null ? null : round2(actual - (l.ext_cost ?? 0)) };
  });
  const held = (r: LineActual) => r.actual ?? r.line.ext_cost ?? 0;
  const show = (r: LineActual) => (!section || r.line.section_id === section)
    && (filter === "all" ? true : filter === "over" ? r.variance !== null && r.variance > 0.5 : r.actual === null);
  const categories = BUCKETS.map((b) => {
    const ls = rows.filter((r) => bucketOf(r.line.cost_type) === b);
    const bud = ls.reduce((a, r) => a + (r.line.ext_cost ?? 0), 0);
    const act = ls.reduce((a, r) => a + held(r), 0);
    return { bucket: b, label: BUCKET_LABEL[b], budget: round2(bud), actual: round2(act), variance: round2(act - bud),
      unfiled: ls.filter((r) => r.actual === null).length, lines: ls.filter(show) };
  }).filter((c) => c.budget > 0 || c.lines.length > 0 || c.actual > 0)
    .filter((c) => filter === "all" && !section ? true : c.lines.length > 0);
  const unbudgeted = costs.filter((c) => !c.line_id || !ids.has(c.line_id));
  const budgetDirect = round2(lines.reduce((a, l) => a + (l.ext_cost ?? 0), 0));
  const coPrice = round2(cos.reduce((a, c) => a + c.price, 0)), coCost = round2(cos.reduce((a, c) => a + c.cost, 0));
  const actualDirect = round2(rows.reduce((a, r) => a + held(r), 0) + unbudgeted.reduce((a, c) => a + c.amount, 0) + coCost);
  const soldPrice = round2(budget.price - budget.discount + coPrice);
  const actualNet = round2(soldPrice - actualDirect - budget.overhead);
  return { categories, unbudgeted, budgetDirect, actualDirect, changeOrderPrice: coPrice, changeOrderCost: coCost, soldPrice, overhead: budget.overhead,
    budgetNet: budget.net, actualNet, actualMargin: soldPrice > 0 ? actualNet / soldPrice : null,
    filed: rows.filter((r) => r.actual !== null).length, lines: rows.length };
}

/** Budgeted crew → actual crew: man-hours, labor per man-hour, SF a crew day, net a day. */
export function crewCompare(budgeted: { size: number | null; days: number | null; hours: number | null },
  actual: { size: number | null; days: number | null; hours: number | null }, laborActual: number, sqft: number | null, actualNet: number) {
  const mh = (c: typeof budgeted) => (c.size && c.days ? c.size * c.days * (c.hours ?? 8) : null);
  const aMH = mh(actual);
  return {
    manHours: { budget: mh(budgeted), actual: aMH },
    laborPerManHour: aMH ? laborActual / aMH : null,
    sfPerCrewDay: actual.days && sqft ? sqft / actual.days : null,
    netPerDay: actual.days ? actualNet / actual.days : null,
  };
}

/** A receipt's suggested line: the line whose words or vendor its vendor and items share most. A suggestion, never filed by itself. */
export function suggestLine(receipt: { vendor: string | null; words: string }, lines: Array<ActualLine & { vendor?: string | null }>): string | null {
  const toks = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}|\d{2,}/g) ?? []);
  const r = toks(`${receipt.vendor ?? ""} ${receipt.words}`);
  let best: string | null = null, score = 0;
  for (const l of lines) {
    const t = toks(`${l.name} ${l.vendor ?? ""}`);
    let s = 0;
    for (const w of t) if (r.has(w)) s += 1;
    if (receipt.vendor && l.vendor && receipt.vendor.toLowerCase() === l.vendor.toLowerCase()) s += 3;
    if (s > score) { score = s; best = l.id; }
  }
  return score >= 2 ? best : null;
}
