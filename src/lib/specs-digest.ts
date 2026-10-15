/**
 * "Specs - read by Dusty" (Coy, 2026-10-12: "Looks like the specifications file
 * was too big to be read on the server. I would like the concrete specs to be
 * consolidated into a new file called Specs - read by dusty. And can be added to
 * the summary page of the job."). A spec book is hundreds of pages; the
 * concrete is a few sections of it. This keeps the pages that are about
 * concrete — every page of a Division 03 section, concrete paving, curbs and
 * walks, and any other page that keeps talking about concrete — word for word,
 * labelled with the book, the page and the section, as one Markdown file the
 * background reader (read-files) can read. Pure — tested in
 * tests/specs-digest.test.mjs.
 */

export const DIGEST_NAME = "Specs - read by Dusty.md";
/** source_url on the digest's files row, so it is found again and replaced, never doubled. */
export const DIGEST_SOURCE = "specs_digest:";
/** What one digest may hold — Dusty's context carries ~30k of it, the file keeps the rest. */
export const DIGEST_MAX_CHARS = 150_000;

/** The concrete words the bid reader looks for (bid-intake's CONCRETE), counted per page. */
const CONCRETE = /\bconcrete\b|\bpsi\b|\brebar\b|\breinforc|\bslab\b|\bfooting|\bfoundation|\bpaving\b|\bpavement\b|\bcurb\b|\bgutter\b|\bsidewalk|\bdriveway|\bapron\b|\bpier\b|\bgrade beam|\bwwf\b|\bwelded wire|\bvapor (barrier|retarder)|\bsaw ?cut|\bcontrol joint|\bexpansion joint|\bcuring\b|\bslump\b|\bportland\b|\bfly ash\b|\bair[- ]entrain/gi;

/** Section numbers (MasterFormat) that are concrete work. */
export function concreteSection(sec: string | null): boolean {
  if (!sec) return false;
  const [d, s] = sec.split(" ");
  if (d === "03") return true;
  // 32 13 xx rigid paving; 32 16 xx curbs, gutters, sidewalks and driveways.
  return d === "32" && (s === "13" || s === "16");
}

/** The MasterFormat section a page belongs to, read off its heading or footer: "03 30 00". */
export function sectionOf(text: string): string | null {
  const head = text.match(/\bSECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})(?![\d])/i);
  if (head) return `${head[1]} ${head[2]} ${head[3]}`;
  // A footer: "03 30 00 - 5" or "033000-5".
  const foot = text.match(/\b(\d{2}) ?(\d{2}) ?(\d{2})\s*[-–]\s*\d{1,3}\b/);
  if (foot) return `${foot[1]} ${foot[2]} ${foot[3]}`;
  // Older five-digit sections: "SECTION 03300".
  const old = text.match(/\bSECTION\s+(\d{2})(\d)(\d{2})\b/i);
  if (old) return `${old[1]} ${old[2]}${old[3][0]} ${old[3][1]}0`;
  return null;
}

export const concreteHits = (text: string) => (text.match(CONCRETE) ?? []).length;

export interface DigestPage { book: string; page: number; section: string | null; hits: number; text: string; sheet?: string | null }

/**
 * The pages worth keeping from one book: a page carries the section of the last
 * heading above it (a section runs on over many pages); a concrete section is
 * kept whole, a page of no section with three concrete words or more is kept,
 * and a page of another section only when it talks about concrete five times.
 */
export function pickPages(book: string, pages: string[]): DigestPage[] {
  const out: DigestPage[] = [];
  let sec: string | null = null;
  pages.forEach((raw, i) => {
    const text = tidy(raw);
    const found = sectionOf(text);
    if (found) sec = found;
    const hits = concreteHits(text);
    const keep = concreteSection(sec) ? text.length > 40 : sec ? hits >= 5 : hits >= 3;
    if (keep) out.push({ book, page: i + 1, section: sec, hits, text });
  });
  return out;
}

