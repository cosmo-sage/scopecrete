// Click-to-fill: an area's outline traced off the drawing — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { traceFill, outline, simplify, dilate, flood } from "../src/lib/plan-fill.ts";

// A white sheet with black strokes drawn on it.
function sheet(w, h) {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  const dot = (x, y, v = 0) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; };
  const line = (x0, y0, x1, y1, t = 2, v = 0) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) dot(x + a, y + b, v);
    }
  };
  const rect = (x0, y0, x1, y1, t) => { line(x0, y0, x1, y0, t); line(x1, y0, x1, y1, t); line(x1, y1, x0, y1, t); line(x0, y1, x0, y0, t); };
  return { d, dot, line, rect, w, h };
}
const OPT = { gap: 1, thin: 0, tol: 1.5 };
const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const bbox = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];

test("a rectangle is traced to its four corners, on its line", () => {
  const s = sheet(200, 160);
  s.rect(40, 30, 160, 120, 2);
  const f = traceFill(s.d, s.w, s.h, 100, 70, OPT);
  assert.equal(f.ok, true);
  assert.equal(f.pts.length, 4);
  const [x0, y0, x1, y1] = bbox(f.pts);
  // Inside of the line is 42..160 by 32..120; grown back by gap+1 it sits within a pixel of the line.
  assert.ok(Math.abs(x0 - 40) <= 1 && Math.abs(y0 - 30) <= 1 && Math.abs(x1 - 162) <= 1 && Math.abs(y1 - 122) <= 1, JSON.stringify(f.pts));
});

test("text and dots inside are ignored — only the outer edge counts", () => {
  const s = sheet(200, 160);
  s.rect(40, 30, 160, 120, 2);
  for (let x = 60; x < 140; x += 9) for (let y = 50; y < 100; y += 11) s.dot(x, y);
  s.line(80, 70, 110, 70, 3); // a word
  const f = traceFill(s.d, s.w, s.h, 50, 40, OPT);
  assert.equal(f.ok, true);
  assert.equal(f.pts.length, 4);
});

test("an L-shaped slab keeps its six corners", () => {
  const s = sheet(240, 200);
  const P = [[20, 20], [200, 20], [200, 80], [100, 80], [100, 180], [20, 180]];
  P.forEach((p, i) => { const q = P[(i + 1) % P.length]; s.line(p[0], p[1], q[0], q[1], 2); });
  const f = traceFill(s.d, s.w, s.h, 50, 100, OPT);
  assert.equal(f.ok, true);
  assert.equal(f.pts.length, 6, JSON.stringify(f.pts));
  // Area ≈ 180×60 + 80×100 = 18,800 px.
  assert.ok(Math.abs(area(f.pts) - 18800) < 700, String(area(f.pts)));
});

test("an outline that doesn't close says so; bridging a small gap closes it", () => {
  const s = sheet(200, 160);
  s.line(40, 30, 160, 30); s.line(160, 30, 160, 120); s.line(160, 120, 40, 120);
  s.line(40, 120, 40, 78); s.line(40, 72, 40, 30); // a 4 px break on the left
  assert.deepEqual(traceFill(s.d, s.w, s.h, 100, 70, OPT), { ok: false, reason: "open" });
  const f = traceFill(s.d, s.w, s.h, 100, 70, { ...OPT, gap: 3 });
  assert.equal(f.ok, true);
});

test("thin lines across the area (a dimension, hatching) can be skipped", () => {
  const s = sheet(200, 160);
  s.rect(40, 30, 160, 120, 4); // a heavy outline
  s.line(40, 75, 160, 75, 1); // a hairline dimension across it
  const split = traceFill(s.d, s.w, s.h, 100, 50, OPT);
  assert.equal(split.ok, true);
  assert.ok(area(split.pts) < 6000, "without skipping, only the top half is filled");
  const whole = traceFill(s.d, s.w, s.h, 100, 50, { ...OPT, thin: 1 });
  assert.equal(whole.ok, true);
  assert.ok(area(whole.pts) > 10000, String(area(whole.pts)));
});

test("a grey shaded area is paper, not ink", () => {
  const s = sheet(200, 160);
  for (let y = 32; y < 120; y++) for (let x = 42; x < 160; x++) s.dot(x, y, 205);
  s.rect(40, 30, 160, 120, 2);
  const f = traceFill(s.d, s.w, s.h, 100, 70, OPT);
  assert.equal(f.ok, true);
  assert.equal(f.pts.length, 4);
});

test("a click on the line finds the paper beside it", () => {
  const s = sheet(200, 160);
  s.rect(40, 30, 160, 120, 2);
  const f = traceFill(s.d, s.w, s.h, 41, 70, OPT);
  assert.equal(f.ok, true);
});

test("outline walks the edge of pixels and simplify keeps corners", () => {
  const w = 6, h = 5, r = new Uint8Array(w * h);
  for (let y = 1; y < 4; y++) for (let x = 1; x < 5; x++) r[y * w + x] = 1;
  assert.deepEqual(outline(r, w, h), [[1, 1], [5, 1], [5, 4], [1, 4]]);
  const noisy = [[0, 0], [5, 0.4], [10, 0], [10, 10], [5, 10.3], [0, 10]];
  assert.equal(simplify(noisy, 1).length, 4);
});

test("dilate grows by r; flood stops at ink and notices the edge", () => {
  const w = 9, m = new Uint8Array(81); m[4 * 9 + 4] = 1;
  assert.equal(dilate(m, w, 9, 2).reduce((a, b) => a + b, 0), 25);
  const f = flood(new Uint8Array(81), 9, 9, 4, 4);
  assert.equal(f.edge, true);
  assert.equal(f.count, 81);
});
