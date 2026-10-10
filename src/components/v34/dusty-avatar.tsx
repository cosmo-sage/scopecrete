"use client";

/**
 * Dusty is the ScopeCrete emblem (Coy, 2026-10-10), and the emblem shows what
 * he is doing (Claude Design "Emblem States", 2026-10-10) — the rings, the
 * light and the dust, in the activity line's colours. Eight states
 * (`Emblem` in site/marks.tsx draws them), driven only by real events, never a
 * timer pretending to work:
 *   idle       default
 *   listening  the chat box has words in it, or a voice note is recording
 *   thinking   a question sent, nothing streaming yet
 *   reading    the background reader has a read claimed
 *   answering  his reply streaming
 *   done       a finished write — plays once (1.3 s), then idle
 *   warn       the reader is broken, a failed call
 *   sleeping   the reader is off
 * The old state names still work (loading → listening, calculating →
 * answering, error → warn …) so callers didn't all have to change.
 */

import { useEffect, useState } from "react";
import { Emblem, type EmblemState } from "@/components/site/marks";

export type { EmblemState };
export type DustyState = EmblemState
  | "loading" | "calculating" | "error" | "sleep" | "scan" | "listen" | "sort" | "celebrate" | "alert" | "land" | "static";

const LEGACY: Record<string, EmblemState> = {
  loading: "listening", calculating: "answering", error: "warn", sleep: "sleeping", scan: "reading",
  listen: "listening", sort: "answering", celebrate: "done", alert: "warn", land: "done", static: "sleeping",
};
export const LABEL: Record<EmblemState, string> = {
  idle: "Dusty", listening: "Dusty is listening", thinking: "Dusty is thinking", reading: "Dusty is reading",
  answering: "Dusty is answering", done: "Dusty finished", warn: "Dusty needs you", sleeping: "The reader is off",
};
/** The short status beside the emblem in the chat. */
export const DOING: Record<EmblemState, string> = {
  idle: "Ready", listening: "Listening", thinking: "Thinking…", reading: "Reading…",
  answering: "Answering…", done: "Done", warn: "Needs you", sleeping: "Reader off",
};
/** How long a one-shot plays before he goes back to idle. */
export const SHOT_MS: Partial<Record<EmblemState, number>> = { done: 1300 };

export function normalizeState(s: DustyState | undefined): EmblemState {
  return s ? LEGACY[s] ?? (s as EmblemState) : "idle";
}

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

export function DustyEmblem({ state = "idle", size = 48, hidden, className, still: stillProp }: {
  state?: DustyState; size?: number;
  /** Never animate. */
  still?: boolean;
  /** Decorative (inside a button that carries its own label). */
  hidden?: boolean; className?: string;
}) {
  const reduced = useReducedMotion();
  const want = normalizeState(state);
  // One-shots play, then he rests; setting the state again re-arms it.
  const [resting, setResting] = useState(false);
  const [seen, setSeen] = useState(want);
  if (want !== seen) { setSeen(want); setResting(false); }
  useEffect(() => {
    const ms = SHOT_MS[want];
    if (!ms || resting) return;
    const t = setTimeout(() => setResting(true), ms);
    return () => clearTimeout(t);
  }, [want, resting]);

  const key: EmblemState = resting ? "idle" : want;
  return (
    <span className={className} key={key} role={hidden ? undefined : "img"} aria-label={hidden ? undefined : LABEL[key]}
      aria-hidden={hidden || undefined} style={{ display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      <Emblem size={size} spin={!reduced && !stillProp} state={key} />
    </span>
  );
}

/** The name the app used before the emblem; same component. */
export const DustyAvatar = DustyEmblem;
