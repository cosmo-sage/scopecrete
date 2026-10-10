/**
 * Click inside an area and its outline is traced off the drawing (Coy, 2026-10-09: "what
 * would it take … to actually be able to do the takeoffs of the areas … on the plan sets?"
 * — step one, click-to-fill). The sheet is drawn by pdf.js around the click; this works on
 * the picture: what is ink, a flood from the click to the ink around it, the outline of what
 * was flooded (text and dots inside are ignored — only the outer edge counts), straightened
 * into corners. A trace is a suggestion: it is shown as a draft Coy keeps, edits or drops.
 * Pure, tested in tests/plan-fill.test.mjs.
 */

export interface FillOptions {
  /** Bridge gaps in the outline up to this many pixels (a dashed or broken line). */
  gap: number;
  /** Ignore lines thinner than this many pixels (hatching, dimension lines). 0 = keep all. */
  thin: number;
  /** Corners closer to a straight line than this many pixels are dropped. */
  tol: number;
  /** Ink pieces that fit in a square this many pixels wide (hatch dots, stipple, letters) are paper. 0 = keep all. */
  speck?: number;
  /** Notches and spikes in the traced edge narrower than twice this many pixels are smoothed off. 0 = none. */
  smooth?: number;
}

export type Fill =
  | { ok: true; pts: Array<[number, number]>; pixels: number }
  | { ok: false; reason: "on_line" | "open" | "too_small" };

const lum = (d: Uint8ClampedArray | Uint8Array, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** What is ink: clearly darker than, or a different colour from, the paper under the click. */
export function inkMask(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, sx: number, sy: number): Uint8Array {
  // The paper's colour: the lightest of the few pixels round the click (a shaded area is paper too).
  let r0 = 0, g0 = 0, b0 = 0, l0 = -1;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.min(w - 1, Math.max(0, sx + dx)), y = Math.min(h - 1, Math.max(0, sy + dy));
    const i = (y * w + x) * 4, l = lum(rgba, i);
    if (l > l0) { l0 = l; r0 = rgba[i]; g0 = rgba[i + 1]; b0 = rgba[i + 2]; }
  }
  const dark = Math.min(l0, 250) - 40;
  const m = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < m.length; p++, i += 4) {
    const a = rgba[i + 3];
    if (a < 8) continue; // transparent = paper
    const off = Math.abs(rgba[i] - r0) + Math.abs(rgba[i + 1] - g0) + Math.abs(rgba[i + 2] - b0);
    if (lum(rgba, i) < dark || off > 150) m[p] = 1;
  }
  return m;
}

/** Grow the set pixels by r in every direction (a square, done row then column). */
export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m;
  const a = new Uint8Array(m.length), b = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    const row = y * w;
    for (let x = 0; x < w; x++) { if (m[row + x]) last = x; if (x - last <= r) a[row + x] = 1; }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (m[row + x]) last = x; if (last - x <= r) a[row + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) { if (a[y * w + x]) last = y; if (y - last <= r) b[y * w + x] = 1; }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (a[y * w + x]) last = y; if (last - y <= r) b[y * w + x] = 1; }
  }
  return b;
}

/** Shrink the set pixels by r (dilating the gaps). */
export function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m;
  const inv = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1;
  const g = dilate(inv, w, h, r);
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = g[i] ? 0 : 1;
  // The picture's own edge isn't ink: keep it from eating in from the border.
  return out;
}

/**
 * Drop the small pieces of ink — stipple and hatch dots, letters, specks — whose whole piece
 * (8-connected) fits in a `side` × `side` square, so they neither wall the flood in nor, once
 * Bridge gaps grows the ink, weld themselves onto the edge line as notches. A line, a dash
 * longer than `side`, or a dot touching a line is part of a bigger piece and stays.
 */
export function dropSpecks(ink: Uint8Array, w: number, h: number, side: number): Uint8Array {
  if (side <= 0) return ink;
  const out = ink.slice();
  const seen = new Uint8Array(ink.length);
  const stack = new Int32Array(ink.length);
  const piece: number[] = [];
  for (let s = 0; s < ink.length; s++) {
    if (!ink[s] || seen[s]) continue;
    let top = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    piece.length = 0;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const p = stack[--top];
      piece.push(p);
      const x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (ink[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; }
      }
    }
    if (x1 - x0 < side && y1 - y0 < side) for (const p of piece) out[p] = 0;
  }
  return out;
}

/** Flood the paper from (sx, sy), 4-connected. Returns the flooded pixels and whether it reached the edge. */
export function flood(ink: Uint8Array, w: number, h: number, sx: number, sy: number): { region: Uint8Array; count: number; edge: boolean } {
  const region = new Uint8Array(w * h);
  const start = sy * w + sx;
  if (ink[start]) return { region, count: 0, edge: false };
  const stack = new Int32Array(w * h);
  let top = 0, count = 0, edge = false;
  stack[top++] = start; region[start] = 1;
  while (top) {
    const p = stack[--top];
    count++;
    const x = p % w, y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
    if (x > 0 && !region[p - 1] && !ink[p - 1]) { region[p - 1] = 1; stack[top++] = p - 1; }
    if (x < w - 1 && !region[p + 1] && !ink[p + 1]) { region[p + 1] = 1; stack[top++] = p + 1; }
    if (y > 0 && !region[p - w] && !ink[p - w]) { region[p - w] = 1; stack[top++] = p - w; }
    if (y < h - 1 && !region[p + w] && !ink[p + w]) { region[p + w] = 1; stack[top++] = p + w; }
  }
  return { region, count, edge };
}

