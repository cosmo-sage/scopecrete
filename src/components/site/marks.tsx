// The site's shared marks: the emblem, the hatched "scope" wordmark (its
// pencil-grain filter must be on the page once, <GraphiteFilter/>), the
// draft-paper grid and the font stacks. From the Claude Design package
// (2026-10-04); the landing page, sign-in and invite pages all use them.
import type { CSSProperties } from "react";

export const disp = "var(--site-disp), 'Barlow Condensed', sans-serif";
export const lexend = "var(--site-lexend), 'Lexend', sans-serif";
export const inter = "var(--site-inter), 'Inter', sans-serif";
export const kalam = "var(--site-kalam), 'Kalam', cursive";

export const DRAFT_GRID =
  "linear-gradient(rgba(89,128,166,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(89,128,166,.08) 1px,transparent 1px)";


export function GraphiteFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <filter id="graphiteSm" x="-5%" y="-10%" width="110%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves={1} seed={4} result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale={0.9} xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feTurbulence type="fractalNoise" baseFrequency="2.6" numOctaves={1} seed={9} result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2 0 0 0 -0.2" result="grainA" />
        <feComposite in="rough" in2="grainA" operator="in" />
      </filter>
    </svg>
  );
}

export function Emblem({ size, spin }: { size: number; spin: boolean }) {
  const sw = size < 40 ? 5 : 2.6, s = 9.5;
  const rot = (anim: string, dur: number): CSSProperties =>
    spin ? { transformBox: "view-box", transformOrigin: "50px 50px", animation: `${anim} ${dur}s linear infinite` } : {};
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ flex: "none", display: "block", overflow: "visible" }} aria-hidden="true">
      <g style={rot("scSpin", 22)}>
        <ellipse cx={46} cy={47} rx={42} ry={20} fill="none" stroke="#F2610C" strokeWidth={sw} transform="rotate(18 50 50)" />
      </g>
      <g style={rot("scSpinR", 16)}>
        <ellipse cx={54} cy={53} rx={40} ry={24} fill="none" stroke="#5980A6" strokeWidth={sw} transform="rotate(-52 50 50)" />
      </g>
      <rect x={50 - s - 2.5} y={50 - s - 2.5} width={(s + 2.5) * 2} height={(s + 2.5) * 2} fill="#1FA971" opacity={0.18} />
      <rect x={50 - s} y={50 - s} width={s * 2} height={s * 2} fill="#1FA971" />
    </svg>
  );
}

export function Wordmark({ dark = false, size = 22 }: { dark?: boolean; size?: number }) {
  const ink = dark ? "rgba(230,233,237,.9)" : "rgba(52,56,61,.95)";
  return (
    <span style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }}>
      <span
        style={{
          fontFamily: lexend, fontWeight: 700, fontSize: size, letterSpacing: dark ? undefined : ".02em",
          paddingBottom: ".25em", marginBottom: "-.25em", color: "transparent",
          backgroundImage: `repeating-linear-gradient(118deg,${ink} 0 1px,transparent 1px 2.4px)`,
          WebkitBackgroundClip: "text", backgroundClip: "text",
          WebkitTextStroke: `.5px ${dark ? "rgba(230,233,237,.6)" : "rgba(52,56,61,.7)"}`,
          filter: dark ? undefined : "url(#graphiteSm)",
        }}
      >
        scope
      </span>
      <span style={{ fontFamily: inter, fontWeight: 300, fontSize: size, color: dark ? "#E6E9ED" : "#34383D", marginLeft: 1 }}>crete</span>
      <span style={{ fontFamily: kalam, fontSize: dark ? 11 : 12, color: dark ? "#8A95A1" : "#5A5F66", marginLeft: 2 }}>.ai</span>
    </span>
  );
}
