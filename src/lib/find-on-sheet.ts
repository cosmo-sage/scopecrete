/**
 * Where on a plan sheet a section's scope was read (Coy, 2026-10-09: "I need to be able to
 * verify … where the sections are on the plan set sheets that the job scope was pulled
 * from"). The bid reader keeps the exact line it took each section from (`source_ref`:
 * sheets · spec · "the line"). This finds that line among the sheet's own text and returns
 * a box round each place it is written — a drawing often labels the same thing in several
 * places, so every place that carries most of its words is marked. Nothing is guessed: no
 * match, no box. Pure, tested in tests/find-on-sheet.test.mjs.
 */

/** A run of text on the page, in points with y down (as pdf.ts reads them). */
export interface TextBox { str: string; x: number; y: number; w: number; h: number }
export interface Hit { x: number; y: number; w: number; h: number; words: number; of: number }

/** The quoted line on a section's bid reference, else null. */
export function quotedLine(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = /["“]([\s\S]+)["”]\s*$/.exec(ref.trim());
  const q = (m ? m[1] : "").replace(/[…]+$/, "").trim();
  return q.length >= 4 ? q : null;
}

const STOP = new Set(["THE", "OF", "FOR", "AND", "TO", "A", "AN", "IN", "ON", "AT", "WITH", "BY", "OR", "SEE", "REF"]);
const norm = (s: string) => s.toUpperCase().replace(/[‘’′'"“”″]/g, " ").replace(/[^A-Z0-9#]+/g, " ").trim();

export function findOnSheet(items: TextBox[], quote: string | null | undefined): Hit[] {
  if (!quote) return [];
  const q = norm(quote);
  const qWords = [...new Set(q.split(" ").filter((w) => w && !STOP.has(w)))];
  if (qWords.length < 1) return [];
  const padded = ` ${q} `;
  // Each run of text that is part of the line (or holds the whole line).
  const hits: Array<{ b: TextBox; words: Set<string> }> = [];
  for (const b of items) {
    const t = norm(b.str);
    if (!t) continue;
    const words = t.split(" ").filter((w) => !STOP.has(w));
    if (!words.length) continue;
    if (padded.includes(` ${t} `) || (q.length >= 8 && ` ${t} `.includes(padded))) {
      hits.push({ b, words: new Set(words.filter((w) => qWords.includes(w))) });
    }
  }
  if (!hits.length) return [];
  // Runs close together are one label: within a few lines of each other.
  const parent = hits.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const a = hits[i].b, c = hits[j].b;
      const h = Math.max(a.h, c.h, 4);
      const dx = Math.max(0, Math.max(a.x, c.x) - Math.min(a.x + a.w, c.x + c.w));
      const dy = Math.max(0, Math.max(a.y, c.y) - Math.min(a.y + a.h, c.y + c.h));
      if (dy <= h * 2.5 && dx <= h * 4) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Array<(typeof hits)[number]>>();
  hits.forEach((x, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), x]); });
  const need = Math.min(qWords.length, Math.max(2, Math.ceil(qWords.length * 0.5)));
  const out: Hit[] = [];
  for (const g of groups.values()) {
    const words = new Set<string>();
    g.forEach((x) => x.words.forEach((w) => words.add(w)));
    if (words.size < need) continue;
    const x0 = Math.min(...g.map((x) => x.b.x)), y0 = Math.min(...g.map((x) => x.b.y));
    const x1 = Math.max(...g.map((x) => x.b.x + x.b.w)), y1 = Math.max(...g.map((x) => x.b.y + x.b.h));
    const pad = Math.max(...g.map((x) => x.b.h)) * 0.4;
    out.push({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2, words: words.size, of: qWords.length });
  }
  // Fullest match first, then top to bottom.
  return out.sort((a, b) => b.words - a.words || a.y - b.y || a.x - b.x);
}
