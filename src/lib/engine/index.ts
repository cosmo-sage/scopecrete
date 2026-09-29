/**
 * The costing engine — DECISIONS.md §3 and §4, and nothing else.
 *
 * Pure: no I/O, no imports, no defaults. It is run by the scope builder in the
 * browser and by the unit tests in tests/engine.test.mjs (node --test, which
 * strips the types — so no enums, no parameter properties, no `@/` imports).
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * It is not v34's computeJob(). That one prices labour by crew-hours, applies
 * one global markup, and adds overhead as a percentage of labour. DECISIONS §3
 * says labour is priced by the SQUARE FOOT and markup is PER COST TYPE; §4 says
 * overhead enters in exactly one place, the floor, spread by crew-days. All
 * three would be double-counts or mispricings here.
 *
 * THE RULE THAT SHAPES EVERY RETURN VALUE
 *
 * Nothing is assumed. A missing dimension is `missing`, never 4 inches. A
 * missing setting blocks the price and is NAMED, never replaced by a Gulfline
 * reference rate. `price()` returns `{ priced: false, blocked }` rather than a
 * number whenever any input it needs is absent, because a price computed from
 * a guess looks exactly like a real one and gets sent.
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
  /** One of the org's reinforcement types (migration 042), or none chosen. */
  reinforcement_type_id?: string | null;
}

/**
 * A reinforcement Coy prices by its own unit (DECISIONS §3, 2026-09-28): mesh
 * by the sheet, rebar by the stick or the foot, fiber by the pound or bag per
 * yard. Every quantity rule needs its own number; a missing one blocks the
 * price and is named, never filled in.
 */
export interface ReinforcementType {
  id: string;
  name: string;
  kind: "mesh" | "rebar" | "fiber" | "other" | string;
  unit: "sheet" | "stick" | "lf" | "lb" | "bag" | "sqft" | string;
  unit_cost: number | null;
  /** Mesh: area one sheet covers after lap. */
  sheet_sqft?: number | null;
  /** Rebar: spacing on centre, both ways. */
  spacing_in?: number | null;
  /** Rebar sold by the stick: its length. */
  stick_ft?: number | null;
  /** Rebar: extra for laps and ends. null = no allowance. */
  lap_pct?: number | null;
  /** Fiber: pounds or bags per cubic yard. */
  per_cy?: number | null;
}

/** The subset of `org_cost_settings` the engine reads. null = not recorded. */
export interface CostSettings {
  concrete_price_per_cy: number | null;
  concrete_overage_pct: number | null;
  shortload_threshold_cy: number | null;
  shortload_pct: number | null;
  form_finish_per_sqft: number | null;
  demo_per_sqft: number | null;
  mobilization_fee: number | null;
  sales_tax_pct: number | null;
  tax_applies_to: "materials" | "full_bid" | "none" | string | null;
  markup_material_pct: number | null;
  markup_labor_pct: number | null;
  markup_equipment_pct: number | null;
  owner_fee_pct: number | null;
  estimator_fee_pct: number | null;
  tax_reserve_pct: number | null;
  assumed_billable_days: number | null;
  comp_mode: "fixed_draw" | "pct_profit" | string | null;
  comp_monthly_draw: number | null;
}

export interface OverheadItem {
  label: string;
  amount: number;
  cadence: "monthly" | "quarterly" | "annual" | "one_time" | string;
  active: boolean;
}

