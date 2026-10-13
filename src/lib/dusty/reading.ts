/**
 * What Dusty is reading on a job, and how far along he is (Coy, 2026-10-12: "If
 * I'm looking at the files page of a job and dusty is reading the files. I
 * would like to open the dusty chat and see the specifics of what he's reading
 * and the status of the process"). Pure — tested in tests/dusty-reading.test.mjs.
 *
 * Two readers feed it:
 *   - the background file reader (read-files, every minute): each file's
 *     read_state, when the read started (read_at), its try (read_attempts, three
 *     at most — sc_files_claim, 080) and why it stopped (read_error);
 *   - the plan reader in the browser (plan-ocr-runner.ts): scanned drawings,
 *     title blocks first, then whole sheets, stamped ocr_title_at / ocr_at.
 * Everything here is read off those columns; nothing is guessed.
 */
import { isStampTitle } from "../plan-sheets.ts";

export interface ReadFile {
  id: string; name: string; category: string | null; kind: string | null;
  read_state: string | null; read_at: string | null; read_attempts: number | null; read_error: string | null;
  page_count: number | null; byte_size: number | null; fetch_state: string | null; created_at: string;
}
export interface ReadSheet {
  file_id: string; number: string | null; title: string | null; number_source: string | null;
  page_w: number; page_h: number; scale_ft_per_pt: number | null; scale_method: string | null;
  ocr_title_at: string | null; ocr_at: string | null;
}

export type RowTone = "now" | "wait" | "done" | "stop" | "warn";
export interface ReadRow { id: string; name: string; tone: RowTone; status: string; detail: string | null }

/** A drawing (longest side ≥ 1,150 pt, or scaled) — the same rule as the Plan Room's isDrawing(). */
const drawing = (s: ReadSheet) => Math.max(s.page_w, s.page_h) >= 1150 || !!s.scale_ft_per_pt || s.scale_method === "manual";

/** Scanned drawings: no text layer read off them (the same test as plan-ocr-runner's ocrPending). */
export function scannedSheets<T extends Pick<ReadSheet, "number" | "title" | "number_source" | "ocr_title_at">>(sheets: T[]): T[] {
  return sheets.filter((s) => s.number_source !== "coy" && (!!s.ocr_title_at || (!s.number && (!s.title || isStampTitle(s.title)))));
}

const mins = (ms: number) => Math.max(0, Math.round(ms / 60_000));
function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const m = mins(now - Date.parse(iso));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
const mb = (b: number | null) => (b && b > 0 ? `${(b / 1_048_576).toFixed(b < 10_485_760 ? 1 : 0)} MB` : null);

/** One file's line: what the background reader is doing with it. */
export function fileRow(f: ReadFile, now: number, ahead = 0): ReadRow {
  const tries = f.read_attempts ?? 0;
  const size = mb(f.byte_size);
  const base = { id: f.id, name: f.name };
  if (f.fetch_state && f.fetch_state !== "fetched") {
    return { ...base, tone: f.fetch_state === "failed" ? "stop" : "wait", status: f.fetch_state === "failed" ? "Couldn't copy it in" : "Still being copied in", detail: null };
  }
  switch (f.read_state) {
    case "reading": {
      const m = f.read_at ? mins(now - Date.parse(f.read_at)) : 0;
      const tryLine = `try ${Math.max(1, tries)} of 3`;
      // A read is one pass over the text and one model call — a few seconds to a minute and a half.
      // Past ten minutes the run stopped mid-read (sc_files_claim takes it again).
      if (m >= 10) return { ...base, tone: "warn", status: `Stopped mid-read ${m} min ago`,
        detail: tries >= 3 ? `${tryLine} — it will be marked not read on the next pass` : `${tryLine} — it will be tried again within a minute or two` };
      if (m >= 3) return { ...base, tone: "warn", status: `Reading · started ${m} min ago`, detail: `${tryLine} — longer than usual${size ? ` for ${size}` : ""}` };
      return { ...base, tone: "now", status: `Reading now · started ${ago(f.read_at, now)}`, detail: [size, tries > 1 ? tryLine : null].filter(Boolean).join(" · ") || null };
    }
    case "waiting":
      return { ...base, tone: "wait", status: ahead > 0 ? `Waiting · ${ahead} ahead of it` : "Next in line", detail: "the reader takes one every minute" };
    case "failed":
      return { ...base, tone: "stop", status: tries >= 3 ? "Couldn't read it" : `Couldn't read it — tries again 30 min after ${ago(f.read_at, now) || "the last try"}`,
        detail: f.read_error ?? null };
    case "skipped":
      return { ...base, tone: f.category === "plan" ? "done" : "stop", status: f.category === "plan" ? "Plan sheets — read below, sheet by sheet" : "Not read", detail: f.category === "plan" ? null : f.read_error ?? null };
    case "read":
      return { ...base, tone: "done", status: `Read ${ago(f.read_at, now)}`.trim(), detail: f.page_count ? `${f.page_count} page${f.page_count === 1 ? "" : "s"}` : null };
    default:
      return { ...base, tone: "wait", status: "Not read yet", detail: null };
  }
}

