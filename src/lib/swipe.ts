/**
 * What a finished swipe on a Threads row means:
 *   right → open the four buckets (Customer · Vendor · Personal · Spam) — Coy, 2026-09-27
 *   left  → open Spam and Archive behind the row — Coy, 2026-10-05 (it used to
 *           file Dusty's guess; the guess is still marked in the buckets)
 * Pure, so tests/swipe.test.mjs pins the thresholds.
 */

export const TRAY_PX = 256;        // four 64px bucket buttons
export const ACTIONS_PX = 152;     // Spam · Archive, 76px each
export const OPEN_AT_PX = 70;      // a swipe past this locks its tray open

export type SwipeResult = "open" | "actions" | "close";

/** dx is where the row ended up (already counting a tray that was open). */
export function decideSwipe(dx: number): SwipeResult {
  if (dx >= OPEN_AT_PX) return "open";
  if (dx <= -OPEN_AT_PX) return "actions";
  return "close";
}

/** Horizontal enough to be a swipe rather than a scroll. */
export function isHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > 10 && Math.abs(dx) > 1.5 * Math.abs(dy);
}

/** How far the row follows the finger: right up to the buckets, left up to Spam · Archive. */
export function clampDrag(dx: number): number {
  return dx > 0 ? Math.min(dx, TRAY_PX + 24) : Math.max(dx, -(ACTIONS_PX + 24));
}
