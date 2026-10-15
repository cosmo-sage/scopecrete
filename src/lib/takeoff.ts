/**
 * Plan Room takeoff maths (migration 059) — pure, tested in
 * tests/takeoff.test.mjs.
 *
 * Coy, 2026-09-30: "scopecrete.ai will be a tool for me to do takeoffs
 * manually." Shapes are drawn on a plan sheet and stored in PDF page points
 * (1/72 inch at 100%, y down, the page as it is shown). A quantity is ALWAYS
 * worked out from the shape × that sheet's scale, never stored, and never
 * from a scale nobody set: a sheet with no scale gives no number.
 *
 *   scale      feet per page point (ft_per_pt)
 *   printed    1/8" = 1'-0"  → 1 inch of paper (72 pt) is 8 ft  → 8/72
 *              1" = 20'      → 20/72;   1:100 → 100/864 (feet, from a metric ratio)
 *   measured   two clicks on a known dimension → its length ÷ the points between
 */

export type Pt = [number, number];
export type TakeoffKind = "area" | "linear" | "count";
export const KIND_UNIT: Record<TakeoffKind, "SF" | "LF" | "EA"> = { area: "SF", linear: "LF", count: "EA" };

export interface SheetScale {
  /** Feet per page point, or null when nobody has set it. */
  ft_per_pt: number | null;
  /** How it was set: read off the title block (and applied by Coy), or measured. */
  method: "title_block" | "manual" | "none" | null;
  /** The sheet as Coy knows it: "C-5". */
  label: string;
}

// --- geometry --------------------------------------------------------------

