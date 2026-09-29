/**
 * What a client may write on an `org_reinforcement_types` row (migration 042).
 * Every number is optional here — the engine names what a type still needs
 * before it can be priced — but a number given must be sane.
 */

export const REINF_SELECT =
  "id, name, kind, unit, unit_cost, sheet_sqft, spacing_in, stick_ft, lap_pct, per_cy, active";

const KINDS = ["mesh", "rebar", "fiber", "other"];
const UNITS = ["sheet", "stick", "lf", "lb", "bag", "sqft"];
const NUMS: Array<[string, number, boolean]> = [
  // field, max, zero allowed
  ["unit_cost", 100000, true], ["sheet_sqft", 1000, false], ["spacing_in", 60, false],
  ["stick_ft", 60, false], ["lap_pct", 100, true], ["per_cy", 100, false],
];

export function readReinforcementFields(body: Record<string, unknown>, creating: boolean):
  { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};
  if ("name" in body || creating) {
    const v = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
    if (!v || v.length > 80) return { ok: false, error: "A reinforcement needs a name (up to 80 characters)." };
    patch.name = v;
  }
  if ("kind" in body || creating) {
    if (!KINDS.includes(body.kind as string)) return { ok: false, error: `kind must be one of ${KINDS.join(", ")}.` };
    patch.kind = body.kind;
  }
  if ("unit" in body || creating) {
    if (!UNITS.includes(body.unit as string)) return { ok: false, error: `unit must be one of ${UNITS.join(", ")}.` };
    patch.unit = body.unit;
  }
  for (const [f, max, zero] of NUMS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v === null || v === "") { patch[f] = null; continue; }
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 0 || (!zero && n === 0) || n > max) return { ok: false, error: `${f} must be a number${zero ? "" : " above 0"} up to ${max}, or blank.` };
    patch[f] = n;
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") return { ok: false, error: "active must be true or false." };
    patch.active = body.active;
  }
  return { ok: true, patch };
}
