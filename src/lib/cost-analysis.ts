/**
 * The budget's Cost Analysis (Coy, 2026-10-08: "expand each line item (materials,
 * labor, equipment, Miscellaneous Costs, Overhead) to show the breakdown … analyze
 * the cost of each of the categories by sqft / SqYd / Linear ft … estimate how many
 * days it will take with what size crew. And how much gross profit and net profit
 * are figured per day").
 *
 * It prices nothing: every number is a sum of the engine's own line results
 * (src/lib/engine budget()), so it always agrees with the budget's totals.
 *
 *   direct cost = materials + labor + equipment + subcontract + misc (cost type "other")
 *   gross profit = price − discount − direct cost
 *   net profit   = gross profit − overhead − risk   (= the tier's profit)
 * Risk (096) is contingency, the ticked risk items and carrying cost — set
 * aside, not profit.
 * Tax is a pass-through and is left out of both.
 */

export type Bucket = "material" | "labor" | "equipment" | "subcontract" | "other";
export const BUCKETS: readonly Bucket[] = ["material", "labor", "equipment", "subcontract", "other"];
export const BUCKET_LABEL: Record<Bucket, string> = {
  material: "Materials", labor: "Labor", equipment: "Equipment", subcontract: "Subcontract", other: "Miscellaneous",
};

export interface AnalysisLine {
  id: string; name: string; cost_type: string; section_id: string | null;
  qty: number | null; unit: string; unit_cost: number | null;
  ext_cost: number | null; overhead: number | null; ext_price: number | null;
  /** Contingency, risk items and carrying cost on this line (096); 0 or absent with none. */
  risk?: number | null;
}
/** An area with its size: sq ft for areas, LF for areas measured in linear feet (curb, grade beam). */
export interface AnalysisArea { id: string; name: string; sqft: number | null; lf: number | null }

export interface AnalysisRow { bucket: Bucket; label: string; cost: number; lines: AnalysisLine[] }
export interface Analysis {
  rows: AnalysisRow[];
  direct: number; overhead: number;
  /** Contingency, risk items and carrying cost (096). */
  risk: number;
  /** Sum of the lines' prices, before tax and discount. */
  price: number; tax: number; discount: number; total: number;
  gross: number; net: number;
  /** net ÷ (price − discount), or null with no price. */
  margin: number | null;
  /** How many square feet, square yards and lineal feet the numbers are spread over. */
  units: { sf: number; sy: number; lf: number };
  /** Lines not priced yet (no quantity or no cost): left out of every sum, and said. */
  unpriced: AnalysisLine[];
}

export const bucketOf = (costType: string): Bucket =>
  (BUCKETS as readonly string[]).includes(costType) ? costType as Bucket : "other";

/**
 * One section (by id), or the whole job ("all" — every line, whole-job costs, tax
 * and discount included). A section alone carries no tax or discount: they are the job's.
 */
export function analyse(lines: AnalysisLine[], areas: AnalysisArea[], opts: { section: string; tax: number; discount: number }): Analysis {
  const known = new Set(areas.map((a) => a.id));
  const all = opts.section === "all";
  const mine = all ? lines : lines.filter((l) => l.section_id === opts.section && known.has(opts.section));
  const priced = mine.filter((l) => l.ext_cost !== null && l.ext_price !== null);
  const unpriced = mine.filter((l) => l.ext_cost === null || l.ext_price === null);
  const sum = (ls: AnalysisLine[], k: "ext_cost" | "overhead" | "ext_price" | "risk") => ls.reduce((a, l) => a + (l[k] ?? 0), 0);

  const rows: AnalysisRow[] = BUCKETS.map((b) => {
    const ls = priced.filter((l) => bucketOf(l.cost_type) === b);
    return { bucket: b, label: BUCKET_LABEL[b], cost: sum(ls, "ext_cost"), lines: ls };
  }).filter((r) => r.bucket !== "subcontract" || r.lines.length > 0);

  const direct = sum(priced, "ext_cost");
  const overhead = sum(priced, "overhead");
  const price = sum(priced, "ext_price");
  const risk = sum(priced, "risk");
  const tax = all ? Math.max(0, opts.tax) : 0;
  const discount = all ? Math.max(0, opts.discount) : 0;
  const gross = price - discount - direct;
  const net = gross - overhead - risk;
  const sold = price - discount;

  const inScope = all ? areas : areas.filter((a) => a.id === opts.section);
  const sf = inScope.reduce((a, x) => a + (x.lf === null && x.sqft !== null && x.sqft > 0 ? x.sqft : 0), 0);
  const lf = inScope.reduce((a, x) => a + (x.lf !== null && x.lf > 0 ? x.lf : 0), 0);

  return {
    rows, direct, overhead, risk, price, tax, discount, total: price + tax - discount,
    gross, net, margin: sold > 0 ? net / sold : null,
    units: { sf, sy: sf / 9, lf }, unpriced,
  };
}

