"use client";

/* ============================================================
   scopecrete.ai — the public landing page

   Ported from the Claude Design package Coy handed over on
   2026-10-04 (deploy/index.html), defaults as designed:
   headline "calls", hero ground "draft", emblem spinning,
   phone demo on autoplay.

   Changes from the design, all on purpose:
   - Log in goes to app.scopecrete.ai/login (LOGIN_URL), where
     the real sign-in lives, not the design's own login mock.
   - Request access is an email to admin@scopecrete.ai. The
     design's request form only pretended to send (a timer, no
     request), and nothing on this site may look like it sent
     something it didn't.
   - Tappable spans are buttons, so they work from a keyboard.
   ============================================================ */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LOGIN_URL } from "@/lib/hosts";
import { DustySVG, type DustyMode } from "./dusty-svg";
import { DRAFT_GRID, Emblem, GraphiteFilter, Wordmark, disp } from "./marks";

const REQUEST_ACCESS = "mailto:admin@scopecrete.ai?subject=ScopeCrete%20access";

const eyebrow: CSSProperties = {
  margin: 0, fontFamily: disp, fontWeight: 600, fontSize: 15, letterSpacing: ".2em",
  textTransform: "uppercase", color: "#616B77",
};
const tag: CSSProperties = {
  fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".08em",
  textTransform: "uppercase", lineHeight: "15px", padding: "0 4px",
};
const demoBtn: CSSProperties = {
  height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: 0,
  background: "#F2610C", color: "#FFFFFF", fontFamily: disp, fontWeight: 700, fontSize: 15,
  letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer",
  boxShadow: "0 0 0 4px rgba(242,97,12,.22)", borderRadius: 2, width: "100%",
};

/* ---------- marks ---------- */

function Dusty({ mode, size }: { mode: DustyMode; size: number }) {
  return (
    <span
      aria-label="Dusty"
      role="img"
      style={{ display: "inline-flex", flex: "none", width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: DustySVG(mode, { size, title: false }) }}
    />
  );
}

/* ---------- content ---------- */

const HEADLINE = "Every call becomes a priced job.";

const NAV = ["Intake", "Sort", "Job", "Scope", "Proposal"];
const TITLES: [string, string][] = [
  ["Inbox", "All lines"], ["Thread", "New caller"], ["Jobs", "Board"],
  ["Scope", "Stamped patio"], ["Proposal", "Draft"], ["Proposal", "Sent"],
];

const MOCK_ROWS = [
  { who: "Sample Customer A", tag: "Customer", c: "#1FA971", t: "2h", line: "Driveway quote sent. Waiting on the deposit." },
  { who: "Ready-mix dispatch", tag: "Vendor", c: "#3E6489", t: "5h", line: "Confirmed Tuesday 7:30, 21 yards." },
  { who: "Sample Customer B", tag: "Customer", c: "#1FA971", t: "1d", line: "Sidewalk punch list. Walk is Friday at 2." },
];

const SCOPE_FIELDS = [
  { k: "Length", v: "16 ft", note: "you said", bg: "#FFFFFF", c: "#12161A", nc: "#1FA971" },
  { k: "Width", v: "12 ft", note: "you said", bg: "#FFFFFF", c: "#12161A", nc: "#1FA971" },
  { k: "Depth", v: "4 in", note: "you said", bg: "#FFFFFF", c: "#12161A", nc: "#1FA971" },
  { k: "Reinforcement", v: "Mesh", note: "you said", bg: "#FFFFFF", c: "#12161A", nc: "#1FA971" },
  { k: "Area", v: "192 sq ft", note: "worked out", bg: "#FFFFFF", c: "#12161A", nc: "#8A95A1" },
  { k: "Finish", v: "—", note: "not said · pick one", bg: "#FFF6F0", c: "#C94F08", nc: "#C94F08" },
];

