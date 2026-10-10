/**
 * Reads a plan sheet's title block from the page's own text (migration 059) —
 * pure, tested in tests/plan-sheets.test.mjs. The browser pulls the text items
 * out of each PDF page with pdf.js and hands them here in page points (y down).
 *
 * What it finds is a first reading, labelled as such, and Coy's to correct:
 * the sheet number ("C-5", "A2.1"), its title, the discipline from the
 * number's prefix, and the printed scale. Nothing is made up — a page with no
 * number, title or scale says so.
 */

import { parsePrintedScale, type PrintedScale } from "./takeoff.ts";

export interface TextItem { str: string; x: number; y: number; w: number; h: number }

export const DISCIPLINES = {
  G: "General", C: "Civil", L: "Landscape", A: "Architectural", S: "Structural", M: "Mechanical",
  E: "Electrical", P: "Plumbing", FP: "Fire protection", T: "Telecom", I: "Interiors", D: "Demolition",
} as const;
export type Discipline = keyof typeof DISCIPLINES | "other";

export interface SheetReading {
  number: string | null;
  title: string | null;
  discipline: Discipline;
  scale: PrintedScale | null;
  /** Several different scales on one sheet and none in the title block — the Scale tool decides. */
  scale_note: string | null;
}

const NUMBER = /^(FP|[A-Z])[-.\s]?(\d{1,3}(?:\.\d{1,2})?[A-Z]?)$/;
const LABELS = /^(sheet|sheet\s*(no|number|title)|scale|date|drawn|checked|project|job|no\.?|rev(ision)?s?|title|issued?|by|description|approved|designed|drawing|dwg|of)\b[:.]?\s*$/i;

/**
 * Text a CAD program stamps on a printed sheet that is never its title: the
 * plot date and time ("Sep 22, 2026 - 12:04pm") and the drawing file's path
 * ("F:\\02020\\…\\Standards.dwg [101]"). On a set whose real lettering is
 * drawn as lines (no text layer), these are the only words left, and taking
 * them for titles made the sheets look digital, so they were never OCR'd
 * (Holden Pedestrian Bridge, 2026-10-10).
 */
export function isStampTitle(t: string | null | undefined): boolean {
  if (!t) return false;
  const s = t.trim();
  if (/\\|\.(dwg|dgn|dxf|pdf|plt)\b|^[A-Z]:[\\/]/i.test(s)) return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}\b/i.test(s) && /\d{1,2}:\d{2}/.test(s)) return true;
  if (/^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i.test(s)) return true;
  return false;
}

/** The prefix of a sheet number → its discipline. */
export function disciplineOf(number: string | null): Discipline {
  const m = number?.toUpperCase().match(/^(FP|[A-Z])/);
  if (!m) return "other";
  return (m[1] in DISCIPLINES ? m[1] : "other") as Discipline;
}

/** Items grouped into lines (same baseline), left to right. */
export function textLines(items: TextItem[]): Array<{ text: string; x: number; y: number; h: number }> {
  const sorted = items.filter((i) => i.str.trim()).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Array<{ items: TextItem[]; y: number; h: number }> = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) <= Math.max(2, Math.min(it.h, last.h) * 0.5)) { last.items.push(it); last.h = Math.max(last.h, it.h); }
    else lines.push({ items: [it], y: it.y, h: it.h });
  }
  // Words far apart on one baseline are separate lines (two detail titles side by side).
  const out: Array<{ text: string; x: number; y: number; h: number }> = [];
  for (const l of lines) {
    const its = l.items.sort((a, b) => a.x - b.x);
    let run: TextItem[] = [];
    const flush = () => { if (run.length) out.push({ text: run.map((i) => i.str.trim()).join(" ").replace(/\s+/g, " "), x: run[0].x, y: l.y, h: l.h }); run = []; };
    for (const it of its) {
      const prev = run[run.length - 1];
      if (prev && it.x - (prev.x + prev.w) > Math.max(prev.h, it.h) * 4) flush();
      run.push(it);
    }
    flush();
  }
  return out;
}

/** Where title blocks live: a strip down the right edge, or along the bottom. */
function inTitleBlock(i: { x: number; y: number }, w: number, h: number) {
  return i.x > w * 0.72 || i.y > h * 0.8;
}

export function readSheet(items: TextItem[], pageW: number, pageH: number): SheetReading {
  const clean = items.map((i) => ({ ...i, str: i.str.trim() })).filter((i) => i.str);

  // The sheet number: the biggest text that reads like one, title block first.
  const nums = clean.filter((i) => NUMBER.test(i.str.toUpperCase()) && !/^\d/.test(i.str));
  const pickNum = (xs: typeof nums) => xs.slice().sort((a, b) => b.h - a.h)[0];
  const numItem = pickNum(nums.filter((i) => inTitleBlock(i, pageW, pageH))) ?? null;
  const number = numItem ? numItem.str.toUpperCase().replace(/\s+/g, "") : null;

  // The title: the largest wording in the title block that isn't a label, a
  // date, a number or the sheet number — nearest the number when sizes tie.
  const lines = textLines(clean.filter((i) => inTitleBlock(i, pageW, pageH)));
  const cands = lines.filter((l) => {
    const t = l.text;
    if (!/[A-Za-z]{3}/.test(t) || t.length < 4 || t.length > 60) return false;
    if (LABELS.test(t)) return false;
    if (number && t.toUpperCase().replace(/\s+/g, "") === number) return false;
    if (/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(t) || /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(t) || /@|www\.|\.com\b/i.test(t)) return false;
    if (parsePrintedScale(t)) return false;
    if (isStampTitle(t)) return false;
    if (/^(sheet|scale|date|drawn|checked|project|job)\b/i.test(t)) return false;
    return true;
  });
  const ny = numItem?.y ?? pageH;
  cands.sort((a, b) => b.h - a.h || Math.abs(a.y - ny) - Math.abs(b.y - ny));
  const titleLine = cands.find((c) => !numItem || c.h < numItem.h * 1.01 || c.text.length > 6) ?? null;

  // The scale: a "SCALE" line in the title block wins; else the one scale the
  // page prints; several different ones → the Scale tool decides.
  const allLines = textLines(clean);
  const scaled = allLines.map((l) => ({ l, s: parsePrintedScale(l.text) })).filter((x): x is { l: typeof x.l; s: PrintedScale } => x.s !== null);
  const tb = scaled.find((x) => /scale/i.test(x.l.text) && inTitleBlock(x.l, pageW, pageH));
  let scale: PrintedScale | null = tb?.s ?? null;
  let note: string | null = null;
  if (!scale) {
    const real = scaled.filter((x) => x.s.kind === "scale");
    const distinct = [...new Set(real.map((x) => (x.s as { ft_per_pt: number }).ft_per_pt.toFixed(6)))];
    if (distinct.length === 1) scale = real[0].s;
    else if (distinct.length > 1) note = `${distinct.length} different scales on this sheet — set it with the Scale tool`;
    else if (scaled.length) scale = scaled[0].s;
  }

  return {
    number,
    title: titleLine ? titleLine.text : null,
    discipline: disciplineOf(number),
    scale,
    scale_note: note,
  };
}
