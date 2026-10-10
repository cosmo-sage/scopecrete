// The site's shared marks: the emblem, the Manrope wordmark, the graphite
// filter (<GraphiteFilter/>, once a page), the
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

// The emblem, 4e "Shaded, thick rings" (Claude Design Emblem Revisions,
// 2026-10-10; it replaced 4a "Gyroscope" the same day). Two rings tumble round
// the green light on tilted axes (18° / −52°), opposite ways (22 s / 16 s).
// Each ring is a short tube — five slices stacked along its normal, the outer
// two darkened — so it keeps body edge-on, and the half coming toward you is
// full strength while the half going away fades (scShade). CSS 3D with
// preserve-3d, no SVG. `spin={false}` is the still pose (public/favicon.svg).
// Spans, not divs, so it can sit inside a <p> or a label. Keyframes in
// globals.css; reduced motion stills it.
const ORANGE = "#F2610C", STEEL = "#5980A6", GREEN = "#1FA971";
const AXES = [18, -52], DUR = [22, 16], POSE = [58, 128], LAYERS = 5;

export function Emblem({ size, spin, className }: { size: number; spin: boolean; onDark?: boolean; className?: string }) {
  const bw = Math.max(1.2, (size * (size < 40 ? 5 : 2.6)) / 100);
  const depth = Math.max(1.5, bw * 1.6);
  const px = (v: number) => `${(size * v) / 100}px`;
  const ring = (i: number) => {
    const color = i === 0 ? ORANGE : STEEL, rev = i === 1, th = (POSE[i] * Math.PI) / 180;
    const base: CSSProperties = { position: "absolute", display: "block", inset: 0, border: `${bw}px solid ${color}`, borderRadius: "50%", boxSizing: "border-box" };
    // Shading goes on each slice, not a wrapper: opacity on an ancestor would flatten the 3D stack.
    const slab = (key: string, extra: CSSProperties, anim: CSSProperties) =>
      Array.from({ length: LAYERS }, (_, k) => {
        const z = -depth / 2 + (depth * k) / (LAYERS - 1), edge = k === 0 || k === LAYERS - 1;
        return <span key={key + k} style={{ ...base, ...extra, ...anim, transform: `translateZ(${z}px)`, filter: edge ? "brightness(.72)" : "none" }} />;
      });
    const half = (key: string, clip: string, delay: number, still: number) =>
      slab(key, { clipPath: clip }, spin ? { animation: `scShade ${DUR[i]}s linear infinite`, animationDelay: `${delay}s` } : { opacity: still });
    const sL = 0.62 + 0.38 * Math.sin(th) * (rev ? -1 : 1), sR = 0.62 - 0.38 * Math.sin(th) * (rev ? -1 : 1);
    const turn: CSSProperties = { position: "absolute", display: "block", inset: 0, transformStyle: "preserve-3d" };
    if (spin) turn.animation = `${rev ? "scOrbitR" : "scOrbit"} ${DUR[i]}s linear infinite`;
    else turn.transform = `rotateY(${rev ? -POSE[i] : POSE[i]}deg)`;
    return (
      <span key={i} style={{ position: "absolute", display: "block", left: "8%", top: "8%", width: "84%", height: "84%", transformStyle: "preserve-3d", transform: `rotateZ(${AXES[i]}deg)` }}>
        <span style={turn}>
          {half("l", "inset(0 50% 0 0)", rev ? -DUR[i] / 2 : 0, sL)}
          {half("r", "inset(0 0 0 50%)", rev ? 0 : -DUR[i] / 2, sR)}
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
      <span style={{ position: "absolute", display: "block", inset: 0, transformStyle: "preserve-3d" }}>
        {ring(0)}
        {ring(1)}
        <span style={sq(24, { opacity: 0.18 })} />
        <span style={sq(19)} />
      </span>
    </span>
  );
}

export const manrope = "var(--site-manrope), 'Manrope', system-ui, sans-serif";

/** The wordmark, 2c "Rounded, confident" (Claude Design Wordmark Desktop
 *  Options, 2026-10-10): one word in Manrope — "scope" 800, "crete" 500 a step
 *  lighter, ".ai" 500 at half size in the light's green, glowing on the
 *  lighthouse rhythm (scGlowAi). Used by the site (landing, sign-in, invite;
 *  `dark` on the footer) and the app (v34/wordmark.tsx). size = font size. */
export function Wordmark({ size = 24, dark = false, className }: { size?: number; dark?: boolean; className?: string; beacon?: boolean }) {
  const ink = dark ? "#F2F4F6" : "var(--sc-ink, #1C2126)";
  const crete = dark ? "#B8C0C9" : "var(--sc-crete, #5A6068)";
  const s = (w: number, c: string): CSSProperties => ({ fontFamily: manrope, fontWeight: w, fontSize: size, letterSpacing: "-.03em", lineHeight: 1, color: c });
  return (
    <span className={className} role="img" aria-label="scopecrete.ai" style={{ display: "inline-flex", alignItems: "baseline", lineHeight: 1 }}>
      <span aria-hidden style={s(800, ink)}>scope</span>
      <span aria-hidden style={s(500, crete)}>crete</span>
      <span aria-hidden className="sc-ai" style={{ fontFamily: manrope, fontWeight: 500, fontSize: Math.round(size * 0.5), letterSpacing: ".02em", lineHeight: 1,
        color: GREEN, marginLeft: Math.max(2, size * 0.1), whiteSpace: "nowrap", animation: "scGlowAi 3.2s ease-in-out infinite" }}>.ai</span>
    </span>
  );
}
