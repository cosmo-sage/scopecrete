/**
 * Dictating a section (Coy, 2026-09-28: "dictate into my phone the section
 * information and it will automatically put the length in the right box").
 *
 * Groq turns the audio into words; Dusty (Hermes) turns the words into
 * fields. This file is the guarantee between the model and the section: a
 * number is kept only if it was SAID — as digits or as words — so the model
 * can move a number into the right box but never invent one. Pure, so
 * tests/dictate.test.mjs runs it under node --test.
 */

export interface DictatedSection {
  name?: string | null;
  work_type?: string | null;
  length_ft?: number | null;
  width_ft?: number | null;
  depth_in?: number | null;
  psi?: number | null;
  reinforcement?: string | null;
  access_notes?: string | null;
}

export const DICTATE_WORK_TYPES = ["slab", "driveway", "patio", "sidewalk", "footing", "curb", "demo", "prep", "other"];

const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Every number said in the transcript: digits ("24", "4.5", "6x6") and words ("twenty four", "four and a half"). */
export function numbersSaid(text: string): number[] {
  const out: number[] = [];
  const t = text.toLowerCase().replace(/(\d),(\d{3})/g, "$1$2");
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  for (const m of t.matchAll(/(\d+)\s*(?:and\s+(?:a\s+)?)?(?:1\/2|a half|half)/g)) out.push(Number(m[1]) + 0.5);

  // Punctuation ends a number: "thirty, four inch" is 30 and 4, not 34.
  const words = t.replace(/-/g, " ").replace(/[,;:!?]|\.(?!\d)/g, " | ").split(/[^a-z0-9.|]+/).filter(Boolean);
  let cur: number | null = null;
  let total = 0;
  const flush = () => { if (cur !== null || total) { out.push(total + (cur ?? 0)); } cur = null; total = 0; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in ONES) {
      // A ones word only joins a bare tens ("twenty four"); "four four" is two numbers.
      if (cur !== null && !(cur % 100 >= 20 && cur % 10 === 0) && !(cur % 100 === 0 && cur >= 100)) flush();
      cur = (cur ?? 0) + ONES[w]; continue;
    }
    if (w in TENS) {
      if (cur !== null && !(cur % 100 === 0 && cur >= 100)) flush();
      cur = (cur ?? 0) + TENS[w]; continue;
    }
    if (w === "hundred" && cur !== null) { cur *= 100; continue; }
    if (w === "thousand" && cur !== null) { total += cur * 1000; cur = null; continue; }
    if (w === "and" && words[i + 1] === "a" && words[i + 2] === "half" && cur !== null) { out.push(total + cur + 0.5); i += 2; continue; }
    if (w === "and" && cur !== null && (words[i + 1] in ONES || words[i + 1] in TENS)) continue; // "one hundred and twenty"
    flush();
  }
  flush();
  return [...new Set(out)];
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Was this value said — directly, or as feet and inches ("24 feet 6" = 24.5)? */
export function wasSaid(v: number, said: number[]): boolean {
  if (said.some((s) => near(s, v))) return true;
  const ft = Math.floor(v);
  const inch = Math.round((v - ft) * 12 * 1000) / 1000;
  return inch > 0 && said.some((s) => near(s, ft)) && said.some((s) => near(s, inch));
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/**
 * The model's answer → a section patch. Anything not said, not sane or not
 * known is dropped, and the reason recorded.
 */
export function sanitizeDictation(p: DictatedSection, transcript: string, reinforcement: Array<{ id: string; name: string }>):
  { patch: Record<string, unknown>; dropped: string[] } {
  const said = numbersSaid(transcript);
  const patch: Record<string, unknown> = {};
  const dropped: string[] = [];

  const num = (k: "length_ft" | "width_ft" | "depth_in" | "psi", min: number, max: number) => {
    const v = p[k];
    if (v === null || v === undefined) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) { dropped.push(`${k}: ${v} is not a sane value`); return; }
    if (!wasSaid(n, said)) { dropped.push(`${k}: ${n} was never said`); return; }
    patch[k] = k === "psi" ? Math.round(n) : n;
  };
  num("length_ft", 0.1, 2000);
  num("width_ft", 0.1, 500);
  num("depth_in", 1, 48);
  num("psi", 2000, 10000);

  if (p.work_type) {
    const w = String(p.work_type).toLowerCase().trim();
    if (DICTATE_WORK_TYPES.includes(w)) patch.work_type = w;
    else dropped.push(`work_type: "${p.work_type}" is not a work type`);
  }
  const name = text(p.name, 80);
  if (name) patch.name = name;
  // The section's Notes (kept in access_notes; Coy, 2026-10-03: Prep and Access gave way to Notes).
  const notes = text(p.access_notes, 500);
  if (notes) patch.access_notes = notes;

  if (p.reinforcement) {
    const want = String(p.reinforcement).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const hit = want && reinforcement.find((r) => {
      const n = r.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return n === want || n.includes(want) || want.includes(n);
    });
    if (hit) patch.reinforcement_item_id = hit.id;
    else dropped.push(`reinforcement: "${p.reinforcement}" is not one of your reinforcement cards`);
  }
  return { patch, dropped };
}

export const DICTATE_SYSTEM = `You turn a concrete contractor's dictated note about ONE section of a job into fields. Return ONLY a JSON object, no prose:
{"name": string|null, "work_type": "slab|driveway|patio|sidewalk|footing|curb|demo|prep|other"|null, "length_ft": number|null, "width_ft": number|null, "depth_in": number|null, "psi": number|null, "reinforcement": string|null, "access_notes": string|null}
Rules:
- Only what was said. Anything not said is null. Never estimate, never fill a typical value.
- "24 by 30" = length_ft 24, width_ft 30. Feet and inches become decimal feet: "24 feet 6" = 24.5.
- depth_in is the slab thickness in inches ("four inch", "6 inches thick"). psi is concrete strength ("3000", "four thousand PSI").
- reinforcement: copy the words used for it ("6x6 10 gauge mesh", "#4 rebar at 18", "fiber"), or null.
- access_notes: the section's notes — anything else said about this area that isn't a field above (access, pump, gates, base, grading, demo, what the customer wants), in the words used.
- name: a short name if one was said ("front drive", "back patio"), else null.`;