const PROP_LINES = [
  { k: "Concrete", q: "2.4 yd", v: "$420" }, { k: "Labor", q: "192 sq ft", v: "$1,540" }, { k: "Mesh", q: "4 sheets", v: "$96" },
  { k: "Stamping", q: "192 sq ft", v: "$1,690" }, { k: "Tax · materials only", q: "", v: "$94" },
];

const STEPS = [
  { n: "01", c: "#F2610C", t: "A call comes in", d: "Any line, any hour. It lands with that person’s other calls and texts, recorded and summed up." },
  { n: "02", c: "#5980A6", t: "Dusty sorts it and opens the job", d: "Customer, vendor, personal or spam. A new customer gets a job on the board, with the reason written down." },
  { n: "03", c: "#1FA971", t: "Dimensions to proposal, fast", d: "The Scope Builder turns measurements into a budgeted proposal. Dictate each section on site, or pull dimensions from aerial maps remotely." },
];

const DUSTY_JOBS: { mode: DustyMode; t: string; d: string }[] = [
  { mode: "listen", t: "Listens", d: "Picks up every call and text, on every line." },
  { mode: "sort", t: "Sorts", d: "Customer, vendor, personal or spam, with the reason." },
  { mode: "scan", t: "Measures", d: "Pulls dimensions from aerial maps for the scope." },
  { mode: "alert", t: "Flags you", d: "Anything waiting on your call, before it’s late." },
];

const FEATURES = [
  { t: "Every call in one place", icon: "M2.5 10.5h4l1.5 2.5h3l1.5-2.5h4M4.5 4h10l2 6.5v5h-14v-5z", d: "Calls, texts, voicemails and recordings from all your lines, merged by person. Two numbers, one customer." },
  { t: "Dusty reads it for you", icon: "M1.5 9.5s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5-8-5.5-8-5.5zM9.5 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z", d: "One line on where each conversation stands, callers named from how they introduce themselves. He asks before sorting until he’s matched you 20 times running." },
  { t: "Summaries and transcripts", icon: "M3 8v3M6 5.5v8M9.5 3v13M13 5.5v8M16 8v3", d: "Every recorded call gets a summary, the transcript and a play button on the customer’s page." },
  { t: "Next steps, never forgotten", icon: "M3 5l1.5 1.5L7 4M3 11l1.5 1.5L7 10M9.5 5.5h7M9.5 11.5h7", d: "Dusty pulls out what you owe each person and reminds you when it’s due." },
  { t: "Jobs board", icon: "M2.5 3.5h4v12h-4zM7.5 3.5h4v8h-4zM12.5 3.5h4v5h-4z", d: "New lead to complete in six columns. When a caller turns out to be a customer, the job opens itself." },
  { t: "Scope priced properly", icon: "M2 13l11-11 4 4-11 11zM5 10l1.5 1.5M7.5 7.5L9 9M10 5l1.5 1.5", d: "Labor by the foot, separate markups, rebar by the sheet, stick or bag, tax on materials only. Missing a measurement? It says so." },
  { t: "Talk the measurements in", icon: "M9.5 2.5A2.5 2.5 0 0112 5v4a2.5 2.5 0 01-5 0V5a2.5 2.5 0 012.5-2.5zM4.5 9a5 5 0 0010 0M9.5 14v3", d: "Say “thirty by forty, four inches, mesh” and the fields fill in. Only numbers you said are kept." },
  { t: "A bid floor you can trust", icon: "M2.5 15.5h14M5 15.5V10M9.5 15.5V5M14 15.5v-3M2.5 12.5h3M7 12.5h5M14.5 12.5h2", d: "Every bid shows the line it can’t go under: hard cost plus its share of overhead and your pay. Tap to see why." },
  { t: "Ask Dusty anything", icon: "M3 4h13v9H9l-4 3v-3H3z", d: "“What do I owe Amber?” He answers from your own records and drafts the reply for you to send." },
];

