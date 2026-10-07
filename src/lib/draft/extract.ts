/**
 * Job → draft budget, step 1: what the job's own calls, texts and notes say
 * about the work (Coy's handoff, 2026-10-07: "It is easier to approve a
 * budget than build one in the field").
 *
 * Pure, so tests/draft.test.mjs runs it under node --test. The rule is the
 * dictation rule (src/lib/dictate.ts): a number is kept only if it is in a
 * line someone said or wrote, and every fact carries that line. Unknown is
 * not zero: a size with no thickness is an area and a question, never four
 * inches. Messages are data — nothing in them is an instruction to anyone.
 */

import { numbersSaid, wasSaid } from "../dictate.ts";

/** One line of evidence: a text, one line of a call transcript, a call summary, a note. */
export interface Evidence {
  /** messages.id, or "<message id>#L<n>" for a transcript line, or "note:<id>" / "job:<id>". */
  id: string;
  /** messages.id this came from (for the link), when it is one. */
  message_id: string | null;
  /** summary = a machine's words (a call summary, Dusty's job description): weaker than what was said. */
  kind: "text" | "call_line" | "summary" | "note" | "job";
  /** them = the customer; us = Coy's side on a call or text; coy = his own note or the job he typed. */
  who: "them" | "us" | "coy";
  at: string;
  text: string;
}

export type FactStatus = "customer_stated" | "contractor_stated" | "summary_only" | "recipe_assumed";

export interface Fact {
  /** length_ft · width_ft · sqft · depth_in · existing_depth_in · base_in · work · demo · psi */
  key: string;
  value: number | string | boolean;
  approximate: boolean;
  status: FactStatus;
  source_id: string;
  message_id: string | null;
  quote: string;
  at: string;
}

export interface AreaDraft {
  /** a1, a2 … in the order first heard. */
  key: string;
  name: string;
  work_type: string;
  length_ft: number | null;
  width_ft: number | null;
  /** Only when an area was given as an area (1,200 sq ft), not worked out from sides. */
  sqft: number | null;
  depth_in: number | null;
  facts: Fact[];
}

export interface Conflict {
  what: string;
  facts: Fact[];
}

export type JobKind = "driveway_replacement" | "driveway_new" | "flatwork" | "unsupported" | "unknown";

export interface Extraction {
  kind: JobKind;
  /** Why the kind was chosen, said plainly. */
  kind_reason: string;
  areas: AreaDraft[];
  /** Thickness of what is there now — never the new slab's. */
  existing_depth: Fact | null;
  demo: Fact | null;
  conflicts: Conflict[];
  questions: string[];
  /** Everything kept, for the panel. */
  facts: Fact[];
}

// ------------------------------------------------------------- words → digits

const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "thirty by forty" → "30 by 40", "a hundred and twenty" → "120". Only whole spoken numbers. */
export function wordsToDigits(text: string): string {
  const parts = text.split(/(\s+|-)/);
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const w = parts[i].toLowerCase().replace(/[^a-z]/g, "");
    const tail = parts[i].replace(/^[A-Za-z]+/, "");
    if (w in TENS || w in ONES || (w === "a" && /^hundred/i.test(parts[i + 2] ?? ""))) {
      let n = w in TENS ? TENS[w] : w in ONES ? ONES[w] : 1;
      let j = i + 1;
      let lastTail = tail;
      const peek = (k: number) => (parts[k] ?? "").toLowerCase().replace(/[^a-z]/g, "");
      if (w in TENS && /^(\s+|-)$/.test(parts[j] ?? "") && peek(j + 1) in ONES && ONES[peek(j + 1)] < 10 && !/[,.;:!?]$/.test(parts[i])) {
        n += ONES[peek(j + 1)]; lastTail = (parts[j + 1] ?? "").replace(/^[A-Za-z]+/, ""); j += 2;
      }
      if (/^\s+$/.test(parts[j] ?? "") && peek(j + 1) === "hundred" && !lastTail) {
        n *= 100; lastTail = (parts[j + 1] ?? "").replace(/^[A-Za-z]+/, ""); j += 2;
        let k = j;
        if (/^\s+$/.test(parts[k] ?? "") && peek(k + 1) === "and") k += 2;
        if (/^\s+$/.test(parts[k] ?? "") && (peek(k + 1) in TENS || peek(k + 1) in ONES)) {
          const v = peek(k + 1);
          n += v in TENS ? TENS[v] : ONES[v];
          lastTail = (parts[k + 1] ?? "").replace(/^[A-Za-z]+/, ""); j = k + 2;
        }
      }
      if (w === "a" && n === 1) { i++; out.push(parts[i - 1]); continue; }
      out.push(String(n) + lastTail);
      i = j;
      continue;
    }
    out.push(parts[i]);
    i++;
  }
  return out.join("");
}

