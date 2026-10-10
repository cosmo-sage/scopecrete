"use client";

/* ============================================================
   scopecrete.ai — the public landing page

   Landing Page v3, from Coy's "New Website" Claude Design
   package (2026-10-08), defaults as designed: headline "stay",
   pricing as cards, the design-partner pilot on, the emblem
   spinning, the phone demo on autoplay (field-demo.tsx).

   Coy: the design doesn't have all the latest app changes, so
   it is direction, and what the app does today wins. Changes
   from the design, all on purpose:
   - Log in goes to app.scopecrete.ai/login (LOGIN_URL).
   - The apply form opens the visitor's own email to
     admin@scopecrete.ai with what they typed. The design's form
     sent nothing, and nothing on this site may look like it
     sent something it didn't.
   - Texts send from the app now (Quo, 2026-10-05), so texting
     is Available and only email sending is Planned; the Jobs
     board has seven stages and jobs are made by hand; a bid
     shows the job minimum (§4), not a "cost floor"; the sample
     budget's cost is what its lines add up to.
   - Footer links with no page behind them (Privacy, Terms,
     Support scope) are left out until those pages exist.
   - Tappable things are buttons, so they work from a keyboard.
   ============================================================ */

import { useState, type CSSProperties, type FormEvent } from "react";
import { LOGIN_URL } from "@/lib/hosts";
import { DustySVG, type DustyMode } from "./dusty-svg";
import FieldDemo from "./field-demo";
import { DRAFT_GRID, Emblem, GraphiteFilter, Wordmark, disp } from "./marks";

const MAIL = "admin@scopecrete.ai";

const eyebrow: CSSProperties = {
  margin: 0, fontFamily: disp, fontWeight: 600, fontSize: 15, letterSpacing: ".2em",
  textTransform: "uppercase", color: "#616B77",
};
const bigHead = (size: string): CSSProperties => ({
  margin: 0, fontFamily: disp, fontWeight: 700, fontSize: size, lineHeight: 0.95,
  textTransform: "uppercase", textWrap: "balance",
});
const label: CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5, fontFamily: disp, fontWeight: 600, fontSize: 13,
  letterSpacing: ".12em", textTransform: "uppercase", color: "#616B77",
};
const field: CSSProperties = {
  height: 44, border: "1px solid #B9C0C8", padding: "0 12px", background: "#FFFFFF",
  fontFamily: "var(--site-body),'IBM Plex Sans',sans-serif", fontSize: 15, textTransform: "none", letterSpacing: 0,
};
const corner = (pos: "tl" | "br"): CSSProperties => pos === "tl"
  ? { position: "absolute", left: -7, top: -7, width: 13, height: 13, borderLeft: "1px solid #12161A", borderTop: "1px solid #12161A" }
  : { position: "absolute", right: -7, bottom: -7, width: 13, height: 13, borderRight: "1px solid #12161A", borderBottom: "1px solid #12161A" };
const paper20: CSSProperties = {
  backgroundColor: "#FAF8F3",
  backgroundImage: "linear-gradient(rgba(89,128,166,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(89,128,166,.1) 1px,transparent 1px)",
  backgroundSize: "20px 20px",
};

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

const HEADLINE = "Stay on the job. Not behind on estimates.";
const HERO = "Calls, texts, emails and photos land in one job thread. ScopeCrete drafts the budget and the proposal from your own pricing. You check the numbers, confirm the site and send.";
const CTA_LONG = "Apply for the contractor pilot";

const STEPS = [
  { n: "01", c: "#F2610C", t: "Capture the job", d: "Contact, conversations, photos, dimensions and site notes stay together in one thread, with where each fact came from." },
  { n: "02", c: "#5980A6", t: "Prepare the numbers", d: "A draft budget from your labor, materials, equipment, overhead and pricing rules. Missing measurements and unconfirmed conditions are flagged, not guessed." },
  { n: "03", c: "#1FA971", t: "Review and close", d: "Check the budget, verify the site, approve the proposal and track the next touchpoint so nothing slips." },
];

