"use client";
/**
 * Reading scanned plan sheets in the browser (migration 064; Coy, 2026-10-02:
 * "if it's running in the background … it shows what it's doing in the activity
 * bar … we know that it's working through the plans").
 *
 * One reader at a time, kept OUTSIDE React (a module, like dusty-live.ts) so it
 * keeps going while Coy moves around the dashboard and never re-renders the
 * layout; the activity line and the Plan Room subscribe to its progress. It
 * stops if the page is reloaded or closed — whatever was saved stays saved, and
 * the next visit to the Plan Room carries on from there.
 *
 *   1. Title blocks of every scanned drawing (right strip + bottom band at ~3×):
 *      sheet number, title, discipline, printed scale — read by the same
 *      readSheet() a digital set uses. Fast, so the Sheets step fills first.
 *   2. Whole sheets in tiles at 3× (a tile that reads poorly is read again at 4×),
 *      civil and structural first: every word with where it is, for Dusty and
 *      for dimensions.
 * Each sheet is saved the moment it is read (/api/plan-sheets/[id]/ocr).
 */
import { useSyncExternalStore } from "react";
import { MAX_CANVAS_PX, openPdf, releasePage, renderRegion } from "@/lib/pdf";
import { isStampTitle, readSheet } from "@/lib/plan-sheets";
import { chooseTitles, compactWords, inTitleCorner, meanConf, mergeItems, ocrText, scaleFor, titleCandidates, tilesFor, titleRegions, toItems, type OcrItem, type OcrWord, type Rect } from "@/lib/plan-ocr";

export interface OcrSheet {
  id: string; file_id: string; page: number; page_w: number; page_h: number;
  number: string | null; title: string | null; discipline: string | null; number_source: string;
  ocr_title_at?: string | null; ocr_at?: string | null;
}
export interface OcrState {
  running: boolean; jobId: string | null; jobTitle: string | null; phase: "title" | "full" | null;
  done: number; total: number; label: string; error: string | null; saved: number;
}

const IDLE: OcrState = { running: false, jobId: null, jobTitle: null, phase: null, done: 0, total: 0, label: "", error: null, saved: 0 };
let state: OcrState = IDLE;
const subs = new Set<() => void>();
function set(patch: Partial<OcrState>) {
  state = { ...state, ...patch };
  for (const f of subs) f();
}
function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export function usePlanOcr(): OcrState {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}

/** The reader's progress right now, outside React. */
export function planOcrState(): OcrState { return state; }

let stop = false;
export function stopPlanOcr() { stop = true; }

// ── tesseract, loaded on first use, from our own origin ─────────────────────
type Sched = { addJob: (a: "recognize", img: HTMLCanvasElement, o: object, out: object) => Promise<{ data: { blocks: Block[] | null } }>; terminate: () => Promise<unknown> };
interface Block { paragraphs: Array<{ lines: Array<{ words: OcrWord[] }> }> }

/** How many parts are read at once — one per tesseract worker. */
let lanes = 1;

async function scheduler(): Promise<Sched> {
  const T = await import("tesseract.js");
  const sch = T.createScheduler();
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const n = coarse ? 1 : Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
  lanes = n;
  for (let i = 0; i < n; i++) {
    const w = await T.createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js", corePath: "/tesseract/core", langPath: "/tesseract/lang", gzip: true,
    });
    // Plans are scattered words, not paragraphs: sparse text.
    await w.setParameters({ tessedit_pageseg_mode: "11" as never, preserve_interword_spaces: "1", user_defined_dpi: "300" });
    sch.addWorker(w);
  }
  return sch as unknown as Sched;
}

/**
 * One part's reading may take this long; past it the part is skipped and the reader
 * restarted. On Burgess Ave's profile sheet some parts never finish at all — a longer
 * wait only wasted minutes — so a dense drawing is read in part, and says which parts.
 */
const PART_MS = 45_000;
const partMs = () => PART_MS;
class PartTimeout extends Error {}
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((ok, no) => {
    const t = setTimeout(() => no(new PartTimeout("a part of this sheet took too long to read")), ms);
    p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); no(e); });
  });
}