/** Plain-English names for every input, used in `blocked` lists. */
export const SETTING_LABEL: Record<keyof CostSettings, string> = {
  concrete_price_per_cy: "Concrete price per yard",
  concrete_overage_pct: "Concrete waste %",
  shortload_threshold_cy: "Short-load threshold",
  shortload_pct: "Short-load charge %",
  form_finish_per_sqft: "Form & finish per sq ft",
  demo_per_sqft: "Demo per sq ft",
  mobilization_fee: "Mobilization",
  sales_tax_pct: "Sales tax %",
  tax_applies_to: "What sales tax applies to",
  markup_material_pct: "Materials markup %",
  markup_labor_pct: "Labor markup %",
  markup_equipment_pct: "Equipment markup %",
  owner_fee_pct: "Owner fee %",
  estimator_fee_pct: "Estimator fee %",
  tax_reserve_pct: "Tax reserve %",
  assumed_billable_days: "Crew-days per month",
  comp_mode: "Pay-yourself mode",
  comp_monthly_draw: "Monthly draw",
};

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
}

export function quantities(s: SectionInput): SectionQuantities {
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
    sqft, sqft_source, depth_in: depth, cy_neat, missing,
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

// ---------------------------------------------------------------------------
// Reinforcement — by its own unit
// ---------------------------------------------------------------------------

export type ReinforcementQty =
  | { ok: true; qty: number; unit: string; note: string }
  | { ok: false; missing: string[] };

/** How much of a reinforcement a section needs, in the unit it is bought by. */
export function reinforcementQty(q: SectionQuantities, t: ReinforcementType): ReinforcementQty {
  const missing: string[] = [];
  const pos = (v: number | null | undefined): v is number => has(v) && v > 0;
  // Round away float dust first: 1,760.0000000002 ft is 88 sticks, not 89.
  const up = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6);
  if (!has(t.unit_cost) || t.unit_cost < 0) missing.push(`${t.name}: cost per ${t.unit}`);
  if (q.sqft === null) return { ok: false, missing: [...missing, `${q.name || "A section"}: area`] };
  const sqft = q.sqft;

  if (t.kind === "mesh") {
    if (t.unit === "sqft") return missing.length ? { ok: false, missing } : { ok: true, qty: sqft, unit: "sq ft", note: "by area" };
    if (t.unit !== "sheet") return { ok: false, missing: [...missing, `${t.name}: mesh is bought by the sheet or the sq ft`] };
    if (!pos(t.sheet_sqft)) missing.push(`${t.name}: sq ft one sheet covers`);
    if (missing.length) return { ok: false, missing };
    return { ok: true, qty: up(sqft / (t.sheet_sqft as number)), unit: "sheet", note: `${t.sheet_sqft} sq ft a sheet` };
  }
  if (t.kind === "rebar") {
    if (!pos(t.spacing_in)) missing.push(`${t.name}: spacing`);
    if (t.unit === "stick" && !pos(t.stick_ft)) missing.push(`${t.name}: stick length`);
    if (t.unit !== "stick" && t.unit !== "lf") missing.push(`${t.name}: rebar is bought by the stick or the foot`);
    if (missing.length) return { ok: false, missing };
    const lap = has(t.lap_pct) ? t.lap_pct : 0;
    // A grid both ways: 12 ÷ spacing bars per foot, each way.
    const lf = sqft * 2 * (12 / (t.spacing_in as number)) * (1 + lap / 100);
    const note = `${t.spacing_in}" o.c. both ways${lap ? `, +${lap}% lap` : ", no lap allowance"}`;
    return t.unit === "stick"
      ? { ok: true, qty: up(lf / (t.stick_ft as number)), unit: "stick", note: `${note}, ${Math.round(lf)} ft` }
      : { ok: true, qty: up(lf), unit: "ft", note };
  }
  if (t.kind === "fiber") {
    if (!pos(t.per_cy)) missing.push(`${t.name}: amount per yard`);
    if (q.cy_neat === null) missing.push(`${q.name || "A section"}: depth`);
    if (missing.length) return { ok: false, missing };
    return { ok: true, qty: up((q.cy_neat as number) * (t.per_cy as number) * 10) / 10, unit: t.unit, note: `${t.per_cy} ${t.unit} a yard` };
  }
  if (t.unit === "sqft") return missing.length ? { ok: false, missing } : { ok: true, qty: sqft, unit: "sq ft", note: "by area" };
  return { ok: false, missing: [...missing, `${t.name}: set it as mesh, rebar or fiber, or price it by the sq ft`] };
}

