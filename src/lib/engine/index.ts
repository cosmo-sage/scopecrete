/**
 * The costing engine — DECISIONS.md §3 and §4, and nothing else.
 *
 * Pure: no I/O, no imports, no defaults. It is run by the scope builder in the
 * browser and by the unit tests in tests/engine.test.mjs (node --test, which
 * strips the types — so no enums, no parameter properties, no `@/` imports).
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * It is not v34's computeJob(), which prices labour by crew-hours. Since Coy's
 * pricing notes (2026-09-30, migration 057) a line's price is
 *   cost × (1 + O.H.) ÷ (1 − margin)
 * with the job's O.H. % and margin % (copied from the org's defaults onto
 * each budget), a line's own margin overriding the job's. Card and group
 * markups, markup per cost type, the off-the-top divisor and the crew-day
 * floor are gone; a job has a MINIMUM instead: the day minimum × its days.
 *
 * THE RULE THAT SHAPES EVERY RETURN VALUE
 *
 * Nothing is assumed. A missing dimension is `missing`, never 4 inches. A
 * missing setting or card price blocks the price and is NAMED, never replaced
 * by a reference rate. `budget()` marks a line and its option unpriced, with
 * the reasons, whenever any input it needs is absent, because a price computed
 * from a guess looks exactly like a real one and gets sent.
 *
 * Since step 3b (migration 050) a job is priced ONLY by its budget: lines
 * copied from Coy's cost cards (the Price book). The old rate path — a price
 * per yard, form & finish per sq ft, mobilization and reinforcement types in
 * Cost settings — is gone; those are cards now.
 *
 * Note the database's generated column `job_sections.cubic_yards` does
 * `COALESCE(depth_in, 4)` — it assumes four inches. Do not display it; use
 * quantities() from here.
 */

export type WorkType =
  | "slab" | "driveway" | "patio" | "sidewalk" | "footing" | "curb" | "demo" | "prep" | "other";

export interface SectionInput {
  id?: string;
  name?: string | null;
  work_type: WorkType | string;
  length_ft: number | null;
  width_ft: number | null;
  sqft_override: number | null;
  depth_in: number | null;
  psi?: number | null;
  /** Measured by count (migration 065): 8 detectable warning panels. */
  count_qty?: number | null;
  count_unit?: string | null;
}

/** One line of recurring overhead — the Cash page's burn rate. */
export interface OverheadItem {
  label: string;
  amount: number;
  cadence: "monthly" | "quarterly" | "annual" | "one_time" | string;
  active: boolean;
}

const has = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** Work types that are poured concrete. demo and prep are area-only. */
export function isConcrete(workType: string): boolean {
  return workType !== "demo" && workType !== "prep";
}

// ---------------------------------------------------------------------------
// Quantities — arithmetic on numbers a person gave. Needs no settings.
// ---------------------------------------------------------------------------

export interface SectionQuantities {
  id?: string;
  name: string | null;
  work_type: string;
  concrete: boolean;
  /** null when neither an override nor both dimensions exist. */
  sqft: number | null;
  /** Where sqft came from, for the "from …" line under the cell. */
  sqft_source: "override" | "dimensions" | null;
  depth_in: number | null;
  /** Neat yards: sqft × depth ÷ 12 ÷ 27. null for non-concrete or when missing. */
  cy_neat: number | null;
  /** What gets missing to reach a price: 'length', 'width', 'depth'. */
  missing: string[];
  /** Measured by count instead of size (065): how many, and of what. */
  count: number | null;
  count_unit: string | null;
}

