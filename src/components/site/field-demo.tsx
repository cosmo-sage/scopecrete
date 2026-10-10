"use client";

/* ============================================================
   The landing page's phone demo: the real app, call to final
   proposal, in eight steps on autoplay (tap anything to take
   over for 12 s).

   Ported from Coy's Claude Design package 10 (2026-10-05,
   "Field Demo.dc.html" + "ScChrome2.dc.html"), drawn in the
   Site Office theme. Sample content throughout.

   Changes from the design, on purpose:
   - Tappable spans are buttons, so they work from a keyboard.
   - Dusty is the ScopeCrete emblem (2026-10-10), not the lander drawing.
   - The other rows on the Threads screen use made-up names:
     the design had borrowed a real prospect's name.
   - The budget is "Budget", not "Budget · Better": a job has
     one price since Good / Better / Best went (2026-10-05).
   ============================================================ */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Emblem, Wordmark, disp, lexend, emblemStateFor, type DustyMode } from "./marks";

const body = "var(--site-body), 'IBM Plex Sans', system-ui, sans-serif";
const figtree = "var(--site-figtree), 'Figtree', system-ui, sans-serif";

// Site Office, as the dashboard draws it (src/lib/v34/themes.ts).
const THEME = {
  "--sc-slab": "#FBF6EC", "--sc-card": "#FFFFFF", "--sc-sunk": "#F3ECDD",
  "--sc-ink": "#2A2A2A", "--sc-ink2": "#5E5A52", "--sc-ink3": "#8C8578",
  "--sc-hair": "#E6DCC8", "--sc-hair-soft": "#F1E9DA", "--sc-hair-strong": "#D9CDB6",
  "--sc-hiviz": "#B85A3C", "--sc-on-hiviz": "#FFFFFF", "--sc-hiviz-dim": "#F6E2D8",
  "--sc-hiviz-soft": "#D97757", "--sc-hiviz-text": "#9A4527",
  "--sc-chalk": "#1E5AA8", "--sc-chalk-dim": "#DCE6F4", "--sc-green": "#2F8A5B",
  "--sc-bucket-customer": "#2F8A5B",
  "--sc-dusty-tint": "#FBEDE6", "--sc-dusty-text": "#9A4527", "--sc-dusty-edge": "#D97757",
  "--sc-paper": "#FAF8F3", "--sc-paper-grid": "rgba(89,128,166,.08)", "--sc-pencil": "#3A3E43",
  "--sc-pencil-muted": "#5A5F66", "--sc-pencil-line": "rgba(58,62,68,.30)", "--sc-paper-btn": "rgba(255,255,255,.55)",
  "--sc-hatch": "rgba(52,56,61,.95)", "--sc-hatch-edge": "rgba(52,56,61,.7)", "--sc-crete": "#5A6068",
  "--sc-work-dot-reply": "#C98A12", "--sc-work-dot-warn": "#B5412C",
} as CSSProperties;

const LINES: [string, string, string, number][] = [
  ["Demo & haul off existing", "1,200 sf", "$1.75", 2100],
  ["Grade & compact base", "1,200 sf", "$0.60", 720],
  ["Concrete 3000 psi", "16.3 cy", "$148.00", 2412],
  ["Rebar #3 @ 18\" o.c.", "1,200 sf", "$0.55", 660],
  ["Form, pour & finish labor", "1,200 sf", "$2.40", 2880],
  ["Broom finish & saw cuts", "1,200 sf", "$0.45", 540],
];
const CELLS: [string, string, string][] = [
  ["Length", "40 ft", "Mark said"], ["Width", "30 ft", "Mark said"], ["Area", "1,200 sf", "worked out"],
  ["Depth", "4 in", "your usual"], ["Concrete", "16.3 cy", "+10% waste"], ["Rebar", "#3 @ 18\"", "your usual"],
];
const DUR = [3800, 4200, 3800, 7200, 4600, 4200, 3400, 5200];
const NAV: [string, number][] = [["Threads", 0], ["Mark", 1], ["Job", 2], ["Budget", 3], ["Photos", 4], ["Draft", 5], ["Final", 6]];
type Work = "read" | "done" | "reply" | "idle";
const ACT: [string, Work][] = [
  ["Read Mark Wilson's call — wants the driveway redone", "read"], ["Mark wants a price by Friday — 30 × 40 tear-out", "done"],
  ["Opened Wilson driveway from the call", "done"], ["Building the driveway budget — 1,200 sq ft", "reply"],
  ["Mark texted 3 photos of the driveway", "read"], ["Drafted the proposal from the budget", "done"],
  ["Ready to send P-0143 to Mark", "idle"], ["Proposal v1 texted to Mark Wilson", "done"],
];
const ROWS = [
  { av: "BC", name: "Brent Cormier", role: "", type: "Commercial", age: "1d", sub: "Property manager · email", line: "Highland dumpster pad — asked to move the start to Oct 14." },
  { av: "DF", name: "Darlene Fontenot", role: "", type: "Residential", age: "2d", sub: "Homeowner · 2 numbers", line: "Proposal sent for the driveway. Waiting on the deposit." },
  { av: "RH", name: "Rene Hebert", role: "Cust. contact", type: "", age: "3d", sub: "Bayou Ridge Builders · super", line: "Punch list walk Friday at 2." },
];
const PHOTOS = ["IMG_5102", "IMG_5103", "IMG_5104"];
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