const BUDGET = [
  { k: "Concrete", note: "16.3 cy · 1,200 sf · 4 in", v: "$2,934", flag: false, nc: "#8A95A1" },
  { k: "Labor", note: "from your price book", v: "$5,400", flag: false, nc: "#8A95A1" },
  { k: "Rebar · #4 @ 18\"", note: "from photos · confirm", v: "$1,180", flag: true, nc: "#C94F08" },
  { k: "Tear-out and haul", note: "customer said", v: "$1,650", flag: false, nc: "#1FA971" },
  { k: "Overhead and margin", note: "your rules", v: "$1,448", flag: false, nc: "#8A95A1" },
];

const DUSTY_JOBS: { mode: DustyMode; t: string }[] = [
  { mode: "listen", t: "Answers" }, { mode: "sort", t: "Sorts" }, { mode: "scan", t: "Drafts" }, { mode: "alert", t: "Flags you" },
];

const FEATURES = [
  { t: "Every call in one place", icon: "M2.5 10.5h4l1.5 2.5h3l1.5-2.5h4M4.5 4h10l2 6.5v5h-14v-5z", d: "Calls, texts, voicemails and forwarded email from all your lines, merged by person." },
  { t: "Dusty reads it for you", icon: "M1.5 9.5s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5-8-5.5-8-5.5zM9.5 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z", d: "One line on where each conversation stands and who it’s with." },
  { t: "Summaries and transcripts", icon: "M3 8v3M6 5.5v8M9.5 3v13M13 5.5v8M16 8v3", d: "Every recorded call summarized, with the transcript on the customer’s page." },
  { t: "Next steps, never forgotten", icon: "M3 5l1.5 1.5L7 4M3 11l1.5 1.5L7 10M9.5 5.5h7M9.5 11.5h7", d: "What you owe each person, and a reminder before it’s late." },
  { t: "Jobs board", icon: "M2.5 3.5h4v12h-4zM7.5 3.5h4v8h-4zM12.5 3.5h4v5h-4z", d: "New lead to complete in seven columns, sorted and filtered by type and city." },
  { t: "Scope priced from your book", icon: "M2 13l11-11 4 4-11 11zM5 10l1.5 1.5M7.5 7.5L9 9M10 5l1.5 1.5", d: "Labor by the foot, rebar by the sheet, sales tax from the job’s address. Missing a measurement? It says so." },
  { t: "Talk the measurements in", icon: "M9.5 2.5A2.5 2.5 0 0112 5v4a2.5 2.5 0 01-5 0V5a2.5 2.5 0 012.5-2.5zM4.5 9a5 5 0 0010 0M9.5 14v3", d: "“Thirty by forty, four inches, mesh” fills the fields. Only numbers you said are kept." },
  { t: "Text from the app", icon: "M3 4h13v9H9l-4 3v-3H3z", d: "Reply to a customer from their thread, on your own business line. Dusty can draft it; you tap Send." },
  { t: "A job minimum on every bid", icon: "M2.5 15.5h14M5 15.5V10M9.5 15.5V5M14 15.5v-3M2.5 12.5h3M7 12.5h5M14.5 12.5h2", d: "Your day minimum times the days on the job, shown under every price, so a bid never goes out under it." },
];

const COMING: { t: string; note?: string }[] = [
  { t: "Instant online estimates that land as leads", note: "Built · being finished" },
  { t: "Send email from the app" },
  { t: "Snap a receipt and it files to the job" },
  { t: "Invoices and payments on the job" },
  { t: "13-week cash view: collected, owed, quoted" },
];

const PLANS = [
  {
    name: "Core", edge: "#5980A6", price: "$149", per: "/ mo per business",
    pitch: "Every lead organized and priced from your own numbers. No AI phone answering.",
    items: ["Job threads: calls, texts, email, photos", "Structured intake and job facts", "Your price book and flatwork templates", "Draft budgets and proposals", "Approval queue and next-step reminders"],
    cta: "Start with Core", primary: false,
  },
  {
    name: "Sales Desk", edge: "#F2610C", tag: "Most contractors", price: "$299", per: "/ mo per business",
    pitch: "Core, plus Dusty answers the phone and the website while you’re on the pour.",
    items: ["Everything in Core", "AI phone answering · 200 voice minutes included", "Website chat intake", "Approved follow-up sequences", "Appointment and site-visit requests"],
    foot: "Extra voice minutes $0.40/min, metered and capped by you.", cta: "Apply for the pilot", primary: true,
  },
  {
    name: "Guided setup", edge: "#1FA971", price: "$399", per: "one time",
    pitch: "We build your price book with you and prove the workflow on three real jobs before go-live.",
    items: ["One price-book import, values you verify", "Three flatwork templates", "Phone routing on your existing number", "One website widget", "Acceptance session: three test jobs"],
    foot: "Waived for design partners.", cta: "Add setup", primary: false,
  },
];

