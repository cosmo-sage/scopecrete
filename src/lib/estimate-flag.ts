/**
 * Dusty's estimates, marked (Coy, 2026-10-09: "I want him to estimate based on
 * best guesses in some cases. And I want him to do research on the internet").
 *
 * A number Dusty puts on a budget that nobody said or wrote — a quantity worked
 * out, a price from the web or a rule of thumb — carries its basis in the line's
 * (or item's) description as "Estimate — <basis>". The budget shows it as an
 * Estimate until Coy taps Confirm, which takes the mark off; approval waits for
 * it, and the proposal never shows it. No migration: the description is where a
 * line's note already lives. Pure — tests/estimate-flag.test.mjs runs it.
 */

export const ESTIMATE_MARK = "Estimate — ";
const MARK_RE = /(?:^|\s·\s)Estimate — [^]*$/;

/** The basis as given, cleaned and capped; null when there is none. */
export function cleanBasis(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().replace(/^estimate\s*[—:-]\s*/i, "");
  return t ? t.slice(0, 240) : null;
}

/** A description with the estimate mark added after any note already there. */
export function markEstimate(description: string | null | undefined, basis: string): string {
  const note = unmark(description);
  return `${note ? `${note} · ` : ""}${ESTIMATE_MARK}${basis}`.slice(0, 500);
}

export function isEstimate(description: string | null | undefined): boolean {
  return !!description && MARK_RE.test(description);
}

/** The basis on a marked description, else null. */
export function estimateBasis(description: string | null | undefined): string | null {
  if (!description) return null;
  const i = description.lastIndexOf(ESTIMATE_MARK);
  return i < 0 || !isEstimate(description) ? null : description.slice(i + ESTIMATE_MARK.length).trim() || null;
}

/** The description without the mark — what Confirm saves and what the proposal shows. */
export function unmark(description: string | null | undefined): string | null {
  if (!description) return null;
  const t = description.replace(MARK_RE, "").trim();
  return t || null;
}