/** Area of a polygon in square points (shoelace; either winding). */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Length of a polyline in points (open — the last point does not join the first). */
export function polylineLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** Length round a closed polygon in points — the last point joins the first. */
export function polygonPerimeter(pts: Pt[]): number {
  if (pts.length < 2) return 0;
  return polylineLength(pts) + (pts.length > 2 ? dist(pts[pts.length - 1], pts[0]) : 0);
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The four corners of a rectangle drawn corner to corner. */
export function rectPoints(a: Pt, b: Pt): Pt[] {
  return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
}

// --- scale -----------------------------------------------------------------

/** "1/8", "3/16", "1 1/2", "0.25", "1" → inches. */
function inches(s: string): number | null {
  const t = s.trim();
  let m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  m = t.match(/^\d*\.?\d+$/);
  return m ? Number(t) : null;
}

/**
 * A length as Coy would type or a drawing would print it, in feet:
 * 30' · 30'-6" · 30' 6" · 30 ft · 6" · 30.5 (feet) · 1'-0". null when it isn't one.
 */
export function parseFeet(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"');
  if (!t) return null;
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*-?\s*(?:(\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?)\s*(?:"|in|inch|inches))?$/);
  if (m) {
    const ft = Number(m[1]);
    const inch = m[2] ? inches(m[2]) : 0;
    return inch === null ? null : ft + inch / 12;
  }
  m = t.match(/^(\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?)\s*(?:"|in|inch|inches)$/);
  if (m) { const i = inches(m[1]); return i === null ? null : i / 12; }
  m = t.match(/^\d*\.?\d+$/);
  return m ? Number(t) : null;
}

export type PrintedScale =
  | { kind: "scale"; text: string; ft_per_pt: number }
  | { kind: "none"; text: string; reason: string };

/**
 * The scale printed on a sheet — the first one found in `text` — or why there
 * is none (NTS, "as noted"). null when nothing that looks like a scale is there.
 */
export function parsePrintedScale(text: string): PrintedScale | null {
  const t = text.replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"');
  const nts = t.match(/\b(N\.?\s?T\.?\s?S\.?|NOT\s+TO\s+SCALE)\b/i);
  const noted = t.match(/\bSCALE\s*:?\s*(AS\s+(NOTED|SHOWN|INDICATED))\b/i);
  // Architectural: 1/8" = 1'-0"   ·   1 1/2" = 1'-0"   ·   3/32"=1'
  const arch = t.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*"\s*=\s*(\d+(?:\.\d+)?)\s*'\s*(?:-?\s*(\d+(?:\.\d+)?)\s*")?/);
  // Engineering: 1" = 20'   (the arch pattern above catches this too, without inches)
  // Metric ratio: 1:100
  const ratio = t.match(/\b1\s*:\s*(\d{1,5})\b/);
  const found: Array<{ at: number; v: PrintedScale }> = [];
  if (arch && arch.index !== undefined) {
    const paperIn = inches(arch[1]);
    const realFt = Number(arch[2]) + (arch[3] ? Number(arch[3]) / 12 : 0);
    if (paperIn && paperIn > 0 && realFt > 0) found.push({ at: arch.index, v: { kind: "scale", text: arch[0].trim(), ft_per_pt: realFt / (paperIn * 72) } });
  }
  if (ratio && ratio.index !== undefined && Number(ratio[1]) > 1) {
    found.push({ at: ratio.index, v: { kind: "scale", text: ratio[0].trim(), ft_per_pt: Number(ratio[1]) / (72 * 12) } });
  }
  if (nts && nts.index !== undefined) found.push({ at: nts.index, v: { kind: "none", text: nts[0].trim(), reason: "not to scale" } });
  if (noted && noted.index !== undefined) found.push({ at: noted.index, v: { kind: "none", text: noted[1].trim(), reason: "scale varies — as noted on each drawing" } });
  if (!found.length) return null;
  found.sort((a, b) => a.at - b.at);
  return found[0].v;
}

/** Feet per point from two clicks on a known dimension. */
export function scaleFromPoints(a: Pt, b: Pt, realFt: number): number | null {
  const d = dist(a, b);
  return d > 0 && realFt > 0 ? realFt / d : null;
}

/** "1/8\" = 1'-0\"" style label for a scale (for a measured one, the nearest common scale, or "1\" = 12.4'"). */
export function scaleLabel(ftPerPt: number): string {
  const ftPerInch = ftPerPt * 72;
  const arch: Array<[string, number]> = [["1/16\" = 1'-0\"", 16], ["3/32\" = 1'-0\"", 32 / 3], ["1/8\" = 1'-0\"", 8], ["3/16\" = 1'-0\"", 16 / 3],
    ["1/4\" = 1'-0\"", 4], ["3/8\" = 1'-0\"", 8 / 3], ["1/2\" = 1'-0\"", 2], ["3/4\" = 1'-0\"", 4 / 3], ["1\" = 1'-0\"", 1], ["1 1/2\" = 1'-0\"", 2 / 3], ["3\" = 1'-0\"", 1 / 3]];
  for (const [l, v] of arch) if (Math.abs(ftPerInch - v) / v < 0.005) return l;
  for (const e of [10, 20, 30, 40, 50, 60, 100, 200]) if (Math.abs(ftPerInch - e) / e < 0.005) return `1" = ${e}'`;
  return `1" = ${Math.round(ftPerInch * 100) / 100}'`;
}

// --- quantities ------------------------------------------------------------

export interface MeasurementIn {
  id: string;
  parameter_id: string;
  sheet_id: string;
  name: string | null;
  geometry: Pt[];
  cutouts?: Pt[][] | null;
}
export interface ParameterIn { id: string; name: string; kind: TakeoffKind; depth_in: number | null }

export type Qty = { ok: true; qty: number } | { ok: false; reason: string };

/** One shape's quantity in its group's unit. */
export function measurementQty(kind: TakeoffKind, m: Pick<MeasurementIn, "geometry" | "cutouts">, sheet: SheetScale | undefined): Qty {
  if (kind === "count") return { ok: true, qty: m.geometry.length };
  if (!sheet) return { ok: false, reason: "its sheet was removed" };
  if (!sheet.ft_per_pt || sheet.ft_per_pt <= 0) return { ok: false, reason: `sheet ${sheet.label} scale not set` };
  const k = sheet.ft_per_pt;
  // A linear takeoff's cutouts are runs taken back off it (Coy, 2026-10-15).
  if (kind === "linear") return { ok: true, qty: Math.max(0, polylineLength(m.geometry) - (m.cutouts ?? []).reduce((a, c) => a + polylineLength(c), 0)) * k };
  const holes = (m.cutouts ?? []).reduce((a, c) => a + polygonArea(c), 0);
  return { ok: true, qty: Math.max(0, polygonArea(m.geometry) - holes) * k * k };
}

/**
 * The edge of an area shape in feet (Coy, 2026-10-04: "the linear footage
 * around the perimeter of that area"): its outline plus the outline of every
 * cutout, since a hole in a slab is edge to form too. null for a linear or
 * count shape, or when the sheet's scale isn't set.
 */
export function measurementPerimeter(kind: TakeoffKind, m: Pick<MeasurementIn, "geometry" | "cutouts">, sheet: SheetScale | undefined): number | null {
  if (kind !== "area" || !sheet?.ft_per_pt || sheet.ft_per_pt <= 0) return null;
  const pts = polygonPerimeter(m.geometry) + (m.cutouts ?? []).reduce((a, c) => a + polygonPerimeter(c), 0);
  return pts * sheet.ft_per_pt;
}

export interface GroupTotal {
  name: string;
  unit: "SF" | "LF" | "EA";
  /** null when any shape can't be counted — a total that leaves one out would be wrong. */
  qty: number | null;
  cy: number | null;
  /** Area groups: feet of edge round every shape (cutouts included), null otherwise or when blocked. */
  perim_lf: number | null;
  blocked: string | null;
  /** Each shape's own quantity (null + reason when it can't be counted), for the section rows. */
  parts: Array<{ id: string; qty: number | null; perim_lf: number | null; reason: string | null }>;
}

/** Every group's total — the engine's `TakeoffTotal`, plus the shapes behind it. */
export function groupTotals(params: ParameterIn[], ms: MeasurementIn[], sheets: Record<string, SheetScale>): Record<string, GroupTotal> {
  const out: Record<string, GroupTotal> = {};
  for (const p of params) {
    const mine = ms.filter((m) => m.parameter_id === p.id);
    const parts = mine.map((m) => {
      const q = measurementQty(p.kind, m, sheets[m.sheet_id]);
      const perim_lf = measurementPerimeter(p.kind, m, sheets[m.sheet_id]);
      return q.ok ? { id: m.id, qty: q.qty, perim_lf, reason: null } : { id: m.id, qty: null, perim_lf: null, reason: q.reason };
    });
    const bad = parts.find((x) => x.qty === null);
    const unit = KIND_UNIT[p.kind];
    if (!mine.length) { out[p.id] = { name: p.name, unit, qty: null, cy: null, perim_lf: null, blocked: "nothing measured yet", parts }; continue; }
    if (bad) { out[p.id] = { name: p.name, unit, qty: null, cy: null, perim_lf: null, blocked: bad.reason, parts }; continue; }
    const raw = parts.reduce((a, x) => a + (x.qty as number), 0);
    const qty = unit === "EA" ? raw : Math.round(raw * 100) / 100;
    const cy = p.kind === "area" && p.depth_in && p.depth_in > 0 ? raw * (p.depth_in / 12) / 27 : null;
    const perim_lf = p.kind === "area" ? Math.round(parts.reduce((a, x) => a + (x.perim_lf ?? 0), 0) * 100) / 100 : null;
    out[p.id] = { name: p.name, unit, qty, cy, perim_lf, blocked: null, parts };
  }
  return out;
}

/** A readable quantity: "4,824 SF", "312.5 LF", "14 EA". */
export function fmtQty(q: number, unit: string): string {
  const n = unit === "EA" ? Math.round(q) : q >= 100 ? Math.round(q) : Math.round(q * 10) / 10;
  return `${n.toLocaleString("en-US")} ${unit}`;
}

/** Ray casting: is the point inside the closed outline? */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Fill's Cut out (Coy, 2026-10-10: "click inside of curbs to remove the fill"): the area shape a
 * click lands in — the selected one first, else the smallest on that sheet that holds it — and
 * not inside a hole it already has. Null when the click is on no fill.
 */
export function areaShapeAt<M extends { id: string; geometry: Pt[]; cutouts?: Pt[][] | null }>(p: Pt, shapes: M[], selId?: string | null): M | null {
  const holds = (m: M) => m.geometry.length >= 3 && pointInPolygon(p, m.geometry) && !(m.cutouts ?? []).some((c) => c.length >= 3 && pointInPolygon(p, c));
  const sel = selId ? shapes.find((m) => m.id === selId) : undefined;
  if (sel && holds(sel)) return sel;
  let best: M | null = null;
  for (const m of shapes) if (holds(m) && (!best || polygonArea(m.geometry) < polygonArea(best.geometry))) best = m;
  return best;
}

/** A hole is kept only when it sits inside the shape: most of its corners inside the outline. */
export function holeFits(hole: Pt[], shape: Pt[]): boolean {
  if (hole.length < 3 || shape.length < 3) return false;
  const inside = hole.filter((q) => pointInPolygon(q, shape)).length;
  return inside / hole.length >= 0.9 && polygonArea(hole) < polygonArea(shape);
}
