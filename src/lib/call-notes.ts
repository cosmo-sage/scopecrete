/**
 * Notes taken during a call (Coy, 2026-10-03: "make notes on a live call so that
 * Dusty can finish putting the quote together … afterwards").
 *
 * Quo tells us about a call only once it is over, so a note written while the
 * phone is still at Coy's ear has no call to sit on yet. It is saved on the
 * person (contact_notes) and, once the finished call arrives, attached to the
 * call it was written during: the one whose ring-to-hang-up window, widened by a
 * little before and a quarter of an hour after, holds the moment the note was
 * started. A note that falls in no call's window stays a plain note on the
 * person — nothing is guessed. Pure; tests/call-notes.test.mjs runs it.
 */

export interface CallWindow { id: string; start: string; end: string }

/** A note started up to this long before the call rang is still about it (Coy opens the pad as it rings). */
export const BEFORE_MS = 2 * 60_000;
/** …and up to this long after he hangs up (the rest of the thoughts). */
export const AFTER_MS = 15 * 60_000;

/** The call a note started at `noteAt` belongs to, or null. Two candidates → the one that started last before the note. */
export function callForNote(noteAt: string, calls: CallWindow[]): string | null {
  const t = Date.parse(noteAt);
  if (!Number.isFinite(t)) return null;
  let best: { id: string; start: number } | null = null;
  for (const c of calls) {
    const s = Date.parse(c.start), e = Date.parse(c.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;
    if (t < s - BEFORE_MS || t > e + AFTER_MS) continue;
    // During a call beats the tail of the one before it.
    const during = t >= s - BEFORE_MS && t <= e;
    const score = during ? s + 1e15 : s;
    if (!best || score > best.start) best = { id: c.id, start: score };
  }
  return best?.id ?? null;
}

/** Quo's call.completed payload → the call's window, or null when it doesn't say. */
export function windowFromPayload(raw: unknown): { start: string; end: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const o = (r.data && typeof r.data === "object" && (r.data as Record<string, unknown>).object && typeof (r.data as Record<string, unknown>).object === "object"
    ? (r.data as { object: Record<string, unknown> }).object : r);
  const start = typeof o.createdAt === "string" ? o.createdAt : null;
  const end = typeof o.completedAt === "string" ? o.completedAt : null;
  if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) return null;
  return { start, end };
}

/** The question the "Draft the quote" tap puts in Dusty's box — Coy sends it. */
export function quoteQuestion(who: string, callAt: string | null): string {
  const when = callAt ? new Date(callAt).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return `Draft the quote from my call with ${who}${when ? ` (${when})` : ""}: use the transcript, the summary and my notes on the call, and what's measured in Takeoffs (the aerial). Make the areas the work needs and put the items on them from my Price book. Tell me what you couldn't find a number for.`;
}
