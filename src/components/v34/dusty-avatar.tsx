"use client";

/**
 * Dusty is the ScopeCrete emblem (Coy, 2026-10-10: "replace the dusty
 * character with the new emblem") — the 4e rings round the green light,
 * where the Lander (Claude Design 2026-10-04) stood: the centre of the phone
 * footer, the header button on a desktop, and the chat window.
 *
 * States still come only from real events, never a timer pretending to work:
 *   idle                 — the rings turn slowly (still under reduced motion)
 *   working (loading, calculating, thinking, listen, sort, scan) — the light glows
 *   done                 — one green flash, then idle
 *   error / alert        — an amber flash for a moment, then idle
 *   static / sleep       — still
 */

import { useEffect, useState } from "react";
import { Emblem } from "@/components/site/marks";
import type { DustyMode } from "@/lib/v34/dusty-svg";

export type DustyState = "idle" | "loading" | "calculating" | "done" | "error" | "thinking" | DustyMode;

const MODE: Record<string, DustyMode> = { loading: "listen", calculating: "sort", thinking: "scan", done: "celebrate", error: "alert" };
const LABEL: Record<string, string> = {
  idle: "Dusty", loading: "Dusty is loading", calculating: "Dusty is working", done: "Dusty finished",
  error: "Dusty hit a snag", thinking: "Dusty is thinking", listen: "Dusty is listening", sort: "Dusty is sorting",
  scan: "Dusty is scanning", land: "A new job landed", celebrate: "Dusty is celebrating", alert: "Dusty needs you",
  sleep: "Dusty is asleep", static: "Dusty",
};
/** The glow under the emblem for each kind of work (v34-shell.css). */
const WORK: Record<string, string> = {
  listen: "sc-dusty-work", sort: "sc-dusty-work", scan: "sc-dusty-work",
  celebrate: "sc-dusty-done", land: "sc-dusty-done", alert: "sc-dusty-alert",
};
/** How long a one-shot plays before he goes back to idle. */
const SHOT_MS: Record<string, number> = { done: 3200, error: 2400, land: 2800 };

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function DustyAvatar({ state = "idle", size = 48, hidden, className, still: stillProp }: {
  state?: DustyState; size?: number;
  /** Never animate. */
  still?: boolean;
  /** Decorative (inside a button that carries its own label). */
  hidden?: boolean; className?: string;
}) {
  const reduced = useReducedMotion();
  // One-shots play, then he rests.
  const [resting, setResting] = useState(false);
  const [seen, setSeen] = useState(state);
  if (state !== seen) { setSeen(state); setResting(false); }
  useEffect(() => {
    const ms = SHOT_MS[state];
    if (!ms || resting) return;
    const t = setTimeout(() => setResting(true), ms);
    return () => clearTimeout(t);
  }, [state, resting]);

  const mode: DustyMode = resting ? "idle" : MODE[state] ?? (state as DustyMode);
  const label = LABEL[state] ?? "Dusty";
  const still = reduced || stillProp || mode === "static" || mode === "sleep";
  const work = still ? "" : WORK[mode] ?? "";
  return (
    <span className={`sc-dusty ${work} ${className ?? ""}`} key={mode} role={hidden ? undefined : "img"} aria-label={hidden ? undefined : label}
      aria-hidden={hidden || undefined} style={{ display: "inline-flex", width: size, height: size, flexShrink: 0, borderRadius: "50%" }}>
      <Emblem size={size} spin={!still} />
    </span>
  );
}
