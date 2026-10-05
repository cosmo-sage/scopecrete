/**
 * An aerial of the job site as a Plan Room sheet (Coy, 2026-10-03: "take a
 * screenshot of the address … and measure the driveway area" — "mapbox and esri
 * and Google if possible").
 *
 * Imagery is Web Mercator tiles. At zoom z one 256-px tile pixel covers
 * 156,543.03392 · cos(lat) / 2^z metres, so a sheet laid out one PDF point per
 * tile pixel has a known scale — the map's arithmetic, not a reading. The
 * window is a fixed 1,280 × 1,024 points, drawn as the tiles themselves (each a
 * JPEG XObject), so no image is decoded or re-encoded anywhere.
 *
 * Esri World Imagery and Mapbox Satellite can be kept as a sheet. Google's
 * terms don't allow storing or tracing its imagery, so Google is shown for
 * comparison only and never saved (aerialProviders()).
 */

export type AerialProvider = "esri" | "mapbox" | "google";
export const SAVABLE: AerialProvider[] = ["esri", "mapbox"];

/** The sheet's size in points = 256-tile pixels at its zoom. Over 1,150 pt, so it is a drawing. */
export const WIN_W = 1280;
export const WIN_H = 1024;
export const TILE = 256;
export const MIN_ZOOM = 16;
export const MAX_ZOOM: Record<AerialProvider, number> = { esri: 21, mapbox: 22, google: 21 };

const M_PER_PX_Z0 = 156543.03392;
const FT_PER_M = 3.280839895;

export function clampLat(lat: number) { return Math.max(-85.05112878, Math.min(85.05112878, lat)); }

/** World pixel of a point at zoom z (256-px tiles). */
export function project(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = TILE * 2 ** z;
  const s = Math.sin((clampLat(lat) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export function unproject(x: number, y: number, z: number): { lat: number; lng: number } {
  const n = TILE * 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng };
}

/** Feet per sheet point (one tile pixel) at this latitude and zoom. */
export function ftPerPt(lat: number, z: number): number {
  return ((M_PER_PX_Z0 * Math.cos((clampLat(lat) * Math.PI) / 180)) / 2 ** z) * FT_PER_M;
}

/** The tiles that cover the window centred on (lat, lng), and where each sits on the sheet (top-left, y down). */
export function windowTiles(lat: number, lng: number, z: number, w = WIN_W, h = WIN_H) {
  const c = project(lat, lng, z);
  const left = Math.round(c.x - w / 2), top = Math.round(c.y - h / 2);
  const n = 2 ** z;
  const tiles: Array<{ x: number; y: number; dx: number; dy: number }> = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h - 1) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w - 1) / TILE); tx++) {
      tiles.push({ x: ((tx % n) + n) % n, y: ty, dx: tx * TILE - left, dy: ty * TILE - top });
    }
  }
  return { left, top, tiles };
}

/**
 * A tile's bounding box in Web Mercator metres (EPSG:3857): xmin, ymin, xmax,
 * ymax. Esri's map export draws exactly this box from the best imagery it has,
 * which is how a tile Esri has no photo for at this zoom is filled in.
 */
export function tileBbox(z: number, x: number, y: number): [number, number, number, number] {
  const half = Math.PI * 6378137, size = (2 * half) / 2 ** z;
  const xmin = -half + x * size, ymax = half - y * size;
  return [xmin, ymax - size, xmin + size, ymax];
}

/**
 * Esri's public tiles answer a zoom they have no photo for with a small grey
 * "Map data not yet available" picture rather than an error. Real 256-px photo
 * tiles are tens of KB; the placeholder is a few. A real tile under the line
 * (open water) is only redrawn from the same imagery, so a false alarm costs
 * nothing but one more request.
 */
export const ESRI_PLACEHOLDER_BYTES = 6000;

export interface AddressSuggestion { label: string; lat?: number; lng?: number; key?: string }

/** Mapbox's autocomplete answer → suggestions that carry their own point. */
export function mapboxSuggestions(b: unknown): AddressSuggestion[] {
  const f = (b as { features?: unknown })?.features;
  if (!Array.isArray(f)) return [];
  return f.flatMap((x: { place_name?: unknown; center?: unknown }) => {
    const c = x?.center;
    if (typeof x?.place_name !== "string" || !Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") return [];
    return [{ label: x.place_name, lat: c[1], lng: c[0] }];
  }).slice(0, 6);
}

/** Esri's suggest answer → suggestions to resolve by their magicKey when picked (collections like "Coffee" left out). */
export function esriSuggestions(b: unknown): AddressSuggestion[] {
  const s = (b as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(s)) return [];
  return s.flatMap((x: { text?: unknown; magicKey?: unknown; isCollection?: unknown }) =>
    typeof x?.text === "string" && typeof x?.magicKey === "string" && !x.isCollection ? [{ label: x.text, key: x.magicKey }] : [],
  ).slice(0, 6);
}

export function validCenter(lat: unknown, lng: unknown, z: unknown, p: AerialProvider): { lat: number; lng: number; z: number } | null {
  const a = Number(lat), b = Number(lng), zz = Number(z);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isInteger(zz)) return null;
  if (a < -85 || a > 85 || b < -180 || b > 180 || zz < MIN_ZOOM || zz > MAX_ZOOM[p]) return null;
  return { lat: a, lng: b, z: zz };
}

