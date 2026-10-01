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

const docs = new Map<string, Promise<Doc>>();
/** Open a plan PDF by its file id and (signed) link — once per visit. */
export function openPdf(fileId: string, url: string): Promise<Doc> {
  let d = docs.get(fileId);
  if (!d) {
    d = pdfjs().then((m) => m.getDocument({ url }).promise);
    d.catch(() => docs.delete(fileId));
    docs.set(fileId, d);
  }
  return d;
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

/** Draw a page onto a canvas at `scale` (points → CSS px), sharp on high-DPI screens. Returns a cancel. */
export function drawPage(doc: Doc, pageNo: number, canvas: HTMLCanvasElement, scale: number): { done: Promise<void>; cancel: () => void } {
  let task: { cancel: () => void; promise: Promise<void> } | null = null;
  let cancelled = false;
  const done = doc.getPage(pageNo).then((p) => {
    if (cancelled) return;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
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
/** A small picture of a page, made once per visit, kept in memory only. */
export function pageThumb(fileId: string, url: string, pageNo: number, width = 360): Promise<string> {
  const k = `${fileId}:${pageNo}`;
  let t = thumbs.get(k);
  if (!t) {
    t = openPdf(fileId, url).then(async (doc) => {
      const p = await doc.getPage(pageNo);
      const v1 = p.getViewport({ scale: 1 });
      const v = p.getViewport({ scale: width / v1.width });
      const c = document.createElement("canvas");
      c.width = Math.floor(v.width); c.height = Math.floor(v.height);
      const ctx = c.getContext("2d");
      if (!ctx) return "";
      await (p.render({ canvasContext: ctx, viewport: v, canvas: c }) as unknown as { promise: Promise<void> }).promise;
      p.cleanup();
      return c.toDataURL("image/jpeg", 0.7);
    });
    t.catch(() => thumbs.delete(k));
    thumbs.set(k, t);
  }
  return t;
}
