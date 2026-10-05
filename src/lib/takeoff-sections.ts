/**
 * Takeoff shapes counted in budget sections (migration 069) — pure, tested in
 * tests/takeoff-sections.test.mjs.
 *
 * Coy, 2026-10-03: "Pushing to budget should push the area measured under the
 * group … Section should follow any edit in the plan room … if I delete the
 * measurement, it should delete it in the budget without deleting the whole
 * section."
 *
 * A section takes one or more shapes (takeoff_measurements.section_id); its
 * size is their sum, in the unit of the first shape's group:
 *   area   → sqft_override = Σ SF       (and the groups' depth, when they agree, into a blank thickness)
 *   linear → count_qty = Σ LF, count_unit 'LF'
 *   count  → count_qty = Σ EA, count_unit 'EA'
 * A shape that can't be counted (its sheet has no scale) leaves the size blank
 * and says why — a total that left one out would be wrong. A shape of another
 * kind than the first is not added (an area is never added to a length).
 * Sizes are written only while the section follows its takeoff
 * (`takeoff_sync`); a size typed on the section by hand turns that off.
 */
import { KIND_UNIT, measurementQty, type MeasurementIn, type ParameterIn, type SheetScale, type TakeoffKind } from "./takeoff.ts";

export interface SectionLink {
  id: string; takeoff_sync: boolean;
  sqft_override: number | null; count_qty: number | null; count_unit: string | null;
  length_ft: number | null; width_ft: number | null; depth_in: number | null;
}
export interface ShapeIn extends MeasurementIn { section_id: string | null }

export interface SectionTakeoff {
  unit: "SF" | "LF" | "EA" | null;
  /** The sum, or null when a shape can't be counted (or there are none). */
  total: number | null;
  blocked: string | null;
  shapes: Array<{ id: string; parameter_id: string; qty: number | null; counted: boolean }>;
  /** Shapes of another kind than the first — kept on the section, not added. */
  skipped: number;
  /** The groups' depth when every counted shape's group has the same one. */
  depth_in: number | null;
}

const round = (n: number, unit: string) => (unit === "EA" ? Math.round(n) : Math.round(n * 100) / 100);

/** What a section's shapes add up to. */
export function sectionTakeoff(sectionId: string, shapes: ShapeIn[], params: ParameterIn[], sheets: Record<string, SheetScale>): SectionTakeoff {
  const byId = new Map(params.map((p) => [p.id, p]));
  const mine = shapes.filter((m) => m.section_id === sectionId && byId.has(m.parameter_id));
  if (!mine.length) return { unit: null, total: null, blocked: null, shapes: [], skipped: 0, depth_in: null };
  const kind: TakeoffKind = byId.get(mine[0].parameter_id)!.kind;
  const unit = KIND_UNIT[kind];
  let total = 0, blocked: string | null = null, skipped = 0;
  const depths = new Set<number | null>();
  const out = mine.map((m) => {
    const p = byId.get(m.parameter_id)!;
    if (p.kind !== kind) { skipped++; return { id: m.id, parameter_id: m.parameter_id, qty: null, counted: false }; }
    const q = measurementQty(p.kind, m, sheets[m.sheet_id]);
    depths.add(p.kind === "area" && p.depth_in && p.depth_in > 0 ? p.depth_in : null);
    if (!q.ok) { blocked = blocked ?? q.reason; return { id: m.id, parameter_id: m.parameter_id, qty: null, counted: true }; }
    total += q.qty;
    return { id: m.id, parameter_id: m.parameter_id, qty: q.qty, counted: true };
  });
  const [d] = [...depths];
  return { unit, total: blocked ? null : round(total, unit), blocked, shapes: out, skipped, depth_in: depths.size === 1 ? d ?? null : null };
}

/**
 * The size fields to write on a following section, or null when nothing
 * changes. `touched` sections lost or gained shapes in this edit: one left
 * with none has its size cleared (its cost items stay).
 */
export function sectionPatch(s: SectionLink, t: SectionTakeoff, touched: boolean): Record<string, number | string | null> | null {
  if (!s.takeoff_sync) return null;
  let want: Record<string, number | string | null>;
  if (!t.unit) {
    if (!touched) return null;
    want = { sqft_override: null, count_qty: null, count_unit: null };
  } else if (t.unit === "SF") {
    // The groups' depth fills a blank thickness; one typed on the section is Coy's and stays.
    want = { sqft_override: t.total, count_qty: null, count_unit: null, length_ft: null, width_ft: null, ...(t.depth_in !== null && s.depth_in === null ? { depth_in: t.depth_in } : {}) };
  } else if (t.unit === "LF") {
    want = { count_qty: t.total, count_unit: "LF", sqft_override: null, length_ft: null };
  } else {
    want = { count_qty: t.total, count_unit: "EA", sqft_override: null, length_ft: null, width_ft: null };
  }
  const cur = s as unknown as Record<string, unknown>;
  const same = (a: unknown, b: unknown) => (a === null || a === undefined ? b === null || b === undefined : typeof a === "number" || typeof b === "number" ? Math.abs(Number(a) - Number(b)) < 0.005 : a === b);
  return Object.entries(want).every(([k, v]) => same(cur[k], v)) ? null : want;
}

/** A first guess at the kind of area from a takeoff group's name — Coy changes it. */
export function workTypeFor(name: string, kind: TakeoffKind): string {
  const n = name.toLowerCase();
  if (/drive|apron/.test(n)) return "driveway";
  if (/patio|porch/.test(n)) return "patio";
  if (/side ?walk|walk/.test(n)) return "sidewalk";
  if (/footing|pier|grade beam|foundation/.test(n)) return "footing";
  if (/curb|gutter/.test(n)) return "curb";
  if (/demo|tear|remov|break ?out/.test(n)) return "demo";
  if (/slab|pad|floor|sog/.test(n)) return "slab";
  return kind === "linear" ? "curb" : kind === "area" ? "slab" : "other";
}
