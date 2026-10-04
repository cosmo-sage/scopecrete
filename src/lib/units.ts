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