// ---------------------------------------------------------------------------
// Price — needs settings. Blocks, by name, on anything missing.
// ---------------------------------------------------------------------------

export interface CostLine {
  type: "materials" | "labor" | "equipment";
  label: string;
  qty: number;
  unit: string;
  rate: number;
  cost: number;
}

export interface Priced {
  priced: true;
  takeoff: Takeoff;
  lines: CostLine[];
  cost: { materials: number; labor: number; equipment: number; tax: number; total: number };
  price: { materials: number; labor: number; equipment: number; tax: number; subtotal: number; discount: number; total: number };
  /** (price − cost) ÷ price, after discount. */
  margin: number;
  /** Things the price does NOT include, said out loud. */
  excluded: string[];
}

export interface Blocked {
  priced: false;
  takeoff: Takeoff;
  /** Human-readable names of every missing input. */
  blocked: string[];
}

export function monthlyNut(items: OverheadItem[]): number {
  return items.filter((i) => i.active).reduce((a, i) => {
    if (i.cadence === "monthly") return a + i.amount;
    if (i.cadence === "quarterly") return a + i.amount / 3;
    if (i.cadence === "annual") return a + i.amount / 12;
    return a; // one_time is a dated cash event, not part of the recurring nut
  }, 0);
}

/**
 * Discount touches the PRICE column only (DECISIONS §3). This is the function
 * the Gulfline test holds to: entering a discount as a negative line in both
 * columns inflated a true 27.7% margin to a reported 39.4%.
 */
export function applyDiscount(cost: number, price: number, discount: number) {
  if (!has(discount) || discount < 0) throw new Error("discount must be a number >= 0");
  const net = price - discount;
  return { cost, price: net, margin: net > 0 ? (net - cost) / net : 0 };
}

