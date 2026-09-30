"use client";

/**
 * Dusty — the pixel foreman (design/dusty/CLAUDE.md, pixel v5, 2026-09-29).
 * Replaces the old diamond emblem everywhere. He lives in two places only
 * (Coy, 2026-09-30): the centre of the phone footer and the chat window.
 *
 * Rules from the pack, kept:
 *   - `image-rendering: pixelated` on every render; outlines are the pack's.
 *   - Nothing animates at 16 or 24 px — the static idle sprite (or a static
 *     mixer frame while working) is shown.
 *   - `prefers-reduced-motion` stops every animation: static sprites only.
 *
 * States are driven only by real events, never by a timer pretending to work:
 *   idle        — default (32 px and up: the 6 s breathing / blink / flutter loop)
 *   loading     — hard hat, while a chat loads
 *   calculating — the mixer truck replaces Dusty (200 ms crossfade) while a
 *                 reply streams or the background reader is reading
 *   done        — the concrete pour plays once, then thumbs up for 2 s, then idle
 *   error       — the head scratch plays once, then idle
 */

import React, { useEffect, useState } from "react";

export type DustyState = "idle" | "loading" | "calculating" | "done" | "error" | "thinking";

const SHEET = "/dusty/dusty_state_sheet_6states.png";
const SLOT: Record<string, number> = { idle: 0, thinking: 1, measuring: 2, thumbs: 3, error: 4, loading: 5 };
const GIF = {
  idle: "/dusty/anim_idle_FULL_LOOP_6s.gif",
  mixer: "/dusty/anim_concrete_mixer_FINAL.gif",
  pour: "/dusty/anim_concrete_pour_v2.gif",
  scratch: "/dusty/anim_head_scratch_FINAL.gif",
};
const LABEL: Record<DustyState, string> = {
  idle: "Dusty", loading: "Dusty is loading", calculating: "Dusty is working", done: "Dusty finished",
  error: "Dusty hit a snag", thinking: "Dusty is thinking",
};
const pixel: React.CSSProperties = { imageRendering: "pixelated", display: "block", flexShrink: 0 };

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

/** One frame of the state sheet, scaled to `size`. */
function Sprite({ slot, size, label, hidden }: { slot: number; size: number; label: string; hidden?: boolean }) {
  return (
    <span role={hidden ? undefined : "img"} aria-label={hidden ? undefined : label} aria-hidden={hidden || undefined}
      style={{ ...pixel, width: size, height: size, backgroundImage: `url(${SHEET})`, backgroundRepeat: "no-repeat",
        backgroundSize: `${size * 6}px ${size}px`, backgroundPosition: `${-slot * size}px 0` }} />
  );
}

function Img({ src, size, label, hidden }: { src: string; size: number; label: string; hidden?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={hidden ? "" : label} aria-hidden={hidden || undefined} style={pixel} draggable={false} />;
}

export function DustyAvatar({ state = "idle", size = 48, hidden, className, still: stillProp }: {
  state?: DustyState; size?: number;
  /** Never animate (e.g. the small mark beside each answer). */
  still?: boolean;
  /** Decorative (inside a button that carries its own label). */
  hidden?: boolean; className?: string;
}) {
  const reduced = useReducedMotion();
  const small = size <= 24;
  const still = reduced || small || !!stillProp;
  // One-shots: "done" plays the pour then holds thumbs up; "error" plays the scratch.
  const [phase, setPhase] = useState<"shot" | "hold" | "rest">("rest");
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setPhase(state === "done" || state === "error" ? "shot" : "rest");
  }
  useEffect(() => {
    if (phase === "shot") {
      const t = setTimeout(() => setPhase(state === "done" ? "hold" : "rest"), state === "done" ? 1600 : 1400);
      return () => clearTimeout(t);
    }
    if (phase === "hold") {
      const t = setTimeout(() => setPhase("rest"), 2000);
      return () => clearTimeout(t);
    }
  }, [phase, state]);

  const label = LABEL[state];
  let body: React.ReactNode;
  if (state === "calculating") {
    body = still ? <Img src="/dusty/concrete_mixer_static.png" size={size} label={label} hidden={hidden} />
      : <Img src={GIF.mixer} size={size} label={label} hidden={hidden} />;
  } else if (state === "done" && phase === "shot" && !still) {
    body = <Img src={GIF.pour} size={size} label={label} hidden={hidden} />;
  } else if (state === "done" && phase !== "rest") {
    body = <Sprite slot={SLOT.thumbs} size={size} label={label} hidden={hidden} />;
  } else if (state === "error" && phase === "shot" && !still) {
    body = <Img src={GIF.scratch} size={size} label={label} hidden={hidden} />;
  } else if (state === "loading") {
    body = <Sprite slot={SLOT.loading} size={size} label={label} hidden={hidden} />;
  } else if (state === "thinking") {
    body = <Sprite slot={SLOT.thinking} size={size} label={label} hidden={hidden} />;
  } else {
    body = still ? <Sprite slot={SLOT.idle} size={size} label={label} hidden={hidden} />
      : <Img src={GIF.idle} size={size} label={label} hidden={hidden} />;
  }
  // Crossfade on every change of what is shown (the pack's 200 ms).
  return (
    <span className={`sc-dusty ${className ?? ""}`} key={`${state}-${phase}`} style={{ display: "inline-flex", width: size, height: size }}>
      {body}
    </span>
  );
}
