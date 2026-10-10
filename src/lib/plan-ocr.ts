/**
 * OCR of scanned plan sheets (migration 064) — the pure part, tested in
 * tests/plan-ocr.test.mjs. The browser renders a region of a sheet with pdf.js,
 * tesseract.js reads it, and these turn what it read into the same TextItems a
 * text-layer PDF gives (page points, y down), so the title-block reader
 * (src/lib/plan-sheets.ts) reads a scan exactly as it reads a digital set.
 *
 * Coy, 2026-10-02: "I just want to see if I can get some dimensions off of
 * plans accurately." What OCR reads is a reading — shown, quoted with its sheet,
 * never applied: a printed scale stays a suggestion until Coy taps it (§6).
 */
import type { TextItem } from "./plan-sheets.ts";

/** A region of a sheet, in PDF points (y down). */
export interface Rect { x: number; y: number; w: number; h: number }
/** What tesseract.js gives per word: pixel box in the rendered image, text, confidence 0–100. */
export interface OcrWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
export interface OcrItem extends TextItem { conf: number }

/** Where title blocks live — the same places plan-sheets.ts looks: a strip down the right, a band along the bottom. */
export function titleRegions(pageW: number, pageH: number): Rect[] {
  return [
    { x: pageW * 0.72, y: 0, w: pageW * 0.28, h: pageH },
    { x: 0, y: pageH * 0.8, w: pageW * 0.72, h: pageH * 0.2 },
  ];
}

/** The render scale for a region: `want`, lowered until its pixels fit `maxPx`. */
export function scaleFor(r: Rect, want: number, maxPx: number): number {
  const fit = Math.sqrt(maxPx / Math.max(1, r.w * r.h));
  return Math.max(0.25, Math.min(want, fit));
}

/**
 * The whole sheet as tiles of at most `tilePx` square at `scale`, overlapping
 * by `overlapPx` so a word cut by one edge is whole in the next.
 */
export function tilesFor(pageW: number, pageH: number, scale: number, tilePx = 2400, overlapPx = 64): Rect[] {
  const step = (tilePx - overlapPx) / scale;
  const size = tilePx / scale;
  const out: Rect[] = [];
  for (let y = 0; y < pageH; y += step) {
    for (let x = 0; x < pageW; x += step) {
      out.push({ x, y, w: Math.min(size, pageW - x), h: Math.min(size, pageH - y) });
      if (x + size >= pageW) break;
    }
    if (y + size >= pageH) break;
  }
  return out;
}

/** Tesseract's words in a rendered region → items in page points. Empty and junk words dropped. */
export function toItems(words: OcrWord[], region: Rect, scale: number, minConf = 30): OcrItem[] {
  const out: OcrItem[] = [];
  for (const w of words) {
    const str = (w.text ?? "").trim();
    if (!str || w.confidence < minConf) continue;
    if (!/[A-Za-z0-9=]/.test(str)) continue; // keep "=": a printed scale needs it
    const { x0, y0, x1, y1 } = w.bbox;
    out.push({ str, x: region.x + x0 / scale, y: region.y + y0 / scale, w: (x1 - x0) / scale, h: Math.max(1, (y1 - y0) / scale), conf: w.confidence });
  }
  return out;
}

/** The same word read twice where tiles overlap is one word — the surer reading kept. */
export function mergeItems(items: OcrItem[]): OcrItem[] {
  const sorted = items.slice().sort((a, b) => b.conf - a.conf);
  const kept: OcrItem[] = [];
  for (const it of sorted) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const dup = kept.some((k) => k.str === it.str && Math.abs(k.x + k.w / 2 - cx) < Math.max(2, k.h) && Math.abs(k.y + k.h / 2 - cy) < Math.max(2, k.h * 0.6));
    if (!dup) kept.push(it);
  }
  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The sheet's words as rows, top to bottom. Words on one baseline stay one row,
 * with " | " where there is a wide gap — so a table row reads
 * "104+55 RT. | DRIVE | 39" instead of three loose words (Burgess Ave's summary
 * tables, 2026-10-02). Two tables side by side share a row, separated the same way.
 */