export function price(
  sections: SectionInput[],
  s: CostSettings,
  opts: { discount?: number; reinforcement?: ReinforcementType[] } = {},
): Priced | Blocked {
  const t = takeoff(sections, s.concrete_overage_pct);
  const blocked: string[] = [];
  const need = (k: keyof CostSettings) => {
    const v = s[k];
    if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) {
      blocked.push(SETTING_LABEL[k]);
    }
  };

  for (const q of t.sections) {
    if (q.missing.length) blocked.push(`${q.name || "A section"}: ${q.missing.join(", ")} not set`);
    if (q.work_type === "prep") blocked.push(`${q.name || "Prep section"}: there is no prep rate in cost settings`);
  }
  if (sections.length === 0) blocked.push("No sections yet");

  // Reinforcement chosen on a section is priced by its own unit; a missing
  // number on its type blocks the price, like any other missing setting.
  const types = new Map((opts.reinforcement ?? []).map((r) => [r.id, r]));
  const reinf: Array<{ q: SectionQuantities; t: ReinforcementType; qty: number; unit: string; note: string }> = [];
  const unreinforced: string[] = [];
  sections.forEach((sec, i) => {
    const q = t.sections[i];
    if (!q.concrete) return;
    if (!sec.reinforcement_type_id) { unreinforced.push(q.name || q.work_type); return; }
    const ty = types.get(sec.reinforcement_type_id);
    if (!ty) { blocked.push(`${q.name || "A section"}: its reinforcement type no longer exists`); return; }
    if (q.sqft === null) return; // already blocked on its dimensions
    const r = reinforcementQty(q, ty);
    if (!r.ok) blocked.push(...r.missing);
    else reinf.push({ q, t: ty, qty: r.qty, unit: r.unit, note: r.note });
  });

  const anyConcrete = t.sections.some((q) => q.concrete);
  const anyDemo = t.sections.some((q) => q.work_type === "demo");
  if (anyConcrete) {
    need("concrete_price_per_cy"); need("concrete_overage_pct");
    need("shortload_threshold_cy"); need("shortload_pct");
    need("form_finish_per_sqft"); need("markup_material_pct");
  }
  if (anyDemo) need("demo_per_sqft");
  need("markup_labor_pct");
  need("mobilization_fee"); need("markup_equipment_pct");
  need("tax_applies_to");
  if (s.tax_applies_to !== "none") need("sales_tax_pct");

  const discount = opts.discount ?? 0;
  if (!has(discount) || discount < 0) blocked.push("Discount must be zero or more");

  if (blocked.length) return { priced: false, takeoff: t, blocked: [...new Set(blocked)] };

  const lines: CostLine[] = [];
  const n = (v: number | null) => v as number;

  // Materials: ordered yards (neat + waste) at the plant price, plus the
  // short-load charge when the whole pour is under the threshold.
  if (anyConcrete && t.cy_order !== null && t.cy_order > 0) {
    lines.push({ type: "materials", label: "Ready mix", qty: t.cy_order, unit: "cu yd",
      rate: n(s.concrete_price_per_cy), cost: t.cy_order * n(s.concrete_price_per_cy) });
    if (t.cy_order < n(s.shortload_threshold_cy)) {
      const base = t.cy_order * n(s.concrete_price_per_cy);
      lines.push({ type: "materials", label: `Short load (under ${n(s.shortload_threshold_cy)} cu yd)`,
        qty: 1, unit: "load", rate: base * n(s.shortload_pct) / 100, cost: base * n(s.shortload_pct) / 100 });
    }
  }

  for (const r of reinf) {
    lines.push({ type: "materials", label: `${r.t.name} — ${r.q.name || r.q.work_type}`, qty: r.qty, unit: r.unit,
      rate: n(r.t.unit_cost), cost: r.qty * n(r.t.unit_cost) });
  }

  // Labor by the square foot, per section (DECISIONS §3).
  for (const q of t.sections) {
    if (q.sqft === null) continue;
    if (q.concrete) {
      lines.push({ type: "labor", label: `Form & finish — ${q.name || q.work_type}`, qty: q.sqft,
        unit: "sq ft", rate: n(s.form_finish_per_sqft), cost: q.sqft * n(s.form_finish_per_sqft) });
    } else if (q.work_type === "demo") {
      lines.push({ type: "labor", label: `Demo — ${q.name || "demo"}`, qty: q.sqft,
        unit: "sq ft", rate: n(s.demo_per_sqft), cost: q.sqft * n(s.demo_per_sqft) });
    }
  }

  if (n(s.mobilization_fee) > 0) {
    lines.push({ type: "equipment", label: "Mobilization", qty: 1, unit: "job",
      rate: n(s.mobilization_fee), cost: n(s.mobilization_fee) });
  }

  const sum = (type: CostLine["type"]) => lines.filter((l) => l.type === type).reduce((a, l) => a + l.cost, 0);
  const mat = sum("materials"), lab = sum("labor"), eq = sum("equipment");

  const pMat = mat * (1 + (anyConcrete ? n(s.markup_material_pct) : 0) / 100);
  const pLab = lab * (1 + n(s.markup_labor_pct) / 100);
  const pEq = eq * (1 + n(s.markup_equipment_pct) / 100);

  // Tax on the materials subtotal only, in-market (DECISIONS §3). It is a
  // pass-through: charged at cost, carried in both columns, never marked up.
  const taxPct = s.tax_applies_to === "none" ? 0 : n(s.sales_tax_pct);
  const taxCost = s.tax_applies_to === "materials" ? mat * taxPct / 100 : 0;
  const subtotal = pMat + pLab + pEq + taxCost;
  const taxOnBid = s.tax_applies_to === "full_bid" ? subtotal * taxPct / 100 : 0;
  const tax = taxCost + taxOnBid;
  const costTotal = mat + lab + eq + tax;

  const d = applyDiscount(costTotal, subtotal + taxOnBid, discount);

  return {
    priced: true, takeoff: t, lines,
    cost: { materials: mat, labor: lab, equipment: eq, tax, total: costTotal },
    price: { materials: pMat, labor: pLab, equipment: pEq, tax, subtotal: subtotal + taxOnBid, discount, total: d.price },
    margin: d.margin,
    excluded: [
      ...(unreinforced.length ? [`Reinforcement — none chosen for ${unreinforced.join(", ")}`] : []),
      "Base and vapor barrier — no rates for them in cost settings yet",
      "Equipment rental by the day — not modelled yet"],
  };
}