export function quantities(s: SectionInput): SectionQuantities {
  const countUnit = (s.count_unit || "EA").toUpperCase();
  // Measured in linear feet (Coy, 2026-10-02: "in addition to length/width, area and
  // counts, I need linear ft"): the length is the count, in LF, so lines priced per LF
  // take it. A grade beam's width (width_ft) and depth make its plan area and yards;
  // without them a pour names what it needs, and nothing per LF is held up.
  if (countUnit === "LF" && has(s.count_qty) && s.count_qty > 0 && !(has(s.sqft_override) && s.sqft_override > 0) && !has(s.length_ft)) {
    const concrete = isConcrete(s.work_type);
    const width = has(s.width_ft) && s.width_ft > 0 ? s.width_ft : null;
    const depth = has(s.depth_in) && s.depth_in > 0 ? s.depth_in : null;
    const sqft = width !== null ? s.count_qty * width : null;
    const missing = concrete ? [...(width === null ? ["width"] : []), ...(depth === null ? ["depth"] : [])] : [];
    return { id: s.id, name: s.name ?? null, work_type: s.work_type, concrete, sqft, sqft_source: sqft === null ? null : "dimensions",
      depth_in: depth, cy_neat: concrete && sqft !== null && depth !== null ? (sqft * depth) / 12 / 27 : null,
      missing, count: s.count_qty, count_unit: "LF" };
  }
  // Counted, not measured (Coy, 2026-10-02: "it's not an area, it's a quantity"):
  // no area, no pour, nothing missing — its lines take the count.
  if (has(s.count_qty) && s.count_qty > 0 && !(has(s.sqft_override) && s.sqft_override > 0) && !has(s.length_ft) && !has(s.width_ft)) {
    return { id: s.id, name: s.name ?? null, work_type: s.work_type, concrete: false, sqft: null, sqft_source: null,
      depth_in: null, cy_neat: null, missing: [], count: s.count_qty, count_unit: (s.count_unit || "EA").toUpperCase() };
  }
  const concrete = isConcrete(s.work_type);
  const missing: string[] = [];

  let sqft: number | null = null;
  let sqft_source: SectionQuantities["sqft_source"] = null;
  if (has(s.sqft_override) && s.sqft_override > 0) {
    sqft = s.sqft_override;
    sqft_source = "override";
  } else {
    if (!has(s.length_ft) || s.length_ft <= 0) missing.push("length");
    if (!has(s.width_ft) || s.width_ft <= 0) missing.push("width");
    if (missing.length === 0) {
      sqft = (s.length_ft as number) * (s.width_ft as number);
      sqft_source = "dimensions";
    }
  }

  let cy_neat: number | null = null;
  const depth = has(s.depth_in) && s.depth_in > 0 ? s.depth_in : null;
  if (concrete) {
    if (depth === null) missing.push("depth");
    if (sqft !== null && depth !== null) cy_neat = (sqft * depth) / 12 / 27;
  }

  return {
    id: s.id, name: s.name ?? null, work_type: s.work_type, concrete,
    sqft, sqft_source, depth_in: depth, cy_neat, missing, count: null, count_unit: null,
  };
}

export interface Takeoff {
  sections: SectionQuantities[];
  /** Sum of sections that HAVE an area. Partial when `incomplete`. */
  sqft: number;
  cy_neat: number;
  /** Neat yards × (1 + waste). null when waste is not recorded. */
  cy_order: number | null;
  overage_pct: number | null;
  /** True when any section is missing something — totals are then partial. */
  incomplete: boolean;
}

export function takeoff(sections: SectionInput[], overage_pct: number | null): Takeoff {
  const qs = sections.map(quantities);
  const sqft = qs.reduce((a, q) => a + (q.concrete && q.sqft !== null ? q.sqft : 0), 0);
  const cy_neat = qs.reduce((a, q) => a + (q.cy_neat ?? 0), 0);
  const cy_order = has(overage_pct) ? cy_neat * (1 + overage_pct / 100) : null;
  return {
    sections: qs, sqft, cy_neat, cy_order,
    overage_pct: has(overage_pct) ? overage_pct : null,
    incomplete: qs.some((q) => q.missing.length > 0),
  };
}

/** Recurring overhead as a monthly figure — the Cash page's burn rate. */
export function monthlyNut(items: OverheadItem[]): number {
  return items.filter((i) => i.active).reduce((a, i) => {
    if (i.cadence === "monthly") return a + i.amount;
    if (i.cadence === "quarterly") return a + i.amount / 3;
    if (i.cadence === "annual") return a + i.amount / 12;
    return a; // one_time is a dated cash event, not part of the recurring burn
  }, 0);
}

// ---------------------------------------------------------------------------
// The job minimum (Coy, 2026-09-30): "There are no default crew days … only a
// minimum of $ per day that people require to show up and work. And
// therefore there is a minimum for a job."  minimum = day minimum × days.
// ---------------------------------------------------------------------------