const COMING: { t: string; note?: string }[] = [
  { t: "Instant online estimates that land as leads", note: "Built · being finished" },
  { t: "Send texts and email from the app" },
  { t: "Snap a receipt and it files to the job" },
  { t: "Invoices and payments on the job" },
  { t: "Cash flow dashboard: collected, owed, quoted and runway" },
  { t: "Bank balance check-ins for the cash forecast" },
];

/* ---------- page ---------- */

export default function Landing() {
  const [step, setStep] = useState(0);
  const hold = useRef(0);
  const featEl = useRef<HTMLDivElement>(null);
  const feat = useRef({ x: null as number | null, hold: false, until: 0 });

  // Phone demo: advance every 3.2 s unless someone tapped in the last 12 s.
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() < hold.current) return;
      setStep((s) => (s + 1) % 6);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  // Feature strip: a slow endless drift (the list is doubled), paused while
  // touched or hovered, and for a while after the arrows. Off for reduced motion.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const f = feat.current;
    const t = setInterval(() => {
      const el = featEl.current;
      if (!el) return;
      if (f.hold || Date.now() < f.until) { f.x = el.scrollLeft; return; }
      const half = el.scrollWidth / 2;
      f.x = (f.x ?? el.scrollLeft) + 0.6;
      if (f.x >= half) f.x -= half;
      el.scrollLeft = f.x;
    }, 16);
    return () => clearInterval(t);
  }, []);

  const go = (n: number) => () => { hold.current = Date.now() + 12000; setStep(n); };
  const next = go(Math.min(step + 1, 5));
  const featStep = (dir: number) => {
    const el = featEl.current; if (!el) return;
    feat.current.until = Date.now() + 8000;
    const half = el.scrollWidth / 2;
    if (dir < 0 && el.scrollLeft < 260) el.scrollLeft += half;
    if (dir > 0 && el.scrollLeft > half - 260) el.scrollLeft -= half;
    el.scrollBy({ left: dir * 251, behavior: "smooth" });
  };

  return (
    <div className="sc-site">
      <style>{`
.sc-site{min-height:100vh;color:#12161A;font-family:var(--site-body),'IBM Plex Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;
  background-color:#E9EBEE;background-image:linear-gradient(rgba(18,22,26,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(18,22,26,.055) 1px,transparent 1px);background-size:320px 320px;background-position:-1px -1px}
.sc-site a{color:#3E6489}.sc-site a:hover{color:#12161A}
.sc-site a:focus-visible,.sc-site button:focus-visible{outline:2px solid #F2610C;outline-offset:2px}
.sc-site .sc-cta,.sc-site .sc-cta:hover{color:#FFFFFF}.sc-site .sc-cta:hover{background:#C94F08!important}
.sc-site .sc-ghost{color:#12161A}.sc-site .sc-ghost:hover{background:#FFFFFF}
.sc-site .sc-foot-login{color:#FFFFFF}.sc-site .sc-foot-login:hover{color:#F2610C}
.sc-site .sc-foot-mail{color:#C9CFD6}.sc-site .sc-foot-mail:hover{color:#FFFFFF}
.sc-site .sc-arrow:hover{border-color:#12161A!important}
.sc-site .sc-feat::-webkit-scrollbar{display:none}
@keyframes scSpin{to{transform:rotate(360deg)}}@keyframes scSpinR{to{transform:rotate(-360deg)}}
@media (prefers-reduced-motion:reduce){.sc-site *{animation:none!important}}
`}</style>

      <GraphiteFilter />

      {/* header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#FAF8F3", backgroundImage: DRAFT_GRID, backgroundSize: "10px 10px", borderBottom: "1px solid rgba(58,62,68,.3)", boxShadow: "0 3px 0 -2px rgba(58,62,68,.3)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 60, padding: "0 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <a href="#top" aria-label="ScopeCrete home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <Emblem size={30} spin />
            <Wordmark />
          </a>
          <span style={{ flex: 1 }} />
          <a href={LOGIN_URL} className="sc-cta" style={{ height: 40, padding: "0 18px", display: "flex", alignItems: "center", background: "#F2610C", textDecoration: "none", borderRadius: 2, fontFamily: disp, fontWeight: 700, fontSize: 16, letterSpacing: ".1em", textTransform: "uppercase" }}>Log in</a>
        </div>
      </header>

      <main>
        {/* hero */}
        <section id="top" style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid #DCE0E5", backgroundColor: "#FAF8F3", backgroundImage: DRAFT_GRID, backgroundSize: "14px 14px" }}>
          <span style={{ position: "absolute", left: 0, right: 0, top: 118, height: 1, background: "linear-gradient(90deg,transparent,rgba(58,62,68,.22) 8%,rgba(58,62,68,.22) 92%,transparent)" }} />
          <span style={{ position: "absolute", top: 0, bottom: 0, left: "calc(50% - 600px + 20px)", width: 1, background: "linear-gradient(180deg,transparent,rgba(58,62,68,.2) 12%,rgba(58,62,68,.2) 88%,transparent)" }} />
          <span style={{ position: "absolute", top: 40, bottom: 40, right: "12%", width: 1, background: "linear-gradient(180deg,transparent,rgba(58,62,68,.16) 15%,rgba(58,62,68,.16) 85%,transparent)", transform: "rotate(1deg)" }} />
          <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "44px 20px 52px", display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "center" }}>
            <div style={{ flex: "1 1 440px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1FA971", boxShadow: "0 0 0 3px rgba(31,169,113,.18)" }} />
                <span style={{ fontFamily: disp, fontWeight: 600, fontSize: 14, letterSpacing: ".18em", textTransform: "uppercase", color: "#616B77" }}>The office manager for concrete contractors</span>
              </div>
              <h1 style={{ margin: 0, fontFamily: disp, fontWeight: 700, fontSize: "clamp(46px,8vw,92px)", lineHeight: 0.92, letterSpacing: "-.005em", textTransform: "uppercase", textWrap: "balance" }}>{HEADLINE}</h1>
              <p style={{ margin: 0, maxWidth: 560, fontSize: "clamp(16px,1.6vw,19px)", lineHeight: 1.5, color: "#3A4249", textWrap: "pretty" }}>Calls and texts land in one place. Dusty reads them, sorts the people and opens the job. You price the scope on real concrete math, and the bid never goes under what the job costs to run.</p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", marginTop: 4 }}>
                <a href={LOGIN_URL} className="sc-cta" style={{ height: 52, padding: "0 26px", display: "flex", alignItems: "center", background: "#F2610C", textDecoration: "none", borderRadius: 2, fontFamily: disp, fontWeight: 700, fontSize: 19, letterSpacing: ".1em", textTransform: "uppercase" }}>Log in</a>
                <a href={REQUEST_ACCESS} className="sc-ghost" style={{ height: 52, padding: "0 20px", display: "flex", alignItems: "center", border: "1px solid #12161A", textDecoration: "none", borderRadius: 2, fontFamily: disp, fontWeight: 600, fontSize: 17, letterSpacing: ".1em", textTransform: "uppercase" }}>Request access</a>
              </div>
            </div>

            {/* phone demo */}
            <div style={{ flex: "0 1 260px", minWidth: 230, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: "100%", maxWidth: 260, aspectRatio: "9/16.5", border: "8px solid #14181C", borderRadius: 26, background: "#E9EBEE", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 50px -18px rgba(18,22,26,.45)" }}>
                <div style={{ height: 44, flex: "none", background: "#FAF8F3", borderBottom: "1px solid #DCE0E5", display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
                  <Emblem size={20} spin={false} />
                  <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 16, letterSpacing: ".06em", textTransform: "uppercase" }}>{TITLES[step][0]}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".12em", color: "#8A95A1", textTransform: "uppercase" }}>{TITLES[step][1]}</span>
                </div>
                <Screen step={step} next={next} restart={go(0)} />
              </div>
              <div style={{ width: "100%", maxWidth: 260, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
                {NAV.map((label, i) => (
                  <button key={label} onClick={go(i)} style={{ display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", border: 0, padding: 0, background: "transparent" }}>
                    <span style={{ height: 3, background: i <= step ? "#F2610C" : "#C9CFD6" }} />
                    <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: i === Math.min(step, 4) ? "#12161A" : "#8A95A1", textAlign: "center" }}>{label}</span>
                  </button>
                ))}
              </div>
              <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#8A95A1" }}>Tap through · sample content</span>
            </div>
          </div>
        </section>

        {/* how it works */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "52px 20px 20px", display: "flex", flexDirection: "column", gap: 22 }}>
          <h2 style={eyebrow}>How it works</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 1, background: "#DCE0E5", border: "1px solid #DCE0E5" }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ background: "#FFFFFF", padding: "22px 20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 44, lineHeight: 1, color: s.c, fontVariantNumeric: "tabular-nums" }}>{s.n}</span>
                <h3 style={{ margin: 0, fontFamily: disp, fontWeight: 700, fontSize: 26, lineHeight: 1.05, textTransform: "uppercase" }}>{s.t}</h3>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "#616B77", textWrap: "pretty" }}>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* meet dusty */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px 8px" }}>
          <div style={{ position: "relative", border: "1px solid #C8CDD3", background: "#FFFFFF", display: "flex", flexWrap: "wrap" }}>
            <span style={{ position: "absolute", left: -7, top: -7, width: 13, height: 13, borderLeft: "1px solid #12161A", borderTop: "1px solid #12161A" }} />
            <span style={{ position: "absolute", right: -7, bottom: -7, width: 13, height: 13, borderRight: "1px solid #12161A", borderBottom: "1px solid #12161A" }} />
            <div style={{ flex: "1 1 260px", minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FAF8F3", backgroundImage: "linear-gradient(rgba(89,128,166,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(89,128,166,.1) 1px,transparent 1px)", backgroundSize: "20px 20px", borderRight: "1px solid #DCE0E5" }}>
              <Dusty mode="listen" size={170} />
            </div>
            <div style={{ flex: "2 1 420px", minWidth: 0, padding: "24px 22px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <h2 style={{ margin: 0, fontFamily: disp, fontWeight: 700, fontSize: "clamp(32px,4vw,44px)", lineHeight: 0.95, textTransform: "uppercase" }}>Meet Dusty</h2>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: "#3A4249", textWrap: "pretty" }}>Your office manager. He works the phones and the paperwork so you can stay on the slab.</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, background: "#DCE0E5", border: "1px solid #DCE0E5" }}>
                {DUSTY_JOBS.map((j) => (
                  <div key={j.t} style={{ background: "#FFFFFF", padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <Dusty mode={j.mode} size={48} />
                    <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 17, letterSpacing: ".04em", textTransform: "uppercase" }}>{j.t}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.4, color: "#616B77", textWrap: "pretty" }}>{j.d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* features */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px 20px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 16px" }}>
            <h2 style={eyebrow}>Working today</h2>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#616B77" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1FA971" }} />Running a working contractor’s office now
            </span>
          </div>
          <div style={{ position: "relative", margin: "0 -20px" }}>
            <div
              ref={featEl}
              className="sc-feat"
              onMouseEnter={() => { feat.current.hold = true; }}
              onMouseLeave={() => { feat.current.hold = false; }}
              onTouchStart={() => { feat.current.hold = true; }}
              onTouchEnd={() => { feat.current.hold = false; feat.current.until = Date.now() + 5000; }}
              style={{ display: "flex", gap: 1, overflowX: "auto", scrollbarWidth: "none", padding: "0 20px", WebkitOverflowScrolling: "touch" }}
            >
              {FEATURES.concat(FEATURES).map((f, i) => (
                <div key={i} aria-hidden={i >= FEATURES.length || undefined} style={{ flex: "none", width: 250, background: "#FFFFFF", border: "1px solid #DCE0E5", marginRight: -1, padding: "16px 16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 32, height: 32, flex: "none", border: "1px solid #DCE0E5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="18" height="18" viewBox="0 0 19 19" fill="none" stroke="#3E6489" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={f.icon} /></svg>
                    </span>
                    <h3 style={{ margin: 0, fontFamily: disp, fontWeight: 700, fontSize: 19, lineHeight: 1.05, textTransform: "uppercase" }}>{f.t}</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: "#616B77", textWrap: "pretty" }}>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -8 }}>
            <span style={{ fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#8A95A1" }}>{FEATURES.length} features · swipe or drag</span>
            <span style={{ flex: 1 }} />
            <ArrowBtn label="Previous" onClick={() => featStep(-1)}>‹</ArrowBtn>
            <ArrowBtn label="Next" onClick={() => featStep(1)}>›</ArrowBtn>
          </div>
        </section>

        {/* on the way */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ ...eyebrow, color: "#8A95A1" }}>On the way</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COMING.map((c) => (
              <div key={c.t} style={{ border: "1px dashed #B9C0C8", padding: "7px 11px", display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13.5, lineHeight: 1.35, color: "#3A4249" }}>{c.t}</span>
                {c.note && <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#8A95A1" }}>{c.note}</span>}
              </div>
            ))}
          </div>
        </section>

        {/* built in the field */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "44px 20px 60px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 48px", alignItems: "flex-start", paddingTop: 28, borderTop: "2px solid #12161A" }}>
            <h2 style={{ margin: 0, flex: "0 1 320px", fontFamily: disp, fontWeight: 700, fontSize: "clamp(34px,4.5vw,48px)", lineHeight: 0.95, textTransform: "uppercase" }}>Built in the field</h2>
            <p style={{ margin: 0, flex: "1 1 420px", fontSize: "clamp(16px,1.6vw,19px)", lineHeight: 1.55, color: "#3A4249", textWrap: "pretty" }}>ScopeCrete is built by a working concrete contractor, for his own crew first. Every feature on this page runs that office today. If it doesn’t hold up on a Tuesday pour, it doesn’t ship.</p>
          </div>
        </section>
      </main>

      {/* footer */}
      <footer style={{ background: "#14181C", color: "#C9CFD6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px 32px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 28px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Emblem size={26} spin={false} />
            <Wordmark dark size={20} />
          </span>
          <span style={{ flex: 1 }} />
          <nav style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 24px", fontSize: 14 }}>
            <a href={LOGIN_URL} className="sc-foot-login" style={{ textDecoration: "none", fontFamily: disp, fontWeight: 600, fontSize: 16, letterSpacing: ".1em", textTransform: "uppercase" }}>Log in</a>
            <a href="mailto:admin@scopecrete.ai" className="sc-foot-mail">admin@scopecrete.ai</a>
            <span style={{ color: "#8A95A1" }}>© 2026 ScopeCrete</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function ArrowBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} onClick={onClick} className="sc-arrow" style={{ width: 40, height: 40, border: "1px solid #B9C0C8", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: "#12161A", background: "#FFFFFF", padding: 0 }}>
      {children}
    </button>
  );
}

/* ---------- the phone demo's screens (sample content) ---------- */

function Screen({ step, next, restart }: { step: number; next: () => void; restart: () => void }) {
  if (step === 0) return (
    <>
      <div style={{ flex: "none", padding: "8px 12px", background: "#FFFFFF", borderBottom: "1px solid #DCE0E5", display: "flex", alignItems: "center", gap: 8 }}>
        <Dusty mode="sort" size={18} />
        <span style={{ fontSize: 11.5, color: "#3A4249", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Dusty · reading a new call about a patio</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 1, background: "#DCE0E5" }}>
        <button onClick={next} style={{ textAlign: "left", font: "inherit", color: "inherit", border: 0, background: "#FFF6F0", borderLeft: "3px solid #F2610C", padding: "10px 12px 10px 9px", display: "flex", flexDirection: "column", gap: 3, cursor: "pointer" }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6, width: "100%" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>(555) 010-0142</span>
            <span style={{ ...tag, border: "1px solid #F2610C", color: "#C94F08" }}>New</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: disp, fontSize: 11, color: "#8A95A1" }}>now</span>
          </span>
          <span style={{ fontSize: 12, lineHeight: 1.4, color: "#616B77" }}>Call · 3:41 · wants a price on a stamped patio, about 12 by 16.</span>
          <span style={{ alignSelf: "flex-end", fontFamily: disp, fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "#C94F08" }}>TAP TO OPEN ›</span>
        </button>
        {MOCK_ROWS.map((r) => (
          <div key={r.who} style={{ background: "#FFFFFF", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3, opacity: 0.75 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.who}</span>
              <span style={{ ...tag, flex: "none", border: `1px solid ${r.c}`, color: r.c }}>{r.tag}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: disp, fontSize: 11, color: "#8A95A1" }}>{r.t}</span>
            </div>
            <span style={{ fontSize: 12, lineHeight: 1.4, color: "#616B77" }}>{r.line}</span>
          </div>
        ))}
        <div style={{ flex: 1, background: "#FFFFFF" }} />
      </div>
    </>
  );

  if (step === 1) return (
    <div style={{ flex: 1, minHeight: 0, background: "#FFFFFF", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>(555) 010-0142</span>
        <span style={{ fontSize: 11.5, color: "#8A95A1" }}>Mobile · first contact</span>
      </div>
      <div style={{ border: "1px solid #DCE0E5", background: "#F4F5F7", padding: "9px 11px", display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "#3A4249" }}>CALL · IN · 3:41</span>
        <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>Wants a stamped patio behind the house, about 12 by 16. Asked for a price this week.</span>
        <span style={{ fontSize: 11.5, lineHeight: 1.4, color: "#616B77", fontStyle: "italic" }}>“Hi, this is Sam, I&apos;m looking for a price on a patio…”</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", color: "#3E6489" }}>▶ PLAY · TRANSCRIPT</span>
      </div>
      <div style={{ border: "1px dashed #F2610C", background: "#FFF6F0", padding: "10px 11px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Dusty mode="idle" size={22} />
          <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "#9A3E05" }}>DUSTY</span>
        </span>
        <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>Sounds like a <b>customer</b>. He said his name is <b>Sam</b>. Next step: send the patio price.</span>
      </div>
      <span style={{ flex: 1 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 8 }}>
        <span style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #B9C0C8", fontFamily: disp, fontWeight: 600, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase", color: "#616B77" }}>Not yet</span>
        <button onClick={next} style={demoBtn}>Yes · open a job</button>
      </div>
    </div>
  );

  if (step === 2) return (
    <div style={{ flex: 1, minHeight: 0, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, overflow: "hidden" }}>
        <span style={{ flex: "none", fontFamily: disp, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", padding: "4px 8px", background: "#12161A", color: "#FFFFFF" }}>New lead · 1</span>
        <span style={{ flex: "none", fontFamily: disp, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", padding: "4px 8px", border: "1px solid #B9C0C8", color: "#8A95A1" }}>Consultation</span>
        <span style={{ flex: "none", fontFamily: disp, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", padding: "4px 8px", border: "1px solid #B9C0C8", color: "#8A95A1" }}>Estimating</span>
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid #DCE0E5", borderTop: "3px solid #1FA971", padding: "11px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 19, textTransform: "uppercase" }}>Stamped patio</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: disp, fontSize: 11, color: "#8A95A1" }}>just now</span>
        </div>
        <span style={{ fontSize: 12.5, color: "#3A4249" }}>Sam · (555) 010-0142</span>
        <div style={{ borderLeft: "2px solid #1FA971", paddingLeft: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: disp, fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#8A95A1" }}>Why this job opened</span>
          <span style={{ fontSize: 12, lineHeight: 1.4, color: "#3A4249" }}>Asked for a price on a 12 by 16 stamped patio on today&apos;s call.</span>
        </div>
        <span style={{ alignSelf: "flex-start", fontFamily: disp, fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", padding: "2px 6px", background: "#FDE9DC", color: "#9A3E05" }}>You owe: patio price · Fri</span>
      </div>
      <span style={{ flex: 1 }} />
      <button onClick={next} style={demoBtn}>Build the scope</button>
    </div>
  );

  if (step === 3) return (
    <div style={{ flex: 1, minHeight: 0, background: "#FFFFFF", padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F4F5F7", border: "1px solid #DCE0E5" }}>
        <svg width="16" height="16" viewBox="0 0 19 19" fill="none" stroke="#F2610C" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M9.5 2.5A2.5 2.5 0 0112 5v4a2.5 2.5 0 01-5 0V5a2.5 2.5 0 012.5-2.5zM4.5 9a5 5 0 0010 0M9.5 14v3" /></svg>
        <span style={{ fontSize: 12.5, fontStyle: "italic", color: "#3A4249" }}>“Twelve by sixteen, four inches, mesh.”</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#DCE0E5", border: "1px solid #DCE0E5" }}>
        {SCOPE_FIELDS.map((f) => (
          <div key={f.k} style={{ background: f.bg, padding: "7px 9px", display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontFamily: disp, fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#8A95A1" }}>{f.k}</span>
            <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 18, color: f.c, fontVariantNumeric: "tabular-nums" }}>{f.v}</span>
            <span style={{ fontSize: 10.5, color: f.nc }}>{f.note}</span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 11.5, lineHeight: 1.4, color: "#616B77" }}>Only numbers you said are kept. Finish wasn&apos;t said, so it&apos;s left open instead of guessed.</span>
      <span style={{ flex: 1 }} />
      <button onClick={next} style={demoBtn}>Price it</button>
    </div>
  );

  if (step === 4) return (
    <div style={{ flex: 1, minHeight: 0, background: "#FFFFFF", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 18, textTransform: "uppercase" }}>Proposal · Stamped patio</span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {PROP_LINES.map((p) => (
          <div key={p.k} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 0", borderBottom: "1px solid #EEF0F2", fontSize: 12.5 }}>
            <span style={{ flex: 1 }}>{p.k}</span>
            <span style={{ color: "#8A95A1", fontSize: 11.5 }}>{p.q}</span>
            <span style={{ width: 62, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: disp, fontWeight: 700, fontSize: 18, textTransform: "uppercase" }}>
          <span>Bid</span><span style={{ fontVariantNumeric: "tabular-nums" }}>$3,840</span>
        </div>
        <div style={{ position: "relative", height: 10, background: "#EEF0F2" }}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", background: "#1FA971" }} />
          <span style={{ position: "absolute", top: -4, bottom: -4, left: "81%", width: 2, background: "#12161A" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#616B77" }}>
          <span>Floor $3,120 · cost + overhead + your pay</span><span>Tap ›</span>
        </div>
      </div>
      <span style={{ flex: 1 }} />
      <button onClick={next} style={demoBtn}>Send proposal</button>
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, background: "#FFFFFF", padding: "22px 16px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ display: "flex" }}><Dusty mode="celebrate" size={64} /></span>
      <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 26, lineHeight: 1, textTransform: "uppercase" }}>Proposal sent to Sam</span>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: "#3A4249" }}>The job moved to Follow up. If Sam hasn&apos;t answered by Friday, Dusty reminds you.</span>
      <span style={{ fontSize: 12, color: "#8A95A1" }}>Call to proposal, in one thread.</span>
      <span style={{ flex: 1 }} />
      <button onClick={restart} style={{ ...demoBtn, background: "transparent", color: "#12161A", border: "1px solid #12161A", boxShadow: "none", fontWeight: 600, fontSize: 14 }}>Start over</button>
    </div>
  );
}
