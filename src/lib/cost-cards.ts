/**
 * Cost cards (migration 047) — the pure parts: the vocabulary, and the one
 * place a card from the browser is checked before it is saved. Pure, so
 * tests/cost-cards.test.mjs runs it.
 *
 * A card is something Coy buys or charges for — ready mix from Angelle by the
 * yard, form-and-finish by the sq ft, the mini skid by the day — tied to the
 * vendor it comes from. Nothing is assumed: a card with no unit cost is kept,
 * and blocks any price that uses it, by name.
 */

export const COST_TYPES = ["material", "labor", "equipment", "subcontract", "other"] as const;
export type CostType = (typeof COST_TYPES)[number];
export const COST_TYPE_LABEL: Record<CostType, string> = {
  material: "Materials", labor: "Labor", equipment: "Equipment", subcontract: "Subcontract", other: "Other",
};

export const QTY_RULES = ["per_cy", "per_sqft", "per_lf_perimeter", "per_sheet", "per_stick", "per_day", "per_job", "manual"] as const;
export type QtyRule = (typeof QTY_RULES)[number];
/** How a card turns a scope into a quantity — said the way Coy would. */
export const QTY_RULE_LABEL: Record<QtyRule, string> = {
  per_cy: "by the yard of concrete",
  per_sqft: "by the square foot",
  per_lf_perimeter: "by the foot of edge (forms)",
  per_sheet: "by the sheet (mesh)",
  per_stick: "by the stick (rebar)",
  per_day: "by the day",
  per_job: "once per job",
  manual: "I'll type the quantity",
};
/** The unit a rule usually carries — a suggestion for the form, never forced. */
export const RULE_UNIT: Record<QtyRule, string> = {
  per_cy: "cy", per_sqft: "sq ft", per_lf_perimeter: "lf", per_sheet: "sheet", per_stick: "stick",
  per_day: "day", per_job: "job", manual: "each",
};
export const PRICE_SOURCES = ["quote", "receipt", "invoice", "typed", "import"] as const;

/** Materials are taxed in-market (§3); everything else isn't, unless Coy says. */
export const defaultTaxable = (t: CostType) => t === "material";

export interface CardInput {
  name: string; description: string | null; cost_type: CostType; unit: string;
  unit_cost: number | null; taxable: boolean; markup_pct: number | null;
  cost_group_id: string | null; vendor_contact_id: string | null; vendor_sku: string | null;
  price_as_of: string | null; price_source: string | null; qty_rule: QtyRule;
  rule_params: Record<string, number>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const numOrNull = (v: unknown): number | null | "bad" => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : "bad";
};

/** The rule's own numbers (sheet coverage, stick length, spacing, lap, dose, waste). Only known keys, only positive — waste may be 0. */
const RULE_KEYS: Partial<Record<QtyRule, string[]>> = {
  per_sheet: ["sheet_sqft"], per_stick: ["stick_ft", "spacing_in", "lap_pct"], per_cy: ["per_cy", "waste_pct"],
};
/** Keys where 0 is a real answer (no waste), not a missing one. */
const ZERO_OK = new Set(["waste_pct", "lap_pct"]);

/**
 * Check a card from the browser. `partial` for a PATCH: only the fields sent
 * are checked and returned. Returns the clean fields, or the first problem.
 */