export function jobMinimum(dayMinimum: number | null, days: number | null):
  { ok: true; minimum: number; day_minimum: number; days: number } | { ok: false; blocked: string[] } {
  const blocked: string[] = [];
  if (!has(dayMinimum) || dayMinimum <= 0) blocked.push("Day minimum (Settings → Cost book)");
  if (!has(days) || days <= 0) blocked.push("Days on this job");
  if (blocked.length) return { ok: false, blocked };
  return { ok: true, minimum: (dayMinimum as number) * (days as number), day_minimum: dayMinimum as number, days: days as number };
}

// ---------------------------------------------------------------------------
// The job budget (migration 048; priced Coy's way since migration 057):
//   ext cost  = qty × unit cost
//   O.H.      = ext cost × the job's O.H. %
//   ext price = (ext cost + O.H.) ÷ (1 − margin)      unit price = ext price ÷ qty
//   margin    = the line's own, else the job's — never assumed
// Quantities come from the scope by each line's rule, or are typed (✎).
// Tax is a pass-through on taxable lines, at cost, at the JOB's rate (from its
// parish), only while the budget's tax switch is on. Discount touches price
// only (§3). Good / better / best: a line with no option is in every tier.
// ---------------------------------------------------------------------------

export type QtyRule = "per_cy" | "per_sqft" | "per_lf_perimeter" | "per_sheet" | "per_stick" | "per_day" | "per_job" | "manual" | "from_takeoff";
export type BudgetCostType = "material" | "labor" | "equipment" | "subcontract" | "other";

export interface BudgetLine {
  id: string;
  name: string;
  cost_type: BudgetCostType | string;
  unit: string;
  unit_cost: number | null;
  /** This line's own margin %, overriding the job's. */
  margin_pct?: number | null;
  taxable: boolean;
  qty_rule: QtyRule | string;
  rule_params: Record<string, number>;
  qty_source: "rule" | "set" | string;
  /** Typed quantity (qty_source 'set' or rule 'manual'). */
  quantity: number | null;
  section_id: string | null;
  option_id: string | null;
  cost_group_id: string | null;
  /** Rule 'from_takeoff': the Plan Room group whose measured total is this line's quantity. */
  takeoff_parameter_id?: string | null;
}

/**
 * A Plan Room group's measured total (migration 059), worked out from the
 * drawings by src/lib/takeoff.ts — never stored. `qty` is null and `blocked`
 * says why when any of its shapes sits on a sheet whose scale isn't set.
 */
export interface TakeoffTotal {
  name: string;
  unit: "SF" | "LF" | "EA";
  qty: number | null;
  /** Area groups with a depth: cubic yards (no waste). */
  cy: number | null;
  /** Area groups: feet of edge round their shapes (cutouts included) — an LF card counted from an area group takes it. */
  perim_lf?: number | null;
  blocked: string | null;
}

/** A card's unit said as SF / SY / LF / EA / CY, or null when it is none of them. */
/** The rule a unit counts by when nothing is typed (as `ruleForUnit()` in units.ts). */
const UNIT_RULE: Record<string, QtyRule> = { SF: "per_sqft", SY: "per_sqft", LF: "per_lf_perimeter", CY: "per_cy" };

export function takeoffUnit(unit: string): "SF" | "SY" | "LF" | "EA" | "CY" | null {
  const u = unit.trim().toLowerCase().replace(/[.\s]/g, "");
  if (["sf", "sqft", "sft", "ft2", "squarefeet", "squarefoot"].includes(u)) return "SF";
  // Government bid items are counted in square yards (Coy, 2026-10-02: "706-01 Concrete Walk … 1,769.80 SY").
  if (["sy", "sqyd", "syd", "yd2", "squareyard", "squareyards"].includes(u)) return "SY";
  if (["lf", "ft", "linft", "lnft", "linearfeet", "linearfoot", "feet", "foot"].includes(u)) return "LF";
  if (["ea", "each", "count", "ct", "pcs", "pc", "no"].includes(u)) return "EA";
  if (["cy", "yd", "yd3", "cuyd", "cubicyard", "cubicyards", "yards", "yard"].includes(u)) return "CY";
  return null;
}