/** "0.42 ft per point" → a label for the sheet's scale text (≤ 60 characters). */
export function aerialScaleText(p: AerialProvider, lat: number, z: number): string {
  return `Aerial map, zoom ${z}: 1 pt = ${ftPerPt(lat, z).toFixed(3)} ft`;
}

export const ATTRIBUTION: Record<AerialProvider, string> = {
  esri: "Imagery (c) Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  mapbox: "(c) Mapbox (c) Maxar (c) OpenStreetMap",
  google: "Imagery (c) Google",
};
export const PROVIDER_LABEL: Record<AerialProvider, string> = { esri: "Esri", mapbox: "Mapbox", google: "Google" };

/** Width, height and colour components of a JPEG, from its SOF marker. null if it isn't one. */
export function jpegInfo(b: Uint8Array): { w: number; h: number; comps: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const h = (b[i + 5] << 8) | b[i + 6], w = (b[i + 7] << 8) | b[i + 8], comps = b[i + 9];
      return w && h && (comps === 1 || comps === 3) ? { w, h, comps } : null;
    }
    i += 2 + len;
  }
  return null;
}

const enc = new TextEncoder();
const pdfStr = (s: string) => `(${s.replace(/[^\x20-\x7e]/g, "").replace(/([\\()])/g, "\\$1")})`;

/**
 * A one-page PDF of the window: each tile a JPEG drawn at its place, a 50-ft
 * scale bar (from the same arithmetic, so a wrong scale shows), and the
 * provider's attribution. Tiles that aren't JPEG are left out (blank).
 */
export function aerialPdf(opts: {
  tiles: Array<{ dx: number; dy: number; jpeg: Uint8Array }>;
  w?: number; h?: number; ftPerPt: number; attribution: string; caption: string;
}): Uint8Array {
  const W = opts.w ?? WIN_W, H = opts.h ?? WIN_H;
  const objs: Array<Uint8Array[]> = []; // index = object number - 1
  const add = (parts: Array<string | Uint8Array>) => { objs.push(parts.map((p) => (typeof p === "string" ? enc.encode(p) : p))); return objs.length; };

  const images: Array<{ n: number; dx: number; dy: number }> = [];
  // Objects 1–3 are fixed: catalog, pages, page. Font is 4. Images and content follow.
  add(["<< /Type /Catalog /Pages 2 0 R >>"]);
  add(["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  add([""]); // page, filled in below
  add(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]);
  for (const t of opts.tiles) {
    const info = jpegInfo(t.jpeg);
    if (!info) continue;
    const n = add([
      `<< /Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace /${info.comps === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${t.jpeg.length} >>\nstream\n`,
      t.jpeg, "\nendstream",
    ]);
    images.push({ n, dx: t.dx, dy: t.dy });
  }

  const ops: string[] = [];
  for (const im of images) ops.push(`q ${TILE} 0 0 ${TILE} ${im.dx} ${H - im.dy - TILE} cm /I${im.n} Do Q`);
  // Scale bar: 50 ft, bottom left, on a white plate.
  const bar = 50 / opts.ftPerPt;
  ops.push(`q 1 1 1 rg 8 8 ${(bar + 54).toFixed(2)} 22 re f Q`);
  ops.push(`q 0 0 0 RG 2 w 14 16 m ${(14 + bar).toFixed(2)} 16 l S 14 12 m 14 20 l S ${(14 + bar).toFixed(2)} 12 m ${(14 + bar).toFixed(2)} 20 l S Q`);
  ops.push(`BT /F1 9 Tf 0 0 0 rg ${(18 + bar).toFixed(2)} 13 Td ${pdfStr("50 ft")} Tj ET`);
  // Attribution and caption, bottom right / top left.
  const attrW = opts.attribution.length * 4.4 + 10;
  ops.push(`q 1 1 1 rg ${(W - attrW - 6).toFixed(2)} 6 ${attrW.toFixed(2)} 13 re f Q`);
  ops.push(`BT /F1 8 Tf 0.2 0.2 0.2 rg ${(W - attrW - 1).toFixed(2)} 10 Td ${pdfStr(opts.attribution)} Tj ET`);
  const capW = opts.caption.length * 5 + 12;
  ops.push(`q 1 1 1 rg 6 ${H - 22} ${capW.toFixed(2)} 16 re f Q`);
  ops.push(`BT /F1 9 Tf 0 0 0 rg 12 ${H - 17} Td ${pdfStr(opts.caption)} Tj ET`);
  const content = ops.join("\n");
  const cn = add([`<< /Length ${enc.encode(content).length} >>\nstream\n`, content, "\nendstream"]);

  const xo = images.map((im) => `/I${im.n} ${im.n} 0 R`).join(" ");
  objs[2] = [enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R >> /XObject << ${xo} >> >> /Contents ${cn} 0 R >>`)];

  const chunks: Uint8Array[] = [enc.encode("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
  let off = chunks[0].length;
  const xref: number[] = [];
  objs.forEach((parts, i) => {
    xref.push(off);
    const head = enc.encode(`${i + 1} 0 obj\n`), tail = enc.encode("\nendobj\n");
    for (const c of [head, ...parts, tail]) { chunks.push(c); off += c.length; }
  });
  const xrefAt = off;
  let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of xref) x += `${String(o).padStart(10, "0")} 00000 n \n`;
  x += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(enc.encode(x));
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