// ------------------------------------------------------------- reading one line

const APPROX = /\b(roughly|about|around|approx(?:imately)?|maybe|probably|close to|give or take|or so|ish)\b|~|-ish\b/i;
const EXISTING = /\b(existing|current(?:ly)?|old|now|there now|right now|presently|today)\b/i;
const BASE = /\b(base|gravel|limestone|crush(?:ed)?|rock|sand|fill)\b/i;
const CORRECTION = /\b(actually|correction|sorry|i meant|my mistake|instead|scratch that|not \d+)\b/i;
const DEMO = /\b(tear (?:it )?out|tear up|teardown|tear down|rip (?:it )?out|break (?:it )?out|bust (?:it )?out|remove|removal|broke? (?:it )?up|broken up|pull(?:ed)? (?:it )?out|taken out|take (?:it )?out|re-?pour|demo(?:lish|lition)?|replace|replaced|replacing|replacement|redo|re-do|redone)\b/i;
const NEW_WORK = /\b(new|no concrete there|bare dirt|grass now|never been poured|extend|extension|add(?:ing)? a)\b/i;

const WORK_WORDS: Array<[RegExp, string, string]> = [
  [/\bdrive ?ways?\b|\bdrive\b/i, "driveway", "Driveway"],
  [/\bpatios?\b/i, "patio", "Patio"],
  [/\b(side ?walks?|walk ?ways?|walks?)\b/i, "sidewalk", "Walk"],
  [/\b(parking (?:pad|slab|area)|carport|slab|pad)\b/i, "slab", "Slab"],
];
const UNSUPPORTED = /\b(foundation|footings?|retaining wall|wall|steps|stairs|pool deck|stamped|exposed aggregate|epoxy|polish(?:ed|ing)?|resurfac(?:e|ing)|overlay|mud ?jack(?:ing)?|level(?:ing)?|crack repair|parking lot|commercial)\b/i;

