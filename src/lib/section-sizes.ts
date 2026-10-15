/**
 * Size rows (migration 111, Coy 2026-10-15: "Build size rows"). One section
 * can hold several sizes that add up — typed, plus the section's takeoffs when
 * it follows them — each with its own thickness. The rows' total is written
 * onto the section's own size fields, so the engine, the budget, Dusty and the
 * proposal read the section exactly as before.
 *
 * A section counts one kind: area (L × W or an area, in SF), linear (LF, with
 * a width and depth in inches for a pour) or count (EA or a unit). A row of
 * another kind is kept but not added, and said so.
 */

export type SizeMode = "dims" | "area" | "linear" | "count";
export const SIZE_MODES: SizeMode[] = ["dims", "area", "linear", "count"];

export interface SizeRow {
  id?: string;
  label?: string | null;
  mode: SizeMode;
  length_ft?: number | null;
  width_ft?: number | null;
  sqft?: number | null;
  qty?: number | null;      // LF for linear, the count for count
  unit?: string | null;     // count only
  width_in?: number | null; // linear only
  depth_in?: number | null;
}

/** The section's takeoffs, as one more row (from takeoff-sections' sum). */
export interface TakeoffPart { unit: "SF" | "LF" | "EA" | null; total: number | null; depth_in: number | null }

export type SizeKind = "SF" | "LF" | "EA";
export const kindOf = (m: SizeMode): SizeKind => (m === "linear" ? "LF" : m === "count" ? "EA" : "SF");

export interface RowQty { qty: number | null; cy: number | null; counted: boolean; why: string | null }
export interface SizeTotals {
  kind: SizeKind | null;
  total: number | null;
  /** Yards of concrete, when every counted row has its thickness (and LF rows their width). */
  cy: number | null;
  /** The one thickness that gives those yards over the whole total. */
  depth_in: number | null;
  /** LF only: the one width (ft) that gives the plan area. */
  width_ft: number | null;
  unit: string | null;
  rows: RowQty[];
  takeoff: RowQty | null;
  notes: string[];
}

const pos = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** One row's own quantity and yards. */
export function rowQty(r: SizeRow): RowQty {
  const d = pos(r.depth_in);
  if (r.mode === "dims") {
    const l = pos(r.length_ft), w = pos(r.width_ft);
    if (!l || !w) return { qty: null, cy: null, counted: true, why: "needs length and width" };
    const sf = l * w;
    return { qty: r2(sf), cy: d ? (sf * d) / 324 : null, counted: true, why: null };
  }
  if (r.mode === "area") {
    const sf = pos(r.sqft);
    if (!sf) return { qty: null, cy: null, counted: true, why: "needs its area" };
    return { qty: r2(sf), cy: d ? (sf * d) / 324 : null, counted: true, why: null };
  }
  if (r.mode === "linear") {
    const lf = pos(r.qty), w = pos(r.width_in);
    if (!lf) return { qty: null, cy: null, counted: true, why: "needs its length" };
    return { qty: r2(lf), cy: w && d ? (lf * (w / 12) * (d / 12)) / 27 : null, counted: true, why: null };
  }
  const n = pos(r.qty);
  return n ? { qty: n, cy: null, counted: true, why: null } : { qty: null, cy: null, counted: true, why: "needs how many" };
}

