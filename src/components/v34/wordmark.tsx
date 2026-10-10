"use client";

/**
 * ScopeCrete wordmark — LATEST (2026-09-30).
 * Hatched "scope" (Lexend 700, pencil hatch) + thin "crete" (Inter 300, the hatch's grey since 2026-10-10 — Coy: "the same grey as the rest of the logo"; it was orange) + ".ai" (Kalam).
 * Change from the previous handoff: "scope" and "crete" now sit tight (gap 0,
 * 1px optical space) so they read as one word.
 * Design ref: Dusty Dashboard 1a Draft v3.dc.html (header), ScopeCrete Logo.dc.html 2a (display).
 */
import * as React from "react";

type Props = { size?: number; guides?: boolean; className?: string };

// Colours come from the theme (--sc-hatch, --sc-guide) so the mark
// follows Settings → Appearance; in Night Shift the hatching is chalk-white.
const hLine = (o: number): React.CSSProperties => ({ position: "absolute", height: 1, pointerEvents: "none", opacity: o / 0.35,
  background: "linear-gradient(90deg,transparent,var(--sc-guide) 12%,var(--sc-guide) 88%,transparent)" });
const vLine = (o: number): React.CSSProperties => ({ position: "absolute", width: 1, pointerEvents: "none", opacity: o / 0.35,
  background: "linear-gradient(180deg,transparent,var(--sc-guide) 20%,var(--sc-guide) 80%,transparent)" });

/** size = font-size of "scope"/"crete". Header: 26. Display: 100+. */
export function Wordmark({ size = 26, guides = true, className }: Props) {
  const display = size >= 60;
  const hatch = display
    ? "repeating-linear-gradient(118deg,var(--sc-hatch) 0 1.2px,transparent 1.2px 3.4px),repeating-linear-gradient(104deg,var(--sc-hatch-edge) 0 .8px,transparent .8px 5px)"
    : "repeating-linear-gradient(118deg,var(--sc-hatch) 0 .9px,transparent .9px 2.1px)";

  return (
    <span className={className} role="img" aria-label="scopecrete.ai"
      style={{ display: "inline-flex", alignItems: "baseline", gap: 0 }}>
      <span aria-hidden style={{ position: "relative", display: "inline-block", marginRight: Math.max(1, size * 0.04) }}>
        <span style={{
          display: "block", fontFamily: "'Lexend', sans-serif", fontWeight: 700, fontSize: size, lineHeight: 1,
          letterSpacing: ".02em", paddingBottom: ".28em", marginBottom: "-.28em", // keeps hatch under the "p" descender
          color: "transparent", backgroundImage: hatch, WebkitBackgroundClip: "text", backgroundClip: "text",
          WebkitTextStroke: `${display ? 0.8 : 0.5}px var(--sc-hatch-edge)`,
        }}>scope</span>
        {guides && (<>
          <span style={{ ...hLine(0.35), left: "-10%", right: "-6%", top: "84%" }} />
          <span style={{ ...vLine(0.3), left: "1%", top: "-22%", bottom: "-22%" }} />
          <span style={{ ...vLine(0.24), left: "62%", top: "-24%", bottom: "-26%", transform: "rotate(1.2deg)" }} />
          {display && (<>
            <span style={{ ...hLine(0.32), left: "-7%", right: "-12%", top: "33%", transform: "rotate(.25deg)" }} />
            <span style={{ ...hLine(0.25), left: "4%", right: "40%", top: "58%" }} />
            <span style={{ ...vLine(0.28), left: "38%", top: "-14%", bottom: "-20%", transform: "rotate(-1deg)" }} />
            <span style={{ ...hLine(0.28), left: "14%", top: "6%", width: "44%", transform: "rotate(34deg)", transformOrigin: "0 0" }} />
          </>)}
        </>)}
      </span>
      <span aria-hidden style={{ position: "relative", fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: size,
        lineHeight: 1, letterSpacing: "-.01em", color: "var(--sc-hatch)" }}>
        crete
        {guides && (<>
          <span style={{ ...hLine(0.35), left: "-4%", right: "-10%", top: "86%" }} />
          <span style={{ ...vLine(0.3), left: "97%", top: "-16%", bottom: "-20%" }} />
        </>)}
      </span>
      <span aria-hidden style={{ fontFamily: "'Kalam', cursive", fontSize: size * (display ? 0.5 : 0.62), lineHeight: 1,
        color: "var(--sc-pencil-muted)", marginLeft: 1 }}>.ai</span>
    </span>
  );
}