/** Does a line's unit count the same thing as an area's count? EA ≈ each / ea / count, LF ≈ lin ft; otherwise the same word. */
export function countUnitMatches(lineUnit: string, countUnit: string): boolean {
  const a = takeoffUnit(lineUnit), b = takeoffUnit(countUnit);
  if (a && a === b) return true;
  return lineUnit.trim().toLowerCase().replace(/[.\s]/g, "") === countUnit.trim().toLowerCase().replace(/[.\s]/g, "");
}

/** The job's pricing: its own O.H. and margin (else the org's defaults), and its tax rate. */
export interface BudgetSettings {
  overhead_pct: number | null;
  margin_pct: number | null;
  /** The job's sales tax %, from its parish or typed. null = not known. */
  tax_rate_pct: number | null;
  /** Why the rate is missing, said plainly ("parish unknown"). */
  tax_missing?: string;
  /** Risk (096, src/lib/risk.ts): % on cost beside O.H. — contingency and ticked risk items. */
  risk_pct?: number;
  /** Risk: % of the price set aside for carrying cost, beside margin. */
  carry_pct?: number;
  /** Ticked risk items with no %, named — they block like a missing O.H. */
  risk_missing?: string[];
}

export interface LineResult {
  id: string;
  qty: number | null;
  /** Where the quantity came from, said the way the grid shows it. */
  qty_basis: "rule" | "set";
  qty_note: string | null;
  margin_pct: number | null;
  margin_from: "line" | "job" | null;
  ext_cost: number | null;
  overhead: number | null;
  /** Contingency and risk items on this line's cost (096). 0 when the job has none. */
  risk: number | null;
  /** Carrying cost: this line's share of the price set aside for waiting to be paid (096). */
  carry: number | null;
  unit_price: number | null;
  ext_price: number | null;
  /** (price − cost − O.H. − risk − carry) ÷ price — equals the margin used. */
  margin: number | null;
  tax: number;
  /** Everything missing for this line, by name. Empty = priced. */
  blocked: string[];
}

export interface TierTotal {
  option_id: string | null;
  cost: number;
  overhead: number;
  /** Contingency and risk items (096). */
  risk: number;
  /** Carrying cost (096). */
  carry: number;
  price: number;
  tax: number;
  discount: number;
  /** price + tax − discount */
  total: number;
  /** (total − tax − cost − O.H. − risk − carry) ÷ (total − tax): what is left after cost, O.H. and risk. */
  margin: number;
  profit: number;
  priced: boolean;
  blocked: string[];
  line_ids: string[];
}

export interface BudgetResult {
  lines: Record<string, LineResult>;
  /** One per option; one with option_id null when there are no options. */
  tiers: TierTotal[];
  hints: string[];
}