const ORDER: Record<RowTone, number> = { now: 0, warn: 1, wait: 2, stop: 3, done: 4 };

/** Every file's line, the ones being read first; waiting files in the order they will be taken. */
export function fileRows(files: ReadFile[], now: number): ReadRow[] {
  const queue = files.filter((f) => f.read_state === "waiting").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const place = new Map(queue.map((f, i) => [f.id, i]));
  return files.map((f) => fileRow(f, now, place.get(f.id) ?? 0))
    .sort((a, b) => ORDER[a.tone] - ORDER[b.tone] || (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0));
}

export interface SheetProgress { scans: number; titles: number; read: number; drawings: number }

/** The plan reader's progress on this job's drawings, from what has been saved. */
export function sheetProgress(sheets: ReadSheet[], inRoom: Set<string>): SheetProgress {
  const drawings = sheets.filter((s) => inRoom.has(s.file_id) && drawing(s));
  const scans = scannedSheets(drawings);
  return { drawings: drawings.length, scans: scans.length, titles: scans.filter((s) => s.ocr_title_at).length, read: scans.filter((s) => s.ocr_at).length };
}

/** One line on the plan sheets. `live` is the browser reader's own label while it runs on this job. */
export function sheetLine(p: SheetProgress, live: string | null): { tone: RowTone; status: string; detail: string | null } | null {
  if (live) return { tone: "now", status: live, detail: `${p.read} of ${p.scans} scanned sheets read so far` };
  if (!p.scans) return p.drawings ? { tone: "done", status: `${p.drawings} drawing${p.drawings === 1 ? "" : "s"} — their words came with the PDF`, detail: null } : null;
  if (p.read >= p.scans) return { tone: "done", status: `All ${p.scans} scanned sheets read`, detail: null };
  return { tone: "wait", status: `${p.read} of ${p.scans} scanned sheets read${p.titles > p.read ? ` · ${p.titles} titles read` : ""}`,
    detail: "These are read in your browser, not in the background: open Files or Takeoffs on a computer, or tap Read the rest on a phone." };
}

/** The counts for the header: "1 reading · 2 waiting · 5 read". */
export function readingSummary(rows: ReadRow[]): string {
  const n = (t: RowTone[]) => rows.filter((r) => t.includes(r.tone)).length;
  return [[n(["now", "warn"]), "reading"], [n(["wait"]), "waiting"], [n(["done"]), "read"], [n(["stop"]), "not read"]]
    .filter(([c]) => (c as number) > 0).map(([c, w]) => `${c} ${w}`).join(" · ");
}

/** Whether anything is still moving, so the chat keeps checking. */
export const stillReading = (rows: ReadRow[]) => rows.some((r) => r.tone === "now" || r.tone === "warn" || r.tone === "wait");