/** A money figure per unit, or null when there is nothing to spread it over. */
export const perUnit = (v: number, n: number): number | null => (n > 0 ? v / n : null);

export interface Crew { size: number | null; days: number | null; hours: number | null }
export interface CrewMath {
  ok: boolean;
  /** What is missing to work it out ("crew size", "days"). */
  needs: string[];
  hours: number;
  manDays: number | null; manHours: number | null;
  /** Square feet poured or placed per crew day. */
  sfPerDay: number | null;
  /** Labor cost ÷ man-hours: what the labor lines pay per hour of the crew's time. */
  laborPerHour: number | null;
  grossPerDay: number | null; netPerDay: number | null; netPerManDay: number | null;
}

/** Crew size × days × hours a day (8 unless set), and the profit per day it makes. */
export function crewMath(c: Crew, a: Pick<Analysis, "gross" | "net" | "units" | "rows">): CrewMath {
  const hours = c.hours !== null && c.hours > 0 ? c.hours : 8;
  const size = c.size !== null && c.size > 0 ? c.size : null;
  const days = c.days !== null && c.days > 0 ? c.days : null;
  const needs = [...(size === null ? ["crew size"] : []), ...(days === null ? ["days"] : [])];
  const manDays = size !== null && days !== null ? size * days : null;
  const manHours = manDays !== null ? manDays * hours : null;
  const labor = a.rows.find((r) => r.bucket === "labor")?.cost ?? 0;
  return {
    ok: needs.length === 0, needs, hours, manDays, manHours,
    sfPerDay: days !== null && a.units.sf > 0 ? a.units.sf / days : null,
    laborPerHour: manHours !== null && labor > 0 ? labor / manHours : null,
    grossPerDay: days !== null ? a.gross / days : null,
    netPerDay: days !== null ? a.net / days : null,
    netPerManDay: manDays !== null ? a.net / manDays : null,
  };
}

/**
 * Days on the job worked out from the sections' labor lines (Coy, 2026-10-15:
 * "Days on the job should be an automatic calculation from the sections").
 * A labor line counted in days adds its days (sections are worked one after
 * another); one counted in hours adds hours ÷ (crew × hours a day), or ÷ hours a
 * day with no crew set (crew-hours). Rounded up to the half day. Null when no
 * labor line is counted in time — then the days are typed.
 */
export function daysFromLines(lines: Array<Pick<AnalysisLine, "cost_type" | "qty" | "unit">>, crew: { size: number | null; hours: number | null }): number | null {
  const hours = crew.hours !== null && crew.hours > 0 ? crew.hours : 8;
  const size = crew.size !== null && crew.size > 0 ? crew.size : 1;
  let days = 0, any = false;
  for (const l of lines) {
    if (bucketOf(l.cost_type) !== "labor" || l.qty === null || !(l.qty > 0)) continue;
    const u = (l.unit ?? "").trim().toLowerCase().replace(/\.$/, "");
    if (/^(day|days|da|dy|crew ?days?)$/.test(u)) { days += l.qty; any = true; }
    else if (/^(hr|hrs|hour|hours|h)$/.test(u)) { days += l.qty / (size * hours); any = true; }
    else if (/^(man ?-?hours?|mh|mhr)$/.test(u)) { days += l.qty / (size * hours); any = true; }
  }
  return any ? Math.ceil(days * 2) / 2 : null;
}