/** How many of something a line needs, from the scope. Whole-job lines (no section) sum every section. */
export function ruleQty(
  line: Pick<BudgetLine, "name" | "qty_rule" | "rule_params" | "qty_source" | "quantity" | "section_id"> & { unit?: string; takeoff_parameter_id?: string | null },
  sections: SectionInput[],
  days: number | null,
  takeoff?: Record<string, TakeoffTotal>,
): { ok: true; qty: number; basis: "rule" | "set"; note: string } | { ok: false; missing: string[] } {
  // A line priced per each on a counted area takes the count (065): 8 EA → qty 8.
  // (A card counted by hand lands as qty_source 'set' with no quantity yet — that still takes the count.)
  if (line.section_id && line.qty_rule === "manual" && !(line.qty_source === "set" && has(line.quantity))) {
    const area = sections.find((s) => s.id === line.section_id);
    const q = area ? quantities(area) : null;
    if (q && q.count !== null && countUnitMatches(line.unit ?? "", q.count_unit ?? "EA")) {
      return { ok: true, qty: q.count, basis: "rule", note: `${q.count} ${q.count_unit} on the area` };
    }
  }
  if (line.qty_source === "set" || line.qty_rule === "manual") {
    if (has(line.quantity) && line.quantity >= 0) return { ok: true, qty: line.quantity, basis: "set", note: "typed" };
    // Nothing typed, and its unit counts itself (Coy, 2026-10-09: demolition in
    // SqFt on an area of 894 SF said "needs quantity") — count it from the area.
    const own = UNIT_RULE[takeoffUnit(line.unit ?? "") ?? ""];
    if (own) return ruleQty({ ...line, qty_rule: own, qty_source: "rule" }, sections, days, takeoff);
    return { ok: false, missing: [`${line.name}: quantity`] };
  }
  // Measured on the plans (migration 059): the group's total, in the card's unit.
  if (line.qty_rule === "from_takeoff") {
    const t = line.takeoff_parameter_id ? takeoff?.[line.takeoff_parameter_id] : undefined;
    if (!t) return { ok: false, missing: [`${line.name}: its takeoff group was removed`] };
    if (t.blocked || t.qty === null) return { ok: false, missing: [`Takeoff: ${t.name} — ${t.blocked ?? "nothing measured"}`] };
    const want = takeoffUnit(line.unit ?? "");
    if (want === t.unit) return { ok: true, qty: t.qty, basis: "rule", note: `takeoff · ${t.name}` };
    if (want === "SY" && t.unit === "SF") return { ok: true, qty: Math.round((t.qty / 9) * 100) / 100, basis: "rule", note: `takeoff · ${t.name}, sq yd` };
    if (want === "CY" && t.unit === "SF") {
      return t.cy !== null ? { ok: true, qty: Math.round(t.cy * 100) / 100, basis: "rule", note: `takeoff · ${t.name}, yards` }
        : { ok: false, missing: [`Takeoff: ${t.name} — a depth (to count yards)`] };
    }
    if (want === "LF" && t.unit === "SF") {
      return t.perim_lf !== null && t.perim_lf !== undefined ? { ok: true, qty: t.perim_lf, basis: "rule", note: `takeoff · ${t.name}, perimeter` }
        : { ok: false, missing: [`Takeoff: ${t.name} — its perimeter`] };
    }
    return { ok: false, missing: [`${line.name}: counted in ${line.unit || "no unit"}, but ${t.name} is measured in ${t.unit}`] };
  }
  const up = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6);
  const scope = line.section_id ? sections.filter((s) => s.id === line.section_id) : sections;
  if (line.section_id && !scope.length) return { ok: false, missing: [`${line.name}: its area was removed`] };
  if (!scope.length) return { ok: false, missing: [`${line.name}: no areas on this job yet`] };
  const qs = scope.map(quantities);
  const label = (q: SectionQuantities) => q.name || "An area";
  const p = line.rule_params ?? {};
  const pos = (v: unknown): v is number => has(v as number) && (v as number) > 0;

  switch (line.qty_rule) {
    case "per_job": return { ok: true, qty: 1, basis: "rule", note: "once" };
    case "per_day":
      return has(days) && days > 0 ? { ok: true, qty: days, basis: "rule", note: "days" } : { ok: false, missing: ["Days on this job"] };
    case "per_sqft": {
      const miss = qs.filter((q) => q.sqft === null).map((q) => `${label(q)}: area`);
      if (miss.length) return { ok: false, missing: miss };
      const sf = qs.reduce((a, q) => a + (q.sqft as number), 0);
      // The card's unit decides: a card sold by the square yard counts yards (sq ft ÷ 9).
      if (takeoffUnit(line.unit ?? "") === "SY") return { ok: true, qty: Math.round((sf / 9) * 100) / 100, basis: "rule", note: "sq yd" };
      return { ok: true, qty: sf, basis: "rule", note: "sq ft" };
    }
    case "per_lf_perimeter": {
      const miss: string[] = [];
      let lf = 0;
      for (const s of scope) {
        // An area measured in linear feet (a curb, a grade beam) is its own length.
        const q = quantities(s);
        if (q.count !== null && takeoffUnit(q.count_unit ?? "") === "LF") { lf += q.count; continue; }
        if (!has(s.length_ft) || !has(s.width_ft) || s.length_ft <= 0 || s.width_ft <= 0) miss.push(`${s.name || "An area"}: length and width (for the edge)`);
        else lf += 2 * (s.length_ft + s.width_ft);
      }
      return miss.length ? { ok: false, missing: miss } : { ok: true, qty: lf, basis: "rule", note: "ft of edge" };
    }
    case "per_cy": {
      const conc = qs.filter((q) => q.concrete);
      if (!conc.length) return { ok: false, missing: [`${line.name}: no concrete areas`] };
      const miss = conc.filter((q) => q.cy_neat === null).map((q) => `${label(q)}: ${q.missing.join(" and ") || "size"}`);
      if (miss.length) return { ok: false, missing: miss };
      const neat = conc.reduce((a, q) => a + (q.cy_neat as number), 0);
      if (pos(p.per_cy)) return { ok: true, qty: up(neat * p.per_cy * 10) / 10, basis: "rule", note: `${p.per_cy} a yard` };
      // Waste is the card's (Coy: concrete is set in the cost book) — 0 is a
      // real answer, blank is not.
      if (!has(p.waste_pct) || p.waste_pct < 0) return { ok: false, missing: [`${line.name}: waste % (on the card)`] };
      const withWaste = neat * (1 + p.waste_pct / 100);
      const note = p.waste_pct ? `yards + ${p.waste_pct}% waste` : "yards, no waste";
      // The card can say how a load is ordered (rule_params.round_cy: 0.25 = up
      // to the next quarter yard); without it, yards to the hundredth as before.
      if (pos(p.round_cy)) {
        const steps = up(withWaste / p.round_cy);
        return { ok: true, qty: Math.round(steps * p.round_cy * 1e6) / 1e6, basis: "rule", note: `${note}, ordered by ${p.round_cy} yd` };
      }
      return { ok: true, qty: Math.round(withWaste * 100) / 100, basis: "rule", note };
    }
    case "per_sheet": {
      if (!pos(p.sheet_sqft)) return { ok: false, missing: [`${line.name}: what one sheet covers`] };
      const miss = qs.filter((q) => q.sqft === null).map((q) => `${label(q)}: area`);
      if (miss.length) return { ok: false, missing: miss };
      const sqft = qs.reduce((a, q) => a + (q.sqft as number), 0);
      return { ok: true, qty: up(sqft / p.sheet_sqft), basis: "rule", note: `${p.sheet_sqft} sq ft a sheet` };
    }
    case "per_stick": {
      const miss: string[] = [];
      if (!pos(p.spacing_in)) miss.push(`${line.name}: bar spacing`);
      if (!pos(p.stick_ft)) miss.push(`${line.name}: stick length`);
      miss.push(...qs.filter((q) => q.sqft === null).map((q) => `${label(q)}: area`));
      if (miss.length) return { ok: false, missing: miss };
      const sqft = qs.reduce((a, q) => a + (q.sqft as number), 0);
      const lf = sqft * 2 * (12 / p.spacing_in) * (1 + (pos(p.lap_pct) ? p.lap_pct : 0) / 100);
      return { ok: true, qty: up(lf / p.stick_ft), basis: "rule", note: `${p.spacing_in}" grid, ${p.stick_ft}' sticks` };
    }
    default:
      return { ok: false, missing: [`${line.name}: unknown quantity rule`] };
  }
}

