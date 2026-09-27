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
  opts: { discount?: number } = {},
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
    excluded: ["Reinforcement, base and vapor barrier — no rates for them in cost settings yet",
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
