"use client";
/**
 * pdf.js for the Plan Room (migration 059) — loaded only on that page, its
 * worker served from our own bundle (no CDN). Each plan PDF is opened once per
 * visit and kept; pages are drawn on demand.
 */
import { readSheet, type SheetReading, type TextItem } from "@/lib/plan-sheets";

// The legacy build: the modern one leans on JavaScript newer than most browsers
// (and phones) have yet (Map.getOrInsertComputed).
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type Doc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
type Page = Awaited<ReturnType<Doc["getPage"]>>;

let lib: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return lib;
}

/** The most pixels one canvas may hold here: ~16.7 MP on a phone or tablet, ~33.5 MP on a desktop. */
export const MAX_CANVAS_PX = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? 2 ** 24 : 2 ** 25;

const docs = new Map<string, Promise<Doc>>();

// Plan sets are 10–30 MB and a file id's bytes never change (a new upload is a
// new id), but its signed link does on every visit, so the browser's own cache
// never hits and each visit downloaded the set again — Supabase egress, the
// free plan's tightest limit (2026-10-06). The bytes are kept on the device in
// the Cache API by file id; a first open still streams from the link (first
// page shows early) and stores what pdf.js already downloaded.
const CACHE = "sc-plan-pdfs-v1";
const cacheKey = (fileId: string) => `/__sc-pdf/${fileId}`;
async function cachedBytes(fileId: string): Promise<Uint8Array | null> {
  try {
    if (typeof caches === "undefined") return null;
    const r = await (await caches.open(CACHE)).match(cacheKey(fileId));
    return r ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { return null; }
}
async function keepBytes(fileId: string, doc: Doc) {
  try {
    if (typeof caches === "undefined") return;
    const bytes = await doc.getData();
    await (await caches.open(CACHE)).put(cacheKey(fileId), new Response(new Blob([bytes as BlobPart]), { headers: { "content-type": "application/pdf" } }));
  } catch { /* storage full or refused — the link still works next time */ }
}

/** Open a plan PDF by its file id and (signed) link — once per visit, downloaded once per device. */
export function openPdf(fileId: string, url: string): Promise<Doc> {
  let d = docs.get(fileId);
  if (!d) {
    // Scanned plan sets store their drawings as JBIG2 / JPEG 2000 images: without the
    // decoders (public/pdfjs, copied at build) every page renders white.
    const base = `${window.location.origin}/pdfjs/`;
    const opts = {
      wasmUrl: `${base}wasm/`, standardFontDataUrl: `${base}standard_fonts/`,
      cMapUrl: `${base}cmaps/`, cMapPacked: true, iccUrl: `${base}iccs/`,
      // A scanned D-size sheet is one ~67-megapixel image (Burgess Ave: 10,191 × 6,603, CCITT G4).
      // pdf.js guesses the canvas limit by probing, and a phone says yes to a size it then can't
      // draw — a white page. Told the limit, it shrinks the image in the worker first.
      canvasMaxAreaInBytes: MAX_CANVAS_PX * 4,
    };
    d = Promise.all([pdfjs(), cachedBytes(fileId)]).then(async ([m, data]) => {
      if (data) {
        try { return await m.getDocument({ ...opts, data }).promise; }
        catch { try { await (await caches.open(CACHE)).delete(cacheKey(fileId)); } catch { /* ignore */ } }
      }
      const doc = await m.getDocument({ ...opts, url }).promise;
      void keepBytes(fileId, doc);
      return doc;
    });
    d.catch(() => docs.delete(fileId));
    docs.set(fileId, d);
  }
  return d;
}

/**
 * Let go of a page's decoded pictures. A scanned sheet is one ~67-megapixel image;
 * pdf.js keeps it decoded with the page until cleanup(), so reading or thumbnailing a
 * whole set without this held every sheet at once — gigabytes on Burgess Ave's 74 +
 * 74 + 6 sheets, and the tab crashed (LA Contracting, 2026-10-07). Safe mid-render:
 * pdf.js waits for the page's renders to finish before it clears.
 */
export function releasePage(doc: Doc, pageNo: number) {
  doc.getPage(pageNo).then((p) => p.cleanup()).catch(() => { /* gone already */ });
}

/** Page size in points as shown (rotation applied). */
export function pageSize(p: Page) {
  const v = p.getViewport({ scale: 1 });
  return { w: v.width, h: v.height };
}

/** Read every page's title block. */
export async function readPlanPages(doc: Doc, onPage?: (n: number, of: number) => void): Promise<Array<SheetReading & { page: number; page_w: number; page_h: number }>> {
  const out: Array<SheetReading & { page: number; page_w: number; page_h: number }> = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const v = p.getViewport({ scale: 1 });
    const tc = await p.getTextContent();
    const items: TextItem[] = [];
    for (const raw of tc.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
      if (!raw.str || !raw.transform) continue;
      const [x, y] = v.convertToViewportPoint(raw.transform[4], raw.transform[5]);
      const h = Math.abs(raw.height || Math.hypot(raw.transform[2], raw.transform[3])) || 8;
      items.push({ str: raw.str, x, y: y - h, w: Math.abs(raw.width ?? raw.str.length * h * 0.5), h });
    }
    out.push({ ...readSheet(items, v.width, v.height), page: i, page_w: v.width, page_h: v.height });
    p.cleanup();
    onPage?.(i, doc.numPages);
  }
  return out;
}