export function budget(
  lines: BudgetLine[],
  optionIds: string[],
  s: BudgetSettings,
  sections: SectionInput[],
  days: number | null,
  opts: { tax_on: boolean; discount: number; takeoff?: Record<string, TakeoffTotal> },
): BudgetResult {
  const out: Record<string, LineResult> = {};
  const taxRate = has(s.tax_rate_pct) ? s.tax_rate_pct : null;
  const oh = has(s.overhead_pct) ? s.overhead_pct : null;
  const rk = has(s.risk_pct) && s.risk_pct > 0 ? s.risk_pct : 0;
  const ck = has(s.carry_pct) && s.carry_pct > 0 ? s.carry_pct : 0;

  for (const l of lines) {
    const blocked: string[] = [];
    const q = ruleQty(l, sections, days, opts.takeoff);
    const qty = q.ok ? q.qty : null;
    if (!q.ok) blocked.push(...q.missing);
    if (!has(l.unit_cost)) blocked.push(`${l.name}: unit cost`);
    if (oh === null) blocked.push("O.H. % (Settings → Cost book, or this budget)");

    let m: number | null = null;
    let from: LineResult["margin_from"] = null;
    if (has(l.margin_pct)) { m = l.margin_pct; from = "line"; }
    else if (has(s.margin_pct)) { m = s.margin_pct; from = "job"; }
    else blocked.push("Margin % (Settings → Cost book, or this budget)");
    if (m !== null && m >= 100) { blocked.push(`${l.name}: margin must be under 100%`); m = null; }
    if (m !== null && m + ck >= 100) { blocked.push(`${l.name}: margin + carrying cost must be under 100%`); m = null; }
    for (const r of s.risk_missing ?? []) blocked.push(`Risk — ${r}`);
    if (opts.tax_on && l.taxable && taxRate === null) blocked.push(`Sales tax for this job${s.tax_missing ? ` (${s.tax_missing})` : ""}`);

    const ext_cost = qty !== null && has(l.unit_cost) ? qty * l.unit_cost : null;
    const overhead = ext_cost !== null && oh !== null ? ext_cost * oh / 100 : null;
    const risk = ext_cost !== null ? ext_cost * rk / 100 : null;
    const ext_price = ext_cost !== null && overhead !== null && risk !== null && m !== null ? (ext_cost + overhead + risk) / (1 - (m + ck) / 100) : null;
    const carry = ext_price !== null ? ext_price * ck / 100 : null;
    const unit_price = ext_price !== null && qty ? ext_price / qty
      : has(l.unit_cost) && oh !== null && m !== null ? l.unit_cost * (1 + (oh + rk) / 100) / (1 - (m + ck) / 100) : null;
    const tax = opts.tax_on && l.taxable && ext_cost !== null && taxRate !== null ? ext_cost * taxRate / 100 : 0;
    out[l.id] = {
      id: l.id, qty, qty_basis: q.ok ? q.basis : (l.qty_source === "set" ? "set" : "rule"), qty_note: q.ok ? q.note : null,
      margin_pct: m, margin_from: from, ext_cost, overhead, risk, carry, unit_price, ext_price,
      margin: ext_price && ext_cost !== null && overhead !== null ? (ext_price - ext_cost - overhead - (risk ?? 0) - (carry ?? 0)) / ext_price : null,
      tax, blocked,
    };
  }

  const tierOf = (optionId: string | null): TierTotal => {
    const inTier = lines.filter((l) => l.option_id === null || (optionId !== null && l.option_id === optionId)
      || (optionId === null && optionIds.length === 0));
    const rs = inTier.map((l) => out[l.id]);
    const cost = rs.reduce((a, r) => a + (r.ext_cost ?? 0), 0);
    const overhead = rs.reduce((a, r) => a + (r.overhead ?? 0), 0);
    const risk = rs.reduce((a, r) => a + (r.risk ?? 0), 0);
    const carry = rs.reduce((a, r) => a + (r.carry ?? 0), 0);
    const price = rs.reduce((a, r) => a + (r.ext_price ?? 0), 0);
    const tax = rs.reduce((a, r) => a + r.tax, 0);
    const discount = has(opts.discount) && opts.discount > 0 ? opts.discount : 0;
    const total = price + tax - discount;
    const net = total - tax;
    const profit = net - cost - overhead - risk - carry;
    const blocked = [...new Set(rs.flatMap((r) => r.blocked))];
    return {
      option_id: optionId, cost, overhead, risk, carry, price, tax, discount, total, profit,
      margin: net > 0 ? profit / net : 0,
      priced: blocked.length === 0 && inTier.length > 0, blocked, line_ids: inTier.map((l) => l.id),
    };
  };
  const tiers = optionIds.length ? optionIds.map(tierOf) : [tierOf(null)];
  return { lines: out, tiers, hints: [] };
}

// ---------------------------------------------------------------------------
// Assemblies — Coy's default set of cards for a kind of area (migration 050)
// ---------------------------------------------------------------------------

export interface AssemblyRef { id: string; job_type: string | null; work_type: string | null; auto_load: boolean }

/**
 * Which assembly fills a new area on its own: the one for this job type and
 * work type; else the one for this work type on any job; else none. Only
 * auto-loading assemblies count. An assembly for "any work type" never fills
 * an area by itself — it is loaded by hand.
 */
export function pickAssembly<T extends AssemblyRef>(assemblies: T[], jobType: string | null, workType: string | null): T | null {
  if (!workType) return null;
  const auto = assemblies.filter((a) => a.auto_load && a.work_type === workType);
  return (jobType ? auto.find((a) => a.job_type === jobType) : undefined) ?? auto.find((a) => a.job_type === null) ?? null;
}
