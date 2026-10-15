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
// 2026-10-10). Two rings tumble round the green light on tilted axes
// (18° / −52°), opposite ways (22 s / 16 s). Each ring is a short tube — five
// slices stacked along its normal, the outer two darkened — and the half
// coming toward you is full strength while the half going away fades
// (scShade). CSS 3D with preserve-3d, no SVG; spans, not divs, so it can sit
// inside a <p> or a label. `spin={false}` is the still pose (public/favicon.svg).
//
// It is also Dusty (Claude Design "Emblem States", 2026-10-10): `state` shows
// what he is doing — idle · listening (rings 2.2×, the light breathes) ·
// thinking (the light a cube tumbling on both axes, green dust) · reading
// (the cube turning on one axis, blue) · answering (amber, quick pulse) ·
// done (one green blink, a ring and a dust burst) · warn (rings almost stop
// and rock, steady red) · sleeping (still, grey). Pure render, so a server
// page can draw it; DustyEmblem (v34/dusty-avatar.tsx) maps the app's events
// onto it and plays `done` once. Keyframes in globals.css; reduced motion
// stills it and keeps the colour.
const ORANGE = "#F2610C", STEEL = "#5980A6", GREEN = "#1FA971";
/** A colour darkened to pct % — mixed, not filtered: a CSS filter on a 3D layer
 *  turning edge-on is what drew streaks across the page. */
const shade = (c: string, pct: number) => pct >= 100 ? c : `color-mix(in srgb, ${c} ${Math.round(pct)}%, #000)`;
const AXES = [18, -52], DUR = [22, 16], POSE = [58, 128], LAYERS = 5;

export type EmblemState = "idle" | "listening" | "thinking" | "reading" | "answering" | "done" | "warn" | "sleeping";
// The activity line's work colours (tokens.ts workDot), so each theme follows.
const WORK = {
  read: "var(--sc-work-dot-read, #3F74C9)", reply: "var(--sc-work-dot-reply, #C98A12)",
  done: "var(--sc-work-dot-done, #2F8A5B)", warn: "var(--sc-work-dot-warn, #B5412C)", idle: "var(--sc-work-dot-idle, #A8A39A)",
};
interface Spec { speed: number; light: string; cube?: "tumble" | "spin"; dust: number; pulse?: boolean; quick?: boolean; burst?: boolean; wobble?: boolean; dim?: boolean; glow: string }
const SPEC: Record<EmblemState, Spec> = {
  idle:      { speed: 1,    light: GREEN,      dust: 0,  glow: GREEN },
  listening: { speed: 2.2,  light: GREEN,      dust: 0,  pulse: true, glow: GREEN },
  thinking:  { speed: 3.2,  light: GREEN,      dust: 14, cube: "tumble", glow: GREEN },
  reading:   { speed: 1.8,  light: WORK.read,  dust: 8,  cube: "spin", pulse: true, glow: "#3F74C9" },
  answering: { speed: 2.6,  light: WORK.reply, dust: 6,  pulse: true, quick: true, glow: "#C98A12" },
  done:      { speed: 1,    light: WORK.done,  dust: 22, burst: true, glow: "#2F8A5B" },
  warn:      { speed: 0.35, light: WORK.warn,  dust: 0,  wobble: true, glow: "#B5412C" },
  sleeping:  { speed: 0,    light: WORK.idle,  dust: 0,  dim: true, glow: "#A8A39A" },
};

/** The landing page demo's old Lander modes, as emblem states. */
export type DustyMode = "idle" | "listen" | "sort" | "scan" | "land" | "celebrate" | "alert" | "sleep" | "static";
const MODE_STATE: Record<DustyMode, EmblemState> = {
  idle: "idle", listen: "listening", sort: "answering", scan: "reading", land: "done", celebrate: "done", alert: "warn", sleep: "sleeping", static: "sleeping",
};
export const emblemStateFor = (m: DustyMode): EmblemState => MODE_STATE[m] ?? "idle";