/**
 * The outer boundary of a region as pixel corners, walked clockwise on the pixel grid's edges
 * (so a 10×10 square of pixels is the square 0,0 → 10,10). Holes inside are never visited.
 */
export function outline(region: Uint8Array, w: number, h: number): Array<[number, number]> {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && region[y * w + x] === 1;
  // The top-left pixel of the region: its top edge is on the outer boundary.
  let s = -1;
  for (let i = 0; i < region.length; i++) if (region[i]) { s = i; break; }
  if (s < 0) return [];
  const sx = s % w, sy = (s - sx) / w;
  // Walk vertices with the region on the right. Directions: 0 right, 1 down, 2 left, 3 up.
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  let x = sx, y = sy, d = 0;
  const pts: Array<[number, number]> = [[x, y]];
  const limit = 4 * (w + 1) * (h + 1);
  for (let n = 0; n < limit; n++) {
    // Pixels ahead-left and ahead-right of the vertex (x,y) going in direction d.
    const ahead = (dd: number): [boolean, boolean] => {
      // For an edge leaving (x,y) in direction dd, the pixel on its right and on its left.
      switch (dd) {
        case 0: return [at(x, y), at(x, y - 1)];        // right: below-right is right side, above is left
        case 1: return [at(x - 1, y), at(x, y)];        // down: right side is x-1
        case 2: return [at(x - 1, y - 1), at(x - 1, y)];
        default: return [at(x, y - 1), at(x - 1, y - 1)];
      }
    };
    // Turn right first (hug the pixel we are on, so two pixels touching at a corner aren't
    // joined), then straight, then left.
    let moved = false;
    for (const turn of [1, 0, 3]) {
      const nd = (d + turn) % 4;
      const [right, left] = ahead(nd);
      if (right && !left) { d = nd; moved = true; break; }
    }
    if (!moved) break;
    x += DX[d]; y += DY[d];
    if (x === sx && y === sy) break;
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    // Keep only the corners: a step that continues a straight run replaces the run's end.
    if (prev && (prev[0] === last[0] && last[0] === x || prev[1] === last[1] && last[1] === y)) pts[pts.length - 1] = [x, y];
    else pts.push([x, y]);
  }
  // The last run ends on the start; and the start may sit mid-run.
  const line3 = (a: [number, number], b: [number, number], c: [number, number]) => (a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]);
  if (pts.length > 2 && line3(pts[pts.length - 2], pts[pts.length - 1], pts[0])) pts.pop();
  if (pts.length > 2) {
    const a = pts[pts.length - 1], b = pts[0], c = pts[1];
    if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) pts.shift();
  }
  return pts;
}

const segDist = (p: [number, number], a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  if (!L) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

function dp(pts: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (pts.length < 3) return pts;
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > far) { far = d; at = i; } }
  if (far <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, at + 1), tol).slice(0, -1), ...dp(pts.slice(at), tol)];
}

/** Straighten a closed outline: corners within `tol` of the line through their neighbours go. */
export function simplify(pts: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (pts.length <= 4) return pts;
  // Split at the two points farthest apart so neither half is degenerate.
  let i0 = 0, i1 = 0, best = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > best) { best = d; i1 = i; }
  }
  best = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i1][0], pts[i][1] - pts[i1][1]);
    if (d > best) { best = d; i0 = i; }
  }
  const [a, b] = i0 < i1 ? [i0, i1] : [i1, i0];
  const one = dp(pts.slice(a, b + 1), tol);
  const two = dp([...pts.slice(b), ...pts.slice(0, a + 1)], tol);
  const out = [...one.slice(0, -1), ...two.slice(0, -1)];
  return out.length >= 3 ? out : pts;
}

/** The whole trace: ink → gaps bridged → flood from the click → its outline, in pixels. */
export function traceFill(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, sx: number, sy: number, o: FillOptions): Fill {
  let ink = inkMask(rgba, w, h, sx, sy);
  if (o.speck) ink = dropSpecks(ink, w, h, o.speck);
  // Thin lines go first (an opening: shrink the ink, grow back what's left).
  if (o.thin > 0) ink = dilate(erode(ink, w, h, o.thin), w, h, o.thin);
  const walls = o.gap > 0 ? dilate(ink, w, h, o.gap) : ink;
  let x = sx, y = sy;
  // A click on a line (or in the bridged band beside one) looks a few pixels round for paper.
  if (walls[y * w + x]) {
    let found = false;
    const R = Math.max(4, o.gap + 3);
    for (let r = 1; r <= R && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
      const nx = sx + dx, ny = sy + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !walls[ny * w + nx]) { x = nx; y = ny; found = true; }
    }
    if (!found) return { ok: false, reason: "on_line" };
  }
  const f = flood(walls, w, h, x, y);
  if (f.edge) return { ok: false, reason: "open" };
  if (f.count < 60) return { ok: false, reason: "too_small" };
  // Grow back what bridging took off, so the outline sits on the line, not inside it.
  let region = dilate(f.region, w, h, o.gap + 1);
  // A closing (grow, then shrink back) fills the notches a dot stuck to the edge line, or a
  // tick across it, leaves in the flood, so the outline follows the line itself.
  if (o.smooth) region = erode(dilate(region, w, h, o.smooth), w, h, o.smooth);
  return { ok: true, pts: simplify(outline(region, w, h), o.tol), pixels: f.count };
}