const hatchPhoto: CSSProperties = {
  backgroundColor: "#CFC7B8",
  backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.18) 0 2px,transparent 2px 9px)",
};
const smallCaps = (size: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: disp, fontSize: size, letterSpacing: ".14em", textTransform: "uppercase", ...extra,
});
const act: CSSProperties = {
  border: 0, borderRadius: 4, background: "var(--sc-hiviz)", color: "var(--sc-on-hiviz)", display: "flex",
  alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 13, fontWeight: 700,
  letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", padding: "0 14px",
  animation: "fdPulse 1.6s ease-in-out infinite",
};
const chip: CSSProperties = {
  flex: "none", height: 22, padding: "0 8px", borderRadius: 3, background: "var(--sc-card)",
  border: "1px solid var(--sc-hair)", display: "flex", alignItems: "center", fontSize: 11.5,
};

// Dusty is the ScopeCrete emblem (Coy, 2026-10-10), showing what he is doing
// (Claude Design "Emblem States": listen → listening, sort → answering, scan →
// reading, celebrate → done, alert → warn; still where he stood still).
function Dusty({ mode, size }: { mode: DustyMode; size: number }) {
  return (
    <span aria-label="Dusty" role="img" style={{ display: "inline-flex", flex: "none", width: size, height: size }}>
      <Emblem size={size} spin={mode !== "static"} state={emblemStateFor(mode)} />
    </span>
  );
}

// The activity line's six stepping dots, coloured by the kind of work.
function Dots({ work }: { work: Work }) {
  const C = ["#2F8A5B", "#E0590F", "#3F74C9"];
  const cycle = work === "reply" ? 0.6 : work === "read" ? 1.2 : 2.4;
  return (
    <span className="sc-dots" aria-hidden="true" style={{ flex: "0 0 auto", alignSelf: "stretch", display: "flex", alignItems: "flex-end", gap: 2, paddingBottom: 6 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} style={{ width: 3.5, height: 3.5, borderRadius: 0.5, display: "block", background: C[i % 3], opacity: 0.25, animation: `scDotStep ${cycle}s ease-out ${(cycle / 6) * i}s infinite` }} />
      ))}
    </span>
  );
}