// ---------------------------------------------------------------------------
// Floor — DECISIONS §4. floor = (hard_cost + job's share of the nut) / (1 − off-the-top)
// ---------------------------------------------------------------------------

export interface Floor {
  ok: true;
  floor: number;
  hard_cost: number;
  nut_monthly: number;
  nut_per_crew_day: number;
  crew_days: number;
  nut_share: number;
  off_top_pct: number;
  /** Whether crew days on this job were entered by a person or measured. */
  crew_days_basis: "estimated";
  draw_included: number;
}

export function floor(
  hardCost: number,
  s: CostSettings,
  overhead: OverheadItem[],
  crewDays: number | null,
): Floor | { ok: false; blocked: string[] } {
  const blocked: string[] = [];
  if (!has(s.owner_fee_pct)) blocked.push(SETTING_LABEL.owner_fee_pct);
  if (!has(s.estimator_fee_pct)) blocked.push(SETTING_LABEL.estimator_fee_pct);
  if (!has(s.tax_reserve_pct)) blocked.push(SETTING_LABEL.tax_reserve_pct);
  if (!has(s.assumed_billable_days) || s.assumed_billable_days <= 0) blocked.push(SETTING_LABEL.assumed_billable_days);
  if (!s.comp_mode) blocked.push(SETTING_LABEL.comp_mode);
  if (s.comp_mode === "fixed_draw" && !has(s.comp_monthly_draw)) blocked.push(SETTING_LABEL.comp_monthly_draw);
  if (overhead.filter((o) => o.active).length === 0) blocked.push("Monthly overhead (no items recorded)");
  if (!has(crewDays) || crewDays <= 0) blocked.push("Crew days on this job");

  const offTop = (s.owner_fee_pct ?? 0) + (s.estimator_fee_pct ?? 0) + (s.tax_reserve_pct ?? 0);
  if (offTop >= 100) blocked.push("Off-the-top adds to 100% or more");
  if (blocked.length) return { ok: false, blocked };

  // fixed_draw behaves like an overhead line the floor MUST cover; pct_profit
  // comes out after a job clears and does NOT raise the floor (§4).
  const draw = s.comp_mode === "fixed_draw" ? (s.comp_monthly_draw as number) : 0;
  const nut = monthlyNut(overhead) + draw;
  const perDay = nut / (s.assumed_billable_days as number);
  const share = perDay * (crewDays as number);
  return {
    ok: true,
    // A divisor, not a subtraction: 11% off the top means ÷ 0.89.
    floor: (hardCost + share) / (1 - offTop / 100),
    hard_cost: hardCost, nut_monthly: nut, nut_per_crew_day: perDay,
    crew_days: crewDays as number, nut_share: share, off_top_pct: offTop,
    crew_days_basis: "estimated", draw_included: draw,
  };
}

// ---------------------------------------------------------------------------
// The job budget (migration 048, Coy 2026-09-29) — JobTread's maths on lines
// copied from cost cards:
//   ext cost = qty × unit cost
//   unit price = unit cost × (1 + markup)      ext price = qty × unit price
//   margin = (price − cost) ÷ price
// Quantities come from the scope by each line's rule, or are typed (✎).
// Markup: the line's own (a card's is copied onto it), else its group's
// default, else the cost type's markup in Cost settings — never assumed.
// Tax is a pass-through on taxable lines, at cost, in both columns (§3), and
// only while the budget's tax switch is on. Discount touches price only (§3).
// Good / better / best: a line with no option is in every tier.
// ---------------------------------------------------------------------------