/** What the rows (and the takeoffs) add up to. The first row's kind is the section's. */
export function sizeTotals(rows: SizeRow[], takeoff: TakeoffPart | null = null): SizeTotals {
  const tk: SizeKind | null = takeoff?.unit && takeoff.total ? takeoff.unit : null;
  const kind: SizeKind | null = rows.length ? kindOf(rows[0].mode) : tk;
  const notes: string[] = [];
  let total = 0, any = false, cy = 0, cyAll = true, planSf = 0;
  const unit: string | null = kind === "EA" ? (rows.find((r) => r.mode === "count")?.unit?.trim().toUpperCase() || "EA") : kind;
  const out = rows.map((r) => {
    const q = rowQty(r);
    if (kindOf(r.mode) !== kind) { notes.push(`${r.label || "A row"} is measured another way and isn't added`); return { ...q, counted: false }; }
    if (q.qty === null) { cyAll = false; return q; }
    if (kind === "EA" && (r.unit?.trim().toUpperCase() || "EA") !== unit) { notes.push(`${r.label || "A row"} counts ${r.unit} — not added to ${unit}`); return { ...q, counted: false }; }
    total += q.qty; any = true;
    if (q.cy === null) cyAll = false; else cy += q.cy;
    if (kind === "LF") planSf += q.qty * ((pos(r.width_in) ?? 0) / 12);
    return q;
  });
  let tq: RowQty | null = null;
  if (takeoff && tk) {
    if (tk !== kind) { tq = { qty: takeoff.total, cy: null, counted: false, why: "measured another way" }; notes.push("The takeoffs are measured another way and aren't added"); }
    else {
      const d = pos(takeoff.depth_in);
      const c = kind === "SF" && d ? (takeoff.total! * d) / 324 : null;
      tq = { qty: takeoff.total, cy: c, counted: true, why: null };
      total += takeoff.total!; any = true;
      if (c === null) cyAll = false; else cy += c;
      if (kind === "LF") cyAll = false; // a takeoff line has no width
    }
  }
  if (!kind || !any) return { kind, total: null, cy: null, depth_in: null, width_ft: null, unit, rows: out, takeoff: tq, notes };
  total = kind === "EA" ? Math.round(total * 100) / 100 : r2(total);
  if (kind === "EA") return { kind, total, cy: null, depth_in: null, width_ft: null, unit, rows: out, takeoff: tq, notes };
  const yards = cyAll && cy > 0 ? Math.round(cy * 100) / 100 : null;
  if (kind === "SF") {
    return { kind, total, cy: yards, depth_in: yards ? Math.round(((cy * 324) / total) * 100) / 100 : null, width_ft: null, unit, rows: out, takeoff: tq, notes };
  }
  const width = planSf > 0 && cyAll ? planSf / total : null;
  return {
    kind, total, cy: yards, unit, rows: out, takeoff: tq, notes,
    width_ft: width ? Math.round(width * 10000) / 10000 : null,
    depth_in: yards && planSf > 0 ? Math.round(((cy * 27 * 12) / planSf) * 100) / 100 : null,
  };
}

/** The section fields to write from the totals (null = the section is left as it is). */
export function sizePatch(t: SizeTotals): Record<string, number | string | null> | null {
  if (!t.kind) return null;
  if (t.kind === "SF") return { sqft_override: t.total, length_ft: null, width_ft: null, count_qty: null, count_unit: null, depth_in: t.depth_in };
  if (t.kind === "LF") return { count_qty: t.total, count_unit: "LF", sqft_override: null, length_ft: null, width_ft: t.width_ft, depth_in: t.depth_in };
  return { count_qty: t.total, count_unit: t.unit, sqft_override: null, length_ft: null, width_ft: null };
}

/** Read and check one row from a request body. */
export function readSizeRow(b: Record<string, unknown>): { ok: true; row: SizeRow } | { ok: false; error: string } {
  const mode = b.mode as SizeMode;
  if (!SIZE_MODES.includes(mode)) return { ok: false, error: "mode must be dims, area, linear or count." };
  const row: SizeRow = { mode };
  for (const f of ["length_ft", "width_ft", "sqft", "qty", "width_in", "depth_in"] as const) {
    if (!(f in b) || b[f] === null || b[f] === "") { row[f] = null; continue; }
    const n = pos(b[f]);
    if (!n || n > 1000000) return { ok: false, error: `${f} must be a positive number, or blank.` };
    row[f] = n;
  }
  if (row.depth_in && row.depth_in > 240) return { ok: false, error: "depth_in is in inches — 240 at most." };
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 60) : null;
  row.label = label || null;
  const unit = typeof b.unit === "string" ? b.unit.trim().toUpperCase().slice(0, 12) : null;
  row.unit = mode === "count" ? unit || "EA" : null;
  return { ok: true, row };
}