export function Emblem({ size, spin, state = "idle", className }: { size: number; spin: boolean; state?: EmblemState; onDark?: boolean; className?: string }) {
  const st = SPEC[state] ?? SPEC.idle;
  const turning = spin && st.speed > 0;
  const bw = Math.max(1.2, (size * (size < 40 ? 5 : 2.6)) / 100);
  const depth = Math.max(1.5, bw * 1.6);
  const px = (v: number) => `${(size * v) / 100}px`;
  const ring = (i: number) => {
    const color = i === 0 ? ORANGE : STEEL, rev = i === 1, th = (POSE[i] * Math.PI) / 180, dur = DUR[i] / (st.speed || 1);
    const base: CSSProperties = { position: "absolute", display: "block", inset: 0, border: `${bw}px solid ${color}`, borderRadius: "50%", boxSizing: "border-box" };
    // Shading goes on each slice, not a wrapper: opacity on an ancestor would flatten the 3D stack.
    const slab = (key: string, extra: (c: string) => CSSProperties, anim: CSSProperties) =>
      Array.from({ length: LAYERS }, (_, k) => {
        const z = -depth / 2 + (depth * k) / (LAYERS - 1), edge = k === 0 || k === LAYERS - 1;
        const c = edge ? shade(color, 72) : color;
        return <span key={key + k} style={{ ...base, ...extra(c), ...anim, transform: `translateZ(${z}px) rotateZ(-45deg)` }} />;
      });
    // A half ring is two of the circle's four border arcs, turned 45° — never a
    // clip-path: Chrome projects a clipped 3D layer turning edge-on as a huge
    // wedge across the page (Coy's recording, 2026-10-15), and the wrapper's
    // clip-path didn't hold it.
    const halfOf = (sides: [string, string]) => (c: string): CSSProperties => ({
      borderColor: "transparent", [`border${sides[0]}Color`]: c, [`border${sides[1]}Color`]: c });
    const half = (key: string, sides: [string, string], delay: number, still: number) =>
      slab(key, halfOf(sides), turning ? { animation: `scShade ${dur}s linear infinite`, animationDelay: `${delay * dur}s` } : { opacity: st.dim ? 0.4 : still });
    const sL = 0.62 + 0.38 * Math.sin(th) * (rev ? -1 : 1), sR = 0.62 - 0.38 * Math.sin(th) * (rev ? -1 : 1);
    const turn: CSSProperties = { position: "absolute", display: "block", inset: 0, transformStyle: "preserve-3d" };
    if (turning) turn.animation = `${rev ? "scOrbitR" : "scOrbit"} ${dur}s linear infinite`;
    else turn.transform = `rotateY(${rev ? -POSE[i] : POSE[i]}deg)`;
    const outer = { position: "absolute", display: "block", left: "8%", top: "8%", width: "84%", height: "84%", transformStyle: "preserve-3d",
      transform: `rotateZ(${AXES[i]}deg)`, ["--axis" as string]: `${AXES[i]}deg` } as CSSProperties;
    if (st.wobble && spin) outer.animation = `scWobble ${2.4 + i}s ease-in-out infinite`;
    return (
      <span key={i} style={outer}>
        <span style={turn}>
          {half("l", ["Left", "Top"], rev ? -0.5 : 0, sL)}
          {half("r", ["Right", "Bottom"], rev ? 0 : -0.5, sR)}
        </span>
      </span>
    );
  };
  const S = 19, light = st.light;
  const sq = (s: number, extra?: CSSProperties): CSSProperties => ({
    position: "absolute", display: "block", left: "50%", top: "50%", width: px(s), height: px(s),
    marginLeft: px(-s / 2), marginTop: px(-s / 2), background: light, ...extra,
  });
  let core;
  if (st.cube && spin) {
    const half = px(S / 2);
    const face = (tf: string, br: number, k: number) => (
      <span key={k} style={{ position: "absolute", display: "block", inset: 0, transformStyle: "preserve-3d" }}>
        <span style={sq(S, { background: shade(light, br * 100), transform: tf, backfaceVisibility: "hidden" })} />
      </span>
    );
    core = (
      <span style={{ position: "absolute", display: "block", inset: 0, transformStyle: "preserve-3d",
        animation: st.cube === "tumble" ? "scCubeTumble 3.6s linear infinite" : "scCube 6s linear infinite" }}>
        {face(`translateZ(${half})`, 1, 0)}{face(`rotateY(180deg) translateZ(${half})`, 0.5, 1)}
        {face(`rotateY(90deg) translateZ(${half})`, 0.72, 2)}{face(`rotateY(-90deg) translateZ(${half})`, 0.72, 3)}
        {face(`rotateX(90deg) translateZ(${half})`, 0.86, 4)}{face(`rotateX(-90deg) translateZ(${half})`, 0.6, 5)}
      </span>
    );
  } else {
    const glow = { ["--glow" as string]: st.glow + "88" } as CSSProperties;
    core = (
      <>
        <span style={sq(24, { opacity: 0.18 })} />
        <span style={sq(S, { ...glow, animation: !spin ? undefined : st.pulse ? `scPulse ${st.quick ? 0.9 : 2.2}s ease-in-out infinite` : st.burst ? "scBlink .5s ease-in-out 1" : undefined })} />
        {st.burst && spin && <span style={sq(S, { background: "none", border: `${bw}px solid ${light}`, boxSizing: "border-box", animation: "scRing 1.1s ease-out 1 forwards" })} />}
      </>
    );
  }
  const pad = Math.round(size * 0.4);
  const dust = spin && st.dust ? Array.from({ length: st.dust }, (_, k) => {
    const a = (k / st.dust) * Math.PI * 2 + (k % 3) * 0.4, r = size * (0.34 + (k % 4) * 0.09), d = Math.max(1.5, (size * (1.3 + (k % 3))) / 100);
    const v = { ["--dx" as string]: `${Math.cos(a) * r}px`, ["--dy" as string]: `${Math.sin(a) * r}px` } as CSSProperties;
    return <span key={k} style={{ position: "absolute", display: "block", left: "50%", top: "50%", width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2,
      borderRadius: k % 2 ? "50%" : 1, background: light, opacity: 0, pointerEvents: "none", ...v,
      animation: `scDust ${st.burst ? 1.1 : 1.6 + (k % 5) * 0.35}s ${st.burst ? "ease-out 1 forwards" : "linear infinite"}`,
      animationDelay: st.burst ? `${(k % 4) * 0.04}s` : `${-((k * 0.37) % 1.9)}s` }} />;
  }) : null;
  return (
    // Boxed in its own neighbourhood: when a ring turns edge-on Chrome can
    // smear a 3D layer across the page (orange streaks 2026-10-10, an orange
    // wedge 2026-10-15). An overflow box clips composited 3D layers where a
    // clip-path didn't; it is flat, so the rings inside still turn in 3D, and
    // it is 40% wider each side so the dust has room.
    <span className={`sc-emblem ${className ?? ""}`} aria-hidden="true"
      style={{ position: "relative", display: "block", width: size, height: size, flex: "none" }}>
      <span style={{ position: "absolute", display: "block", left: -pad, top: -pad, width: size + 2 * pad, height: size + 2 * pad,
        overflow: "hidden", contain: "paint", isolation: "isolate", pointerEvents: "none" }}>
        <span style={{ position: "absolute", display: "block", left: pad, top: pad, width: size, height: size, perspective: `${size * 2.1}px`, transformStyle: "preserve-3d" }}>
          <span style={{ position: "absolute", display: "block", inset: 0, transformStyle: "preserve-3d" }}>
            {ring(0)}
            {ring(1)}
            {core}
          </span>
          {dust}
        </span>
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
