/**
 * Units of measure for Price book items and budget lines (Coy, 2026-10-03:
 * "Need to change unit types. Sometimes it's days/sqft. I need to be able to
 * add and edit unit types"). The list offered is these plus every unit already
 * on an item; a new one is simply typed and saved on the item. Pure — tested
 * in tests/units.test.mjs.
 */
export const COMMON_UNITS = ["EA", "SF", "SY", "LF", "CY", "Day", "Hr", "Job", "LS", "Sheet", "Stick", "Ton", "Load", "Bag", "Gal"];

/** A unit as typed: trimmed, inner spaces collapsed, 1–20 characters; else null. */
export function cleanUnit(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.replace(/\s+/g, " ").trim();
  return u.length >= 1 && u.length <= 20 ? u : null;
}

/** The units to offer: the org's own first (most used), then the common ones it doesn't have, ignoring case. Always includes `current`. */
export function unitChoices(orgUnits: string[], current?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...(current ? [current] : []), ...orgUnits, ...COMMON_UNITS]) {
    const k = u.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(u.trim());
  }
  return out;
}

/**
 * Unit type (Coy, 2026-10-05: "if it's just the unit type then it needs to be
 * renamed 'unit type'. And the dropdown list should be simple: SqFt, SqYd,
 * LnFt, CuYd, Each, + (to add my own)"). One picker; the unit decides how a
 * line's quantity is worked out, so there is no separate "how it's counted".
 */
export const UNIT_TYPES = [
  { unit: "SqFt", rule: "per_sqft", says: "the area's square feet" },
  { unit: "SqYd", rule: "per_sqft", says: "the area's square yards" },
  { unit: "LnFt", rule: "per_lf_perimeter", says: "the area's edge (or its length, measured in LF)" },
  { unit: "CuYd", rule: "per_cy", says: "the area's yards of concrete, with the card's waste" },
  { unit: "Each", rule: "manual", says: "typed (or the area's count)" },
] as const;
export type UnitType = (typeof UNIT_TYPES)[number]["unit"];

const ALIASES: Record<UnitType, string[]> = {
  SqFt: ["sf", "sqft", "sft", "ft2", "squarefeet", "squarefoot"],
  SqYd: ["sy", "sqyd", "syd", "yd2", "squareyard", "squareyards"],
  LnFt: ["lf", "ft", "linft", "lnft", "linearfeet", "linearfoot", "feet", "foot"],
  CuYd: ["cy", "yd", "yd3", "cuyd", "cubicyard", "cubicyards", "yards", "yard"],
  Each: ["ea", "each", "count", "ct", "pcs", "pc", "no"],
};
const squash = (u: string) => u.trim().toLowerCase().replace(/[.\s]/g, "");

/** Which of the five a unit is ("Square Feet" → SqFt), or null for the org's own (Days, Lump Sum…). */
export function unitTypeOf(unit: string | null | undefined): UnitType | null {
  if (!unit) return null;
  const u = squash(unit);
  for (const t of UNIT_TYPES) if (ALIASES[t.unit].includes(u)) return t.unit;
  return null;
}

/**
 * The quantity rule a unit brings: SqFt/SqYd by the area, LnFt by the edge,
 * CuYd by the yard, Each typed. Of Coy's own units, a day counts the days on the
 * job and a lump sum once; sheets and sticks count by the sheet / stick on a
 * Price book card (which carries the coverage and spacing), and on a budget
 * line only if it already does; anything else is typed.
 * A line measured in the Plan Room stays measured.
 */
export function ruleForUnit(unit: string | null | undefined, current?: string | null, card = false): string {
  if (current === "from_takeoff") return "from_takeoff";
  const t = unitTypeOf(unit);
  if (t) return UNIT_TYPES.find((x) => x.unit === t)!.rule;
  const u = squash(unit ?? "");
  if (["day", "days"].includes(u)) return "per_day";
  if (["ls", "lumpsum", "job"].includes(u)) return "per_job";
  if (["sheet", "sheets"].includes(u) && (card || current === "per_sheet")) return "per_sheet";
  if (["stick", "sticks"].includes(u) && (card || current === "per_stick")) return "per_stick";
  return "manual";
}

/** The org's own units — those that aren't one of the five, once each. */
export function ownUnits(orgUnits: string[], current?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...(current ? [current] : []), ...orgUnits]) {
    const k = squash(u);
    if (!k || unitTypeOf(u) || seen.has(k)) continue;
    seen.add(k);
    out.push(u.trim());
  }
  return out;
}
