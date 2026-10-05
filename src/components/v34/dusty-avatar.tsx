"use client";

/**
 * Dusty — the Scopecrete Lander (Claude Design package 2026-10-04,
 * `design/dusty-lander/`): a hatched concrete block on steel legs with
 * green-light eyes, a dish antenna and an orange ring. Replaces the pixel
 * foreman. He lives in two places only (Coy, 2026-09-30): the centre of the
 * phone footer (the header button on a desktop) and the chat window.
 *
 * Drawn inline from `dustySvg()` (src/lib/v34/dusty-svg.ts), so a state swaps
 * without reloading an image. `prefers-reduced-motion` stills him.
 *
 * States are driven only by real events, never by a timer pretending to work:
 *   idle        — default (at 24 px and under he stands still)
 *   loading     — listening: the dish wobbles (a chat loading, a voice note)
 *   calculating — sorting: the ring spins (a reply streams, the reader reads)
 *   thinking    — scanning
 *   done        — celebrates once, then idle
 *   error       — alert (amber eyes) for a moment, then idle
 * Any of the package's own modes (listen, sort, scan, land, celebrate, alert,
 * sleep, static) may be passed directly too.
 */

import React, { useEffect, useId, useMemo, useState } from "react";
import { dustySvg, type DustyMode } from "@/lib/v34/dusty-svg";

export type DustyState = "idle" | "loading" | "calculating" | "done" | "error" | "thinking" | DustyMode;

const MODE: Record<string, DustyMode> = { loading: "listen", calculating: "sort", thinking: "scan", done: "celebrate", error: "alert" };
const LABEL: Record<string, string> = {
  idle: "Dusty", loading: "Dusty is loading", calculating: "Dusty is working", done: "Dusty finished",
  error: "Dusty hit a snag", thinking: "Dusty is thinking", listen: "Dusty is listening", sort: "Dusty is sorting",
  scan: "Dusty is scanning", land: "A new job landed", celebrate: "Dusty is celebrating", alert: "Dusty needs you",
  sleep: "Dusty is asleep", static: "Dusty",
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
  const uid = useId();
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

  let mode: DustyMode = resting ? "idle" : MODE[state] ?? (state as DustyMode);
  // Small and idle, or asked to hold still: no animation at all.
  if (reduced || stillProp || (size <= 24 && mode === "idle")) mode = "static";
  const label = LABEL[state] ?? "Dusty";
  const html = useMemo(() => dustySvg(mode, { size, id: uid, title: hidden ? false : label }), [mode, size, uid, hidden, label]);
  // Crossfade on every change of what is shown (200 ms, .sc-dusty).
  return (
    <span className={`sc-dusty ${className ?? ""}`} key={mode} role={hidden ? undefined : "img"} aria-label={hidden ? undefined : label}
      aria-hidden={hidden || undefined} style={{ display: "inline-flex", width: size, height: size, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