export type QtyRule = "per_cy" | "per_sqft" | "per_lf_perimeter" | "per_sheet" | "per_stick" | "per_day" | "per_job" | "manual";
export type BudgetCostType = "material" | "labor" | "equipment" | "subcontract" | "other";

export interface BudgetLine {
  id: string;
  name: string;
  cost_type: BudgetCostType | string;
  unit: string;
  unit_cost: number | null;
  markup_pct: number | null;
  taxable: boolean;
  qty_rule: QtyRule | string;
  rule_params: Record<string, number>;
  qty_source: "rule" | "set" | string;
  /** Typed quantity (qty_source 'set' or rule 'manual'). */
  quantity: number | null;
  section_id: string | null;
  option_id: string | null;
  cost_group_id: string | null;
}

export interface BudgetSettings {
  markup_material_pct: number | null;
  markup_labor_pct: number | null;
  markup_equipment_pct: number | null;
  markup_subcontract_pct?: number | null;
  sales_tax_pct: number | null;
  concrete_overage_pct: number | null;
  shortload_threshold_cy: number | null;
}

export interface LineResult {
  id: string;
  qty: number | null;
  /** Where the quantity came from, said the way the grid shows it. */
  qty_basis: "rule" | "set";
  qty_note: string | null;
  markup: number | null;
  markup_from: "line" | "group" | "type" | null;
  ext_cost: number | null;
  unit_price: number | null;
  ext_price: number | null;
  margin: number | null;
  tax: number;
  /** Everything missing for this line, by name. Empty = priced. */
  blocked: string[];
}