const NOTES = [
  { t: "Voice minutes", d: "Sales Desk includes 200 AI voice minutes. Past that, $0.40/min with a meter, alerts and a cap you set. Hitting the cap never drops a call: it falls back to your routing or voicemail." },
  { t: "What setup buys", d: "A validated price book, three flatwork templates, your number routed, a website widget, and three test jobs run end to end before you go live." },
  { t: "Does it pay for itself", d: "One recovered $8,000 driveway at 25% margin is about $2,000 of contribution: roughly six months of Sales Desk. One job you’d have lost to a slow callback." },
];

const FAQ: [string, string][] = [
  ["Can I keep my number?", "Yes. Your existing number forwards to ScopeCrete; nothing about how customers reach you changes. If you leave, forwarding stops and the number stays yours."],
  ["What channels work today?", "Calls, texts and voicemail on your lines, texting back from the app, forwarded email from your approved addresses, and photos. Website chat and sending email from the app are on the Sales Desk and Planned lists above."],
  ["Where do the prices come from?", "From you. Your supplier prices, burdened labor, production rates, disposal, equipment, overhead and margin live in your price book. Dusty never invents a quote."],
  ["Does the AI send estimates on its own?", "No. Before enough is known it asks questions, requests photos or books a visit. After, it drafts a budget for you to approve. Nothing binding goes out without you."],
  ["What does setup include?", "A price-book import you verify line by line, three flatwork templates, your number routed, a website widget, and three test jobs run end to end, including a missing measurement and a scope change."],
  ["What if a caller needs a person?", "Dusty hands off to your chosen routing or voicemail. The same fallback kicks in if you hit your voice cap, so a busy month never drops a call."],
  ["Can I export my data?", "Yes. Customers, jobs, budgets, proposals and recordings export on request, and we tell you the retention and deletion policy before you sign up."],
  ["What’s live right now?", "Everything under Available runs our own concrete business daily. Planned items are labeled and not part of what you pay for until they ship."],
];

const INQUIRIES = ["Under 15", "15–30", "30–60", "60+"];

/* ---------- page ---------- */