/** Page text as pdf.js gives it, without runs of blank lines or trailing spaces. */
export function tidy(text: string): string {
  return text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * A plan set's concrete notes (Coy, 2026-10-15: "i'm not seeing the spec notes
 * on the job" — HPC Ascension Campus has no spec book; its concrete specs are
 * the numbered notes on the civil sheets: "7. NEW SITE PAVEMENT SHALL BE 4000
 * PSI CONCRETE …"). A drawing's words are mostly labels, so only its numbered
 * notes are kept — each with the lines that run on until it ends with a period —
 * and only those that talk about concrete, under the NOTES heading above them,
 * each note once (`seen`, shared across a job's plan sets).
 */
const NOTE_HEAD = /^[A-Z0-9 &,/'()-]*\bNOTES?\b[A-Z0-9 &,/'()-]*:?$/;
const NOTE_START = /^(\(?\d{1,2}[.)]\s*|[A-Z][.)]\s+)\S/;
/** A note has words, not a run of elevations ("17.62") or dimensions. */
const wordy = (line: string) => (line.match(/[A-Za-z]{2,}/g) ?? []).length >= 2;
const noteKey = (t: string) => t.replace(/^\(?\d{1,2}[.)]\s*|^[A-Z][.)]\s+/, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();

export function pickNotes(book: string, pages: string[], sheets: Map<number, string> = new Map(), seen: Set<string> = new Set()): DigestPage[] {
  const out: DigestPage[] = [];
  pages.forEach((raw, i) => {
    const lines = tidy(raw).split("\n").map((l) => l.trim()).filter(Boolean);
    const groups: Array<{ head: string | null; notes: string[] }> = [];
    let head: string | null = null;
    let cur: string[] | null = null;
    const flush = () => {
      // The same notes are printed on sheet after sheet: each is kept once, where it first appears.
      const key = cur ? noteKey(cur.join(" ")) : "";
      if (cur && concreteHits(cur.join(" ")) > 0 && !seen.has(key)) {
        seen.add(key);
        const last = groups[groups.length - 1];
        const text = cur.join(" ");
        if (last && last.head === head) last.notes.push(text); else groups.push({ head, notes: [text] });
      }
      cur = null;
    };
    for (const line of lines) {
      if (line.length < 60 && NOTE_HEAD.test(line)) { flush(); head = line.replace(/:$/, ""); continue; }
      if (NOTE_START.test(line) && wordy(line)) { flush(); cur = [line]; continue; }
      const c = cur as string[] | null;
      if (c && !/[.;]$/.test(c[c.length - 1]) && c.length < 12) c.push(line);
      else flush();
    }
    flush();
    if (!groups.length) return;
    const text = groups.map((g) => (g.head ? `**${g.head}**\n\n` : "") + g.notes.join("\n")).join("\n\n");
    out.push({ book, page: i + 1, section: null, hits: concreteHits(text), text, sheet: sheets.get(i + 1) ?? null });
  });
  return out;
}

export interface DigestBook { name: string; pages: number; kept: DigestPage[]; plans?: boolean }

/** The Markdown file: what it is, the sections kept, then each page as printed. */
export function buildDigest(books: DigestBook[], made: Date, max = DIGEST_MAX_CHARS): { text: string; pages: number; sections: string[]; left: number } {
  const sections = [...new Set(books.flatMap((b) => b.kept.map((p) => p.section).filter((s): s is string => !!s && concreteSection(s))))].sort();
  const kept = books.flatMap((b) => b.kept);
  const specs = books.filter((b) => !b.plans);
  const plans = books.filter((b) => b.plans);
  const day = made.toISOString().slice(0, 10);
  const lines = ["# Specs - read by Dusty", ""];
  if (specs.length) lines.push(`The concrete pages of ${specs.map((b) => `${b.name} (${b.kept.length} of ${b.pages} pages)`).join("; ")}, copied word for word on ${day}. The book${specs.length === 1 ? " was" : "s were"} too big to read whole; this file keeps every page of a concrete section${sections.length ? ` (${sections.join(", ")})` : ""} and any other page that talks about concrete. Check anything you price against the book itself.`, "");
  if (plans.length) lines.push(`The notes about concrete on the sheets of ${plans.map((b) => `${b.name} (${b.kept.length} of ${b.pages} sheets)`).join("; ")}, copied word for word on ${day}. The job has no spec book filed, so these notes are its concrete specs. Check anything you price against the sheet itself.`, "");
  const head = lines.join("\n");
  let body = "";
  let used = 0;
  for (const p of kept) {
    const block = `## ${p.book} · ${p.sheet ? `Sheet ${p.sheet} · ` : ""}p.${p.page}${p.section ? ` · Section ${p.section}` : ""}\n\n${p.text}\n\n`;
    if (head.length + body.length + block.length > max) break;
    body += block;
    used++;
  }
  const left = kept.length - used;
  const tail = left ? `\n(${left} more concrete page${left === 1 ? "" : "s"} left out for room — open the book for ${left === 1 ? "it" : "them"}.)\n` : "";
  return { text: head + "\n" + body.trimEnd() + "\n" + tail, pages: used, sections, left };
}
