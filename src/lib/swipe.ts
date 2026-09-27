/**
 * What a finished swipe on a Threads row means (Coy, 2026-09-27):
 *   right  → open the four buckets (Customer · Vendor · Personal · Spam)
 *   left, all the way → accept Dusty's guess, only when the row shows one
 * Pure, so tests/swipe.test.mjs pins the thresholds.
 */

export const TRAY_PX = 256;        // four 64px bucket buttons
export const OPEN_AT_PX = 70;      // a right swipe past this locks the tray open
export const ACCEPT_AT = 0.6;      // a left swipe past this share of the row accepts

export type SwipeResult = "open" | "accept" | "close";

export function decideSwipe(dx: number, rowWidth: number, hasGuess: boolean): SwipeResult {
  if (dx >= OPEN_AT_PX) return "open";
  if (hasGuess && dx <= -ACCEPT_AT * rowWidth) return "accept";
  return "close";
}

/** Horizontal enough to be a swipe rather than a scroll. */
export function isHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > 10 && Math.abs(dx) > 1.5 * Math.abs(dy);
}

/** How far the row follows the finger: right up to the tray, left only with a guess. */
export function clampDrag(dx: number, rowWidth: number, hasGuess: boolean): number {
  if (dx > 0) return Math.min(dx, TRAY_PX + 24);
  return hasGuess ? Math.max(dx, -rowWidth) : Math.max(dx, -24);
}
