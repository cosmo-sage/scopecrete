/**
 * Add plans — the review step between picking a plan PDF and saving it (Coy, 2026-10-14:
 * "take a lesson from how jobtread handles plan uploads and autofills the names of the sheets
 * and autoscales if there is a scale"). Pure, tested in tests/plan-upload.test.mjs.
 *
 * Each page gets one name, "C3.0 PAVING AND JOINTING PLAN" (the sheet number and title its
 * title block prints), and a scale picked from the one it prints, Coy's to change before Save.
 * Save is his tap: the scale he leaves picked is set on the sheet.
 */

import { scaleLabel, type PrintedScale } from "./takeoff.ts";

export interface ScaleChoice { value: string; label: string; ft_per_pt: number | null }

/** "" = not picked, "none" = not to scale, else feet per point. */
export const NO_SCALE = "none";

const ARCH: Array<[string, number]> = [["1/16\" = 1'-0\"", 16], ["3/32\" = 1'-0\"", 32 / 3], ["1/8\" = 1'-0\"", 8], ["3/16\" = 1'-0\"", 16 / 3],
  ["1/4\" = 1'-0\"", 4], ["3/8\" = 1'-0\"", 8 / 3], ["1/2\" = 1'-0\"", 2], ["3/4\" = 1'-0\"", 4 / 3], ["1\" = 1'-0\"", 1], ["1 1/2\" = 1'-0\"", 2 / 3], ["3\" = 1'-0\"", 1 / 3]];
const ENG = [5, 10, 20, 30, 40, 50, 60, 100, 200];

const key = (ftPerPt: number) => ftPerPt.toPrecision(8);

/** The scales offered in every row's picker: engineering, then architectural. */
export const SCALE_CHOICES: ScaleChoice[] = [
  ...ENG.map((e) => ({ value: key(e / 72), label: `1" = ${e}'`, ft_per_pt: e / 72 })),
  ...ARCH.map(([l, ftPerIn]) => ({ value: key(ftPerIn / 72), label: l, ft_per_pt: ftPerIn / 72 })),
];

/** The picker's value for what a sheet prints: one of the list when it is one, else its own. */
export function scaleValue(s: PrintedScale | null | undefined): string {
  if (!s) return "";
  if (s.kind === "none") return NO_SCALE;
  const hit = SCALE_CHOICES.find((c) => c.ft_per_pt !== null && Math.abs(c.ft_per_pt - s.ft_per_pt) / c.ft_per_pt < 0.005);
  return hit ? hit.value : key(s.ft_per_pt);
}

/** The choices for one row: the list, with the printed scale added when it isn't on it. */
export function choicesFor(s: PrintedScale | null | undefined): ScaleChoice[] {
  const v = scaleValue(s);
  if (!v || v === NO_SCALE || SCALE_CHOICES.some((c) => c.value === v)) return SCALE_CHOICES;
  const ft = Number(v);
  return [{ value: v, label: s && s.kind === "scale" ? s.text || scaleLabel(ft) : scaleLabel(ft), ft_per_pt: ft }, ...SCALE_CHOICES];
}

/** What Save sets on the sheet for a picked value. */
export function scaleToSave(value: string, printed: PrintedScale | null | undefined):
  { scale_ft_per_pt: number | null; scale_method: "title_block" | "manual" | "none" } | null {
  if (!value) return null;
  if (value === NO_SCALE) return { scale_ft_per_pt: null, scale_method: "none" };
  const ft = SCALE_CHOICES.find((c) => c.value === value)?.ft_per_pt ?? Number(value);
  if (!(ft > 0) || !Number.isFinite(ft)) return null;
  const fromBlock = printed?.kind === "scale" && Math.abs(printed.ft_per_pt - ft) / ft < 0.005;
  return { scale_ft_per_pt: fromBlock ? (printed as { ft_per_pt: number }).ft_per_pt : ft, scale_method: fromBlock ? "title_block" : "manual" };
}

/** One name for a sheet, as JobTread shows it: "C3.0 PAVING AND JOINTING PLAN". */
export function sheetName(number: string | null | undefined, title: string | null | undefined): string {
  return [number?.trim(), title?.trim()].filter(Boolean).join(" ");
}

/** The name a page has before anything is read, or with Autofill off: "Plans.pdf (4)". */
export const placeholderName = (fileName: string, page: number) => `${fileName} (${page})`;

const NUMBER = /^(FP|[A-Z]{1,2})[-.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?$/i;

/** A name typed back into a sheet number and title: "C3.0 PAVING PLAN" → C3.0 + PAVING PLAN. */
export function splitName(name: string): { number: string | null; title: string | null } {
  const s = name.replace(/\s+/g, " ").trim();
  if (!s) return { number: null, title: null };
  const [first, ...rest] = s.split(" ");
  const bare = first.replace(/[-:–—]+$/, "");
  if (NUMBER.test(bare) && /\d/.test(bare)) {
    const title = rest.join(" ").replace(/^[-:–—]\s*/, "").trim();
    return { number: bare.toUpperCase().slice(0, 20), title: title ? title.slice(0, 120) : null };
  }
  return { number: null, title: s.slice(0, 120) };
}