export function ocrText(items: TextItem[]): string {
  const sorted = items.filter((i) => i.str.trim()).slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
  const rows: Array<{ items: TextItem[]; mid: number; h: number }> = [];
  for (const it of sorted) {
    const mid = it.y + it.h / 2;
    const last = rows[rows.length - 1];
    if (last && Math.abs(mid - last.mid) <= Math.max(1.5, Math.min(it.h, last.h) * 0.45)) { last.items.push(it); last.h = Math.max(last.h, it.h); }
    else rows.push({ items: [it], mid, h: it.h });
  }
  return rows.map((r) => {
    const its = r.items.sort((a, b) => a.x - b.x);
    let out = "";
    its.forEach((it, i) => {
      if (i) { const prev = its[i - 1]; out += it.x - (prev.x + prev.w) > Math.max(prev.h, it.h) * 1.6 ? " | " : " "; }
      out += it.str.trim();
    });
    return out;
  }).join("\n");
}

/** Compact for storage: [x, y, w, h, text, conf], points to 0.1. */
export function compactWords(items: OcrItem[], max = 8000): Array<[number, number, number, number, string, number]> {
  const r = (n: number) => Math.round(n * 10) / 10;
  return items.slice(0, max).map((i) => [r(i.x), r(i.y), r(i.w), r(i.h), i.str.slice(0, 60), Math.round(i.conf)]);
}

export function meanConf(items: OcrItem[]): number | null {
  return items.length ? Math.round((items.reduce((s, i) => s + i.conf, 0) / items.length) * 10) / 10 : null;
}

/**
 * Dimensions as plans print them — 12'-6", 5'-0", 6", 24' — found in OCR'd text,
 * each with its line. Feet-and-inches are turned into feet only for display;
 * nothing is ever applied from them.
 */
export function findDimensions(text: string): Array<{ text: string; feet: number; line: string }> {
  const out: Array<{ text: string; feet: number; line: string }> = [];
  const norm = text.replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  for (const line of norm.split("\n")) {
    // Not the 2 of a fraction (1/2"), not the end of a longer number.
    const re = /(?<![\d/.])(\d{1,4})\s*'\s*(?:-?\s*(\d{1,2}(?:\s+\d\/\d)?)\s*")?|(?<![\d/.])(\d{1,3})\s*"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      let feet: number;
      if (m[1]) {
        const inch = m[2] ? m[2].split(/\s+/).reduce((s, p) => s + (p.includes("/") ? Number(p.split("/")[0]) / Number(p.split("/")[1]) : Number(p)), 0) : 0;
        if (inch >= 12) continue;
        feet = Number(m[1]) + inch / 12;
      } else feet = Number(m[3]) / 12;
      out.push({ text: m[0].trim(), feet: Math.round(feet * 1000) / 1000, line: line.trim().slice(0, 160) });
    }
  }
  return out;
}

/** How tall the words of `text` were read (the tallest), in points — 0 when not found. */
export function heightOf(text: string, items: TextItem[]): number {
  const words = new Set(text.toUpperCase().split(/\s+/));
  return items.filter((i) => words.has(i.str.toUpperCase())).reduce((h, i) => Math.max(h, i.h), 0);
}