// The page each document last drew whole: moving to another sheet lets go of the last one
// (a zoom redraws the same page and keeps its decoded picture).
const lastDrawn = new WeakMap<Doc, number>();

/** Draw a page onto a canvas at `scale` (points → CSS px), sharp on high-DPI screens. Returns a cancel. */
export function drawPage(doc: Doc, pageNo: number, canvas: HTMLCanvasElement, scale: number): { done: Promise<void>; cancel: () => void } {
  let task: { cancel: () => void; promise: Promise<void> } | null = null;
  let cancelled = false;
  const prev = lastDrawn.get(doc);
  if (prev !== undefined && prev !== pageNo) releasePage(doc, prev);
  lastDrawn.set(doc, pageNo);
  const done = doc.getPage(pageNo).then((p) => {
    if (cancelled) return;
    let dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    // Zoomed far in on a big sheet, the canvas would pass what the device can draw: give up
    // sharpness, never the picture.
    const base = p.getViewport({ scale });
    const fit = Math.sqrt(MAX_CANVAS_PX / Math.max(1, base.width * base.height));
    dpr = Math.min(dpr, fit);
    const v = p.getViewport({ scale: scale * dpr });
    canvas.width = Math.floor(v.width);
    canvas.height = Math.floor(v.height);
    canvas.style.width = `${Math.floor(v.width / dpr)}px`;
    canvas.style.height = `${Math.floor(v.height / dpr)}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    task = p.render({ canvasContext: ctx, viewport: v, canvas }) as unknown as { cancel: () => void; promise: Promise<void> };
    return task.promise.catch(() => { /* cancelled */ });
  });
  return { done, cancel: () => { cancelled = true; task?.cancel(); } };
}

const thumbs = new Map<string, Promise<string>>();
// Thumbnails are drawn a few at a time. Each one decodes its whole sheet first; a grid of
// 154 scanned sheets asking at once peaked near 3 GB per 30 sheets in a test and crashed
// the tab (2026-10-07). One at a time on a phone, two on a desktop.
const THUMB_LANES = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? 1 : 2;
let thumbBusy = 0;
const thumbWaiting: Array<() => void> = [];
async function thumbTurn<T>(work: () => Promise<T>): Promise<T> {
  if (thumbBusy >= THUMB_LANES) await new Promise<void>((go) => thumbWaiting.push(go));
  thumbBusy++;
  try { return await work(); }
  finally { thumbBusy--; thumbWaiting.shift()?.(); }
}
/** A small picture of a page, made once per visit, kept in memory only. */
export function pageThumb(fileId: string, url: string, pageNo: number, width = 360): Promise<string> {
  const k = `${fileId}:${pageNo}`;
  let t = thumbs.get(k);
  if (!t) {
    t = openPdf(fileId, url).then((doc) => thumbTurn(async () => {
      const p = await doc.getPage(pageNo);
      const c = document.createElement("canvas");
      try {
        const v1 = p.getViewport({ scale: 1 });
        const v = p.getViewport({ scale: width / v1.width });
        c.width = Math.floor(v.width); c.height = Math.floor(v.height);
        const ctx = c.getContext("2d");
        if (!ctx) return "";
        await (p.render({ canvasContext: ctx, viewport: v, canvas: c }) as unknown as { promise: Promise<void> }).promise;
        return c.toDataURL("image/jpeg", 0.7);
      } finally {
        p.cleanup();
        c.width = 0; c.height = 0;
      }
    }));
    t.catch(() => thumbs.delete(k));
    thumbs.set(k, t);
  }
  return t;
}

/**
 * One region of a page (PDF points, y down) drawn at `scale` onto a fresh canvas —
 * for reading a scanned sheet with OCR (src/lib/v34/plan-ocr-runner.ts). White
 * behind, as on paper. The page is let go after, unless `keep` (the OCR reader draws
 * many parts of one sheet and lets go of it once it is done with the sheet).
 */
export async function renderRegion(doc: Doc, pageNo: number, r: { x: number; y: number; w: number; h: number }, scale: number, keep = false): Promise<HTMLCanvasElement> {
  const p = await doc.getPage(pageNo);
  const v = p.getViewport({ scale, offsetX: -r.x * scale, offsetY: -r.y * scale });
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(r.w * scale));
  c.height = Math.max(1, Math.floor(r.h * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  try { await (p.render({ canvasContext: ctx, viewport: v, canvas: c }) as unknown as { promise: Promise<void> }).promise; }
  finally { if (!keep) p.cleanup(); }
  return c;
}
