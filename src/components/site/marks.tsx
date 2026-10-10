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

// The emblem, 4a "Gyroscope" (Claude Design Emblem Revisions, 2026-10-10):
// two rings tumble round the green light in real 3D, passing in front of and
// behind it — CSS 3D with preserve-3d, no SVG. Same colours, axes (18° /
// −52°) and speeds (22 s / 16 s, opposite ways) as the flat ovals before it.
// `spin={false}` is the still pose (public/favicon.svg). Spans, not divs, so
// it can sit inside a <p> or a label. Keyframes scOrbit / scOrbitR in
// globals.css; reduced motion stills it.
const ORANGE = "#F2610C", STEEL = "#5980A6", GREEN = "#1FA971";
const AXES = [18, -52], DUR = [22, 16], POSE = [58, 128];

export function Emblem({ size, spin, className }: { size: number; spin: boolean; onDark?: boolean; className?: string }) {
  const bw = Math.max(1.2, (size * (size < 40 ? 5 : 2.6)) / 100);
  const px = (v: number) => `${(size * v) / 100}px`;
  const box: CSSProperties = { position: "absolute", display: "block", transformStyle: "preserve-3d" };
  const ring = (i: number) => {
    const rev = i === 1;
    const inner: CSSProperties = { ...box, inset: 0 };
    if (spin) inner.animation = `${rev ? "scOrbitR" : "scOrbit"} ${DUR[i]}s linear infinite`;
    else inner.transform = `rotateY(${rev ? -POSE[i] : POSE[i]}deg)`;
    return (
      <span key={i} style={{ ...box, left: "8%", top: "8%", width: "84%", height: "84%", transform: `rotateZ(${AXES[i]}deg)` }}>
        <span style={inner}>
          <span style={{ position: "absolute", display: "block", inset: 0, border: `${bw}px solid ${i === 0 ? ORANGE : STEEL}`, borderRadius: "50%", boxSizing: "border-box" }} />
        </span>
      </span>
    );
  };
  const sq = (s: number, extra?: CSSProperties): CSSProperties => ({
    position: "absolute", display: "block", left: "50%", top: "50%", width: px(s), height: px(s),
    marginLeft: px(-s / 2), marginTop: px(-s / 2), background: GREEN, ...extra,
  });
  return (
    <span className={className ?? "sc-emblem"} aria-hidden="true"
      style={{ position: "relative", display: "block", width: size, height: size, flex: "none", perspective: `${size * 2.1}px`, transformStyle: "preserve-3d" }}>
      {ring(0)}
      {ring(1)}
      <span style={sq(24, { opacity: 0.18 })} />
      <span style={sq(19)} />
    </span>
  );
}

/** The ".aı" with the lighthouse dot (Emblem Revisions 4a): a dotless ı and
 *  the green light over it, pulsing (scBeacon in globals.css). */
export function BeaconI({ beacon = true }: { beacon?: boolean }) {
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      ı
      <span className="sc-beacon" style={{
        position: "absolute", left: "50%", top: "0.12em", width: "0.2em", height: "0.2em", marginLeft: "-0.1em",
        borderRadius: "50%", background: GREEN, animation: beacon ? "scBeacon 3.2s ease-in-out infinite" : "none",
      }} />
    </span>
  );
}

export function Wordmark({ dark = false, size = 22, beacon = true }: { dark?: boolean; size?: number; beacon?: boolean }) {
  const ink = dark ? "rgba(230,233,237,.9)" : "rgba(52,56,61,.95)";
  return (
    <span style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }} role="img" aria-label="scopecrete.ai">
      <span
        aria-hidden
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
      <span aria-hidden style={{ fontFamily: inter, fontWeight: 300, fontSize: size, color: dark ? "#A8AFB8" : "#5A6068", marginLeft: 1 }}>crete</span>
      <span aria-hidden style={{ fontFamily: inter, fontWeight: 300, fontSize: 12, color: dark ? "#8A95A1" : "#5A5F66", marginLeft: 2 }}>.a<BeaconI beacon={beacon} /></span>
    </span>
  );
}