/** A title is words ("SUMMARY TABLES", "TYPICAL SECTIONS"), not a logo ("DOTD"), a label or a stray mark. */
export function titleLike(text: string, maxLen = 60): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  const lead = text.replace(/^[^A-Za-z0-9]+/, "");
  return letters.length >= 6 && letters.length / Math.max(1, text.replace(/\s/g, "").length) > 0.7 && !NOT_TITLE.test(lead)
    && !SEAL.test(text) && !PERSON.test(text) && !/[:|]\s*$/.test(text) && !/not to scale/i.test(text) && text.length <= maxLen;
}
/** Initials and a surname — the DESIGNED / DRAWN / CHECKED row ("G. CHENG", "G. VANNICE | T. STEPHENS"), never a title. */
const PERSON = /^\W*([A-Z]\.\s?){1,2}[A-Z][A-Za-z'-]+\b|\|\s*([A-Z]\.\s?){1,2}[A-Z]/;
/** The engineer's seal and the agency's name are on every sheet and never its title (and OCR mangles the seal: "ENGINES,"). */
const SEAL = /engin|regist|licens|professional|\bseal\b|department|transportation|development|louisiana|\bstate of\b|sional/i;

// Labels in a title block's boxes — the review / initials box ("Review KTB", "DESIGN JBC", "CHECK KTB",
// "DETAIL MLM", "SERIES 1 OF 1" on Burgess Ave) and the usual field names.
const NOT_TITLE = /^(sheet no|sheet number|scale|date|drawn|check(ed)?|design(ed)?|review(ed)?|detail\b|series|plot|file|project|job|no\.?|rev(ision)?s?|evisions|standard( plan)?|height|type of|by|description|approved|parish|state|control|section|route|license|registered|engineer|of)\b/i;
/**
 * The title from a strip of title-block words: the biggest lettering that reads as
 * words — not a label, a number, a date, a seal, a name of the firm in small type.
 */
export function pickTitle(items: TextItem[]): { text: string; h: number } | null {
  return titleCandidates(items)[0] ?? null;
}

export interface TitleCand { text: string; h: number; x: number; y: number; turned?: boolean; lines?: string[] }
/** Every title-like run in a strip of words, biggest lettering first, with where it starts. */
export function titleCandidates(items: TextItem[]): TitleCand[] {
  const sorted = items.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
  const rows: Array<{ items: TextItem[]; mid: number; h: number }> = [];
  for (const it of sorted) {
    const mid = it.y + it.h / 2;
    const last = rows[rows.length - 1];
    if (last && Math.abs(mid - last.mid) <= Math.max(1.5, Math.min(it.h, last.h) * 0.45)) { last.items.push(it); last.h = Math.max(last.h, it.h); }
    else rows.push({ items: [it], mid, h: it.h });
  }
  const cands = rows.map((r) => {
    const its = r.items.sort((a, b) => a.x - b.x);
    const runs: TextItem[][] = [];
    for (const it of its) {
      const run = runs[runs.length - 1];
      const prev = run?.[run.length - 1];
      if (prev && it.x - (prev.x + prev.w) <= Math.max(prev.h, it.h) * 1.6) run.push(it); else runs.push([it]);
    }
    const parts = runs.map((run) => ({ text: run.map((i) => i.str).join(" "), h: Math.max(...run.map((i) => i.h)), x: run[0].x, y: run[0].y, x1: run[run.length - 1].x + run[run.length - 1].w }));
    // Runs of the same lettering on one row are one title broken by a gap ("TITLE SHEET" … "LAYOUT MAP").
    const same = parts.filter((p) => titleLike(p.text) && Math.abs(p.h - parts[0].h) <= parts[0].h * 0.15);
    return same.length > 1 && same.length === parts.length
      ? [{ text: same.map((p) => p.text).join(" "), h: Math.min(...same.map((p) => p.h)), x: same[0].x, y: same[0].y, x1: same[same.length - 1].x1 }, ...parts]
      : parts;
  }).flat().filter((c) => titleLike(c.text));
  const out: TitleCand[] = [...cands.map((c) => ({ text: c.text, h: c.h, x: c.x, y: c.y })), ...stacks(cands)];
  // Biggest first; a title set on several lines before any one of its lines.
  out.sort((a, b) => b.h - a.h || (b.lines?.length ?? 1) - (a.lines?.length ?? 1));
  return out;
}

/**
 * A title lettered over two to four lines ("STORM WATER POLLUTION / PREVENTION PLAN /
 * BEST MANAGEMENT PRACTICES" on a city standard plan): lines of the same lettering,
 * one under the next, overlapping side to side.
 */
function stacks(cands: Array<{ text: string; h: number; x: number; y: number; x1: number }>): TitleCand[] {
  const out: TitleCand[] = [];
  const byY = cands.slice().sort((a, b) => a.y - b.y);
  const used = new Set<number>();
  for (let i = 0; i < byY.length; i++) {
    if (used.has(i)) continue;
    const chain = [byY[i]];
    let last = byY[i];
    for (let j = i + 1; j < byY.length && chain.length < 4; j++) {
      const c = byY[j];
      if (c.y - last.y > last.h * 2.2) break;
      if (c.y - last.y < last.h * 0.6) continue;
      if (Math.abs(c.h - last.h) > last.h * 0.15 || c.x > last.x1 || c.x1 < last.x) continue;
      chain.push(c); used.add(j); last = c;
    }
    if (chain.length < 2) continue;
    const text = chain.map((c) => c.text).join(" ");
    if (text.length > 110) continue;
    out.push({ text, h: Math.min(...chain.map((c) => c.h)), x: Math.min(...chain.map((c) => c.x)), y: chain[0].y, lines: chain.map((c) => c.text) });
  }
  return out;
}

/** The labels of a title block's sign-off row — the title sits just above it. */
const SIGN_OFF = /^(designed|drawn|checked|approved)$/i;
/**
 * A flat candidate just above a DESIGNED / DRAWN / CHECKED / APPROVED row, over the
 * same stretch of the sheet: a title block set in from the edge (a city standard plan
 * whose title sits at 80% across and down, where inTitleCorner doesn't reach).
 */
export function nearSignOff(c: { x: number; y: number }, items: TextItem[], pageH: number): boolean {
  const row = items.filter((i) => SIGN_OFF.test(i.str.replace(/[^A-Za-z]/g, "")));
  if (row.length < 2) return false;
  const x0 = Math.min(...row.map((i) => i.x)), x1 = Math.max(...row.map((i) => i.x + i.w));
  const y = Math.min(...row.map((i) => i.y));
  const pad = (x1 - x0) * 0.15;
  return c.x >= x0 - pad && c.x <= x1 + pad && c.y < y && c.y >= y - pageH * 0.15;
}

// Repeats are compared loosely — OCR reads the same name differently sheet to sheet
// ("KRESTENT. BR", "KRESTEN T. BROWN"): the first 8 letters.
const key = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
/**
 * A flat title candidate counts only in the title block itself — the far right
 * strip or the bottom band. Wider, the search reaches into the drawing and picks
 * up table headings ("LENGTH", "REMOVAL OF SIGNS" on Burgess Ave's summary sheet).
 */
export function inTitleCorner(c: { x: number; y: number }, pageW: number, pageH: number): boolean {
  return c.x >= pageW * 0.86 || c.y >= pageH * 0.88;
}

/**
 * Each sheet's title once the whole set's title blocks are read: the biggest
 * candidate that is NOT on most sheets — a firm's logo, the agency, the project
 * name repeat on every sheet; the title is what changes (Burgess Ave: "FORTE",
 * "DOTD" on all 74, "SUMMARY TABLES" on one).
 */
export function chooseTitles(sheets: Array<{ id: string; cands: Array<{ text: string; h: number; turned?: boolean; lines?: string[] }> }>): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (sheets.length < 3) { for (const s of sheets) out.set(s.id, s.cands[0]?.text ?? null); return out; }
  const seen = new Map<string, number>();
  for (const s of sheets) for (const k of new Set(s.cands.flatMap((c) => [c.text, ...(c.lines ?? [])]).map(key))) seen.set(k, (seen.get(k) ?? 0) + 1);
  // Boilerplate is on nearly every sheet (the firm, the project, the engineer). A common title
  // — "PLAN AND PROFILE" on a third of a road set — is not.
  const limit = Math.max(3, Math.ceil(sheets.length * 0.8));
  const common = (t: string) => (seen.get(key(t)) ?? 0) >= limit;
  // A title over several lines is the sheet's own only when none of its lines is boilerplate.
  const own = (c: { text: string; lines?: string[] }) => !common(c.text) && !(c.lines ?? []).some(common);
  // Which way does this set print its titles? The way whose titles are lettered biggest.
  const weight = (turned: boolean) => sheets.reduce((sum, s) => sum + (s.cands.find((c) => !!c.turned === turned && own(c))?.h ?? 0), 0);
  const turned = weight(true) > weight(false);
  for (const s of sheets) {
    const pick = s.cands.find((c) => !!c.turned === turned && own(c)) ?? s.cands.find(own);
    out.set(s.id, pick?.text ?? null);
  }
  return out;
}
