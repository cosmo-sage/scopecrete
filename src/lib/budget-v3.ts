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
  url: string; site: string; quote: string; item?: string;
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

// ─── by section (Coy, 2026-10-09: "the market rates page needs to pull in the sections … created
// automatically from the plan sets") ──────────────────────────────────────────────────────

export interface MarketSection {
  id: string; name: string; origin: string | null; source_ref: string | null;
  sqft: number | null; lf: number | null; count: number | null; count_unit: string | null;
  /** Its scope of work bullets and Notes, pulled in from the budget (Coy, 2026-10-11). */
  sow?: string[]; notes?: string | null;
}
export interface SectionRow {
  section: MarketSection;
  unit: "sf" | "lf" | "each" | null; qty: number | null;
  lines: MarketLine[]; unpriced: number;
  cost: number; price: number;
  per_cost: number | null; per_price: number | null;
  rates: RateLite[]; kind: RateLite["kind"] | null; low: number | null; high: number | null;
  mine: number | null;
  status: RateStatus | "no_data" | "no_line" | "no_size";
  /** The going rates by cost type, each in the section's unit where it can be, else its own. */
  by_type: TypeRange[];
}
export interface TypeRange { split: string; kind: RateLite["kind"]; unit: string; low: number; high: number; sources: number; what: string[] }

/** Cost types in Coy's order (2026-10-11): labor, materials, equipment, management, overhead, misc, then all-in. */
export const COST_TYPE_ORDER = ["labor", "material", "equipment", "management", "overhead", "misc", "all"];
export const COST_TYPE_LABEL: Record<string, string> = { labor: "Labor", material: "Materials", equipment: "Equipment", management: "Management", overhead: "Overhead", misc: "Misc.", all: "All-in" };

/** One range per cost type × kind × unit, the section's unit first (per SY read per SF ÷ 9). */
export function typeRanges(rates: RateLite[], unit: SectionRow["unit"]): TypeRange[] {
  const m = new Map<string, TypeRange>();
  for (const r of rates) {
    const u = inUnit(r, unit);
    const ru = u ? unit! : r.unit;
    const v = u ?? { low: r.low, high: r.high };
    const k = `${r.split}|${r.kind}|${ru}`;
    const x = m.get(k);
    const what = r.what;
    if (!x) m.set(k, { split: r.split, kind: r.kind, unit: ru, low: v.low, high: v.high, sources: 1, what: what ? [what] : [] });
    else { x.low = Math.min(x.low, v.low); x.high = Math.max(x.high, v.high); x.sources++; if (what && !x.what.includes(what)) x.what.push(what); }
  }
  const rank = (s: string) => { const i = COST_TYPE_ORDER.indexOf(s); return i < 0 ? 99 : i; };
  return [...m.values()].sort((a, b) => rank(a.split) - rank(b.split) || Number(a.unit !== unit) - Number(b.unit !== unit) || a.kind.localeCompare(b.kind));
}

/** A section's unit: linear feet when measured so, a count's each, else square feet. */
export function sectionUnit(x: MarketSection): { unit: SectionRow["unit"]; qty: number | null } {
  if (x.lf) return { unit: "lf", qty: x.lf };
  if (x.count && (x.count_unit ?? "").toUpperCase() !== "LF") return { unit: "each", qty: x.count };
  if (x.sqft) return { unit: "sf", qty: x.sqft };
  return { unit: null, qty: null };
}

/** A rate brought to the section's unit (a per-SY rate reads per SF ÷ 9); null when it can't be. */
function inUnit(r: RateLite, unit: SectionRow["unit"]): { low: number; high: number } | null {
  if (!unit) return null;
  if (r.unit === unit) return { low: r.low, high: r.high };
  if (unit === "sf" && r.unit === "sy") return { low: r.low / 9, high: r.high / 9 };
  return null;
}

/**
 * One row per section: its size in its own unit, its lines' cost and price and what they
 * come to per unit, and the going rates looked up for it (installed prices against the
 * price per unit, supply costs against the cost per unit — never both on one bar).
 */
export function sectionRows(sections: MarketSection[], lines: MarketLine[], rates: RateLite[]): SectionRow[] {
  return sections.map((x) => {
    const { unit, qty } = sectionUnit(x);
    const ls = lines.filter((l) => l.section_id === x.id);
    const unpriced = ls.filter((l) => l.ext_price === null || l.ext_price === undefined).length;
    const cost = ls.reduce((a, l) => a + (l.ext_cost ?? 0), 0);
    const price = ls.reduce((a, l) => a + (l.ext_price ?? 0), 0);
    const per = (v: number) => (qty && ls.length && !unpriced ? v / qty : null);
    const own = rates.filter((r) => r.step === x.id);
    const kind: RateLite["kind"] | null = own.some((r) => r.kind === "installed_price" && inUnit(r, unit)) ? "installed_price"
      : own.some((r) => inUnit(r, unit)) ? "cost" : null;
    const usable = own.filter((r) => r.kind === kind).map((r) => inUnit(r, unit)).filter(Boolean) as Array<{ low: number; high: number }>;
    const low = usable.length ? Math.min(...usable.map((r) => r.low)) : null;
    const high = usable.length ? Math.max(...usable.map((r) => r.high)) : null;
    const value = kind === "installed_price" ? per(price) : kind === "cost" ? per(cost) : null;
    const status: SectionRow["status"] = !ls.length ? "no_line" : !qty ? "no_size" : low === null ? "no_data" : rateStatus(value, low, high!);
    return { section: x, unit, qty, lines: ls, unpriced, cost, price, per_cost: per(cost), per_price: per(price), rates: own, kind, low, high, mine: value, status, by_type: typeRanges(own, unit) };
  });
}

/** The whole job's installed range per unit, from the rates for the whole job ("job" step). */
export function jobRange(rates: RateLite[], unit = "sf"): { low: number; high: number; typical: number; sources: number } | null {
  // Per SY reads per SF ÷ 9; a material-only or labor-only price isn't the installed driveway.
  const rs = rates.filter((r) => r.step === "job" && r.kind === "installed_price" && r.split === "all" && (r.unit === unit || (unit === "sf" && r.unit === "sy")))
    .map((r) => (r.unit === unit ? r : { ...r, low: r.low / 9, high: r.high / 9 }))
    // A whole-driveway total whose own words give its size ("$4,556 to $6,165 for a 500 sq ft
    // driveway") reads per SF: the quote's numbers divided by the quote's size, nothing else.
    .concat(unit !== "sf" ? [] : rates.flatMap((r) => {
      if (r.step !== "job" || r.kind !== "installed_price" || r.split !== "all" || r.unit !== "job") return [];
      const sizes = [...r.quote.replace(/,(?=\d{3})/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|square[- ]f(?:oo|ee)t|sf)\b/gi)].map((m) => Number(m[1]));
      if (sizes.length !== 1 || !(sizes[0] >= 50)) return [];
      return [{ ...r, unit: "sf", low: r.low / sizes[0], high: r.high / sizes[0] }];
    }));
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