export interface TierTotal {
  option_id: string | null;
  cost: number;
  price: number;
  tax: number;
  discount: number;
  /** price + tax − discount */
  total: number;
  /** (total − (cost + tax)) ÷ total */
  margin: number;
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

const TYPE_MARKUP: Record<string, keyof BudgetSettings> = {
  material: "markup_material_pct", labor: "markup_labor_pct", equipment: "markup_equipment_pct", subcontract: "markup_subcontract_pct",
};
const TYPE_NAME: Record<string, string> = { material: "Materials", labor: "Labor", equipment: "Equipment", subcontract: "Subcontract", other: "Other" };

/** How many of something a line needs, from the scope. Whole-job lines (no section) sum every section. */
export function ruleQty(
  line: Pick<BudgetLine, "name" | "qty_rule" | "rule_params" | "qty_source" | "quantity" | "section_id">,
  sections: SectionInput[],
  overage_pct: number | null,
  crewDays: number | null,
): { ok: true; qty: number; basis: "rule" | "set"; note: string } | { ok: false; missing: string[] } {
  if (line.qty_source === "set" || line.qty_rule === "manual") {
    if (has(line.quantity) && line.quantity >= 0) return { ok: true, qty: line.quantity, basis: "set", note: "typed" };
    return { ok: false, missing: [`${line.name}: quantity`] };
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
      return has(crewDays) && crewDays > 0 ? { ok: true, qty: crewDays, basis: "rule", note: "crew days" } : { ok: false, missing: ["Crew days on this job"] };
    case "per_sqft": {
      const miss = qs.filter((q) => q.sqft === null).map((q) => `${label(q)}: area`);
      if (miss.length) return { ok: false, missing: miss };
      return { ok: true, qty: qs.reduce((a, q) => a + (q.sqft as number), 0), basis: "rule", note: "sq ft" };
    }
    case "per_lf_perimeter": {
      const miss: string[] = [];
      let lf = 0;
      for (const s of scope) {
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
      if (!has(overage_pct)) return { ok: false, missing: [SETTING_LABEL.concrete_overage_pct] };
      return { ok: true, qty: Math.round(neat * (1 + overage_pct / 100) * 100) / 100, basis: "rule", note: `yards + ${overage_pct}% waste` };
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
  crewDays: number | null,
  opts: { tax_on: boolean; discount: number; groupMarkup?: Record<string, number | null> },
): BudgetResult {
  const out: Record<string, LineResult> = {};
  const taxRate = has(s.sales_tax_pct) ? s.sales_tax_pct : null;

  for (const l of lines) {
    const blocked: string[] = [];
    const q = ruleQty(l, sections, s.concrete_overage_pct, crewDays);
    const qty = q.ok ? q.qty : null;
    if (!q.ok) blocked.push(...q.missing);
    if (!has(l.unit_cost)) blocked.push(`${l.name}: unit cost`);

    let markup: number | null = null;
    let from: LineResult["markup_from"] = null;
    const gm = l.cost_group_id ? opts.groupMarkup?.[l.cost_group_id] : null;
    if (has(l.markup_pct)) { markup = l.markup_pct; from = "line"; }
    else if (has(gm)) { markup = gm; from = "group"; }
    else {
      const k = TYPE_MARKUP[l.cost_type];
      const v = k ? s[k] : null;
      if (has(v as number)) { markup = v as number; from = "type"; }
      else blocked.push(`${TYPE_NAME[l.cost_type] ?? "Other"} markup %`);
    }
    if (opts.tax_on && l.taxable && taxRate === null) blocked.push(SETTING_LABEL.sales_tax_pct);

    const ext_cost = qty !== null && has(l.unit_cost) ? qty * l.unit_cost : null;
    const unit_price = has(l.unit_cost) && markup !== null ? l.unit_cost * (1 + markup / 100) : null;
    const ext_price = qty !== null && unit_price !== null ? qty * unit_price : null;
    const tax = opts.tax_on && l.taxable && ext_cost !== null && taxRate !== null ? ext_cost * taxRate / 100 : 0;
    out[l.id] = {
      id: l.id, qty, qty_basis: q.ok ? q.basis : (l.qty_source === "set" ? "set" : "rule"), qty_note: q.ok ? q.note : null,
      markup, markup_from: from, ext_cost, unit_price, ext_price,
      margin: ext_price && ext_cost !== null ? (ext_price - ext_cost) / ext_price : null,
      tax, blocked,
    };
  }

  const tierOf = (optionId: string | null): TierTotal => {
    const inTier = lines.filter((l) => l.option_id === null || (optionId !== null && l.option_id === optionId)
      || (optionId === null && optionIds.length === 0));
    const rs = inTier.map((l) => out[l.id]);
    const cost = rs.reduce((a, r) => a + (r.ext_cost ?? 0), 0);
    const price = rs.reduce((a, r) => a + (r.ext_price ?? 0), 0);
    const tax = rs.reduce((a, r) => a + r.tax, 0);
    const discount = has(opts.discount) && opts.discount > 0 ? opts.discount : 0;
    const total = price + tax - discount;
    const blocked = [...new Set(rs.flatMap((r) => r.blocked))];
    return {
      option_id: optionId, cost, price, tax, discount, total,
      margin: total > 0 ? (total - (cost + tax)) / total : 0,
      priced: blocked.length === 0 && inTier.length > 0, blocked, line_ids: inTier.map((l) => l.id),
    };
  };
  const tiers = optionIds.length ? optionIds.map(tierOf) : [tierOf(null)];

  const hints: string[] = [];
  const t = takeoff(sections, s.concrete_overage_pct);
  const yards = t.cy_order ?? t.cy_neat;
  if (has(s.shortload_threshold_cy) && yards > 0 && yards < s.shortload_threshold_cy
      && !lines.some((l) => /short[\s-]?load/i.test(l.name))) {
    hints.push(`Under ${s.shortload_threshold_cy} yd — add your short-load card if the plant charges one.`);
  }
  return { lines: out, tiers, hints };
}