async function read(sch: Sched, doc: Awaited<ReturnType<typeof openPdf>>, page: number, r: Rect, scale: number): Promise<OcrItem[]> {
  const c = await renderRegion(doc, page, r, scale, true);
  try {
    const res = await within(sch.addJob("recognize", c, {}, { blocks: true, text: false }), partMs());
    const words = (res.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
    return toItems(words, r, scale);
  } finally { c.width = 0; c.height = 0; }
}

/**
 * The right edge read turned a quarter clockwise — DOTD and many civil sets run the
 * title up the side ("SUMMARY TABLES" on Burgess Ave). Returns the words in the
 * turned frame (their sizes are what matter for picking the title), not page points.
 */
async function readTurned(sch: Sched, doc: Awaited<ReturnType<typeof openPdf>>, page: number, r: Rect, scale: number): Promise<OcrItem[]> {
  const c = await renderRegion(doc, page, r, scale, true);
  const t = document.createElement("canvas");
  t.width = c.height; t.height = c.width;
  const ctx = t.getContext("2d");
  try {
    if (!ctx) return [];
    ctx.translate(t.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(c, 0, 0);
    const res = await within(sch.addJob("recognize", t, {}, { blocks: true, text: false }), partMs());
    const words = (res.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
    return toItems(words, { x: 0, y: 0, w: t.width / scale, h: t.height / scale }, scale);
  } finally { c.width = 0; c.height = 0; t.width = 0; t.height = 0; }
}

const breathe = () => new Promise((r) => setTimeout(r, 0));
const label = (s: OcrSheet) => s.number ?? `p.${s.page}`;

async function save(id: string, body: object): Promise<Partial<OcrSheet> | null> {
  try {
    const r = await fetch(`/api/plan-sheets/${id}/ocr`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    return r.ok ? (b.sheet ?? null) : null;
  } catch { return null; }
}

/**
 * Start reading a job's scanned drawings, unless this job is already being read.
 * `sheets` are the drawings in the plan room; `urls` their files' signed links.
 */
/**
 * What is left to read of a job's scanned drawings, and what is done. A sheet read
 * once is never read again (its ocr_title_at / ocr_at are stamped), so a visit after
 * the reader finished does nothing.
 */
export function ocrPending(sheets: OcrSheet[], urls: Map<string, string>) {
  // A scan has no text layer: nothing was read off it. A digital sheet already has its words.
  // A CAD set whose lettering is drawn as lines is a scan too: all it has is the plot stamp
  // or the drawing file's path, which is never a title (isStampTitle).
  const scans = sheets.filter((s) => s.number_source !== "coy" && (s.ocr_title_at || (!s.number && (!s.title || isStampTitle(s.title)))));
  const titles = scans.filter((s) => !s.ocr_title_at && urls.has(s.file_id));
  const full = scans.filter((s) => !s.ocr_at && urls.has(s.file_id));
  return { scans: scans.length, read: scans.filter((s) => s.ocr_at).length, titles, full };
}

/**
 * Whether this device may start reading on its own. A phone never does (Coy,
 * 2026-10-02: it "tends to want to crash the mobile browser") — there it is a
 * tap — and a desktop doesn't restart a job Coy paused in this tab.
 */
export function mayAutoRead(jobId: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(pointer: coarse)").matches) return false;
  try { if (sessionStorage.getItem(`sc:ocr-paused:${jobId}`)) return false; } catch { /* no storage */ }
  return true;
}
export function pausePlanOcr(jobId: string) {
  try { sessionStorage.setItem(`sc:ocr-paused:${jobId}`, "1"); } catch { /* no storage */ }
  stop = true;
  set({ label: "Pausing after this part…" });
}
export function resumePlanOcrAllowed(jobId: string) {
  try { sessionStorage.removeItem(`sc:ocr-paused:${jobId}`); } catch { /* no storage */ }
}

export function startPlanOcr(job: { id: string; title: string | null }, sheets: OcrSheet[], urls: Map<string, string>) {
  if (state.running) return;
  const { titles, full } = ocrPending(sheets, urls);
  if (!titles.length && !full.length) return;
  stop = false;
  set({ ...IDLE, running: true, jobId: job.id, jobTitle: job.title, phase: titles.length ? "title" : "full", total: titles.length || full.length, label: "Opening the plan reader…" });
  void run(job, titles, full, urls);
}

async function run(job: { id: string; title: string | null }, titles: OcrSheet[], full: OcrSheet[], urls: Map<string, string>) {
  const name = job.title || "this job";
  let sch: Sched | null = null;
  const candidates: Array<{ id: string; cands: Array<{ text: string; h: number; turned?: boolean }> }> = [];
  try {
    sch = await scheduler();
    // 1 · title blocks
    for (let i = 0; i < titles.length && !stop; i++) {
      const s = titles[i];
      set({ phase: "title", done: i, total: titles.length, label: `Reading sheet titles · ${name} · ${label(s)} · ${i + 1} of ${titles.length}` });
      try {
        const doc = await openPdf(s.file_id, urls.get(s.file_id)!);
        // The title block flat (right strip, bottom band) and the right edge turned a quarter —
        // many civil sets run the title up the side — read at once. Every title-like run from
        // both, biggest first; which one is the title is decided against the whole set below
        // (what repeats on every sheet is a logo, not a title).
        const edge = { x: s.page_w * 0.9, y: 0, w: s.page_w * 0.1, h: s.page_h };
        const reader = sch;
        const [flatParts, turnedItems] = await Promise.all([
          Promise.all(titleRegions(s.page_w, s.page_h).map((r) => read(reader, doc, s.page, r, scaleFor(r, 3, MAX_CANVAS_PX)))),
          readTurned(reader, doc, s.page, edge, scaleFor(edge, 3, MAX_CANVAS_PX)),
        ]);
        const m = mergeItems(flatParts.flat());
        const sheet = readSheet(m, s.page_w, s.page_h);
        const turned = mergeItems(turnedItems);
        const flat = titleCandidates(m).filter((c) => inTitleCorner(c, s.page_w, s.page_h));
        const cands = [...flat, ...titleCandidates(turned).map((c) => ({ ...c, turned: true }))]
          .filter((c, i, a) => a.findIndex((x) => x.text.toUpperCase() === c.text.toUpperCase()) === i)
          .sort((a, b) => b.h - a.h).slice(0, 6);
        releasePage(doc, s.page);
        candidates.push({ id: s.id, cands });
        const title = cands[0]?.text ?? null;
        const got = await save(s.id, {
          phase: "title", number: sheet.number, title, discipline: sheet.number ? sheet.discipline : null,
          scale_text: sheet.scale?.text ?? null, printed_ft_per_pt: sheet.scale?.kind === "scale" ? sheet.scale.ft_per_pt : null, conf: meanConf(m),
        });
        if (got) Object.assign(s, got);
      } catch (e) {
        if (e instanceof PartTimeout && sch) { void sch.terminate(); sch = await scheduler(); }
        await save(s.id, { phase: "title", error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      }
      set({ saved: state.saved + 1 });
    }
    // Titles against the whole set: a candidate on most sheets is boilerplate.
    if (!stop && candidates.length >= 3) {
      const best = chooseTitles(candidates);
      for (const c of candidates) {
        const t = best.get(c.id) ?? null;
        if (t && t !== c.cands[0]?.text) await save(c.id, { phase: "title", title: t });
      }
    }
    // 2 · whole sheets, the concrete ones first
    const rank = (s: OcrSheet) => (s.discipline === "C" || s.discipline === "S" ? 0 : s.discipline ? 1 : 2);
    const order = full.slice().sort((a, b) => rank(a) - rank(b) || a.page - b.page);
    for (let i = 0; i < order.length && !stop; i++) {
      const s = order[i];
      try {
        const doc = await openPdf(s.file_id, urls.get(s.file_id)!);
        // 3× (~216 dpi): plan lettering is ~1/10 in tall; at 2× table totals were lost (Burgess Ave).
        const tiles = tilesFor(s.page_w, s.page_h, 3);
        const items: OcrItem[] = [];
        const skipped: number[] = [];
        // As many parts at once as there are readers (three on a desktop, one on a phone).
        for (let t = 0; t < tiles.length && !stop; t += lanes) {
          const batch = tiles.slice(t, t + lanes);
          const parts = batch.length > 1 ? `parts ${t + 1}–${t + batch.length}` : `part ${t + 1}`;
          set({ phase: "full", done: i, total: order.length, label: `Reading the plans · ${name} · ${label(s)} · sheet ${i + 1} of ${order.length} · ${parts} of ${tiles.length}` });
          const reader = sch;
          const results = await Promise.allSettled(batch.map(async (tile) => {
            let got = await read(reader, doc, s.page, tile, scaleFor(tile, 3, MAX_CANVAS_PX));
            // Hermes's habit: a part that read poorly is read again, finer — not on a phone,
            // where a 4× render of a 10,000-px scan is what runs it out of memory.
            if (lanes > 1 && got.length && (meanConf(got) ?? 100) < 60) {
              const fine = await read(reader, doc, s.page, tile, scaleFor(tile, 4, MAX_CANVAS_PX));
              if ((meanConf(fine) ?? 0) > (meanConf(got) ?? 0)) got = fine;
            }
            return got;
          }));
          let stuck = false;
          results.forEach((r, k) => {
            if (r.status === "fulfilled") items.push(...r.value);
            else if (r.reason instanceof PartTimeout) { skipped.push(t + k + 1); stuck = true; }
            else throw r.reason;
          });
          // A dense drawing can hold tesseract for minutes: skip the part, start a fresh reader.
          if (stuck) { void sch.terminate(); sch = await scheduler(); }
          await breathe();
        }
        releasePage(doc, s.page);
        if (stop) break;
        const m = mergeItems(items);
        await save(s.id, { phase: "full", text: ocrText(m).slice(0, 200_000), words: compactWords(m), conf: meanConf(m),
          ...(skipped.length ? { note: `part${skipped.length > 1 ? "s" : ""} ${skipped.join(", ")} of ${tiles.length} took too long and weren't read` } : {}) });
      } catch (e) { await save(s.id, { phase: "full", error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }); }
      set({ saved: state.saved + 1 });
    }
    set({ running: false, phase: null, label: stop ? "" : `Read ${order.length || titles.length} sheet${(order.length || titles.length) === 1 ? "" : "s"} · ${name}` });
  } catch (e) {
    set({ running: false, phase: null, error: e instanceof Error ? e.message : String(e), label: `Couldn't read the plans: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160) });
  } finally {
    if (sch) void sch.terminate();
  }
}
