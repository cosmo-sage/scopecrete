/**
 * Dusty's hello when a chat opens empty (Coy, 2026-10-05: "a personalized
 * message from Dusty … Hey Coy … something subtle to greet and to maybe make
 * me smile"). No model call: the words are his own thoughts already written
 * by the background reader (musings, 039) and the dreams (058), as
 * /api/activity serves them. Pure, so it is tested.
 */

export interface Thought { id: string; at: string; summary: string; detail?: string | null; contact_id?: string | null }

/** "Coy Sacco" → "Coy"; an email or nothing → null (no made-up name). */
export function firstName(name: string | null | undefined): string | null {
  const w = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!w || w.includes("@") || !/^\p{L}/u.test(w)) return null;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Morning / Afternoon / Evening in Central time, the business's clock. */
export function partOfDay(now: Date): "Morning" | "Afternoon" | "Evening" {
  const h = Number(now.toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Chicago" }));
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

export function greeting(name: string | null, now: Date): string {
  const first = firstName(name);
  return first ? `Hey ${first}.` : `${partOfDay(now)}.`;
}

/**
 * Which thought to show: one about the person the page is on, else one of the
 * newest few (r in [0,1) picks, so it isn't the same line on every opening).
 */
export function pickThought(thoughts: Thought[], r: number, contactId?: string | null): Thought | null {
  const ok = thoughts.filter((t) => t.summary?.trim());
  if (!ok.length) return null;
  const sorted = [...ok].sort((a, b) => b.at.localeCompare(a.at));
  const about = contactId ? sorted.filter((t) => t.contact_id === contactId) : [];
  const pool = (about.length ? about : sorted).slice(0, 5);
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}

/** "From reading Dylan Ordoyne's calls and texts" → "reading Dylan Ordoyne's calls and texts". */
export function thoughtSource(detail: string | null | undefined): string | null {
  const d = (detail ?? "").trim();
  if (!d) return null;
  return d.replace(/^From /, "").replace(/^A dream/, "a dream");
}

/** With nothing new to mention: a short line, still his voice. */
export const QUIET_LINES = [
  "Nothing new to report. The concrete's curing and so am I.",
  "Quiet out there. Good day to finally name a few of those unknown numbers.",
  "All caught up. I've been staring at the Price book for fun.",
];