const sentences = (t: string) => t.split(/(?<=[.!?\n])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const clip = (t: string) => (t.length > 220 ? `${t.slice(0, 217)}…` : t);

function statusOf(e: Evidence): FactStatus {
  if (e.kind === "summary") return "summary_only";
  return e.who === "them" ? "customer_stated" : "contractor_stated";
}

function fact(e: Evidence, key: string, value: Fact["value"], approximate: boolean, quote: string): Fact {
  return { key, value, approximate, status: statusOf(e), source_id: e.id, message_id: e.message_id, quote: clip(quote), at: e.at };
}

export interface Seen { work: string | null; name: string | null; facts: Fact[] }

/** Everything one line says. Pure; the caller orders lines oldest first. */
export function readLine(e: Evidence): Seen[] {
  const out: Seen[] = [];
  for (const raw of sentences(e.text)) {
    const s = wordsToDigits(raw).replace(/(\d),(\d{3})\b/g, "$1$2");
    const approx = APPROX.test(s);
    const work = WORK_WORDS.find(([re]) => re.test(s));
    // Every work word in the sentence, by where it is: a size goes to the nearest one
    // ("18 feet long, 6 feet wide for the patio, and the driveway …").
    const hits = WORK_WORDS.flatMap(([re, key, name]) => [...s.matchAll(new RegExp(re.source, "gi"))].map((m) => ({ at: m.index ?? 0, key, name })))
      .sort((a, b) => a.at - b.at);
    const facts: Fact[] = [];
    const where = new Map<Fact, number>();
    const put = (at: number, ...fs: Fact[]) => { for (const f of fs) { facts.push(f); where.set(f, at); } };

    // Sides: 30x40, 30 x 40, 30' x 40', 30 by 40, 30 ft by 40 ft. Never a mesh (6x6) or a lumber size (2x4).
    for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(?:'|’|ft\.?|feet|foot)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:'|’|ft\.?|feet|foot)?(?!\d|\.\d)/gi)) {
      const a = Number(m[1]), b = Number(m[2]);
      const end = (m.index ?? 0) + m[0].length;
      const around = s.slice(Math.max(0, (m.index ?? 0) - 12), end + 14).toLowerCase();
      if (/\bmesh|wire|rebar|\bbar\b|lumber|boards?\b|\bw\d/.test(around) || /^\s*("|”|in\b|inch)/i.test(s.slice(end, end + 6))) continue;
      if (!(a >= 3 && b >= 3 && a <= 1000 && b <= 1000)) continue;
      put(m.index ?? 0, fact(e, "length_ft", Math.max(a, b), approx, raw), fact(e, "width_ft", Math.min(a, b), approx, raw));
    }
    // "18 feet long, 6 feet wide" — both in one sentence.
    const long = s.match(/(\d+(?:\.\d+)?)\s*(?:'|’|ft\.?|feet|foot)\s+(?:long|in length)\b/i);
    const wide = s.match(/(\d+(?:\.\d+)?)\s*(?:'|’|ft\.?|feet|foot)\s+(?:wide|across|in width)\b/i);
    if (long && wide && !facts.some((f) => f.key === "length_ft")) {
      const L = Number(long[1]), W = Number(wide[1]);
      if (L >= 3 && W >= 3 && L <= 1000 && W <= 1000) put(long.index ?? 0, fact(e, "length_ft", L, approx, raw), fact(e, "width_ft", W, approx, raw));
    }
    // An area given as an area: 1200 sq ft, 1,200 square feet, 1200 sf.
    for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet|foot)|square\s*(?:feet|foot|ft)|sf\b|sqft\b)/gi)) {
      const v = Number(m[1]);
      if (v >= 9 && v <= 200000) put(m.index ?? 0, fact(e, "sqft", v, approx, raw));
    }
    // Thickness: 4 inch, 4", 4 in thick, 5-inch. The base's depth and what is there now are their own facts.
    for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(?:-?\s*inch(?:es)?\b|"|”|\s+in\.?(?=\s|$)\s*(?:thick|deep|slab)?)/gi)) {
      const v = Number(m[1]);
      if (!(v >= 2 && v <= 24)) continue;
      const at = m.index ?? 0;
      const around = s.slice(Math.max(0, at - 30), at + m[0].length + 30);
      const near = s.slice(Math.max(0, at - 12), at + m[0].length + 14);
      if (/\b(rebar|bar|pipe|drain|mesh|spacing|on cent|o\.?c\.?|apart|crack|gap|lip|step)\b/i.test(near)) continue;
      const key = BASE.test(around) ? "base_in" : EXISTING.test(around) ? "existing_depth_in" : "depth_in";
      put(at, fact(e, key, v, approx, raw));
    }
    for (const m of s.matchAll(/(\d{4})\s*psi\b/gi)) {
      const v = Number(m[1]);
      if (v >= 2000 && v <= 10000) put(m.index ?? 0, fact(e, "psi", v, false, raw));
    }
    const other: Fact[] = [];
    if (DEMO.test(s) && (work || /\b(concrete|slab|it|sections?)\b/i.test(s))) other.push(fact(e, "demo", true, false, raw));
    else if (NEW_WORK.test(s) && work) other.push(fact(e, "demo", false, false, raw));
    if (UNSUPPORTED.test(s)) other.push(fact(e, "unsupported", (s.match(UNSUPPORTED)?.[0] ?? "").toLowerCase(), false, raw));
    const kinds = [...new Map(hits.map((h) => [h.key, h])).values()];
    if (kinds.length <= 1) {
      if (work) facts.push(fact(e, "work", work[1], false, raw));
      facts.push(...other);
      if (facts.length) out.push({ work: work?.[1] ?? null, name: work?.[2] ?? null, facts });
      continue;
    }
    const nearest = (at: number) => hits.reduce((b, h) => (Math.abs(h.at - at) < Math.abs(b.at - at) ? h : b), hits[0]);
    for (const k of kinds) {
      const mine = facts.filter((f) => nearest(where.get(f) ?? 0).key === k.key);
      out.push({ work: k.key, name: k.name, facts: [fact(e, "work", k.key, false, raw), ...mine, ...(k === kinds[0] ? other : [])] });
    }
  }
  return out;
}

// ------------------------------------------------------------- the job's picture

const rank = (f: Fact) => (f.status === "contractor_stated" ? 3 : f.status === "customer_stated" ? 2 : 1);
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * Decide one value from every fact about it, oldest first. Coy's word beats
 * the customer's; a later correction ("actually 35") beats an earlier
 * statement of the same rank; otherwise two different values are a conflict,
 * and neither is used.
 */
export function settle(facts: Fact[]): { value: number | null; chosen: Fact | null; conflict: Fact[] | null } {
  const nums = facts.filter((f) => typeof f.value === "number");
  if (!nums.length) return { value: null, chosen: null, conflict: null };
  const top = Math.max(...nums.map(rank));
  const best = nums.filter((f) => rank(f) === top);
  let chosen = best[0];
  let conflict: Fact[] | null = null;
  for (const f of best.slice(1)) {
    if (same(f.value as number, chosen.value as number)) continue;
    if (CORRECTION.test(f.quote)) { chosen = f; conflict = null; continue; }
    conflict = [...(conflict ?? [chosen]), f];
  }
  if (conflict) return { value: null, chosen: null, conflict };
  return { value: chosen.value as number, chosen, conflict: null };
}

/**
 * Read every line and put together the areas, the kind of job and the
 * questions. `jobType` is jobs.job_type (residential / commercial / public).
 */
export function extract(evidence: Evidence[], jobType: string | null, extra: Seen[] = []): Extraction {
  const lines = [...evidence].sort((a, b) => a.at.localeCompare(b.at));
  // A model's reading (checked by modelSeen) adds to the plain reading; the same fact twice counts once.
  const keyOf = (f: Fact) => `${f.key}|${f.value}|${f.source_id}`;
  const plain = lines.flatMap(readLine);
  const have = new Set(plain.flatMap((x) => x.facts.map(keyOf)));
  const seen = [...plain, ...extra.map((x) => ({ ...x, facts: x.facts.filter((f) => !have.has(keyOf(f))) })).filter((x) => x.facts.length)]
    .sort((a, b) => (a.facts[0]?.at ?? "").localeCompare(b.facts[0]?.at ?? ""));
  const all = seen.flatMap((s) => s.facts);

  // Areas: one per kind of work heard; a size said in a line with no work word
  // belongs to the only area there is, or to a plain "Slab" when none is named.
  const byWork = new Map<string, { name: string; facts: Fact[] }>();
  for (const s of seen) {
    if (s.work) {
      if (!byWork.has(s.work)) byWork.set(s.work, { name: s.name ?? s.work, facts: [] });
      byWork.get(s.work)!.facts.push(...s.facts.filter((f) => ["length_ft", "width_ft", "sqft", "depth_in", "psi"].includes(f.key)));
    }
  }
  const loose = seen.filter((s) => !s.work).flatMap((s) => s.facts.filter((f) => ["length_ft", "width_ft", "sqft", "depth_in", "psi"].includes(f.key)));
  if (loose.length) {
    if (byWork.size === 1) [...byWork.values()][0].facts.push(...loose);
    else if (byWork.size === 0 && loose.some((f) => f.key !== "depth_in" && f.key !== "psi")) byWork.set("slab", { name: "Slab", facts: loose });
    // With two or more areas a loose size is not given to either: it becomes a question.
  }

  const conflicts: Conflict[] = [];
  const questions: string[] = [];
  const areas: AreaDraft[] = [];
  let n = 0;
  for (const [work, a] of byWork) {
    const pick = (key: string) => settle(a.facts.filter((f) => f.key === key));
    const L = pick("length_ft"), W = pick("width_ft"), S = pick("sqft"), D = pick("depth_in");
    for (const [label, r] of [["length", L], ["width", W], ["area", S], ["thickness", D]] as const) {
      if (r.conflict) {
        conflicts.push({ what: `${a.name} ${label}`, facts: r.conflict });
        questions.push(`${a.name}: they said ${r.conflict.map((f) => f.value).join(" and ")} for the ${label} — which is it?`);
      }
    }
    const kept = [L.chosen, W.chosen, S.chosen, D.chosen].filter((f): f is Fact => !!f);
    areas.push({
      key: `a${++n}`, name: a.name, work_type: work,
      length_ft: L.value !== null && W.value !== null ? L.value : null,
      width_ft: L.value !== null && W.value !== null ? W.value : null,
      sqft: L.value !== null && W.value !== null ? null : S.value,
      depth_in: D.value, facts: kept,
    });
    const sized = (L.value !== null && W.value !== null) || S.value !== null;
    if (!sized && !L.conflict && !W.conflict && !S.conflict) questions.push(`${a.name}: how big is it? (length and width, or the square feet)`);
    if (D.value === null && !D.conflict) questions.push(`${a.name}: how thick should the new concrete be?`);
    const approx = kept.filter((f) => f.approximate && ["length_ft", "width_ft", "sqft"].includes(f.key));
    if (approx.length) questions.push(`${a.name}: the size was given roughly ("${approx[0].quote}") — measure it on site.`);
  }
  if (loose.length && byWork.size >= 2) {
    questions.push(`A size was given without saying which area it is ("${loose[0].quote}") — which one?`);
  }

  const existingR = settle(all.filter((f) => f.key === "existing_depth_in"));
  const existing_depth = existingR.chosen;
  const demoFacts = all.filter((f) => f.key === "demo");
  const demo = demoFacts.length ? demoFacts.sort((a, b) => rank(b) - rank(a) || b.at.localeCompare(a.at))[0] : null;
  const unsupported = all.filter((f) => f.key === "unsupported");

  let kind: JobKind;
  let kind_reason: string;
  const works = [...byWork.keys()];
  if (jobType && jobType !== "residential") {
    kind = "unsupported"; kind_reason = `${jobType} jobs aren't drafted yet — only residential driveway replacement`;
  } else if (unsupported.length) {
    kind = "unsupported"; kind_reason = `they mentioned ${[...new Set(unsupported.map((f) => f.value))].join(", ")} ("${unsupported[0].quote}"), which the driveway recipe doesn't cover`;
  } else if (!works.length) {
    kind = "unknown"; kind_reason = "nothing in the calls or texts says what the work is";
    questions.unshift("What is the work? (a driveway, a patio, a walk…)");
  } else if (works.includes("driveway")) {
    if (demo?.value === true) { kind = "driveway_replacement"; kind_reason = `a driveway, with the old one coming out ("${demo.quote}")`; }
    else if (demo?.value === false) { kind = "driveway_new"; kind_reason = `a new driveway ("${demo.quote}")`; }
    else { kind = "driveway_replacement"; kind_reason = "a driveway; whether the old one comes out isn't said"; questions.push("Is there an old driveway to tear out and haul off?"); }
  } else {
    kind = "flatwork"; kind_reason = `${works.join(" and ")} — drafted with the driveway recipe's steps`;
    if (!demo) questions.push("Is there old concrete to tear out and haul off?");
  }
  if (demo?.value === true && !existing_depth && kind !== "unsupported") questions.push("How thick is the old concrete coming out? (for the haul-off)");

  return { kind, kind_reason, areas, existing_depth, demo, conflicts, questions: [...new Set(questions)], facts: all };
}

/** Is every number on this fact in its own quote? (A model's facts are checked the same way.) */
export function factHolds(f: Fact): boolean {
  if (typeof f.value !== "number") return true;
  const said = numbersSaid(wordsToDigits(f.quote));
  return wasSaid(f.value, said);
}

// ------------------------------------------------------------- a model's reading, checked

const MODEL_KEYS = new Set(["length_ft", "width_ft", "sqft", "depth_in", "existing_depth_in", "base_in", "psi", "work", "demo"]);
const WORK_NAME: Record<string, string> = { driveway: "Driveway", patio: "Patio", sidewalk: "Walk", slab: "Slab" };
const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Turn a model's JSON into facts — only those that hold: the line it cites
 * exists, the quote is really in that line, every number is in the quote, the
 * key and work type are known ones. Anything else is dropped, never repaired.
 * Shape: {"facts":[{"area":"driveway"|null,"key":"width_ft","value":30,"approximate":true,"source_id":"…","quote":"…"}]}
 */
export function modelSeen(json: unknown, evidence: Evidence[]): Seen[] {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const list = (json as { facts?: unknown })?.facts;
  if (!Array.isArray(list)) return [];
  const out: Seen[] = [];
  for (const r of list.slice(0, 60)) {
    const o = r as Record<string, unknown>;
    const e = typeof o.source_id === "string" ? byId.get(o.source_id) : undefined;
    const key = typeof o.key === "string" ? o.key : "";
    const quote = typeof o.quote === "string" ? o.quote.trim() : "";
    if (!e || !MODEL_KEYS.has(key) || quote.length < 3 || !squash(e.text).includes(squash(quote))) continue;
    const area = typeof o.area === "string" && o.area in WORK_NAME ? o.area : null;
    let value: Fact["value"];
    if (key === "work") { if (!area) continue; value = area; }
    else if (key === "demo") { if (typeof o.value !== "boolean") continue; value = o.value; }
    else { const n = Number(o.value); if (!Number.isFinite(n) || n <= 0) continue; value = n; }
    const f = fact(e, key, value, o.approximate === true || APPROX.test(quote), quote);
    if (!factHolds(f)) continue;
    out.push({ work: area, name: area ? WORK_NAME[area] : null, facts: [f] });
  }
  return out;
}
