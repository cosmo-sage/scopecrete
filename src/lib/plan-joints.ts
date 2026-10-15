/**
 * Find joints — Dusty measures control joints off a vector plan (Coy, 2026-10-15: "any way to
 * enable dusty to measure control joint cutting on a parking lot?").
 *
 * No model looks at the drawing: the joints are read from the PDF's own lines, so a joint is
 * exactly where the engineer drew it.
 *  1. Which lines are control joints. A CAD set usually keeps its CAD layers in the PDF
 *     (C-PRKG-JNTS-CONTROL on HPC's C3.0), and a layer whose name says control joint is used
 *     outright. With no such layer, the legend's own sample is the key: the strokes drawn just
 *     left of the "CONTROL JOINT" label give a line width, a colour and a dash length, and every
 *     stroke on the sheet drawn that way is a candidate.
 *  2. A dashed line comes out of CAD as hundreds of separate dashes. Dashes on one straight line
 *     with small gaps between them are joined into one run, gaps included (a saw cut is
 *     continuous), and a run is one linear takeoff.
 *  3. The legend's own sample is left out, and each run is cut where it crosses from one zone
 *     (an area takeoff with a thickness) into another, so the LF splits by 5" / 6" / 7".
 * Everything here is a draft — Dusty's estimate — until Coy keeps it. Pure functions, tested in
 * tests/plan-joints.test.mjs; src/lib/pdf.ts hands them the page's operator list.
 */
import { pointInPolygon, type Pt } from "./takeoff.ts";

