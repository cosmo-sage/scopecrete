/**
 * The What's next card's to-dos (Coy, 2026-10-15: "a lot of redundant repeat items … The list
 * items need less words"). Dusty re-words the same ask on each read ("Confirm AERIAL 2 = demo
 * only on the plan", then "Answer the demo-only question on AERIAL 2"), and contact_tasks'
 * title_key only catches the same words. Two to-dos are the same when the words that say what
 * it is about mostly match; the verbs that say what to do with it don't count.
 * `sameTask()` is copied into enrich-contacts/rules.ts so the reader stops adding repeats too.
 */

const FILLER = new Set([
  "a", "an", "the", "to", "on", "in", "at", "of", "for", "and", "or", "with", "by", "per", "from", "about", "if",
  "whether", "only", "his", "her", "their", "them", "our", "we", "us", "it", "is", "be", "this", "that", "which",
  "send", "confirm", "answer", "reply", "review", "check", "call", "ask", "get", "back", "question", "clarify",
  "follow", "up", "let", "know", "find", "out", "make", "sure", "see", "look", "give",
]);

/** The words that say what a to-do is about, lower case, a plural's "s" off. */
export function taskWords(title: string): Set<string> {
  const out = new Set<string>();
  for (const w of title.toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z0-9]+/)) {
    if (!w || FILLER.has(w)) continue;
    out.add(w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  }
  return out;
}

/** The same to-do worded twice: at least two words in common, 60% of the words between them. */
export function sameTask(a: string, b: string): boolean {
  const x = taskWords(a), y = taskWords(b);
  if (!x.size || !y.size) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both >= 2 && both / (x.size + y.size - both) >= 0.6;
}

/** First of each kept — the caller orders them (Coy's own first, then by due date, newest). */
export function dedupeTasks<T extends { title: string }>(tasks: T[]): T[] {
  const kept: T[] = [];
  for (const t of tasks) if (!kept.some((k) => sameTask(k.title, t.title))) kept.push(t);
  return kept;
}

/** Fewer words on the card: no "(#7)" asides, no "per Jeremy's 10/11 clarification" tails. */
export function shortTask(title: string): string {
  let t = title.replace(/\s*\([^)]*\)/g, "").replace(/\s+per\s+.+$/i, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^confirm whether\s+/i, "Confirm ");
  return t.replace(/[.;:,\s]+$/, "") || title;
}

/** 108's own "Finish scoping X: check their photos …" says what the Scope Builder step already says. */
export function repeatsStep(title: string): boolean {
  return /^finish scoping\b/i.test(title.trim());
}