export function cleanCard(b: Record<string, unknown>, partial = false): { ok: true; card: Partial<CardInput> } | { ok: false; error: string } {
  const out: Partial<CardInput> = {};
  const has = (k: string) => !partial || k in b;

  if (has("name")) {
    const n = txt(b.name, 120);
    if (!n) return { ok: false, error: "A card needs a name." };
    out.name = n;
  }
  if (has("cost_type")) {
    if (!(COST_TYPES as readonly string[]).includes(String(b.cost_type))) return { ok: false, error: "Pick materials, labor, equipment, subcontract or other." };
    out.cost_type = b.cost_type as CostType;
  }
  if (has("qty_rule")) {
    const r = b.qty_rule ?? "manual";
    if (!(QTY_RULES as readonly string[]).includes(String(r))) return { ok: false, error: "Unknown quantity rule." };
    out.qty_rule = r as QtyRule;
  }
  if (has("unit")) {
    const u = txt(b.unit, 20) ?? (out.qty_rule ? RULE_UNIT[out.qty_rule] : null);
    if (!u) return { ok: false, error: "A card needs a unit." };
    out.unit = u;
  }
  for (const [k, min, max] of [["unit_cost", 0, 1_000_000], ["markup_pct", 0, 500]] as const) {
    if (!has(k)) continue;
    const n = numOrNull(b[k]);
    if (n === "bad" || (n !== null && (n < min || n > max))) return { ok: false, error: `${k === "unit_cost" ? "Unit cost" : "Markup"} must be a number from ${min} to ${max}.` };
    out[k] = n;
  }
  if (has("taxable")) out.taxable = b.taxable === undefined ? defaultTaxable(out.cost_type ?? "other") : b.taxable === true;
  if (has("description")) out.description = txt(b.description, 500);
  if (has("vendor_sku")) out.vendor_sku = txt(b.vendor_sku, 60);
  for (const k of ["cost_group_id", "vendor_contact_id"] as const) {
    if (!has(k)) continue;
    const v = b[k];
    if (v === null || v === undefined || v === "") out[k] = null;
    else if (typeof v === "string" && UUID.test(v)) out[k] = v;
    else return { ok: false, error: `Bad ${k === "cost_group_id" ? "group" : "vendor"}.` };
  }
  if (has("price_as_of")) {
    const d = txt(b.price_as_of, 10);
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return { ok: false, error: "Price date must be a date." };
    out.price_as_of = d;
  }
  if (has("price_source")) {
    const s = txt(b.price_source, 20);
    if (s && !(PRICE_SOURCES as readonly string[]).includes(s)) return { ok: false, error: "Price source is quote, receipt, invoice, typed or import." };
    out.price_source = s;
  }
  if (has("rule_params")) {
    const raw = (b.rule_params && typeof b.rule_params === "object" ? b.rule_params : {}) as Record<string, unknown>;
    const allowed = RULE_KEYS[(out.qty_rule ?? b.qty_rule) as QtyRule] ?? [];
    const params: Record<string, number> = {};
    for (const k of allowed) {
      const n = numOrNull(raw[k]);
      if (n === "bad" || (n !== null && (ZERO_OK.has(k) ? n < 0 : n <= 0))) return { ok: false, error: `${k.replace(/_/g, " ")} must be a positive number.` };
      if (n !== null) params[k] = n;
    }
    out.rule_params = params;
  }
  return { ok: true, card: out };
}

/** What a card still needs before a price can use it — said out loud, never filled in. */
export function cardGaps(c: Pick<CardInput, "unit_cost" | "qty_rule" | "rule_params">): string[] {
  const g: string[] = [];
  if (c.unit_cost === null || c.unit_cost === undefined) g.push("unit cost");
  if (c.qty_rule === "per_sheet" && !c.rule_params?.sheet_sqft) g.push("what one sheet covers");
  if (c.qty_rule === "per_stick" && !c.rule_params?.spacing_in) g.push("bar spacing");
  if (c.qty_rule === "per_stick" && !c.rule_params?.stick_ft) g.push("stick length");
  // Concrete itself (no per-yard dose) needs its waste %; 0 is an answer.
  if (c.qty_rule === "per_cy" && !c.rule_params?.per_cy && typeof c.rule_params?.waste_pct !== "number") g.push("waste %");
  return g;
}

/**
 * A card a section can pick as its reinforcement (step 3b): counted by the
 * sheet (mesh) or the stick (rebar), or a per-yard dose (fiber).
 */
export function isReinforcementCard(c: { qty_rule: string; rule_params?: Record<string, number> | null }): boolean {
  return c.qty_rule === "per_sheet" || c.qty_rule === "per_stick" || (c.qty_rule === "per_cy" && !!c.rule_params?.per_cy);
}