export type Seg = [Pt, Pt];
export interface Stroke { layer: string | null; lw: number; color: string; segs: Seg[] }
export interface TextBox { str: string; x: number; y: number; w: number; h: number }

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: number[]): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * The stroked lines of a page from pdf.js's operator list, in the page's viewport points (y down,
 * rotation applied — `base` is the viewport's transform at scale 1). Curves are kept as their
 * end points; fills are left out. `ops` is pdf.js's OPS table, `layers` its optional-content
 * names by id.
 */
export function strokesFromOps(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: Record<string, number>, base: number[], layers: Record<string, string>): Stroke[] {
  let st = { m: [...base] as Mat, lw: 1, color: "#000000" };
  const stack: typeof st[] = [];
  const mc: Array<string | null> = [];
  const out: Stroke[] = [];
  const strokeOps = new Set([ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i] as unknown[];
    if (fn === ops.save) stack.push({ ...st, m: [...st.m] as Mat });
    else if (fn === ops.restore) st = stack.pop() ?? st;
    else if (fn === ops.paintFormXObjectBegin) { stack.push({ ...st, m: [...st.m] as Mat }); if (Array.isArray(a?.[0])) st.m = mul(st.m, a[0] as number[]); }
    else if (fn === ops.paintFormXObjectEnd) st = stack.pop() ?? st;
    else if (fn === ops.transform) st.m = mul(st.m, a as number[]);
    else if (fn === ops.setLineWidth) st.lw = Number(a[0]) || 0;
    else if (fn === ops.setStrokeRGBColor) st.color = typeof a[0] === "string" ? a[0] : "#000000";
    else if (fn === ops.setGState) {
      for (const kv of (a?.[0] as Array<[string, unknown]>) ?? []) if (kv?.[0] === "LW") st.lw = Number(kv[1]) || 0;
    }
    else if (fn === ops.beginMarkedContentProps) {
      const p = a?.[1] as { id?: string } | undefined;
      mc.push(a?.[0] === "OC" && p?.id ? layers[p.id] ?? null : null);
    }
    else if (fn === ops.beginMarkedContent) mc.push(null);
    else if (fn === ops.endMarkedContent) mc.pop();
    else if (fn === ops.constructPath) {
      const op = a[0] as number;
      const data = (a[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | undefined;
      if (!strokeOps.has(op) || !data) continue;
      const m = st.m;
      const tp = (x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
      const segs: Seg[] = [];
      let start: Pt | null = null, cur: Pt | null = null;
      for (let j = 0; j < data.length;) {
        const c = data[j++];
        if (c === 0) { cur = start = tp(data[j++], data[j++]); }
        else if (c === 1) { const p = tp(data[j++], data[j++]); if (cur) segs.push([cur, p]); cur = p; }
        else if (c === 2) { j += 4; const p = tp(data[j++], data[j++]); if (cur) segs.push([cur, p]); cur = p; }
        else if (c === 3) { j += 2; const p = tp(data[j++], data[j++]); if (cur) segs.push([cur, p]); cur = p; }
        else if (c === 4) { if (cur && start) segs.push([cur, start]); cur = start; }
        else break;
      }
      if (!segs.length) continue;
      let layer: string | null = null;
      for (let k = mc.length - 1; k >= 0; k--) if (mc[k]) { layer = mc[k]; break; }
      out.push({ layer, lw: st.lw * Math.hypot(m[0], m[1]), color: st.color, segs });
    }
  }
  return out;
}

const JOINT = /(^|[^a-z])(jo?i?n?ts?|jnts?|joints?)([^a-z]|$)/i;
const CONTROL = /(control|cntrl|ctrl|contraction|sawcut|saw[\s_-]?cut|(^|[^a-z])cj([^a-z]|$))/i;
const OTHER = /(exp|isol|constr|const|keyed|tied|dowel|thick|hatch|txt|text|anno|labl|label)/i;

/** The CAD layer that holds control joints, by its name: C-PRKG-JNTS-CONTROL, CONC-JOINT-CTRL,
 *  SAWCUT … Never an expansion, isolation or construction joint layer, nor a label layer. */
export function controlLayer(names: Iterable<string>): string | null {
  const hits: string[] = [];
  for (const n of names) {
    const leaf = n.split("|").pop() ?? n;
    if (OTHER.test(leaf)) continue;
    if (CONTROL.test(leaf) && (JOINT.test(leaf) || /sawcut|saw[\s_-]?cut|(^|[^a-z])cj([^a-z]|$)/i.test(leaf))) hits.push(n);
  }
  return hits.sort((a, b) => a.length - b.length)[0] ?? null;
}

const segLen = (s: Seg) => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);

/** The legend's "CONTROL JOINT" label — its line, not a note that mentions control joints. */
export function controlLabel(text: TextBox[]): TextBox | null {
  const lab = text.filter((t) => /^\s*control\s+joints?\s*(\(.*\))?\s*$/i.test(t.str));
  return lab.sort((a, b) => a.str.length - b.str.length)[0] ?? null;
}

/**
 * The legend box to leave out: the column of labels the control joint label sits in (its
 * neighbours lined up within a few points), and the samples drawn to their left.
 */
export function legendBox(label: TextBox, text: TextBox[]): { x0: number; y0: number; x1: number; y1: number } {
  const col = text.filter((t) => Math.abs(t.x - label.x) < 12 && Math.abs(t.y - label.y) < 600);
  // Only the stretch of labels around this one with no big gap: a notes block below isn't legend.
  col.sort((a, b) => a.y - b.y);
  let i = col.indexOf(label);
  let y0 = label.y, y1 = label.y + label.h;
  for (let k = i - 1; k >= 0 && y0 - (col[k].y + col[k].h) < 40; k--) y0 = col[k].y;
  for (i = col.indexOf(label), y1 = label.y + label.h; i + 1 < col.length && col[i + 1].y - y1 < 40; i++) y1 = col[i + 1].y + col[i + 1].h;
  return { x0: label.x - 330, y0: y0 - 14, x1: label.x - 1, y1: y1 + 14 };
}

/**
 * With no layer to go by: the style of the legend's control joint sample — the strokes left of
 * the label on its line — as a line width, a colour and a typical dash length.
 */
export function sampleStyle(strokes: Stroke[], label: TextBox): { lw: number; color: string; dash: number } | null {
  const cy = label.y + label.h / 2;
  const hit: Array<{ s: Stroke; seg: Seg }> = [];
  for (const s of strokes) for (const seg of s.segs) {
    const mx = (seg[0][0] + seg[1][0]) / 2, my = (seg[0][1] + seg[1][1]) / 2;
    if (mx < label.x - 2 && mx > label.x - 260 && Math.abs(my - cy) < Math.max(5, label.h * 0.8) && Math.abs(seg[0][1] - seg[1][1]) < 1.5 && segLen(seg) > 0.5) hit.push({ s, seg });
  }
  if (hit.length < 3) return null; // one solid line is an expansion joint or a border, not a dashed sample
  const key = (s: Stroke) => `${s.lw.toFixed(2)} ${s.color}`;
  const tally = new Map<string, number>();
  for (const h of hit) tally.set(key(h.s), (tally.get(key(h.s)) ?? 0) + 1);
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const mine = hit.filter((h) => key(h.s) === best);
  const lens = mine.map((h) => segLen(h.seg)).sort((a, b) => a - b);
  return { lw: mine[0].s.lw, color: mine[0].s.color, dash: lens[Math.floor(lens.length / 2)] };
}

/** The control joint segments of a page: the layer's, else those drawn like the legend's sample. */
export function jointSegments(strokes: Stroke[], text: TextBox[], layerNames: string[]): { segs: Seg[]; how: "layer" | "legend"; layer: string | null } | { segs: null; reason: string } {
  const layer = controlLayer(layerNames);
  if (layer && strokes.some((s) => s.layer === layer)) {
    return { segs: strokes.filter((s) => s.layer === layer).flatMap((s) => s.segs).filter((g) => segLen(g) > 0.5), how: "layer", layer };
  }
  const label = controlLabel(text);
  if (!label) return { segs: null, reason: "This sheet has no control joint layer and no CONTROL JOINT line in a legend to follow." };
  const st = sampleStyle(strokes, label);
  if (!st) return { segs: null, reason: "Couldn't find the legend's control joint sample line beside its label." };
  const segs = strokes.filter((s) => Math.abs(s.lw - st.lw) < 0.06 && s.color === st.color).flatMap((s) => s.segs)
    .filter((g) => { const l = segLen(g); return l >= st.dash * 0.8 && l <= st.dash * 4; });
  // The plan may draw the pattern at a bigger linetype scale than the legend (HPC: 9 pt dashes in
  // the legend, 18 on the plan), so a dash may be longer than the sample's, never much shorter.
  return { segs, how: "legend", layer: null };
}

export interface Run { a: Pt; b: Pt; dashes: number }

/**
 * Join dashes into runs: segments on one straight line (within a degree and a point and a half)
 * whose ends are within `gap` points of each other are one run, from the first dash's start to
 * the last one's end.
 */
export function joinRuns(segs: Seg[], gap = 14): Run[] {
  const n = segs.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ang = segs.map((s) => { let t = Math.atan2(s[1][1] - s[0][1], s[1][0] - s[0][0]); if (t < 0) t += Math.PI; if (t >= Math.PI - 1e-9) t -= Math.PI; return t; });
  const cell = Math.max(gap, 4);
  const grid = new Map<string, number[]>();
  const put = (p: Pt, i: number) => { const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`; const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); };
  segs.forEach((s, i) => { put(s[0], i); put(s[1], i); });
  const off = (p: Pt, s: Seg, t: number) => -Math.sin(t) * (p[0] - s[0][0]) + Math.cos(t) * (p[1] - s[0][1]);
  const along = (p: Pt, s: Seg, t: number) => Math.cos(t) * (p[0] - s[0][0]) + Math.sin(t) * (p[1] - s[0][1]);
  for (let i = 0; i < n; i++) {
    const s = segs[i], t = ang[i];
    // The dash's own span along the line (its far end may lie behind its start).
    const e = along(s[1], s, t), s0 = Math.min(0, e), s1 = Math.max(0, e);
    for (const p of s) {
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (j <= i || find(i) === find(j)) continue;
          let d = Math.abs(ang[j] - t); d = Math.min(d, Math.PI - d);
          if (d > 0.026) continue; // 1.5°
          const o = segs[j];
          if (Math.abs(off(o[0], s, t)) > 1.5 || Math.abs(off(o[1], s, t)) > 1.5) continue;
          const u0 = along(o[0], s, t), u1 = along(o[1], s, t);
          const lo = Math.min(u0, u1), hi = Math.max(u0, u1);
          const between = lo > s1 ? lo - s1 : hi < s0 ? s0 - hi : 0;
          if (between <= gap) parent[find(j)] = find(i);
        }
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find(i); const g = groups.get(r); if (g) g.push(i); else groups.set(r, [i]); }
  const runs: Run[] = [];
  for (const idx of groups.values()) {
    // Direction of the longest dash; every end projected onto it.
    const lead = idx.reduce((a, b) => (segLen(segs[b]) > segLen(segs[a]) ? b : a));
    const s = segs[lead], t = ang[lead];
    const ux = Math.cos(t), uy = Math.sin(t);
    let lo = Infinity, hi = -Infinity, o = 0, k = 0;
    for (const i of idx) for (const p of segs[i]) {
      const u = ux * (p[0] - s[0][0]) + uy * (p[1] - s[0][1]);
      lo = Math.min(lo, u); hi = Math.max(hi, u);
      o += -uy * (p[0] - s[0][0]) + ux * (p[1] - s[0][1]); k++;
    }
    o /= k;
    const base: Pt = [s[0][0] - uy * o, s[0][1] + ux * o];
    runs.push({ a: [base[0] + ux * lo, base[1] + uy * lo], b: [base[0] + ux * hi, base[1] + uy * hi], dashes: idx.length });
  }
  return runs;
}

export interface Zone { key: string; label: string; poly: Pt[]; holes: Pt[][] }
export interface Piece { a: Pt; b: Pt; zone: string | null }

const inZone = (p: Pt, z: Zone) => pointInPolygon(p, z.poly) && !z.holes.some((h) => h.length >= 3 && pointInPolygon(p, h));

/**
 * Cut runs where they pass from one zone into another (and drop the legend's sample, and
 * anything shorter than `minLen` points). A stretch in no zone keeps zone null. The cut points
 * are found by stepping along the run every `step` points.
 */
export function splitByZone(runs: Run[], zones: Zone[], opts: { skip?: { x0: number; y0: number; x1: number; y1: number } | null; minLen?: number; step?: number } = {}): Piece[] {
  const { skip = null, minLen = 3, step = 1.5 } = opts;
  const out: Piece[] = [];
  const zoneAt = (p: Pt) => zones.find((z) => inZone(p, z))?.key ?? null;
  for (const r of runs) {
    const mid: Pt = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
    if (skip && mid[0] >= skip.x0 && mid[0] <= skip.x1 && mid[1] >= skip.y0 && mid[1] <= skip.y1) continue;
    const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
    if (L < minLen) continue;
    const n = Math.max(1, Math.ceil(L / step));
    const at = (k: number): Pt => [r.a[0] + ((r.b[0] - r.a[0]) * k) / n, r.a[1] + ((r.b[1] - r.a[1]) * k) / n];
    // Each step's zone is read at its middle; a change of zone starts a new piece.
    let from = 0, cur = zones.length ? zoneAt(at(0.5)) : null;
    for (let k = 1; k <= n; k++) {
      const z = k < n && zones.length ? zoneAt(at(k + 0.5)) : cur;
      if (k === n || z !== cur) {
        const a = at(from), b = at(k);
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= Math.min(minLen, L)) out.push({ a, b, zone: cur });
        from = k; cur = z;
      }
    }
  }
  return out;
}

/** A zone's name from its group: `5" Light duty concrete pavement` reads `5"`. */
export function zoneLabel(name: string, depth: number | null): string {
  if (depth) return `${Math.round(depth * 100) / 100}"`;
  const m = name.match(/(\d+(\.\d+)?)\s*("|in\b|inch)/i);
  return m ? `${m[1]}"` : name.slice(0, 30);
}

/** The group the joints go in: the job's linear group named for control joints or saw cutting. */
export function jointGroup<G extends { id: string; name: string; kind: string }>(groups: G[]): G | null {
  const lin = groups.filter((g) => g.kind === "linear");
  return lin.find((g) => /control\s*joint/i.test(g.name)) ?? lin.find((g) => /saw\s*cut|sawcut|concrete\s*cutting/i.test(g.name)) ?? null;
}

export type JointsRead =
  | { ok: true; how: "layer" | "legend"; layer: string | null; pieces: Piece[] }
  | { ok: false; reason: string };

/** The whole read for one page: which lines, joined into runs, the legend left out, cut by zone. */
export function findJoints(strokes: Stroke[], text: TextBox[], layerNames: string[], zones: Zone[]): JointsRead {
  const js = jointSegments(strokes, text, layerNames);
  if (!js.segs) return { ok: false, reason: js.reason };
  // Read off the legend's style, a lone dash is as likely a stray line drawn the same way.
  const runs = joinRuns(js.segs).filter((r) => js.how === "layer" || r.dashes >= 2);
  const label = controlLabel(text);
  const pieces = splitByZone(runs, zones, { skip: label ? legendBox(label, text) : null });
  if (!pieces.length) return { ok: false, reason: js.how === "layer" ? `The ${js.layer} layer has no joints on the drawing.` : "Nothing on the drawing is drawn like the legend's control joint." };
  return { ok: true, how: js.how, layer: js.layer, pieces };
}
