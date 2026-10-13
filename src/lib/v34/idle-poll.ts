"use client";

/**
 * Background polls slow down when nobody is at the screen (2026-10-12, Supabase's
 * Disk IO warning). A tab left visible overnight — a desktop monitor, the phone
 * app on a charger — kept asking the database every 15–20 s all night. After ten
 * minutes with no tap, click, key or scroll a poll that asks `shouldPoll()` runs
 * at most every five minutes; the first input brings it back at once.
 */
const IDLE_AFTER_MS = 10 * 60_000;
const IDLE_EVERY_MS = 5 * 60_000;

let lastInput = Date.now();
let wired = false;
const backers = new Set<() => void>();

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  const mark = () => {
    const was = Date.now() - lastInput >= IDLE_AFTER_MS;
    lastInput = Date.now();
    if (was) for (const fn of backers) fn();
  };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "scroll"]) {
    window.addEventListener(ev, mark, { passive: true, capture: true });
  }
}

/** Whether a poll last run at `lastRun` should run now: visible, and not idle unless five minutes have passed. */
export function shouldPoll(lastRun: number, now = Date.now()): boolean {
  wire();
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  if (now - lastInput < IDLE_AFTER_MS) return true;
  return now - lastRun >= IDLE_EVERY_MS;
}

/** Calls `fn` when the user comes back after being idle, so a screen can read at once. */
export function onBack(fn: () => void): () => void {
  wire();
  backers.add(fn);
  return () => { backers.delete(fn); };
}