function PhoneHead({ activity, work }: { activity: string; work: Work }) {
  return (
    <div style={{ flex: "none", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
      <div style={{ height: 54, padding: "0 10px", display: "flex", alignItems: "center", gap: 12, backgroundColor: "var(--sc-paper)", backgroundImage: "linear-gradient(var(--sc-paper-grid) 1px,transparent 1px),linear-gradient(90deg,var(--sc-paper-grid) 1px,transparent 1px)", backgroundSize: "10px 10px", borderBottom: "1px solid var(--sc-pencil-line)", boxShadow: "0 3px 0 -2px var(--sc-pencil-line)", color: "var(--sc-pencil)" }}>
        {/* The site's demo wears ScopeCrete's own brand (New Website package,
            2026-10-08); in the app this spot is the org's logo. */}
        <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
          <Emblem size={24} spin />
          <Wordmark size={20} />
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 32, height: 32, border: "1px solid var(--sc-pencil-line)", borderRadius: 3, background: "var(--sc-paper-btn)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><circle cx="6.4" cy="6.4" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M9.8 9.8 L13.4 13.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </span>
          <span style={{ width: 32, height: 32, border: "1px solid var(--sc-pencil-line)", borderRadius: 3, background: "var(--sc-paper-btn)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 18, height: 2, borderRadius: 3, background: "var(--sc-pencil)" }} />)}
          </span>
        </span>
      </div>
      <div style={{ height: 38, padding: "0 10px 8px", display: "flex", background: "var(--sc-paper)", borderBottom: "1px solid var(--sc-pencil-line)" }}>
        <div style={{ flex: 1, minWidth: 0, height: 30, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
          <Dots work={work} />
          <span key={activity} style={{ flex: 1, minWidth: 0, fontFamily: figtree, fontWeight: 400, fontSize: 13.5, letterSpacing: "-.01em", color: "var(--sc-pencil)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", animation: "fdIn .4s ease-out" }}>{activity}</span>
        </div>
      </div>
    </div>
  );
}

const FOOT_ICONS: Record<string, string> = {
  dashboard: "M2.5 2.5h6v6h-6zM10.5 2.5h6v4h-6zM10.5 8.5h6v8h-6zM2.5 10.5h6v6h-6z",
  threads: "M2.6 4.4h13.8v8.4H8.9l-4 3v-3H2.6z",
  scope: "M3.4 5.4h12.2a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V6.4a1 1 0 0 1 1-1zM2.4 3.1h14.2M3.6 2.1v2M15.4 2.1v2",
  toolbox: "M3.2 7h12.6a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM6.8 7V4.6h5.4V7M2.2 10.6h14.6M8.2 10.6v1.6h2.6v-1.6",
};
const FOOT: [string, string][] = [["dashboard", "Dashboard"], ["threads", "Threads"], ["dusty", ""], ["scope", "Jobs"], ["toolbox", "Toolbox"]];

function PhoneFoot({ active }: { active: string }) {
  return (
    <div style={{ height: 58, flex: "none", display: "flex", background: "var(--sc-card)", borderTop: "1px solid var(--sc-hair)", position: "relative" }}>
      {FOOT.map(([k, label]) => {
        const on = k === active;
        const fg = on ? "var(--sc-ink)" : "var(--sc-ink3)";
        return (
          <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, position: "relative", color: fg }}>
            <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: on ? "#F2610C" : "transparent" }} />
            {k === "dusty" ? <Dusty mode="static" size={24} /> : (
              <span style={{ position: "relative", display: "block" }}>
                <svg width="19" height="19" viewBox="0 0 19 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }} aria-hidden="true"><path d={FOOT_ICONS[k]} /></svg>
                {k === "threads" && <span style={{ position: "absolute", top: -4, left: "calc(50% + 4px)", minWidth: 14, height: 14, padding: "0 3px", borderRadius: 999, background: "var(--sc-hiviz)", color: "var(--sc-on-hiviz)", fontFamily: disp, fontSize: 9.5, fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>3</span>}
              </span>
            )}
            {label && <span style={{ fontFamily: disp, fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", lineHeight: 1.3, color: fg }}>{label}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function FieldDemo({ autoplay = true }: { autoplay?: boolean }) {
  const [s, setS] = useState({ step: 0, t: 0, build: 0, photos: false });
  const hold = useRef(0);

  useEffect(() => {
    const i = setInterval(() => {
      setS((p) => {
        let n = p;
        if (n.step === 3 && n.build < 12) n = { ...n, build: n.build + 1 };
        if (n.step === 4 && !n.photos && n.t > 1800) n = { ...n, photos: true };
        if (!autoplay || Date.now() < hold.current) return n;
        const t = n.t + 450;
        if (t >= DUR[n.step]) {
          const step = n.step === 7 ? 0 : n.step + 1;
          return { step, t: 0, build: step > 3 ? 12 : 0, photos: step > 4 };
        }
        return { ...n, t };
      });
    }, 450);
    return () => clearInterval(i);
  }, [autoplay]);

  const go = (n: number) => () => {
    hold.current = Date.now() + 12000;
    setS({ step: n, t: 0, build: n > 3 ? 12 : 0, photos: n > 4 });
  };
  const addPhotos = () => { hold.current = Date.now() + 12000; setS((p) => ({ ...p, photos: true })); };

  const { step: st, build: b, photos } = s;
  const next = go(Math.min(st + 1, 7));
  const nLines = Math.max(0, Math.min(6, b - 6)), nCells = Math.min(6, b);
  const shown = LINES.slice(0, st === 3 ? nLines : st > 3 ? 6 : 0);
  const cost = shown.reduce((a, l) => a + l[3], 0);
  const mats = shown.filter((l) => /Concrete|Rebar/.test(l[0])).reduce((a, l) => a + l[3], 0);
  const price = cost ? cost * 1.12 * 1.18 + mats * 0.0995 : 0;
  const areaOn = st > 3 || nCells >= 3, orderOn = st > 3 || nCells >= 5;
  const tabOn = st >= 5 ? 2 : 1;
  const navCur = st === 7 ? 6 : st;

  return (
    <div style={{ ...THEME, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 300 }}>
      <style>{`
@keyframes fdIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes fdPulse{0%,100%{box-shadow:0 0 0 0 rgba(242,97,12,.45)}50%{box-shadow:0 0 0 6px rgba(242,97,12,0)}}
@keyframes scDotStep{0%,100%{opacity:.25}12%{opacity:1}40%{opacity:.25}}
.sc-fd button{font:inherit}
@media (prefers-reduced-motion:reduce){.sc-fd *{animation:none!important}}
`}</style>
      <div className="sc-fd" role="region" aria-label="ScopeCrete on a phone, call to proposal (sample content)" style={{ width: 300, height: 631, flex: "none", border: "8px solid #14181C", borderRadius: 30, background: "#14181C", overflow: "hidden", boxShadow: "0 24px 50px -18px rgba(18,22,26,.45)", position: "relative" }}>
        <div style={{ width: 390, height: 844, transform: "scale(.72821)", transformOrigin: "0 0", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--sc-slab)", color: "var(--sc-ink)", fontFamily: body, position: "relative" }}>
          <PhoneHead activity={ACT[st][0]} work={ACT[st][1]} />

          {/* 1 · Threads */}
          {st === 0 && (
            <>
              <div style={{ padding: "10px 12px 8px", background: "var(--sc-card)", borderBottom: "1px solid var(--sc-hair)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 4, border: "1px solid var(--sc-hair-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="12" viewBox="0 0 18 14" stroke="var(--sc-ink)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M1 1h16M1 7h16M1 13h16" /></svg></span>
                <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 22, textTransform: "uppercase", color: "var(--sc-bucket-customer)" }}>Customer</span>
                <span style={{ fontFamily: disp, fontSize: 13, color: "var(--sc-ink3)" }}>4</span>
                <span style={{ flex: 1 }} />
                <span style={{ height: 26, padding: "0 9px", border: "1px solid var(--sc-hair-strong)", borderRadius: 4, display: "flex", alignItems: "center", fontFamily: disp, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--sc-ink2)" }}>Recent</span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", background: "var(--sc-card)" }}>
                <button onClick={next} style={{ width: "100%", textAlign: "left", color: "inherit", border: 0, display: "flex", gap: 10, padding: "9px 8px 9px 7px", borderLeft: "3px solid var(--sc-hiviz)", background: "var(--sc-hiviz-dim)", cursor: "pointer", animation: "fdIn .4s ease-out" }}>
                  <Avatar text="MW" />
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontFamily: lexend, fontWeight: 600, fontSize: 13.5 }}>Mark Wilson</span><span style={smallCaps(9.5, { color: "var(--sc-ink2)" })}>Residential</span><span style={{ flex: 1 }} /><span style={{ fontSize: 12, color: "var(--sc-ink3)" }}>now</span></span>
                    <span style={{ fontSize: 11.5, color: "var(--sc-ink3)" }}>Homeowner · email</span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.4, color: "var(--sc-ink2)", marginTop: 2 }}>Wants the driveway at 4411 Perkins torn out and redone — about 30 by 40. Texted 3 photos.</span>
                    <span style={{ alignSelf: "flex-end", marginTop: 4, fontFamily: disp, fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--sc-hiviz-text)" }}>TAP TO OPEN ›</span>
                  </span>
                </button>
                {ROWS.map((r) => (
                  <div key={r.name} style={{ display: "flex", gap: 10, padding: "9px 8px 9px 10px", borderTop: "1px solid var(--sc-hair)" }}>
                    <Avatar text={r.av} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: lexend, fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                        {r.role && <span style={{ flex: "none", fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", lineHeight: "15px", padding: "0 4px", borderRadius: 2, border: "1px solid var(--sc-bucket-customer)", color: "var(--sc-bucket-customer)" }}>{r.role}</span>}
                        <span style={smallCaps(9.5, { color: "var(--sc-ink2)" })}>{r.type}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 12, color: "var(--sc-ink3)" }}>{r.age}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--sc-ink3)" }}>{r.sub}</div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.4, color: "var(--sc-ink2)", marginTop: 2 }}>{r.line}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 2 · Mark's thread */}
          {st === 1 && (
            <>
              <div style={{ background: "var(--sc-card)", borderBottom: "1px solid var(--sc-hair)", padding: "10px 16px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={smallCaps(9.5, { flex: 1, color: "var(--sc-chalk)" })}>‹ Customer</span><span style={{ fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", lineHeight: "15px", padding: "0 4px", borderRadius: 2, border: "1px solid var(--sc-bucket-customer)", color: "var(--sc-bucket-customer)" }}>Customer</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ flex: 1, fontFamily: lexend, fontWeight: 700, fontSize: 19, lineHeight: 1.15 }}>Mark Wilson</span><span style={{ height: 28, padding: "0 8px", borderRadius: 4, border: "1px solid var(--sc-hair-strong)", display: "flex", alignItems: "center", fontSize: 12, color: "var(--sc-ink2)" }}>⋯</span></div>
                <div style={{ fontSize: 11.5, color: "var(--sc-ink3)", marginTop: 2 }}>Homeowner · email · last heard now</div>
                <div style={{ display: "flex", marginTop: 6 }}>
                  {([["Team only", "Internal notes", false], ["Phone", "Mobile", true], ["Email", "Email", false], ["ScopeCrete", "Chat", false]] as [string, string, boolean][]).map(([kind, label, on]) => (
                    <div key={kind} style={{ flex: 1, minWidth: 0, padding: "7px 8px 8px", borderBottom: `2px solid ${on ? "var(--sc-hiviz)" : "transparent"}`, opacity: kind === "ScopeCrete" ? 0.5 : 1 }}>
                      <div style={{ fontFamily: disp, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--sc-ink3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kind}</div>
                      <div style={{ fontFamily: lexend, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: "8px 16px", background: "var(--sc-card)", borderBottom: "1px solid var(--sc-hair-soft)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", height: 28, border: "1px solid var(--sc-hair-strong)", borderRadius: 4, overflow: "hidden" }}>
                  {["All 2", "Calls 1", "Texts 1"].map((l, i) => (
                    <span key={l} style={{ padding: "0 10px", display: "flex", alignItems: "center", background: i ? undefined : "var(--sc-ink)", color: i ? "var(--sc-ink2)" : "var(--sc-card)", borderLeft: i ? "1px solid var(--sc-hair-strong)" : undefined, fontFamily: disp, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase" }}>{l}</span>
                  ))}
                </div>
                <span style={{ flex: 1 }} />
                <span style={{ height: 28, padding: "0 10px", borderRadius: 4, border: "1px solid var(--sc-hair-strong)", display: "flex", alignItems: "center", color: "var(--sc-ink2)" }}><PhoneIcon size={12} fill="currentColor" /></span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "12px 18px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}><span style={{ flex: 1, height: 1, background: "var(--sc-hair)" }} /><span style={smallCaps(9.5, { color: "var(--sc-ink3)" })}>Sun, Oct 5, 2026</span><span style={{ flex: 1, height: 1, background: "var(--sc-hair)" }} /></div>
                <div style={{ borderRadius: 12, padding: "10px 12px", marginBottom: 8, background: "var(--sc-card)", border: "1px solid var(--sc-hair)", animation: "fdIn .4s ease-out" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><PhoneIcon size={13} fill="var(--sc-ink3)" /><span style={smallCaps(9.5)}>Inbound call</span><span style={{ fontSize: 10, color: "var(--sc-ink3)" }}>4m 12s</span><span style={{ marginLeft: "auto", fontSize: 10, color: "var(--sc-ink3)" }}>Oct 5, 8:02 AM</span></div>
                  <div style={{ fontSize: 12, lineHeight: "1.15rem", marginTop: 4, color: "var(--sc-ink2)" }}>Driveway at 4411 Perkins is cracked along the garage and roots are lifting the left side. Wants it torn out and replaced, about 30 by 40. Asked for a price this week.</div>
                  <div style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--sc-chalk)", marginTop: 8 }}>▶ Play recording · 4m 12s</div>
                  <div style={{ marginTop: 8, borderRadius: 4, padding: "8px 10px", background: "var(--sc-hair-soft)" }}>
                    <div style={smallCaps(9.5, { color: "var(--sc-hiviz)", marginBottom: 3 })}>Next steps — extracted from the call</div>
                    <div style={{ fontSize: 11, lineHeight: 1.45 }}>▪ Price a full tear-out and replace, ~30 × 40<br />▪ Send it by Friday</div>
                  </div>
                  <button onClick={next} style={{ ...act, display: "inline-flex", marginTop: 10, height: 36 }}>Draft the quote ›</button>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                  <div style={{ maxWidth: "78%", borderRadius: 16, padding: "8px 12px", background: "var(--sc-sunk)", border: "1px solid var(--sc-hair)" }}>
                    <div style={{ fontSize: 12 }}>Here&apos;s what it looks like now</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>{PHOTOS.map((p) => <div key={p} style={{ ...hatchPhoto, width: 72, height: 72, borderRadius: 8, display: "flex", alignItems: "flex-end", padding: 4, fontSize: 8.5, color: "#4A443A" }}>{p}</div>)}</div>
                    <div style={{ fontSize: 9, marginTop: 4, opacity: 0.7, letterSpacing: ".06em" }}>IN · 8:09 AM</div>
                  </div>
                </div>
              </div>
              <div style={{ background: "var(--sc-card)", borderTop: "1px solid var(--sc-hair)", padding: "8px 10px", display: "flex", alignItems: "flex-end", gap: 6 }}><span style={{ flex: 1, height: 36, border: "1px solid var(--sc-hair)", borderRadius: 8, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 13, color: "var(--sc-ink3)" }}>Text Mark back…</span><span style={{ width: 34, height: 34, border: "1px solid var(--sc-hair)", borderRadius: 8 }} /></div>
            </>
          )}

          {/* the job page, steps 3–8 */}
          {st >= 2 && (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
              <div style={{ padding: "10px 12px 8px", display: "flex", flexDirection: "column", gap: 8, flex: "none" }}>
                <div style={{ display: "flex", border: "1px solid var(--sc-hair-strong)", borderRadius: 4, overflow: "hidden" }}>
                  {["Takeoffs", "Budget", "Proposal"].map((label, i) => (
                    <span key={label} style={{ flex: 1, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: i === tabOn ? "var(--sc-ink)" : "var(--sc-card)", color: i === tabOn ? "var(--sc-card)" : "var(--sc-ink2)", borderLeft: i ? "1px solid var(--sc-hair)" : "none", fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</span>
                  ))}
                </div>
                {st < 5 && (
                  <div style={{ display: "flex", gap: 5, overflow: "hidden" }}>
                    <span style={chip}>Mark Wilson</span><span style={chip}>4411 Perkins Rd</span><span style={chip}>Residential</span>
                    <span style={{ ...chip, border: 0, background: "var(--sc-chalk-dim)", color: "var(--sc-chalk)" }}>Estimating</span>
                  </div>
                )}
              </div>

              {/* 3 · job opened */}
              {st === 2 && (
                <div style={{ flex: 1, minHeight: 0, padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ border: "1px dashed var(--sc-dusty-edge)", background: "var(--sc-dusty-tint)", borderRadius: 4, padding: 12, display: "flex", flexDirection: "column", gap: 10, animation: "fdIn .4s ease-out" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Dusty mode="idle" size={36} /><span style={{ fontFamily: figtree, fontWeight: 600, fontSize: 14, color: "var(--sc-dusty-text)" }}>Dusty</span></div>
                    <div style={{ fontFamily: figtree, fontSize: 14, lineHeight: 1.5 }}>From Mark&apos;s call this morning: tear out and replace, about <b>30 × 40</b>. He didn&apos;t say a depth, so I&apos;d start at <b>4 in</b> with #3 rebar — your usual for a driveway. Build the budget from that?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 8 }}>
                      <span style={{ height: 44, borderRadius: 4, border: "1px solid var(--sc-hair-strong)", background: "var(--sc-card)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--sc-ink2)" }}>Not yet</span>
                      <button onClick={next} style={{ ...act, height: 44 }}>Build it</button>
                    </div>
                  </div>
                  <div style={{ background: "var(--sc-card)", border: "1px dashed var(--sc-hair-strong)", borderRadius: 4, padding: 16, textAlign: "center", fontSize: 12.5, color: "var(--sc-ink3)" }}>No areas yet. Add one, or take it off the plans.</div>
                  <div style={{ background: "var(--sc-card)", border: "1px solid var(--sc-hair)", borderRadius: 4, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontFamily: disp, fontSize: 15, fontWeight: 700, flex: 1 }}>Files</span><span style={{ fontSize: 12, color: "var(--sc-ink3)" }}>3 texted · not on the job yet</span></div>
                </div>
              )}

              {/* 4 · the budget builds */}
              {st === 3 && (
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: "var(--sc-card)", border: "1px solid var(--sc-hair)", borderRadius: 4, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: lexend, fontSize: 15, fontWeight: 600, flex: 1 }}>Driveway</span>
                      <div style={{ display: "flex", border: "1px solid var(--sc-hair)", borderRadius: 3, overflow: "hidden", fontFamily: disp, fontSize: 11, textTransform: "uppercase" }}>
                        <span style={{ padding: "4px 8px", background: "var(--sc-ink)", color: "var(--sc-card)" }}>L × W</span><span style={{ padding: "4px 8px" }}>Area</span><span style={{ padding: "4px 8px" }}>LF</span><span style={{ padding: "4px 8px" }}>#</span>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6 }}>
                      {CELLS.map(([k, v, note], i) => {
                        const on = i < nCells, fresh = i === nCells - 1;
                        return (
                          <div key={k} style={{ border: `1px solid ${fresh ? "var(--sc-hiviz-soft)" : "var(--sc-hair-soft)"}`, borderRadius: 3, padding: "6px 8px", background: fresh ? "var(--sc-hiviz-dim)" : "var(--sc-slab)", transition: "background .3s" }}>
                            <div style={smallCaps(9.5, { color: "var(--sc-ink3)" })}>{k}</div>
                            <div style={{ fontFamily: disp, fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: on ? "var(--sc-ink)" : "var(--sc-ink3)" }}>{on ? v : "—"}</div>
                            <div style={{ fontSize: 9.5, color: note === "your usual" ? "var(--sc-work-dot-reply)" : "var(--sc-green)" }}>{on ? note : ""}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ background: "var(--sc-card)", border: "1px solid var(--sc-hair)", borderRadius: 4, flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderBottom: "1px solid var(--sc-hair-soft)" }}><span style={{ fontFamily: disp, fontSize: 17, fontWeight: 700, flex: 1 }}>Budget</span><span style={{ fontFamily: disp, fontSize: 12, textTransform: "uppercase", color: "var(--sc-chalk)" }}>+ Add</span></div>
                    {shown.map((l) => (
                      <div key={l[0]} style={{ display: "flex", gap: 8, padding: "6px 10px", borderTop: "1px solid var(--sc-hair-soft)", fontSize: 13, animation: "fdIn .35s ease-out" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>{l[0]}<span style={{ display: "block", fontSize: 11, color: "var(--sc-ink3)" }}>Driveway · {l[1]} × {l[2]}</span></span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{usd(l[3])}</span>
                      </div>
                    ))}
                    {b < 12 && <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, fontFamily: figtree, fontSize: 12, color: "var(--sc-dusty-text)" }}><Dusty mode="sort" size={22} />Pricing from your Price book…</div>}
                  </div>
                  {b >= 12 && <button onClick={next} style={{ ...act, height: 44, flex: "none" }}>Add Mark&apos;s photos</button>}
                </div>
              )}

              {/* 5 · photos onto the job */}
              {st === 4 && (
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: "var(--sc-card)", border: "1px solid var(--sc-hair)", borderRadius: 4, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center" }}><span style={{ fontFamily: lexend, fontSize: 15, fontWeight: 600, flex: 1 }}>Driveway</span><span style={{ fontFamily: disp, fontSize: 15, fontWeight: 600 }}>1,200 sf · 16.3 cy</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={smallCaps(9.5, { color: "var(--sc-ink3)", width: 52 })}>Photos</span>
                      {photos ? PHOTOS.map((p) => <span key={p} style={{ ...hatchPhoto, width: 44, height: 44, borderRadius: 3, animation: "fdIn .35s ease-out" }} />) : <span style={{ fontSize: 12, color: "var(--sc-ink3)" }}>None yet</span>}
                    </div>
                  </div>
                  <div style={{ background: "var(--sc-card)", border: "1px solid var(--sc-hair)", borderRadius: 4, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontFamily: disp, fontSize: 17, fontWeight: 700, flex: 1 }}>Files</span><span style={{ height: 28, padding: "0 10px", borderRadius: 4, border: "1px solid var(--sc-hair-strong)", display: "flex", alignItems: "center", fontFamily: disp, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--sc-ink2)" }}>+ Add photos / files</span></div>
                    <div style={{ display: "flex", gap: 4, fontFamily: disp, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }}>
                      {[`All ${photos ? 3 : 0}`, `Photos ${photos ? 3 : 0}`, "PDFs & more"].map((l) => <span key={l} style={{ padding: "4px 8px", borderRadius: 3, border: "1px solid var(--sc-hair)" }}>{l}</span>)}
                      <span style={{ padding: "4px 8px", borderRadius: 3, background: "var(--sc-ink)", color: "var(--sc-card)" }}>From texts 3</span>
                    </div>
                    {!photos && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 4, background: "var(--sc-sunk)", fontSize: 12, lineHeight: 1.4 }}>
                        <span style={{ flex: 1 }}>Bring a texted photo onto the job to use it in Takeoffs, under an area, or as the proposal&apos;s cover.</span>
                        <button onClick={addPhotos} style={{ ...act, flex: "none", height: 32, padding: "0 10px", fontSize: 11.5, letterSpacing: ".06em" }}>Add all 3 to the job</button>
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                      {PHOTOS.map((name) => (
                        <div key={name} style={{ ...hatchPhoto, aspectRatio: "1", position: "relative", border: "1px solid var(--sc-hair)", borderRadius: 4, overflow: "hidden" }}>
                          <span style={{ position: "absolute", left: 5, top: 5, fontSize: 9, color: "#4A443A" }}>{name}</span>
                          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "3px 6px", background: photos ? "var(--sc-green)" : "rgba(255,255,255,.85)", color: photos ? "#FFFFFF" : "var(--sc-ink2)", fontFamily: disp, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>{photos ? "On the job ✓" : "Texted · now"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <span style={{ flex: 1 }} />
                  {photos && <button onClick={next} style={{ ...act, height: 44, flex: "none" }}>Make the proposal</button>}
                </div>
              )}

              {/* 6–8 · the proposal */}
              {st >= 5 && (
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "color-mix(in srgb,var(--sc-slab) 70%,#9C907C 30%)", position: "relative" }}>
                  <div style={{ padding: "8px 10px", display: "flex", gap: 6, alignItems: "center", background: "var(--sc-slab)", borderBottom: "1px solid var(--sc-hair)" }}>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <span style={smallCaps(9.5, { color: st === 7 ? "var(--sc-green)" : "var(--sc-ink3)" })}>{st === 7 ? "Final · v1" : "Draft · v1"}</span>
                      <span style={{ fontSize: 12, color: "var(--sc-ink2)" }}>{st === 7 ? "Texted 9:14 AM · $12,612" : "Settings · $12,612"}</span>
                    </span>
                    <span style={{ height: 36, padding: "0 12px", borderRadius: 4, border: "1px solid var(--sc-hair)", background: "var(--sc-card)", display: "flex", alignItems: "center", fontFamily: disp, fontSize: 12, textTransform: "uppercase" }}>PDF</span>
                    {st === 5 && <button onClick={next} style={{ ...act, height: 36, fontSize: 12, letterSpacing: ".06em" }}>Preview</button>}
                    {st === 7 && <span style={{ height: 36, padding: "0 12px", borderRadius: 4, border: "1px solid var(--sc-hair-strong)", background: "var(--sc-card)", display: "flex", alignItems: "center", fontFamily: disp, fontSize: 12, textTransform: "uppercase" }}>New version</span>}
                  </div>
                  <div style={{ margin: "10px 12px 0", background: "#FFFFFF", color: "#2A2A2A", boxShadow: "0 4px 16px rgba(0,0,0,.18)", fontFamily: body, display: "flex", flexDirection: "column", position: "relative", animation: "fdIn .4s ease-out" }}>
                    <div style={{ ...hatchPhoto, height: 104, position: "relative" }}><span style={{ position: "absolute", left: 8, bottom: 6, fontSize: 9.5, color: "#4A443A" }}>Cover · IMG_5102 from Mark&apos;s text</span></div>
                    <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 9, fontSize: 11.5, lineHeight: 1.5 }}>
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        <span style={{ height: 24, padding: "0 8px", border: "1px dashed #B9AE98", borderRadius: 3, display: "flex", alignItems: "center", fontFamily: disp, fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: "#8C8578" }}>Your logo</span>
                        <span style={{ flex: 1 }} />
                        <div style={{ textAlign: "right" }}><div style={{ fontFamily: disp, fontSize: 9.5, letterSpacing: ".16em", textTransform: "uppercase", color: "#8C8578" }}>Proposal</div><div style={{ fontFamily: lexend, fontWeight: 700, fontSize: 15 }}>P-0143</div></div>
                      </div>
                      <div><DocHead muted>Prepared for</DocHead><b>Mark Wilson</b> · 4411 Perkins Rd, Baton Rouge</div>
                      <div><DocHead>Scope of work</DocHead>Remove and haul off the existing driveway. Grade and compact the base. Form and pour a 4&quot; driveway, 40 × 30 ft (1,200 sq ft), 3000 psi with #3 rebar at 18&quot; on centre, broom finish and saw-cut joints.</div>
                      <div>
                        <DocHead>Pricing</DocHead>
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #F1E9DA", padding: "3px 0" }}><span>Driveway · 1,200 sq ft</span><span>$12,306</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #F1E9DA", padding: "3px 0" }}><span>Tax · materials</span><span>$306</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #D9CDB6", paddingTop: 4 }}><b>Total</b><b style={{ fontFamily: lexend, fontSize: 14 }}>$12,612</b></div>
                      </div>
                      <div>
                        <DocHead>Payment schedule</DocHead>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span>50% on signing</span><span>$6,306</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span>50% on completion</span><span>$6,306</span></div>
                      </div>
                    </div>
                    {st === 7 && <span style={{ position: "absolute", right: 12, top: 116, transform: "rotate(-8deg)", border: "2px solid #2F8A5B", color: "#2F8A5B", fontFamily: disp, fontWeight: 700, fontSize: 15, letterSpacing: ".14em", textTransform: "uppercase", padding: "2px 8px", background: "rgba(255,255,255,.85)" }}>Final · v1</span>}
                  </div>

                  {/* 7 · send sheet */}
                  {st === 6 && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(20,20,20,.36)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div style={{ background: "var(--sc-card)", borderTop: "1px solid var(--sc-hair)", padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 10, animation: "fdIn .3s ease-out" }}>
                        <div style={{ fontFamily: disp, fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>Send to Mark Wilson</div>
                        <div style={{ fontSize: 12, color: "var(--sc-ink3)", lineHeight: 1.45 }}>Sending freezes this as version 1. Changes after that start version 2, with its own link.</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                          <button onClick={next} style={{ ...act, height: 44, letterSpacing: ".06em", padding: 0 }}>Text it</button>
                          <span style={{ ...act, height: 44, letterSpacing: ".06em", padding: 0, opacity: 0.85, animation: "none", cursor: "default" }}>Email it</span>
                          <span style={{ height: 44, borderRadius: 4, border: "1px solid var(--sc-hair-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>Copy link</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--sc-ink3)", lineHeight: 1.4 }}>Text and Email open your own Messages or mail app with the link in it — you press send.</div>
                      </div>
                    </div>
                  )}

                  {/* 8 · sent */}
                  {st === 7 && (
                    <div style={{ margin: "10px 12px 12px", background: "var(--sc-card)", border: "1px solid var(--sc-hair)", borderRadius: 4, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, animation: "fdIn .4s ease-out" }}>
                      <Dusty mode="celebrate" size={44} />
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontFamily: disp, fontSize: 15, fontWeight: 700, textTransform: "uppercase" }}>Texted to Mark</span>
                        <span style={{ fontFamily: figtree, fontSize: 12, lineHeight: 1.4, color: "var(--sc-ink2)" }}>I&apos;ll tell you when he opens it, and remind you Friday if he hasn&apos;t.</span>
                      </div>
                      <button onClick={go(0)} style={{ height: 36, padding: "0 10px", borderRadius: 4, border: "1px solid var(--sc-ink)", background: "transparent", color: "inherit", display: "flex", alignItems: "center", fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>Again</button>
                    </div>
                  )}
                </div>
              )}

              {/* money strip */}
              {(st === 3 || st === 4) && (
                <div style={{ flex: "none", background: "#2A2A2A", color: "#FFFFFF", padding: "10px 14px", display: "flex", gap: 14, alignItems: "flex-end" }}>
                  {([["Area", areaOn ? "1,200 sf" : "—", 1], ["Order", orderOn ? "16.3 cy" : "—", 1], ["Price", price ? usd(price) : "—", 1.2]] as [string, string, number][]).map(([k, v, f]) => (
                    <div key={k} style={{ flex: f }}><div style={smallCaps(9.5, { color: "#A8A39A" })}>{k}</div><div style={{ fontFamily: disp, fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div></div>
                  ))}
                </div>
              )}
            </div>
          )}

          <PhoneFoot active={st < 2 ? "threads" : "scope"} />
        </div>
      </div>
      <div style={{ width: 300, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {NAV.map(([label, i]) => (
          <button key={label} onClick={go(i)} aria-label={`Show: ${label}`} style={{ display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", border: 0, padding: 0, background: "transparent" }}>
            <span style={{ height: 3, background: i <= navCur ? "#F2610C" : "#C9CFD6" }} />
            <span style={{ fontFamily: disp, fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: i === navCur ? "#12161A" : "#8A95A1", textAlign: "center", whiteSpace: "nowrap" }}>{label}</span>
          </button>
        ))}
      </div>
      <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#8A95A1" }}>Tap through · sample content</span>
    </div>
  );
}

function Avatar({ text }: { text: string }) {
  return <span style={{ width: 30, height: 30, flex: "none", borderRadius: 3, background: "var(--sc-slab)", color: "var(--sc-ink3)", border: "1px solid var(--sc-hair-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: lexend, fontWeight: 600, fontSize: 12 }}>{text}</span>;
}

function PhoneIcon({ size, fill }: { size: number; fill: string }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill={fill} aria-hidden="true"><path d="M4 2h4l2 5-2.5 1.5a11 11 0 004 4L13 10l5 2v4a2 2 0 01-2 2A14 14 0 012 4a2 2 0 012-2z" /></svg>;
}

function DocHead({ children, muted }: { children: string; muted?: boolean }) {
  return <div style={{ fontFamily: disp, fontSize: muted ? 9.5 : 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: muted ? "#8C8578" : "#9A4527" }}>{children}</div>;
}
