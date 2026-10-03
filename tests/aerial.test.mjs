// Aerial sheet: map maths and the one-page PDF — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { project, unproject, ftPerPt, windowTiles, jpegInfo, aerialPdf, validCenter, WIN_W, WIN_H, TILE } from "../src/lib/aerial.ts";

const near = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("a point projects and comes back", () => {
  for (const [lat, lng] of [[30.4515, -91.1871], [0, 0], [-33.86, 151.21]]) {
    const w = project(lat, lng, 20);
    const back = unproject(w.x, w.y, 20);
    near(back.lat, lat, 1e-9); near(back.lng, lng, 1e-9);
  }
});

test("scale: Baton Rouge at zoom 20 is about 0.42 ft a point, and halves per zoom", () => {
  // 156,543.03392 m · cos(30.4515°) / 2^20 = 0.128698 m = 0.42224 ft
  near(ftPerPt(30.4515, 20), 0.42224, 1e-4);
  near(ftPerPt(30.4515, 21) * 2, ftPerPt(30.4515, 20), 1e-12);
  near(ftPerPt(0, 0), 156543.03392 * 3.280839895, 1e-6);
});

test("the scale agrees with distance on the ground", () => {
  // Two points 1,000 world pixels apart east–west at zoom 20 near the centre latitude.
  const lat = 30.4515, z = 20, a = project(lat, -91.1871, z);
  const b = unproject(a.x + 1000, a.y, z);
  const R = 6378137, dLng = ((b.lng + 91.1871) * Math.PI) / 180;
  const metres = R * dLng * Math.cos((lat * Math.PI) / 180);
  near(1000 * ftPerPt(lat, z), metres * 3.280839895, 0.01);
});

test("the window's tiles cover it exactly once", () => {
  const { tiles } = windowTiles(30.4515, -91.1871, 20);
  const cover = new Uint8Array(WIN_W * WIN_H);
  for (const t of tiles) {
    for (let y = Math.max(0, t.dy); y < Math.min(WIN_H, t.dy + TILE); y++)
      for (let x = Math.max(0, t.dx); x < Math.min(WIN_W, t.dx + TILE); x++) cover[y * WIN_W + x]++;
  }
  assert.ok(cover.every((n) => n === 1));
  assert.ok(tiles.length <= 30);
});

test("centre, zoom and provider limits", () => {
  assert.deepEqual(validCenter("30.45", "-91.18", "20", "esri"), { lat: 30.45, lng: -91.18, z: 20 });
  assert.equal(validCenter(30, -91, 22, "esri"), null);
  assert.deepEqual(validCenter(30, -91, 22, "mapbox"), { lat: 30, lng: -91, z: 22 });
  assert.equal(validCenter(30, -91, 20.5, "esri"), null);
  assert.equal(validCenter(95, -91, 20, "esri"), null);
});

// A real 2×2 baseline JPEG (grey), small enough to inline.
const JPEG = Uint8Array.from(Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==", "base64"));

test("a JPEG's size is read off its frame header; anything else is not a JPEG", () => {
  assert.deepEqual(jpegInfo(JPEG), { w: 2, h: 2, comps: 1 });
  assert.equal(jpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
});

test("the PDF opens, is the window's size, draws every tile and keeps the text", async () => {
  const { tiles } = windowTiles(30.4515, -91.1871, 20);
  const pdf = aerialPdf({
    tiles: [...tiles.map((t) => ({ dx: t.dx, dy: t.dy, jpeg: JPEG })), { dx: 0, dy: 0, jpeg: new Uint8Array([1, 2, 3]) }],
    ftPerPt: ftPerPt(30.4515, 20), attribution: "Imagery (c) Esri", caption: "Aerial - Esri (Raynette's)",
  });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: pdf, isEvalSupported: false, useSystemFonts: false }).promise;
  assert.equal(doc.numPages, 1);
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  assert.equal(vp.width, WIN_W); assert.equal(vp.height, WIN_H);
  const ops = await page.getOperatorList();
  const images = ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject).length;
  assert.equal(images, tiles.length); // the non-JPEG is left out
  const text = (await page.getTextContent()).items.map((i) => i.str).join(" ");
  assert.match(text, /50 ft/); assert.match(text, /Imagery \(c\) Esri/); assert.match(text, /Raynette's/);
  await doc.destroy();
});