export default function Landing() {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(0);
  const [mailed, setMailed] = useState(false);

  // The form has nowhere to post, so it writes an email in the visitor's own
  // mail app, addressed to us, with what they typed. They press Send there.
  const apply = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const subject = `Contractor pilot: ${v("company") || v("name")}`;
    const body = [
      `Name: ${v("name")}`, `Company: ${v("company")}`, `Email: ${v("email")}`,
      `Inquiries a month: ${v("inquiries")}`, "", "Biggest bottleneck right now:", v("bottleneck"),
    ].join("\n");
    window.location.href = `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setMailed(true);
  };

  return (
    <div className="sc-site">
      <style>{`
.sc-site{min-height:100vh;color:#12161A;font-family:var(--site-body),'IBM Plex Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;
  background-color:#E9EBEE;background-image:linear-gradient(rgba(18,22,26,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(18,22,26,.055) 1px,transparent 1px);background-size:320px 320px;background-position:-1px -1px}
html:has(.sc-site){scroll-behavior:smooth}
.sc-site [id]{scroll-margin-top:72px}
.sc-site a{color:#3E6489}.sc-site a:hover{color:#12161A}
.sc-site a:focus-visible,.sc-site button:focus-visible,.sc-site input:focus-visible,.sc-site select:focus-visible,.sc-site textarea:focus-visible{outline:2px solid #F2610C;outline-offset:2px}
.sc-site .sc-cta,.sc-site .sc-cta:hover{color:#FFFFFF}.sc-site .sc-cta:hover{background:#C94F08!important;border-color:#C94F08!important}
.sc-site .sc-ghost{color:#12161A}.sc-site .sc-ghost:hover{background:#FFFFFF;color:#12161A}
.sc-site .sc-ghost.sc-plan:hover{background:#C94F08;border-color:#C94F08!important;color:#FFFFFF}
.sc-site .sc-nav a{color:#3A4249;text-decoration:none}.sc-site .sc-nav a:hover{color:#12161A}
.sc-site .sc-nav a.sc-login{color:#616B77}
.sc-site .sc-menu a{padding:14px 20px;color:#12161A;text-decoration:none;border-bottom:1px solid #EEF0F3}.sc-site .sc-menu a:hover{background:#FAF8F3}
.sc-site .sc-menu a.sc-login{color:#616B77;border-bottom:0}
.sc-site .sc-foot a{color:#C9CFD6;text-decoration:none}.sc-site .sc-foot a:hover{color:#FFFFFF}
.sc-site .sc-foot a.sc-foot-login{color:#FFFFFF}.sc-site .sc-foot a.sc-foot-login:hover{color:#F2610C}
.sc-site .sc-foot a.sc-foot-mail{text-decoration:underline}
.sc-site .sc-short{display:none}
.sc-site .sc-burger{display:none}
@media (max-width:759px){
  .sc-site .sc-nav{display:none!important}
  .sc-site .sc-burger{display:flex}
  .sc-site .sc-short{display:inline}.sc-site .sc-long{display:none}
  .sc-site .sc-hero-btn{width:100%}
  .sc-site .sc-hero-btn.sc-cta{font-size:17px!important}.sc-site .sc-hero-btn.sc-ghost{font-size:16px!important}
}
@media (min-width:760px){.sc-site .sc-menu{display:none}}
@media (prefers-reduced-motion:reduce){.sc-site *{animation:none!important}html:has(.sc-site){scroll-behavior:auto}}
`}</style>

      <GraphiteFilter />

      {/* header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#FAF8F3", backgroundImage: DRAFT_GRID, backgroundSize: "10px 10px", borderBottom: "1px solid rgba(58,62,68,.3)", boxShadow: "0 3px 0 -2px rgba(58,62,68,.3)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 60, padding: "0 16px", display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <a href="#top" aria-label="ScopeCrete home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <Emblem size={30} spin />
            <Wordmark />
          </a>
          <span style={{ flex: 1 }} />
          <nav className="sc-nav" style={{ display: "flex", alignItems: "center", gap: 22, fontFamily: disp, fontWeight: 600, fontSize: 15, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href={LOGIN_URL} className="sc-login">Log in</a>
          </nav>
          <a href="#apply" className="sc-cta" style={{ height: 40, padding: "0 14px", display: "flex", alignItems: "center", background: "#F2610C", textDecoration: "none", borderRadius: 2, fontFamily: disp, fontWeight: 700, fontSize: 15, letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            <span className="sc-long">Apply for the pilot</span><span className="sc-short">Apply</span>
          </a>
          <button
            className="sc-burger"
            aria-label="Menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            style={{ width: 40, height: 40, flex: "none", border: "1px solid #B9C0C8", background: "#FFFFFF", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", padding: 0 }}
          >
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 18, height: 2, background: "#12161A" }} />)}
          </button>
        </div>
        {menu && (
          <nav className="sc-menu" onClick={() => setMenu(false)} style={{ borderTop: "1px solid rgba(58,62,68,.3)", background: "#FFFFFF", display: "flex", flexDirection: "column", fontFamily: disp, fontWeight: 600, fontSize: 18, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href={LOGIN_URL} className="sc-login">Log in</a>
          </nav>
        )}
      </header>

      <main>
        {/* hero */}
        <section id="top" style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid #DCE0E5", backgroundColor: "#FAF8F3", backgroundImage: DRAFT_GRID, backgroundSize: "14px 14px" }}>
          <span style={{ position: "absolute", left: 0, right: 0, top: 118, height: 1, background: "linear-gradient(90deg,transparent,rgba(58,62,68,.22) 8%,rgba(58,62,68,.22) 92%,transparent)" }} />
          <span style={{ position: "absolute", top: 0, bottom: 0, left: "calc(50% - 600px + 20px)", width: 1, background: "linear-gradient(180deg,transparent,rgba(58,62,68,.2) 12%,rgba(58,62,68,.2) 88%,transparent)" }} />
          <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "44px 20px 52px", display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "center" }}>
            <div style={{ flex: "1 1 440px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, flex: "none", borderRadius: "50%", background: "#1FA971", boxShadow: "0 0 0 3px rgba(31,169,113,.18)" }} />
                <span style={{ fontFamily: disp, fontWeight: 600, fontSize: 14, letterSpacing: ".18em", textTransform: "uppercase", color: "#616B77" }}>AI estimating &amp; sales desk for concrete contractors</span>
              </div>
              <h1 style={{ margin: 0, fontFamily: disp, fontWeight: 700, fontSize: "clamp(46px,8vw,92px)", lineHeight: 0.92, letterSpacing: "-.005em", textTransform: "uppercase", textWrap: "balance" }}>{HEADLINE}</h1>
              <p style={{ margin: 0, maxWidth: 560, fontSize: "clamp(16px,1.6vw,19px)", lineHeight: 1.5, color: "#3A4249", textWrap: "pretty" }}>{HERO}</p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", marginTop: 4 }}>
                <a href="#apply" className="sc-cta sc-hero-btn" style={{ height: 52, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "center", background: "#F2610C", textDecoration: "none", borderRadius: 2, fontFamily: disp, fontWeight: 700, fontSize: 19, letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{CTA_LONG}</a>
                <a href="#how" className="sc-ghost sc-hero-btn" style={{ height: 52, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #12161A", textDecoration: "none", borderRadius: 2, fontFamily: disp, fontWeight: 600, fontSize: 17, letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>See a lead become a proposal</a>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "#616B77" }}>Built by a working concrete contractor. You set the prices and approve everything that goes out.</p>
            </div>

            {/* phone demo: the real app, call to final proposal */}
            <div style={{ flex: "0 1 300px", minWidth: 300, margin: "0 auto", display: "flex", justifyContent: "center" }}>
              <FieldDemo />
            </div>
          </div>
        </section>

        {/* problem */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 20px 8px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 48px", alignItems: "flex-start" }}>
            <h2 style={{ ...bigHead("clamp(34px,4.5vw,52px)"), flex: "0 1 380px" }}>The pour can’t wait. Neither can the next customer.</h2>
            <div style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 14, fontSize: "clamp(16px,1.5vw,18px)", lineHeight: 1.55, color: "#3A4249" }}>
              <p style={{ margin: 0, textWrap: "pretty" }}>You’re running the crew when a homeowner calls about a driveway. The photos show up later. The measurements are in a text. The estimate is still not done after dinner.</p>
              <p style={{ margin: 0, textWrap: "pretty" }}>ScopeCrete turns those scattered details into a budget you can review and a proposal you can send. Less rebuilding the job from memory. One clear next step for every lead.</p>
            </div>
          </div>
        </section>

        {/* how it works */}
        <section id="how" style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 20px 20px", display: "flex", flexDirection: "column", gap: 22 }}>
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

        {/* approve, don't rebuild */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px 8px" }}>
          <div style={{ position: "relative", border: "1px solid #C8CDD3", background: "#FFFFFF", display: "flex", flexWrap: "wrap" }}>
            <span style={corner("tl")} /><span style={corner("br")} />
            <div style={{ flex: "1 1 380px", minWidth: 0, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
              <h2 style={bigHead("clamp(32px,4vw,46px)")}>Approve the budget. Don’t rebuild it from scratch.</h2>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "#3A4249", textWrap: "pretty" }}>It’s easier to approve a budget than build one in the field. You should be checking quantities, access, assumptions and margin, not retyping the same job after a day on the slab. Every number shows where it came from, and anything you haven’t confirmed is flagged.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, background: "#DCE0E5", border: "1px solid #DCE0E5" }}>
                {[
                  ["Your prices", "Labor, materials, equipment, overhead and margin from your price book."],
                  ["Your judgment", "You decide what’s in scope and what needs an onsite check."],
                  ["Your approval", "Nothing is priced or sent to a customer until you say so."],
                ].map(([t, d]) => (
                  <div key={t} style={{ background: "#FFFFFF", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 17, letterSpacing: ".04em", textTransform: "uppercase" }}>{t}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.4, color: "#616B77" }}>{d}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 340px", minWidth: 0, padding: 24, ...paper20, borderLeft: "1px solid #DCE0E5", display: "flex", alignItems: "center" }}>
              {/* a picture of a budget, not a control: sample numbers only */}
              <div aria-label="Sample draft budget" style={{ width: "100%", maxWidth: 420, margin: "0 auto", background: "#FFFFFF", border: "1px solid #C8CDD3", boxShadow: "0 10px 30px -18px rgba(18,22,26,.4)", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #DCE0E5", display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 18, textTransform: "uppercase" }}>Wilson driveway · draft budget</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: disp, fontWeight: 600, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#C94F08", border: "1px solid #F2610C", padding: "2px 6px", whiteSpace: "nowrap" }}>Waiting on you</span>
                </div>
                {BUDGET.map((b) => (
                  <div key={b.k} style={{ padding: "9px 14px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "baseline", gap: 10, fontSize: 14, background: b.flag ? "#FFF6F0" : "#FFFFFF" }}>
                    <span>{b.k}</span>
                    <span style={{ fontSize: 12, color: b.nc }}>{b.note}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{b.v}</span>
                  </div>
                ))}
                <div style={{ padding: "12px 14px", display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#616B77" }}>Your cost · $11,164</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 24, fontVariantNumeric: "tabular-nums" }}>$12,612</span>
                </div>
                <div aria-hidden="true" style={{ padding: "0 14px 14px", display: "flex", gap: 8 }}>
                  <span style={{ flex: 1, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "#F2610C", color: "#FFFFFF", fontFamily: disp, fontWeight: 700, fontSize: 15, letterSpacing: ".1em", textTransform: "uppercase" }}>Approve</span>
                  <span style={{ flex: 1, height: 40, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #12161A", fontFamily: disp, fontWeight: 600, fontSize: 15, letterSpacing: ".1em", textTransform: "uppercase" }}>Needs site visit</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* dusty */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px 8px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 32px", alignItems: "center", border: "1px solid #DCE0E5", background: "#FFFFFF", padding: "20px 22px" }}>
            <Dusty mode="listen" size={96} />
            <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 6 }}>
              <h2 style={bigHead("clamp(26px,3vw,34px)")}>Dusty runs the desk</h2>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5, color: "#3A4249", textWrap: "pretty" }}>He picks up the lines, sorts customers from vendors and spam, pulls the job facts out of each conversation and keeps the next step in front of you. He drafts. You decide.</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DUSTY_JOBS.map((j) => (
                <span key={j.t} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #DCE0E5", padding: "6px 10px 6px 6px" }}>
                  <Dusty mode={j.mode} size={28} />
                  <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 15, letterSpacing: ".04em", textTransform: "uppercase" }}>{j.t}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* available / planned */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: "24px 40px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, flex: "none", borderRadius: "50%", background: "#1FA971" }} />
              <h2 style={eyebrow}>Available · used in our contracting business</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 1, background: "#DCE0E5", border: "1px solid #DCE0E5" }}>
              {FEATURES.map((f) => (
                <div key={f.t} style={{ background: "#FFFFFF", padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="18" height="18" viewBox="0 0 19 19" fill="none" stroke="#3E6489" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden="true"><path d={f.icon} /></svg>
                    <h3 style={{ margin: 0, fontFamily: disp, fontWeight: 700, fontSize: 17, lineHeight: 1.05, textTransform: "uppercase" }}>{f.t}</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: "#616B77", textWrap: "pretty" }}>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ ...eyebrow, color: "#8A95A1" }}>Planned · labeled, not promised</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {COMING.map((c) => (
                <div key={c.t} style={{ border: "1px dashed #B9C0C8", padding: "9px 12px", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 14, lineHeight: 1.35, color: "#3A4249" }}>{c.t}</span>
                  {c.note && <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "#8A95A1" }}>{c.note}</span>}
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#616B77", textWrap: "pretty" }}>Features marked Available run our own concrete office today. Planned items ship when they hold up on a Tuesday pour.</p>
          </div>
        </section>

        {/* pricing */}
        <section id="pricing" style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 20px 20px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 40px", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={eyebrow}>Pricing</h2>
              <p style={bigHead("clamp(30px,3.6vw,42px)")}>One price per business. Not per crew member.</p>
            </div>
            <p style={{ margin: 0, flex: "1 1 320px", fontSize: 15, lineHeight: 1.5, color: "#3A4249", textWrap: "pretty" }}>Your owner and office team are included. Guys who only upload photos are free. No lifetime deals, no cut of your contracts.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 1, background: "#DCE0E5", border: "1px solid #DCE0E5" }}>
            {PLANS.map((p) => (
              <div key={p.name} style={{ background: "#FFFFFF", padding: "22px 22px 24px", display: "flex", flexDirection: "column", gap: 16, borderTop: `4px solid ${p.edge}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 style={{ margin: 0, fontFamily: disp, fontWeight: 700, fontSize: 28, lineHeight: 1, textTransform: "uppercase" }}>{p.name}</h3>
                  {p.tag && <span style={{ fontFamily: disp, fontWeight: 600, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#FFFFFF", background: "#F2610C", padding: "3px 7px" }}>{p.tag}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 52, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{p.price}</span>
                  <span style={{ fontSize: 14, color: "#616B77" }}>{p.per}</span>
                </div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "#3A4249", textWrap: "pretty" }}>{p.pitch}</p>
                <ul style={{ margin: 0, padding: "14px 0 0", listStyle: "none", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #DCE0E5" }}>
                  {p.items.map((i) => (
                    <li key={i} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.4, color: "#3A4249" }}>
                      <span aria-hidden="true" style={{ flex: "none", width: 14, height: 14, marginTop: 3, border: "1px solid #1FA971", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 6, height: 6, background: "#1FA971" }} /></span>
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
                {p.foot && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "#616B77", textWrap: "pretty" }}>{p.foot}</p>}
                <span style={{ flex: 1 }} />
                <a
                  href="#apply"
                  className={p.primary ? "sc-cta" : "sc-ghost sc-plan"}
                  style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", borderRadius: 2, fontFamily: disp, fontWeight: 700, fontSize: 16, letterSpacing: ".1em", textTransform: "uppercase", background: p.primary ? "#F2610C" : "#FFFFFF", border: `1px solid ${p.primary ? "#F2610C" : "#12161A"}` }}
                >
                  {p.cta}
                </a>
              </div>
            ))}
          </div>

          <div style={{ background: "#14181C", color: "#E6E9ED", padding: "22px 24px", display: "flex", flexWrap: "wrap", gap: "14px 32px", alignItems: "center" }}>
            <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: disp, fontWeight: 600, fontSize: 13, letterSpacing: ".18em", textTransform: "uppercase", color: "#F2610C" }}>Design-partner pilot · 10 seats</span>
              <span style={{ fontFamily: disp, fontWeight: 700, fontSize: "clamp(22px,2.6vw,30px)", lineHeight: 1, textTransform: "uppercase" }}>Sales Desk at $199/mo for 90 days, then $299. Setup waived.</span>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: "#C9CFD6", textWrap: "pretty" }}>In return: real jobs through the workflow, honest feedback every two weeks, and permission to ask for a case study.</span>
            </div>
            <a href="#apply" className="sc-cta" style={{ height: 48, padding: "0 24px", display: "flex", alignItems: "center", background: "#F2610C", textDecoration: "none", borderRadius: 2, fontFamily: disp, fontWeight: 700, fontSize: 17, letterSpacing: ".1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Apply for a seat</a>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 1, background: "#DCE0E5", border: "1px solid #DCE0E5" }}>
            {NOTES.map((n) => (
              <div key={n.t} style={{ background: "#FFFFFF", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 16, letterSpacing: ".04em", textTransform: "uppercase" }}>{n.t}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "#616B77" }}>{n.d}</span>
              </div>
            ))}
          </div>
        </section>

        {/* founder */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "44px 20px 20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 48px", alignItems: "flex-start", paddingTop: 28, borderTop: "2px solid #12161A" }}>
            <h2 style={{ ...bigHead("clamp(34px,4.5vw,48px)"), flex: "0 1 360px" }}>Built because the office work was costing me jobs.</h2>
            <figure style={{ margin: 0, flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 12 }}>
              <blockquote style={{ margin: 0, fontSize: "clamp(16px,1.6vw,19px)", lineHeight: 1.55, color: "#3A4249", textWrap: "pretty" }}>“I was pouring concrete all day and falling behind on estimates and callbacks every night. I needed software that used the details already coming through my phone, not another place to type them in again. So I built it for my own crew first.”</blockquote>
              <figcaption style={{ fontFamily: disp, fontWeight: 600, fontSize: 14, letterSpacing: ".12em", textTransform: "uppercase", color: "#616B77" }}>Coy Sacco · Concrete contractor · Founder, ScopeCrete</figcaption>
            </figure>
          </div>
        </section>

        {/* faq */}
        <section id="faq" style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px 20px", display: "flex", flexDirection: "column", gap: 22 }}>
          <h2 style={eyebrow}>Straight answers</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: "0 40px", borderTop: "1px solid #C8CDD3" }}>
            {FAQ.map(([q, a], i) => {
              const on = open === i;
              return (
                <div key={q} style={{ borderBottom: "1px solid #C8CDD3", padding: "16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    aria-expanded={on}
                    onClick={() => setOpen(on ? -1 : i)}
                    style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left", color: "#12161A" }}
                  >
                    <h3 style={{ margin: 0, flex: 1, fontFamily: disp, fontWeight: 700, fontSize: 21, lineHeight: 1.1, textTransform: "uppercase" }}>{q}</h3>
                    <span aria-hidden="true" style={{ width: 28, height: 28, flex: "none", border: "1px solid #B9C0C8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1, transform: on ? "rotate(45deg)" : "none", transition: "transform .2s" }}>+</span>
                  </button>
                  {on && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "#3A4249", textWrap: "pretty" }}>{a}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* apply */}
        <section id="apply" style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px 64px" }}>
          <div style={{ position: "relative", border: "1px solid #C8CDD3", background: "#FFFFFF", display: "flex", flexWrap: "wrap" }}>
            <span style={corner("tl")} /><span style={corner("br")} />
            <div style={{ flex: "1 1 340px", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 14, ...paper20, borderRight: "1px solid #DCE0E5" }}>
              <h2 style={bigHead("clamp(32px,4vw,46px)")}>Ten seats. Real jobs. Honest feedback.</h2>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: "#3A4249", textWrap: "pretty" }}>We’re taking ten design partners who match the work we know. Tell us about your shop and we’ll set up a walkthrough with one of your real leads.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, color: "#616B77" }}>
                <span>Owner-run residential or light-commercial concrete.</span>
                <span>Repeatable driveway, patio and slab work.</span>
                <span>Willing to keep a price book current.</span>
              </div>
            </div>
            <form onSubmit={apply} style={{ flex: "1 1 380px", padding: "28px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "14px 16px", alignContent: "start" }}>
              <label style={label}>Name<input type="text" name="name" required autoComplete="name" style={field} /></label>
              <label style={label}>Company<input type="text" name="company" autoComplete="organization" style={field} /></label>
              <label style={label}>Email<input type="email" name="email" required autoComplete="email" style={field} /></label>
              <label style={label}>Inquiries a month
                <select name="inquiries" style={{ ...field, padding: "0 10px" }}>{INQUIRIES.map((o) => <option key={o}>{o}</option>)}</select>
              </label>
              <label style={{ ...label, gridColumn: "1 / -1" }}>Biggest bottleneck right now
                <textarea name="bottleneck" rows={3} placeholder="e.g. Estimates sit for a week before I get to them." style={{ ...field, height: "auto", padding: "10px 12px", resize: "vertical" }} />
              </label>
              <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px" }}>
                <button type="submit" className="sc-cta" style={{ height: 50, padding: "0 26px", border: 0, background: "#F2610C", cursor: "pointer", borderRadius: 2, fontFamily: disp, fontWeight: 700, fontSize: 18, letterSpacing: ".1em", textTransform: "uppercase" }}>{CTA_LONG}</button>
                <span role="status" style={{ fontSize: 13, color: "#616B77", textWrap: "pretty" }}>
                  {mailed
                    ? <>Your email app should be open with this filled in. Press Send there. Nothing opened? Write to <a href={`mailto:${MAIL}`}>{MAIL}</a>.</>
                    : "Five fields. It opens your email to send. We reply within one business day."}
                </span>
              </div>
            </form>
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
          <nav className="sc-foot" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 22px", fontSize: 14 }}>
            <a href="#pricing">Pilot terms</a>
            <a href={LOGIN_URL} className="sc-foot-login" style={{ fontFamily: disp, fontWeight: 600, fontSize: 16, letterSpacing: ".1em", textTransform: "uppercase" }}>Log in</a>
            <a href={`mailto:${MAIL}`} className="sc-foot-mail">{MAIL}</a>
            <span style={{ color: "#8A95A1" }}>© 2026 ScopeCrete</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
