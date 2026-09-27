import React, { useState, useMemo, useRef, useEffect } from "react";

/* ============================================================
   ScopeCrete v32 — customer page, and activity split from alerts
   ALL NUMBERS ARE MOCK.

   Header, identical on every page:
     emblem + wordmark · search · pipeline · + · menu · account
     search expands a bar under the glass
     pipeline drops a four-number panel, with a door to the full board

   Footer, left to right:
     Threads · Scope · EMBLEM (center, unlabelled) · Cash · More
     Jobs moved into More alongside Schedule, Daily logs, Docs,
     Customers, Vendors, Receipts & invoices, Pipeline

   Scope Builder is live: four tabs (Scope / Costs / Notes / Plans),
   editable sections, openable cost cards, a generated scope of work,
   the 12×20×4″ calibration check, and the files attached to the job.
   Opening it from a thread seeds the sections with the dimensions the
   conversation already gave up — you never retype what was said.
   Generate quote snapshots the scope into a versioned document.

   Documents (behind More) lists quotes, invoices and expenses, filtered
   by kind and sortable by date, amount, customer or status. A quote
   opens the builder: versions, estimate-vs-quote, three levels of cost
   disclosure, payment schedule, and a live preview of the paper the
   customer actually receives.
   Reached from the footer, or from Scope on a customer thread — which
   carries that customer in. Vendor and sub threads have no Scope
   button at all. THE MATH IS v8's AND KNOWN WRONG; flow first.

   Dusty is a FULL SCREEN page, not a drawer. Default view is a new
   chat; history slides in from the LEFT behind the hamburger, so it
   never collides with the right-hand drawers. Composer has attach
   and hold-to-talk.

   Threads page carries no stat boxes and no search row — the counts
   ride on the filter chips, the dollars live in the pipeline panel.
   ============================================================ */

const T = {
  slab: "#E9EBEE", card: "#FFFFFF", ink: "#12161A", ink2: "#616B77", ink3: "#8A95A1",
  hair: "#DCE0E5", hairSoft: "#F0F2F4",
  chalk: "#1B5FD9", chalkDim: "#EAF0FC",
  hiviz: "#F2610C", hivizDim: "#FFF1E7",
  green: "#0F8A4F", greenDim: "#E6F5ED",
  violet: "#6B4BD6", violetDim: "#F1EFFB",
  red: "#C0341D", redDim: "#FBECE9",
  dark: "#14181C", darkHair: "#262C33",
  pulse: "#1FA971",
};

/* ---- money palette ----
   Softer than the UI tokens: teal for cash already in, indigo for
   committed, sand for projected, clay for what goes out. Clay is
   deliberately still a warning colour — a week that lost money should
   not look like a prize. Nothing here is brighter than the truth. */
const M = {
  inDark: "#0E6F63", inLight: "#2FA795",
  comDark: "#3A55C9", comLight: "#6D86EE",
  projDark: "#C08A2E", projLight: "#EDC66A",
  outDark: "#B14A34", outLight: "#E08469",
  line: "#12B886", lineSoft: "rgba(18,184,134,.16)",
  grid: "#EDEFF2", axis: "#C9CFD6",
};
const F = { xxl: 34, xl: 26, lg: 19, md: 15, sm: 13, xs: 11, micro: 9.5 };
const disp = "'Barlow Condensed', system-ui, sans-serif";
const body = "'IBM Plex Sans', system-ui, sans-serif";
const eyebrow = { fontFamily: disp, fontSize: F.micro, letterSpacing: ".14em", textTransform: "uppercase", color: T.ink3, lineHeight: 1.3 };
const nums = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const clip = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

const money0 = (n) => (n < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("en-US");

/* ------------------------------------------------------------------
   Ported from v8 with the engine. `money` prints cents (bid math),
   `num` is the fixed-decimal helper the engine's readouts use.
------------------------------------------------------------------ */
const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n, d = 2) => (Number(n) || 0).toFixed(d);

const moneyK = (n) => {
  const v = Math.abs(Number(n) || 0), s = n < 0 ? "-" : "";
  return v >= 1000 ? s + "$" + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k" : s + "$" + Math.round(v);
};

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOWL = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DOW = ["M","T","W","T","F","S","S"];
const pad = (n) => String(n).padStart(2, "0");
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; };
const dnum = (s) => { const { y, m, d } = parse(s); return Date.UTC(y, m, d) / 86400000; };
const fromNum = (n) => { const t = new Date(n * 86400000); return key(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
const dowOf = (s) => { const { y, m, d } = parse(s); return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; };
const mondayOf = (s) => fromNum(dnum(s) - dowOf(s));
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/* ============================================================ MOCK */
const TODAY = "2026-08-13";
const ANCHOR = { as_of: "2026-05-31", balance: 43161, expected: 44791 };

const JOBS = [
  { id: "j0", num: "24-290", name: "Thibodeaux — warehouse apron", status: "won", total: 21400 },
  { id: "j1", num: "24-318", name: "Gulfline Paving — Old Hammond", status: "won", total: 34120 },
  { id: "j2", num: "24-401", name: "Vega — Government St shop slab", status: "won", total: 11850 },
  { id: "j3", num: "24-407", name: "Duplessis driveway", status: "quoted", total: 7460 },
  { id: "j4", num: "24-409", name: "Rousseau patio + walk", status: "quoted", total: 4200 },
  { id: "j5", num: "24-412", name: "Bergeron shop apron", status: "quoted", total: 16400 },
];
const INVOICES = [
  { id: "h1", job: "j0", label: "Deposit",  amount: 5350,  due_on: "2026-06-03", status: "paid" },
  { id: "h2", job: "j0", label: "Progress", amount: 8560,  due_on: "2026-06-19", status: "paid" },
  { id: "h3", job: "j0", label: "Final",    amount: 7490,  due_on: "2026-07-08", status: "paid" },
  { id: "i1", job: "j1", label: "Deposit",  amount: 8530,  due_on: "2026-08-04", status: "paid" },
  { id: "i2", job: "j1", label: "Progress", amount: 13648, due_on: "2026-08-18", status: "sent" },
  { id: "i3", job: "j1", label: "Final",    amount: 11942, due_on: "2026-09-02", status: "sent" },
  { id: "i4", job: "j2", label: "Deposit",  amount: 2963,  due_on: "2026-08-11", status: "paid" },
  { id: "i5", job: "j2", label: "Final",    amount: 8887,  due_on: "2026-08-27", status: "sent" },
];
const PAYMENTS = [
  { id: "q1", inv: "h1", job: "j0", amount: 5350, received_on: "2026-06-05" },
  { id: "q2", inv: "h2", job: "j0", amount: 8560, received_on: "2026-06-24" },
  { id: "q3", inv: "h3", job: "j0", amount: 7490, received_on: "2026-07-14" },
  { id: "p1", inv: "i1", job: "j1", amount: 8530, received_on: "2026-08-06" },
  { id: "p2", inv: "i4", job: "j2", amount: 2963, received_on: "2026-08-12" },
];
const RECEIPTS = [
  { id: "s1", job: "j0", vendor: "Redi-Mix South", amount: 4820, on: "2026-06-04", type: "material" },
  { id: "s2", job: "j0", vendor: "Crew draw",      amount: 5200, on: "2026-06-12", type: "labor" },
  { id: "s3", job: "j0", vendor: "United Rentals", amount: 1180, on: "2026-06-17", type: "equipment" },
  { id: "s4", job: "j0", vendor: "Redi-Mix South", amount: 3140, on: "2026-07-02", type: "material" },
  { id: "s5", job: "j0", vendor: "Crew draw",      amount: 3600, on: "2026-07-09", type: "labor" },
  { id: "r1", job: "j1", vendor: "Redi-Mix South", amount: 6180, on: "2026-08-05", type: "material" },
  { id: "r2", job: "j1", vendor: "United Rentals", amount: 1624, on: "2026-08-07", type: "equipment" },
  { id: "r3", job: "j2", vendor: "Redi-Mix South", amount: 2210, on: "2026-08-12", type: "material" },
  { id: "r4", job: "j1", vendor: "Crew draw",      amount: 4100, on: "2026-08-14", type: "labor" },
  { id: "r5", job: "j2", vendor: "Sunbelt",        amount: 890,  on: "2026-08-19", type: "equipment" },
];
const OVERHEAD_SEED = [
  { id: "o1", label: "Equipment notes",     category: "equipment", amount: 3000, cadence: "monthly", due_day: 5,  active: true },
  { id: "o2", label: "Website + marketing", category: "fixed",     amount: 1200, cadence: "monthly", due_day: 1,  active: true },
  { id: "o3", label: "Software",            category: "fixed",     amount: 300,  cadence: "monthly", due_day: 15, active: true },
  { id: "o4", label: "General liability",   category: "insurance", amount: 2700, cadence: "annual",  due_day: 20, due_month: 4, active: true },
  { id: "o5", label: "Fuel + misc",         category: "variable",  amount: 450,  cadence: "monthly", due_day: 22, active: true },
];
const COMP = { mode: "fixed_draw", monthly_draw: 4500, draw_day: 28, profit_pct: 35 };
const OFF_TOP_PCT = 11;
const CLOSE = { rate: 42, sample: 19 };

const RIBBON = (() => {
  const { y, m } = parse(TODAY), out = [];
  for (let i = -14; i <= 10; i++) { const t = y * 12 + m + i; out.push({ y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }); }
  return out;
})();
const NOW_IDX = 14;

/* ============================================================ AGG */
const paidByInv = {};
PAYMENTS.forEach((p) => { paidByInv[p.inv] = (paidByInv[p.inv] || 0) + p.amount; });

function overheadHits(items, s, e) {
  const hits = [];
  for (let n = dnum(s); n <= dnum(e); n++) {
    const iso = fromNum(n), { m, d } = parse(iso);
    items.forEach((o) => {
      if (!o.active) return;
      const mo = o.cadence === "monthly" && o.due_day === d;
      const an = o.cadence === "annual" && o.due_day === d && (o.due_month || 1) === m + 1;
      if (mo || an) hits.push({ label: o.label, amount: o.amount, on: iso, kind: "overhead" });
    });
  }
  return hits;
}
function drawHits(s, e) {
  if (COMP.mode !== "fixed_draw") return [];
  const hits = [];
  for (let n = dnum(s); n <= dnum(e); n++) {
    const iso = fromNum(n);
    if (parse(iso).d === COMP.draw_day) hits.push({ label: "Your draw", amount: COMP.monthly_draw, on: iso, kind: "draw" });
  }
  return hits;
}
function bucket(start, end, label, sub, overhead, showProjected, allowProjected) {
  const inR = (d) => dnum(d) >= dnum(start) && dnum(d) <= dnum(end);
  const pays = PAYMENTS.filter((p) => inR(p.received_on));
  const collected = pays.reduce((s, p) => s + p.amount, 0);
  let committed = 0; const commits = [];
  INVOICES.forEach((inv) => {
    const outstanding = inv.amount - (paidByInv[inv.id] || 0);
    if (outstanding <= 0 || inv.status === "draft") return;
    if (inR(inv.due_on)) { committed += outstanding; commits.push({ ...inv, outstanding }); }
  });
  let projected = 0;
  if (showProjected && allowProjected && dnum(end) > dnum(TODAY)) {
    const pipeline = JOBS.filter((j) => j.status === "quoted").reduce((s, j) => s + j.total, 0) * (CLOSE.rate / 100);
    projected = (pipeline / 120) * (dnum(end) - dnum(start) + 1);
  }
  const recs = RECEIPTS.filter((r) => inR(r.on));
  const oh = overheadHits(overhead, start, end), dr = drawHits(start, end);
  return {
    id: start, start, end, label, sub, collected, committed, projected,
    costOut: recs.reduce((s, r) => s + r.amount, 0),
    overheadOut: oh.reduce((s, h) => s + h.amount, 0),
    drawOut: dr.reduce((s, h) => s + h.amount, 0),
    get totalIn() { return this.collected + this.committed + this.projected; },
    get totalOut() { return this.costOut + this.overheadOut + this.drawOut; },
    events: {
      in: [
        ...pays.map((p) => ({ label: (JOBS.find((j) => j.id === p.job) || {}).num + " payment", amount: p.amount, kind: "collected" })),
        ...commits.map((c) => ({ label: (JOBS.find((j) => j.id === c.job) || {}).num + " " + c.label.toLowerCase() + " due", amount: c.outstanding, kind: "committed" })),
      ],
      out: [...recs.map((r) => ({ label: r.vendor, amount: r.amount, kind: r.type })), ...oh, ...dr],
    },
  };
}
const monthBucket = (y, m, oh, sp) => bucket(key(y, m, 1), key(y, m, lastDay(y, m)), MON[m], null, oh, sp, true);
function weeksOf(y, m, oh, sp) {
  const first = key(y, m, 1), last = key(y, m, lastDay(y, m)), out = [];
  let cur = mondayOf(first);
  while (dnum(cur) <= dnum(last)) {
    const wkEnd = fromNum(dnum(cur) + 6);
    const s = dnum(cur) < dnum(first) ? first : cur, e = dnum(wkEnd) > dnum(last) ? last : wkEnd;
    const b = bucket(s, e, `${parse(s).d}–${parse(e).d}`, null, oh, sp, true);
    b.weekStart = cur; b.partial = s !== cur || e !== wkEnd;
    out.push(b); cur = fromNum(dnum(cur) + 7);
  }
  return out;
}
const daysOf = (weekStart, oh) => Array.from({ length: 7 }, (_, i) => {
  const d = fromNum(dnum(weekStart) + i);
  const b = bucket(d, d, DOW[i], String(parse(d).d), oh, false, false);
  b.isDay = true; return b;
});

/* ============================================================ EMBLEM */
/* ------------------------------------------------------------------
   CANONICAL EMBLEM — single source of truth.
   Diamond outline → spaced square outline → filled circle core.
   Identical geometry to the holding page. When this ports to the
   repo, delete this block and pull the shared component in from
   src/components/Emblem instead.
   Do not redraw it per-screen; that is how the three versions drifted.
------------------------------------------------------------------ */
const Emblem = ({ size = 22, stroke = 2.6, ring = T.hiviz, core = T.pulse, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" className={className}
       style={{ display: "block", overflow: "visible" }} aria-hidden="true">
    <polygon className="sc-em-diamond" points="50,3 97,50 50,97 3,50" fill="none" stroke={ring}
             strokeWidth={stroke} strokeLinejoin="miter" />
    <rect className="sc-em-square" x="29" y="29" width="42" height="42" fill="none" stroke={ring} strokeWidth={stroke} />
    <circle className="sc-em-core" cx="50" cy="50" r="12.5" fill={core} />
  </svg>
);

/* ============================================================ RIBBON */
function Ribbon({ months, layers, selected, onSelect }) {
  const MW = 54, H = 158, padT = 14, padB = 22;
  const W = months.length * MW, plotH = H - padT - padB;
  const axisY = padT + plotH * 0.58;
  const upH = axisY - padT, dnH = padT + plotH - axisY;
  const scroller = useRef(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = NOW_IDX * MW + MW / 2 - el.clientWidth / 2; }, []);

  const maxIn = Math.max(...months.map((b) =>
    (layers.collected ? b.collected : 0) + (layers.committed ? b.committed : 0) + (layers.projected ? b.projected : 0)), 1);
  const maxOut = Math.max(...months.map((b) => b.totalOut), 1);
  const barW = 24;

  let run = ANCHOR.balance;
  const pts = months.map((b, i) => {
    if (dnum(b.end) >= dnum(ANCHOR.as_of)) run += b.collected + b.committed - b.totalOut;
    return { x: MW * i + MW / 2, v: run, past: dnum(b.end) <= dnum(TODAY) };
  });
  const lo = Math.min(0, ...pts.map((p) => p.v)), hi = Math.max(ANCHOR.balance, ...pts.map((p) => p.v));
  const netY = (v) => padT + plotH - ((v - lo) / Math.max(hi - lo, 1)) * plotH;

  return (
    <div ref={scroller} style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch", background: T.card }}>
      <svg width={W} height={H} style={{ display: "block" }}>
        <defs>
          <linearGradient id="gIn" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={M.inDark} /><stop offset="100%" stopColor={M.inLight} />
          </linearGradient>
          <linearGradient id="gCom" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={M.comDark} /><stop offset="100%" stopColor={M.comLight} />
          </linearGradient>
          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={M.outLight} /><stop offset="100%" stopColor={M.outDark} />
          </linearGradient>
          <linearGradient id="gLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={M.lineSoft} /><stop offset="100%" stopColor="rgba(18,184,134,0)" />
          </linearGradient>
          <pattern id="h12" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#FBF3E2" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={M.projLight} strokeWidth="2.4" />
          </pattern>
        </defs>
        {months.map((b, i) => {
          const jan = parse(b.start).m === 0;
          return (
            <g key={"bg" + b.id}>
              {selected === i && <rect x={MW * i + 2} y={2} width={MW - 4} height={H - 20} rx="6" fill="#F4F6F8" />}
              {jan && <line x1={MW * i} y1={2} x2={MW * i} y2={H - 16} stroke={M.grid} strokeWidth="1" />}
              {jan && <text x={MW * i + 3} y={10} style={{ fontFamily: disp, fontSize: 9, fill: T.ink3, letterSpacing: ".1em" }}>{parse(b.start).y}</text>}
              {i === NOW_IDX && <rect x={MW * i + 2} y={2} width={MW - 4} height={H - 20} rx="6" fill="none" stroke={T.hiviz} strokeWidth="1.25" strokeDasharray="3 3" opacity=".8" />}
            </g>
          );
        })}
        <line x1={0} y1={axisY} x2={W} y2={axisY} stroke={M.axis} strokeWidth="1" />
        {months.map((b, i) => {
          const cx = MW * i + MW / 2, x = cx - barW / 2, sel = selected === i;
          let y = axisY; const seg = [];
          if (layers.collected && b.collected > 0) { const h = (b.collected / maxIn) * upH; y -= h; seg.push({ y, h, fill: "url(#gIn)" }); }
          if (layers.committed && b.committed > 0) { const h = (b.committed / maxIn) * upH; y -= h; seg.push({ y, h, fill: "url(#gCom)" }); }
          if (layers.projected && b.projected > 0) { const h = (b.projected / maxIn) * upH; y -= h; seg.push({ y, h, fill: "url(#h12)" }); }
          const outH = (b.totalOut / maxOut) * dnH * 0.85;
          const topSeg = seg.length ? seg[seg.length - 1] : null;
          return (
            <g key={b.id} onClick={() => onSelect(i)} style={{ cursor: "pointer" }}>
              <rect x={MW * i} y={0} width={MW} height={H} fill="transparent" />
              {seg.map((sg, k) => <rect key={k} x={x} y={sg.y} width={barW} height={sg.h} fill={sg.fill} />)}
              {topSeg && <rect x={x} y={topSeg.y} width={barW} height={Math.min(topSeg.h, 7)} rx="3.5" fill={topSeg.fill} />}
              {b.totalOut > 0 && <rect x={x} y={axisY} width={barW} height={outH} rx="3" fill="url(#gOut)" opacity=".92" />}
              <text x={cx} y={H - 5} textAnchor="middle"
                style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".04em",
                  fill: i === NOW_IDX ? T.hiviz : sel ? T.ink : T.ink3, fontWeight: sel || i === NOW_IDX ? 700 : 400 }}>{b.label}</text>
            </g>
          );
        })}
        {layers.net && (
          <>
            <polygon fill="url(#gLine)"
              points={`${pts[0].x},${padT + plotH} ` + pts.map((p) => `${p.x},${netY(p.v)}`).join(" ") + ` ${pts[pts.length - 1].x},${padT + plotH}`} />
            <polyline fill="none" stroke={M.line} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              points={pts.map((p) => `${p.x},${netY(p.v)}`).join(" ")} />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={netY(p.v)} r={i === NOW_IDX ? 3.4 : 2.2}
                fill={i === NOW_IDX ? M.line : "#fff"} stroke={M.line} strokeWidth="1.6"
                opacity={p.past ? 1 : .55} />
            ))}
          </>
        )}
      </svg>
    </div>
  );
}

/* ============================================================ BAND */
function Band({ buckets, picked, onPick, isDays }) {
  const H = 118, padT = 8, padB = 24;
  const plotH = H - padT - padB, axisY = padT + plotH / 2;
  const max = Math.max(...buckets.map((b) => Math.max(b.collected + b.committed + b.projected, b.totalOut)), 1);
  const n = buckets.length, W = 340, slot = W / n, bw = Math.min(isDays ? 20 : 40, slot * 0.6);
  const half = plotH / 2 - 3;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id="bIn" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={M.inDark} /><stop offset="100%" stopColor={M.inLight} />
        </linearGradient>
        <linearGradient id="bCom" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={M.comDark} /><stop offset="100%" stopColor={M.comLight} />
        </linearGradient>
        <linearGradient id="bOut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={M.outLight} /><stop offset="100%" stopColor={M.outDark} />
        </linearGradient>
      </defs>
      <line x1={0} y1={axisY} x2={W} y2={axisY} stroke={M.axis} strokeWidth="1" />
      {buckets.map((b, i) => {
        const cx = slot * i + slot / 2, x = cx - bw / 2, sel = picked === i;
        const isNow = dnum(TODAY) >= dnum(b.start) && dnum(TODAY) <= dnum(b.end);
        let y = axisY; const seg = [];
        if (b.collected > 0) { const h = (b.collected / max) * half; y -= h; seg.push({ y, h, fill: "url(#bIn)" }); }
        if (b.committed > 0) { const h = (b.committed / max) * half; y -= h; seg.push({ y, h, fill: "url(#bCom)" }); }
        if (b.projected > 0) { const h = (b.projected / max) * half; y -= h; seg.push({ y, h, fill: "url(#h12)" }); }
        const outH = (b.totalOut / max) * half;
        const net = b.totalIn - b.totalOut, quiet = b.totalIn === 0 && b.totalOut === 0;
        const topSeg = seg.length ? seg[seg.length - 1] : null;
        return (
          <g key={b.id} onClick={() => onPick(i)} style={{ cursor: "pointer" }}>
            <rect x={slot * i + 1} y={2} width={slot - 2} height={H - 4} rx="6" fill={sel ? "#F4F6F8" : "transparent"} />
            {seg.map((sg, k) => <rect key={k} x={x} y={sg.y} width={bw} height={sg.h} fill={sg.fill} />)}
            {topSeg && <rect x={x} y={topSeg.y} width={bw} height={Math.min(topSeg.h, 6)} rx="3" fill={topSeg.fill} />}
            {b.totalOut > 0 && <rect x={x} y={axisY} width={bw} height={outH} rx="3" fill="url(#bOut)" opacity=".92" />}
            {quiet && <circle cx={cx} cy={axisY} r="2" fill={T.hair} />}
            <text x={cx} y={H - 12} textAnchor="middle"
              style={{ fontFamily: disp, fontSize: 10, fill: isNow ? T.hiviz : sel ? T.ink : T.ink3, fontWeight: isNow ? 700 : 400 }}>{b.label}</text>
            {!quiet && (
              <text x={cx} y={H - 2} textAnchor="middle"
                style={{ fontFamily: disp, fontSize: 9.5, fontWeight: 600, ...nums, fill: net >= 0 ? M.inDark : M.outDark }}>
                {net >= 0 ? "+" : ""}{moneyK(net)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}


/* ============================================================ SCOPE BUILDER
   Ported forward from v8. The contractor's structured record of what
   the job actually is — sections he can edit, cost cards he can open,
   a scope of work written for him, and the plans that came in.

   THE MATH IS v8's AND IS KNOWN WRONG: crew-hour labor and one global
   markup. Per DECISIONS §3-4 it has to become per-sqft labor and
   per-cost-type markup, and discounts must touch price only. Kept as
   is on purpose so the flow and feel can be judged first.
============================================================ */
const ZIP_TAX = { "708": 0.08, "707": 0.0845, "701": 0.0945, "703": 0.0895, "704": 0.0895 };
const taxForZip = (z) => ZIP_TAX[String(z || "").slice(0, 3)] ?? 0.08;

const DEFAULTS = {
  concretePrice: { 3000: 148, 4000: 155, 5000: 168 },
  shortloadPct: 0.15, shortloadThresholdCY: 5,
  dowels: { on: false, price: 3.25, spacingIn: 24 },
  rebar4: { on: false, price: 14.5, gridIn: 18 },
  rebar5: { on: false, price: 22.0, gridIn: 18 },
  mesh: { on: true, gauge: "10ga", price: { "10ga": 110, "6ga": 165, "4ga": 210 }, coverageSqft: 150 },
  vaporBarrier: { on: false, price: 92, coverageSqft: 1000 },
  sandBase: { on: true, rate: 0.3 },
  geotextile: { on: false, rate: 0.22 },
  gravelBase: { on: false, rate: 0.85 },
  mobilization: 750, burnRate: 36, crewSize: 4, productionRate: 60, hoursPerDay: 8,
  formingRate: 2.25, finishingRate: 4.75, logisticsDays: 0.25,
  trailer: { on: true, rate: 75 }, skid: { on: false, rate: 265 }, saw: { on: false, rate: 95 },
  fuelFlat: 35, placement: "tailgate", buggyRate: 185, pumpPerYd: 32, pumpMin: 850,
  overheadPct: 0.1, demo: { on: false, rate: 3.5 },
  markupPct: 0.15, zip: "70805",
};

function computeJob(sections, c) {
  const per = sections.map((s) => {
    const L = (Number(s.Lft) || 0) + (Number(s.Lin) || 0) / 12;
    const W = (Number(s.Wft) || 0) + (Number(s.Win) || 0) / 12;
    const sqft = L * W;
    return { id: s.id, name: s.name, L, W, sqft, perimeter: 2 * (L + W), cy: (sqft * ((Number(s.depthIn) || 0) / 12)) / 27, psi: s.psi, depthIn: Number(s.depthIn) || 0, note: s.note };
  });
  const sqft = per.reduce((a, b) => a + b.sqft, 0);
  const sqyd = sqft / 9;
  const cy = per.reduce((a, b) => a + b.cy, 0);
  const perimeter = per.reduce((a, b) => a + b.perimeter, 0);

  const M = [];
  const concreteCost = per.reduce((a, s) => a + s.cy * (c.concretePrice[s.psi] ?? c.concretePrice[4000]), 0);
  M.push({ name: `Ready mix (${per.length > 1 ? "mixed PSI" : (per[0]?.psi ?? 4000) + " PSI"})`, qty: cy, unit: "CY", unitCost: cy ? concreteCost / cy : 0, total: concreteCost, auto: true });
  const shortload = cy > 0 && cy < c.shortloadThresholdCY ? concreteCost * c.shortloadPct : 0;
  if (shortload > 0) M.push({ name: `Shortload surcharge (${cy.toFixed(2)} CY)`, qty: 1, unit: "job", unitCost: shortload, total: shortload, auto: true, flag: true });
  if (c.dowels.on) { const q = Math.ceil(perimeter / (c.dowels.spacingIn / 12)); M.push({ name: `Dowels @ ${c.dowels.spacingIn}" o.c.`, qty: q, unit: "pc", unitCost: c.dowels.price, total: q * c.dowels.price }); }
  const gridPieces = (g) => { const sp = g / 12; const lf = per.reduce((a, s) => a + (s.W / sp) * s.L + (s.L / sp) * s.W, 0); return Math.ceil(lf / 20); };
  if (c.rebar4.on) { const q = gridPieces(c.rebar4.gridIn); M.push({ name: `#4 rebar 20ft @ ${c.rebar4.gridIn}" grid`, qty: q, unit: "pc", unitCost: c.rebar4.price, total: q * c.rebar4.price }); }
  if (c.rebar5.on) { const q = gridPieces(c.rebar5.gridIn); M.push({ name: `#5 rebar 20ft @ ${c.rebar5.gridIn}" grid`, qty: q, unit: "pc", unitCost: c.rebar5.price, total: q * c.rebar5.price }); }
  if (c.mesh.on) { const q = Math.ceil(sqft / c.mesh.coverageSqft); const p = c.mesh.price[c.mesh.gauge]; M.push({ name: `Wire mesh ${c.mesh.gauge}`, qty: q, unit: "roll", unitCost: p, total: q * p }); }
  if (c.vaporBarrier.on) { const q = Math.ceil(sqft / c.vaporBarrier.coverageSqft); M.push({ name: "Vapor barrier", qty: q, unit: "roll", unitCost: c.vaporBarrier.price, total: q * c.vaporBarrier.price }); }
  if (c.sandBase.on) M.push({ name: "Sand base", qty: sqft, unit: "sqft", unitCost: c.sandBase.rate, total: sqft * c.sandBase.rate });
  if (c.geotextile.on) M.push({ name: "Geotextile fabric", qty: sqft, unit: "sqft", unitCost: c.geotextile.rate, total: sqft * c.geotextile.rate });
  if (c.gravelBase.on) M.push({ name: "Gravel base", qty: sqft, unit: "sqft", unitCost: c.gravelBase.rate, total: sqft * c.gravelBase.rate });
  const matSubtotal = M.reduce((a, b) => a + b.total, 0);
  const taxRate = taxForZip(c.zip);
  const taxAmount = matSubtotal * taxRate;
  const materialsTotal = matSubtotal + taxAmount;

  const laborDays = sqft > 0 ? sqft / (c.crewSize * c.productionRate) : 0;
  const totalDays = laborDays + c.logisticsDays;
  const crewHours = c.crewSize * c.hoursPerDay * laborDays;
  const L2 = [
    { name: "Mobilization (per job)", qty: 1, unit: "job", unitCost: c.mobilization, total: c.mobilization },
    { name: `Crew — ${c.crewSize} @ ${money0(c.burnRate)}/hr`, qty: crewHours, unit: "hr", unitCost: c.burnRate, total: crewHours * c.burnRate, auto: true },
    { name: "Forming", qty: perimeter, unit: "lf", unitCost: c.formingRate, total: perimeter * c.formingRate, auto: true },
    { name: "Finishing", qty: sqyd, unit: "sq yd", unitCost: c.finishingRate, total: sqyd * c.finishingRate, auto: true },
  ];
  const laborTotal = L2.reduce((a, b) => a + b.total, 0);

  const E = [];
  if (c.trailer.on) E.push({ name: "Dump trailer", qty: totalDays, unit: "day", unitCost: c.trailer.rate, total: totalDays * c.trailer.rate });
  if (c.skid.on) E.push({ name: "Mini skid steer", qty: totalDays, unit: "day", unitCost: c.skid.rate, total: totalDays * c.skid.rate });
  if (c.saw.on) E.push({ name: "Concrete saw", qty: totalDays, unit: "day", unitCost: c.saw.rate, total: totalDays * c.saw.rate });
  if (c.fuelFlat > 0) E.push({ name: "Fuel surcharge", qty: 1, unit: "job", unitCost: c.fuelFlat, total: c.fuelFlat });
  let place = 0;
  if (c.placement === "buggy") place = c.buggyRate * totalDays;
  if (c.placement === "pump") place = Math.max(cy * c.pumpPerYd, c.pumpMin);
  E.push({ name: { tailgate: "Placement — chute", buggy: "Placement — buggy", pump: "Placement — pump" }[c.placement], qty: 1, unit: "job", unitCost: place, total: place, auto: c.placement === "pump" });
  if (c.demo.on) E.push({ name: "Demo — remove existing", qty: sqft, unit: "sqft", unitCost: c.demo.rate, total: sqft * c.demo.rate });
  const overheadCost = laborTotal * c.overheadPct;
  E.push({ name: `Overhead (${(c.overheadPct * 100).toFixed(0)}% of labor)`, qty: 1, unit: "job", unitCost: overheadCost, total: overheadCost, auto: true });
  const equipTotal = E.reduce((a, b) => a + b.total, 0);

  const subtotal = materialsTotal + laborTotal + equipTotal;
  const markupAmt = subtotal * c.markupPct;
  const bidTotal = subtotal + markupAmt;
  return {
    per, sqft, sqyd, cy, perimeter, materials: M, matSubtotal, taxRate, taxAmount, materialsTotal,
    labor: L2, laborTotal, equipment: E, equipTotal, subtotal, markupAmt, bidTotal,
    marginPct: bidTotal ? markupAmt / bidTotal : 0, laborDays, totalDays,
    profitPerDay: totalDays ? markupAmt / totalDays : 0,
    perSqft: sqft ? bidTotal / sqft : 0, perSqyd: sqyd ? bidTotal / sqyd : 0,
    perDay: totalDays ? bidTotal / totalDays : 0, costPerSqft: sqft ? subtotal / sqft : 0,
  };
}


function scopeBullets(cfg, r) {
  const b = ["Mobilization — equipment delivery to site"];
  if (cfg.demo.on) b.push("Demolition and removal of existing concrete");
  b.push("Excavation and grading to depth");
  if (cfg.gravelBase.on) b.push("Gravel base, compacted");
  if (cfg.sandBase.on) b.push("Sand base, screeded level");
  if (cfg.geotextile.on) b.push("Geotextile fabric installation");
  b.push("Forming and staking");
  if (cfg.vaporBarrier.on) b.push("Vapor barrier installation");
  if (cfg.mesh.on) b.push(`Wire mesh ${cfg.mesh.gauge} placement`);
  if (cfg.rebar4.on) b.push(`#4 rebar on ${cfg.rebar4.gridIn}" grid`);
  if (cfg.rebar5.on) b.push(`#5 rebar on ${cfg.rebar5.gridIn}" grid`);
  if (cfg.dowels.on) b.push(`Steel doweling @ ${cfg.dowels.spacingIn}" on center`);
  const psi = r.per[0]?.psi ?? 4000;
  b.push(`Pour ${num(r.cy)} CY ${psi} PSI mix${cfg.placement === "pump" ? " — pumped" : cfg.placement === "buggy" ? " — buggied" : ""}`);
  b.push("Finish, joint cut, and cure");
  b.push("Wreck forms and site cleanup");
  return b;
}


const Toggle = ({ on, onChange, label }) => (
  <button onClick={() => onChange(!on)} aria-pressed={on} className="flex items-center gap-2" style={{ minHeight: 40 }}>
    <span className="relative rounded-full shrink-0" style={{ width: 34, height: 20, background: on ? T.chalk : "#C6CCD3", transition: "background .15s" }}>
      <span className="absolute rounded-full bg-white" style={{ width: 16, height: 16, top: 2, left: 2, transform: on ? "translateX(14px)" : "none", transition: "transform .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </span>
    {label && <span style={{ fontSize: F.sm, color: on ? T.ink : T.ink2, whiteSpace: "nowrap" }}>{label}</span>}
  </button>
);

const Segmented = ({ options, value, onChange, small }) => (
  <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, height: small ? 30 : 36 }}>
    {options.map(([k, l]) => (
      <button key={k} onClick={() => onChange(k)} className="flex-1 px-2"
        style={{ background: value === k ? T.ink : "#fff", color: value === k ? "#fff" : T.ink2, fontFamily: disp, fontSize: small ? F.sm : F.md, textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>
        {l}
      </button>
    ))}
  </div>
);

const NumField = ({ label, value, onChange, suffix }) => (
  <label className="block" style={{ minWidth: 0 }}>
    <span style={eyebrow}>{label}</span>
    <div className="flex items-center rounded mt-0.5" style={{ border: `1px solid ${T.hair}`, background: "#fff", height: 40 }}>
      <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full bg-transparent outline-none px-2" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
      {suffix && <span className="pr-2 shrink-0" style={{ fontSize: F.xs, color: T.ink3 }}>{suffix}</span>}
    </div>
  </label>
);

const TextField = ({ label, value, onChange, placeholder, type = "text", inputMode, multiline }) => (
  <label className="block" style={{ minWidth: 0 }}>
    <span style={eyebrow}>{label}</span>
    {multiline ? (
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full rounded mt-0.5 px-2 py-1.5 outline-none"
        style={{ border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.sm, fontFamily: body, resize: "none", lineHeight: 1.45 }} />
    ) : (
      <input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded mt-0.5 px-2 outline-none"
        style={{ border: `1px solid ${T.hair}`, background: "#fff", height: 40, fontSize: F.sm, fontFamily: body, minWidth: 0 }} />
    )}
  </label>
);

const DimRow = ({ axis, ft, inches, onFt, onIn }) => (
  <div className="flex items-center gap-1.5">
    <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, color: T.ink3, width: 14 }}>{axis}</span>
    <div className="flex items-center rounded flex-1" style={{ border: `1px solid ${T.hair}`, background: "#fff", height: 38, minWidth: 0 }}>
      <input type="number" inputMode="decimal" value={ft} onChange={(e) => onFt(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full bg-transparent outline-none px-2" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
      <span className="pr-1.5 shrink-0" style={{ fontSize: F.micro, color: T.ink3, letterSpacing: ".08em" }}>FT</span>
    </div>
    <div className="flex items-center rounded" style={{ border: `1px solid ${T.hair}`, background: "#fff", height: 38, width: 72 }}>
      <input type="number" inputMode="decimal" value={inches} onChange={(e) => onIn(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full bg-transparent outline-none px-2" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
      <span className="pr-1.5 shrink-0" style={{ fontSize: F.micro, color: T.ink3, letterSpacing: ".08em" }}>IN</span>
    </div>
  </div>
);



/* ---- the screen ---- */

/* Files attached to a job — v8's FILES, trimmed to what Plans needs. */
const FILES = [
  /* room: null = not a planset · "ready" = can be sent · "queued" = sent,
     server is working · "done" = takeoff surface exists. A phone queues,
     it does not download 400MB of drawings at a jobsite. */
  { id: "f1", name: "boudreaux-plans.pdf", kind: "pdf", size: "2.4 MB", at: "Yest", threadId: 4, tags: ["Foundation", "Engineered"], room: "ready" },
  { id: "f2", name: "sherwood-before-01.jpg", kind: "img", size: "1.1 MB", at: "Thu", threadId: 1, tags: ["Before", "Patio"] },
  { id: "f3", name: "sherwood-measure.jpg", kind: "img", size: "980 KB", at: "Thu", threadId: 1, tags: ["Measurement", "Patio"] },
  { id: "f4", name: "perkins-apron-marked.jpg", kind: "img", size: "1.4 MB", at: "Aug 6", threadId: 2, tags: ["Before", "Driveway", "Marked"] },
  { id: "f8", name: "government-st-permit.pdf", kind: "pdf", size: "180 KB", at: "Aug 2", threadId: 3, tags: ["Commercial"], room: null },
];

function FileRow({ f, first, onRoom }) {
  const room = f.room;
  return (
    <div className="px-2.5 py-2 flex items-start gap-2.5"
      style={{ background: T.card, borderTop: first ? "none" : `1px solid ${T.hair}` }}>
      <span className="shrink-0 rounded flex items-center justify-center"
        style={{ width: 34, height: 34, background: f.kind === "pdf" ? T.redDim : T.chalkDim,
                 color: f.kind === "pdf" ? T.red : T.chalk, fontFamily: disp, fontSize: F.xs,
                 fontWeight: 700, letterSpacing: ".06em" }}>
        {f.kind === "pdf" ? "PDF" : "IMG"}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: F.sm, fontWeight: 500, ...clip }}>{f.name}</div>
        <div style={{ fontSize: F.micro, color: T.ink3, ...nums, ...clip }}>{f.size} · {f.at}</div>
        <div className="flex flex-wrap gap-1 mt-1">
          {f.tags.map((t) => (
            <span key={t} className="px-1.5 rounded"
              style={{ background: T.slab, color: T.ink2, fontSize: F.micro, height: 16,
                       display: "inline-flex", alignItems: "center" }}>{t}</span>
          ))}
        </div>
        {/* Only a planset goes to the plan room, and the phone only ever
            queues it — the drawings are unreadable on a 6in screen and the
            file is bigger than the data plan. */}
        {room && (
          <button onClick={() => room === "ready" && onRoom && onRoom(f)}
            disabled={room !== "ready"}
            className="mt-1.5 rounded px-2"
            style={{ height: 26,
              background: room === "ready" ? T.chalkDim : T.slab,
              color: room === "ready" ? T.chalk : T.ink3,
              border: `1px solid ${room === "ready" ? T.chalk : T.hair}`,
              fontFamily: disp, fontSize: F.xs, textTransform: "uppercase" }}>
            {room === "ready" ? "Send to plan room"
              : room === "queued" ? "Queued for takeoff"
              : "In the plan room"}
          </button>
        )}
      </div>
    </div>
  );
}


/* ============================================================ DOCUMENTS
   Ported from v8. A quote is a VERSIONED thing — you send an estimate,
   they push back, you cut markup, you send a quote. Each version keeps
   its own document type, disclosure level and payment schedule, and the
   preview shows exactly what the customer receives.

   Every generated document snapshots the sections and config it was
   built from, so opening an old version shows what you actually sent
   rather than what the scope looks like today.
============================================================ */
const COMPANY = {
  name: "Sacco Builders",
  contact: "Coy Sacco",
  phone: "(225) 378-2458",
  email: "admin@saccobuilt.com",
  addr: "9618 Jefferson Hwy, STE D174, Baton Rouge, LA 70809",
};

const DOC_STATUS = {
  draft:    { label: "Draft",    bg: "#EFF1F3", fg: T.ink2 },
  sent:     { label: "Sent",     bg: T.chalkDim, fg: T.chalk },
  viewed:   { label: "Viewed",   bg: T.violetDim, fg: T.violet },
  approved: { label: "Approved", bg: T.greenDim, fg: T.green },
  declined: { label: "Declined", bg: T.redDim, fg: T.red },
  paid:     { label: "Paid",     bg: T.greenDim, fg: T.green },
  open:     { label: "Open",     bg: T.hivizDim, fg: "#C24A00" },
};

const PAY_PRESETS = {
  "10/50/40": [["Deposit", 0.10], ["Progress", 0.50], ["Final", 0.40]],
  "25/40/35": [["Deposit", 0.25], ["Progress", 0.40], ["Final", 0.35]],
  "50/50": [["Deposit", 0.50], ["Final", 0.50]],
  "Net on completion": [["Due on completion", 1.0]],
};

const snap = (secs, c) => ({ sections: secs.map((x) => ({ ...x })), cfg: { ...c } });

const DOCS_SEED = [
  {
    id: "d2", type: "quote", num: "26-368", threadId: 2, status: "sent",
    issued: "Aug 9, 2026", subject: "Hawkins Driveway", sortAt: 20260809,
    snapshot: snap([{ id: 1, name: "Driveway", Lft: 32, Lin: 0, Wft: 20, Win: 0, depthIn: 4, psi: 4000 }], DEFAULTS),
    versions: [
      { v: 1, at: "Aug 6, 2:10p", docType: "estimate", detail: "group", markupPct: 0.15, pay: "10/50/40", note: "Driveway only" },
      { v: 2, at: "Aug 9, 8:05a", docType: "quote", detail: "line", markupPct: 0.139, pay: "10/50/40", note: "Dropped markup to win it" },
    ],
  },
  {
    id: "d1", type: "quote", num: "26-372", threadId: 1, status: "draft",
    issued: "Aug 12, 2026", subject: "Plunket Back Patio", sortAt: 20260812,
    snapshot: snap([{ id: 1, name: "Back Patio", Lft: 12, Lin: 0, Wft: 20, Win: 0, depthIn: 4, psi: 4000, src: "thread" }], DEFAULTS),
    versions: [
      { v: 1, at: "Aug 12, 9:40a", docType: "estimate", detail: "group", markupPct: 0.15, pay: "10/50/40", note: "First pass off the Thursday measure" },
    ],
  },
  { id: "d3", type: "invoice", num: "INV-1042", threadId: 4, status: "open", issued: "Aug 1, 2026", sortAt: 20260801, subject: "Boudreaux — deposit", amount: 4840.0 },
  { id: "d4", type: "invoice", num: "INV-1039", threadId: 2, status: "paid", issued: "Jul 18, 2026", sortAt: 20260718, subject: "Hawkins — apron deposit", amount: 750.0 },
  { id: "d5", type: "expense", num: "EXP-221", threadId: 1, status: "open", issued: "Aug 11, 2026", sortAt: 20260811, subject: "Gulf Coast Ready Mix — 3 CY", amount: 465.0, vendor: "Gulf Coast Ready Mix" },
  { id: "d6", type: "expense", num: "EXP-220", threadId: 2, status: "paid", issued: "Aug 7, 2026", sortAt: 20260807, subject: "Rebar + mesh — Home Depot", amount: 312.44, vendor: "Home Depot" },
];

const docAmount = (d) => {
  if (d.amount != null) return d.amount;
  if (!d.snapshot || !d.versions) return 0;
  const v = d.versions[d.versions.length - 1];
  return computeJob(d.snapshot.sections, { ...d.snapshot.cfg, markupPct: v.markupPct }).bidTotal;
};

/* ---- the paper the customer receives ---- */
function DocPaper({ doc, ver, thread, r, bullets }) {
  const isQuote = ver.docType === "quote";
  const bid = r.bidTotal;
  const pay = PAY_PRESETS[ver.pay] || PAY_PRESETS["10/50/40"];

  const Row = ({ label, qty, unit, amount, indent, bold, faint }) => (
    <div className="flex items-baseline justify-between gap-2 py-1"
      style={{ borderBottom: `1px solid ${T.hairSoft}`, paddingLeft: indent ? 10 : 0 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: F.sm, fontWeight: bold ? 600 : 400, color: faint ? T.ink2 : T.ink, lineHeight: 1.35 }}>{label}</div>
        {qty != null && <div style={{ fontSize: F.micro, color: T.ink3, ...nums }}>{num(qty, qty < 10 ? 2 : 0)} {unit}</div>}
      </div>
      {amount != null && <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: bold ? 700 : 600, ...nums }}>{money(amount)}</div>}
    </div>
  );

  return (
    <div className="rounded" style={{ background: "#fff", border: `1px solid ${T.hair}`, padding: 14 }}>
      <div className="flex items-center gap-2" style={{ borderBottom: `2px solid ${T.ink}`, paddingBottom: 8 }}>
        <span style={{ width: 8, height: 22, background: T.hiviz, display: "inline-block" }} />
        <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase" }}>{COMPANY.name}</span>
      </div>

      <div style={{ paddingTop: 10 }}>
        <div style={{ fontFamily: disp, fontSize: F.xxl, fontWeight: 700, lineHeight: 1.05, textTransform: "uppercase" }}>
          {isQuote ? "Quote" : "Estimate"} {doc.num}-{ver.v}
        </div>
        <div style={{ fontSize: F.xs, color: T.ink2, ...nums }}>Issued {doc.issued}</div>
        <div style={{ fontSize: F.xs, color: isQuote ? T.green : T.hiviz, marginTop: 2 }}>
          {isQuote ? "Price firm for 30 days from issue." : "Preliminary — subject to change after site verification."}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3" style={{ paddingTop: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...eyebrow, color: T.chalk }}>Prepared by</div>
          <div style={{ fontSize: F.sm, fontWeight: 600 }}>{COMPANY.contact}</div>
          <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.4 }}>{COMPANY.name}<br />{COMPANY.phone}<br />{COMPANY.email}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...eyebrow, color: T.chalk }}>Prepared for</div>
          <div style={{ fontSize: F.sm, fontWeight: 600 }}>{thread.name || thread.phone}</div>
          <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.4 }}>{thread.phone}<br />{thread.email || "—"}<br />{thread.addr || "—"}</div>
        </div>
      </div>

      <div style={{ paddingTop: 12 }}>
        <div style={{ ...eyebrow, color: T.chalk }}>Scope of work</div>
        <div style={{ fontSize: F.sm, fontWeight: 600, marginBottom: 4 }}>{thread.addr || "Job site"}</div>
        {bullets.map((b) => (
          <div key={b} className="flex gap-1.5" style={{ fontSize: F.sm, lineHeight: 1.5, color: T.ink2 }}>
            <span style={{ color: T.hiviz }}>—</span><span>{b}</span>
          </div>
        ))}
      </div>

      <div style={{ paddingTop: 12 }}>
        <div className="flex items-baseline justify-between" style={{ borderBottom: `1px solid ${T.ink}`, paddingBottom: 3 }}>
          <span style={{ ...eyebrow, color: T.chalk }}>Description</span>
          <span style={{ ...eyebrow, color: T.chalk }}>{ver.detail === "total" ? "" : "Amount"}</span>
        </div>
        <div className="py-1.5" style={{ background: T.slab, marginTop: 4, paddingLeft: 6, paddingRight: 6 }}>
          <div className="flex items-baseline justify-between gap-2">
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {thread.type} — {r.per.length} area{r.per.length > 1 ? "s" : ""}
            </span>
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>{num(r.sqft, 0)} sq ft</span>
          </div>
        </div>
        {r.per.map((pp) => (
          <div key={pp.id} className="py-1.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, paddingLeft: 6 }}>
            <div className="flex items-baseline justify-between gap-2">
              <span style={{ fontSize: F.sm, fontWeight: 600 }}>{pp.name}</span>
              <span style={{ fontSize: F.sm, ...nums }}>{num(pp.sqft, 0)} sq ft</span>
            </div>
            <div style={{ fontSize: F.xs, color: T.ink2, ...nums }}>
              {num(pp.L, 2)}′ × {num(pp.W, 2)}′ · {pp.depthIn}″ · {pp.psi} PSI · {num(pp.cy)} CY
            </div>
          </div>
        ))}
      </div>

      {ver.detail === "line" && (
        <div style={{ paddingTop: 10 }}>
          <div style={{ ...eyebrow, color: T.chalk, marginBottom: 2 }}>Materials</div>
          {r.materials.map((m, i) => <Row key={i} label={m.name} qty={m.qty} unit={m.unit} amount={m.total} indent />)}
          <Row label={`Sales tax @ ${(r.taxRate * 100).toFixed(2)}%`} amount={r.taxAmount} indent faint />
          <div style={{ ...eyebrow, color: T.chalk, marginTop: 8, marginBottom: 2 }}>Labor</div>
          {r.labor.map((m, i) => <Row key={i} label={m.name} qty={m.qty} unit={m.unit} amount={m.total} indent />)}
          <div style={{ ...eyebrow, color: T.chalk, marginTop: 8, marginBottom: 2 }}>Equipment &amp; overhead</div>
          {r.equipment.map((m, i) => <Row key={i} label={m.name} qty={m.qty} unit={m.unit} amount={m.total} indent />)}
        </div>
      )}

      {ver.detail === "group" && (
        <div style={{ paddingTop: 10 }}>
          <Row label="Materials" amount={r.materialsTotal} bold />
          <Row label="Labor" amount={r.laborTotal} bold />
          <Row label="Equipment & overhead" amount={r.equipTotal} bold />
        </div>
      )}

      {ver.detail === "total" && (
        <div style={{ paddingTop: 10, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
          Complete installation as described above, furnished and installed.
        </div>
      )}

      {/* Duration goes on a QUOTE, never an estimate — an estimate has not
          earned a promise. Two numbers, because "2 days" gets read as
          "done Wednesday" and concrete is not walkable when we leave. */}
      {isQuote && (
        <div style={{ paddingTop: 12 }}>
          <div style={{ ...eyebrow, color: T.chalk }}>Tentative schedule</div>
          <div className="flex items-baseline justify-between gap-2 py-1" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
            <span style={{ fontSize: F.sm }}>Working days on site</span>
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>{num(r.totalDays, 1)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2 py-1" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
            <span style={{ fontSize: F.sm }}>Before you drive on it</span>
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>7 days</span>
          </div>
          <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.5, marginTop: 4 }}>
            Start date is scheduled separately and confirmed by phone. Duration is
            weather-dependent.
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-2" style={{ marginTop: 10, borderTop: `2px solid ${T.ink}`, paddingTop: 8 }}>
        <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em" }}>
          {isQuote ? "Quote total" : "Estimated total"}
        </span>
        <span style={{ fontFamily: disp, fontSize: F.xxl, fontWeight: 700, color: T.hiviz, ...nums, lineHeight: 1 }}>{money(bid)}</span>
      </div>

      <div style={{ paddingTop: 12 }}>
        <div style={{ ...eyebrow, color: T.chalk }}>Payment schedule</div>
        {pay.map(([label, pct]) => (
          <div key={label} className="flex items-baseline justify-between gap-2 py-1" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
            <span style={{ fontSize: F.sm }}>{label} <span style={{ color: T.ink3 }}>({Math.round(pct * 100)}%)</span></span>
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>{money(bid * pct)}</span>
          </div>
        ))}
      </div>

      <div style={{ paddingTop: 12, fontSize: F.xs, color: T.ink2, lineHeight: 1.55 }}>
        <div style={{ fontWeight: 600, color: T.ink }}>Weather delays are possible.</div>
        <div style={{ marginTop: 6 }}>
          <span style={{ fontWeight: 600, color: T.ink }}>Limited warranty — concrete work. </span>
          {COMPANY.name} warrants workmanship and contractor-supplied materials against defects for one year from
          substantial completion. Concrete is expected to develop hairline shrinkage cracking; this is normal and not
          covered. Control joints are cut to direct cracking but do not eliminate it.
        </div>
        {!isQuote && (
          <div style={{ marginTop: 6, color: T.hiviz }}>
            This estimate is not a binding offer. Final pricing is confirmed after site verification of subgrade,
            access, and actual measurements.
          </div>
        )}
      </div>

      <div className="rounded" style={{ marginTop: 12, border: `1px solid ${T.hair}`, padding: 10 }}>
        <div style={{ fontSize: F.sm, fontWeight: 600 }}>The above specifications, costs, and terms are hereby accepted.</div>
        <div className="flex items-end gap-3" style={{ marginTop: 22 }}>
          <div style={{ flex: 1, borderTop: `1px solid ${T.ink3}`, paddingTop: 3 }}>
            <div style={eyebrow}>{(thread.name || "Customer").toUpperCase()}</div>
          </div>
          <div style={{ width: 90, borderTop: `1px solid ${T.ink3}`, paddingTop: 3 }}>
            <div style={eyebrow}>Date</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- builder + preview ---- */
function DocView({ doc, thread, onBack, onUpdate, flash }) {
  const [vIdx, setVIdx] = useState(doc.versions ? doc.versions.length - 1 : 0);
  const [showInternal, setShowInternal] = useState(true);
  const ver = doc.versions?.[vIdx];

  const verCfg = useMemo(
    () => ({ ...doc.snapshot.cfg, markupPct: ver?.markupPct ?? doc.snapshot.cfg.markupPct }),
    [doc.snapshot, ver]
  );
  const r = useMemo(() => computeJob(doc.snapshot.sections, verCfg), [doc.snapshot, verCfg]);
  const bullets = useMemo(() => scopeBullets(verCfg, r), [verCfg, r]);

  if (!ver) return null;

  const setVer = (patch) => onUpdate({ ...doc, versions: doc.versions.map((v, i) => (i === vIdx ? { ...v, ...patch } : v)) });

  const newVersion = () => {
    const next = { ...ver, v: doc.versions.length + 1, at: "Now", note: "" };
    onUpdate({ ...doc, versions: [...doc.versions, next] });
    setVIdx(doc.versions.length);
    flash(`Version ${next.v} created`);
  };

  const prev = vIdx > 0 ? doc.versions[vIdx - 1] : null;
  const prevTotal = prev ? computeJob(doc.snapshot.sections, { ...doc.snapshot.cfg, markupPct: prev.markupPct }).bidTotal : null;
  const delta = prevTotal != null ? r.bidTotal - prevTotal : null;

  return (
    <div style={{ paddingBottom: 8 }}>
      <div className="px-2.5 pt-2.5 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1" style={{ ...eyebrow, color: T.ink2 }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>‹</span> Documents
          </button>
          <Badge s={doc.status} map={DOC_STATUS} />
        </div>
        <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.1, ...clip }}>{doc.subject}</div>
        <div style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{doc.num}-{ver.v} · {thread.name || thread.phone}</div>
      </div>

      <div className="px-2.5 pt-2">
        <div style={eyebrow}>Versions</div>
        <div className="flex gap-1 mt-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {doc.versions.map((v, i) => (
            <button key={v.v} onClick={() => setVIdx(i)} className="px-2.5 rounded shrink-0"
              style={{ height: 34, border: `1px solid ${i === vIdx ? T.ink : T.hair}`,
                       background: i === vIdx ? T.ink : T.card, color: i === vIdx ? "#fff" : T.ink2, minWidth: 62 }}>
              <div style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 700, letterSpacing: ".06em" }}>V{v.v}</div>
              <div style={{ fontSize: F.micro, opacity: .75, ...nums }}>{v.docType === "quote" ? "Quote" : "Est"}</div>
            </button>
          ))}
          <button onClick={newVersion} className="px-2.5 rounded shrink-0"
            style={{ height: 34, border: `1px dashed ${T.chalk}`, color: T.chalk, background: T.card,
                     fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".08em" }}>+ New</button>
        </div>
        {ver.note && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>{ver.at} · {ver.note}</div>}
        {delta != null && Math.abs(delta) > 0.5 && (
          <div style={{ fontSize: F.xs, marginTop: 3, color: delta > 0 ? T.green : T.red, ...nums }}>
            {delta > 0 ? "▲" : "▼"} {money(Math.abs(delta))} vs V{prev.v}
          </div>
        )}
      </div>

      <div className="px-2.5 pt-2.5" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={eyebrow}>Document type</div>
          <div className="mt-0.5">
            <Segmented options={[["estimate", "Estimate"], ["quote", "Quote"]]} value={ver.docType} onChange={(v) => setVer({ docType: v })} />
          </div>
          <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 3, lineHeight: 1.45 }}>
            {ver.docType === "quote"
              ? "Binding for 30 days. Use once you've verified the site."
              : "Non-binding, subject to change. Safe to send off a phone call."}
          </div>
        </div>

        <div>
          <div style={eyebrow}>Cost detail the customer sees</div>
          <div className="mt-0.5">
            <Segmented options={[["total", "Total"], ["group", "Groups"], ["line", "Line by line"]]}
              value={ver.detail} onChange={(v) => setVer({ detail: v })} />
          </div>
          <div style={{ fontSize: F.xs, color: ver.detail === "line" ? T.hiviz : T.ink3, marginTop: 3, lineHeight: 1.45 }}>
            {ver.detail === "line" && "Shows your unit costs — they can price-shop every line and back into your margin."}
            {ver.detail === "group" && "Three totals. Enough to feel transparent, no unit costs exposed."}
            {ver.detail === "total" && "One number plus scope. Strongest for margin, weakest for objection handling."}
          </div>
        </div>

        <div>
          <div style={eyebrow}>Payment schedule</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.keys(PAY_PRESETS).map((k) => (
              <button key={k} onClick={() => setVer({ pay: k })} className="px-2.5 rounded"
                style={{ height: 30, border: `1px solid ${ver.pay === k ? T.chalk : T.hair}`,
                         background: ver.pay === k ? T.chalkDim : "#fff",
                         color: ver.pay === k ? T.chalk : T.ink2, fontSize: F.sm, ...nums }}>{k}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-2.5 pt-2.5">
        <div className="rounded px-2.5 py-2" style={{ background: T.dark, color: "#fff" }}>
          <div className="flex items-center justify-between">
            <span style={{ ...eyebrow, color: "#7D8894" }}>Your side · not on the document</span>
            <button onClick={() => setShowInternal((x) => !x)} style={{ fontSize: F.xs, color: "#C3CBD4", height: 24 }}>
              {showInternal ? "Hide" : "Show"}
            </button>
          </div>
          {showInternal && (
            <>
              <div className="flex justify-between mt-1" style={{ fontSize: F.xs, color: "#C3CBD4", ...nums }}>
                <span>Cost {money(r.subtotal)}</span>
                <span style={{ color: T.hiviz }}>Profit {money(r.markupAmt)}</span>
                <span>Margin {(r.marginPct * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between mt-1.5" style={{ fontSize: F.micro, color: "#7D8894", ...nums }}>
                <span>MARKUP {((ver.markupPct ?? 0.15) * 100).toFixed(1)}%</span>
                <span>{money0(r.profitPerDay)}/DAY</span>
                <span>{num(r.totalDays, 1)} DAYS</span>
              </div>
              <div style={{ fontSize: F.xs, color: "#7D8894", marginTop: 6, lineHeight: 1.45 }}>
                This version is what you sent. Markup is set on the scope — change it
                there and take a new version off it.
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-2.5 pt-2.5">
        <div className="flex items-center gap-1.5" style={{ marginBottom: 5 }}>
          <span style={{ ...eyebrow, color: T.chalk }}>Preview — exactly what they receive</span>
          <span style={{ flex: 1, height: 1, background: T.hair }} />
        </div>
        <DocPaper doc={doc} ver={ver} thread={thread} r={r} bullets={bullets} />
      </div>

      <div className="px-2.5 pt-2.5" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="flex gap-1.5">
          <button onClick={() => flash("PDF generated")} className="flex-1 rounded"
            style={{ height: 40, border: `1px solid ${T.hair}`, background: "#fff", fontFamily: disp,
                     fontSize: F.md, textTransform: "uppercase", letterSpacing: ".08em", color: T.ink2 }}>PDF</button>
          <button onClick={() => { onUpdate({ ...doc, status: "draft" }); flash("Saved as draft"); }} className="flex-1 rounded"
            style={{ height: 40, border: `1px solid ${T.hair}`, background: "#fff", fontFamily: disp,
                     fontSize: F.md, textTransform: "uppercase", letterSpacing: ".08em", color: T.ink2 }}>Save draft</button>
        </div>
        <button onClick={() => { onUpdate({ ...doc, status: "sent" }); flash(`Sent to ${thread.name || "customer"}`); }}
          className="w-full rounded"
          style={{ height: 46, background: T.hiviz, color: "#fff", fontFamily: disp, fontSize: F.lg,
                   textTransform: "uppercase", letterSpacing: ".12em" }}>
          Send {ver.docType === "quote" ? "quote" : "estimate"} · {money(r.bidTotal)}
        </button>
      </div>
    </div>
  );
}

/* ---- the list: filter by kind, sort by whatever you're chasing ---- */
const DOC_FILTERS = [
  { k: "all", l: "All" }, { k: "quote", l: "Quotes" },
  { k: "invoice", l: "Invoices" }, { k: "expense", l: "Expenses" },
];
const DOC_SORTS = [
  { k: "recent", l: "Newest" }, { k: "amount", l: "Amount" },
  { k: "customer", l: "Customer" }, { k: "status", l: "Status" },
];

function DocsScreen({ docs, onOpen, onBack, flash }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");

  const rows = useMemo(() => {
    const list = docs.filter((d) => filter === "all" || d.type === filter);
    const who = (d) => {
      const t = THREADS.find((x) => x.id === d.threadId);
      return d.vendor || (t ? (t.name || t.phone) : "");
    };
    const sorted = [...list];
    if (sort === "recent") sorted.sort((a, b) => (b.sortAt || 0) - (a.sortAt || 0));
    if (sort === "amount") sorted.sort((a, b) => docAmount(b) - docAmount(a));
    if (sort === "customer") sorted.sort((a, b) => who(a).localeCompare(who(b)));
    if (sort === "status") sorted.sort((a, b) => a.status.localeCompare(b.status));
    return sorted;
  }, [docs, filter, sort]);

  return (
    <div>
      <div className="px-2.5 pt-2.5">
        <button onClick={onBack} className="flex items-center gap-1 mb-1.5" style={{ ...eyebrow, color: T.ink2 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>‹</span> More
        </button>
      </div>

      <div className="flex gap-1 px-2.5 pb-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {DOC_FILTERS.map(({ k, l }) => (
          <button key={k} onClick={() => setFilter(k)} className="px-2.5 rounded shrink-0"
            style={{ height: 30, border: `1px solid ${filter === k ? T.ink : T.hair}`,
                     background: filter === k ? T.ink : T.card, color: filter === k ? "#fff" : T.ink2,
                     fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>{l}</button>
        ))}
      </div>

      <div className="flex items-center gap-1 px-2.5 pb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <span style={{ ...eyebrow, flexShrink: 0, marginRight: 2 }}>Sort</span>
        {DOC_SORTS.map(({ k, l }) => (
          <button key={k} onClick={() => setSort(k)} className="px-2 rounded shrink-0"
            style={{ height: 26, border: `1px solid ${sort === k ? T.chalk : T.hair}`,
                     background: sort === k ? T.chalkDim : T.card, color: sort === k ? T.chalk : T.ink2,
                     fontSize: F.xs }}>{l}</button>
        ))}
      </div>

      <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center" style={{ background: T.card, fontSize: F.sm, color: T.ink3 }}>
            Nothing filed under that yet.
          </div>
        )}
        {rows.map((d, i) => {
          const t = THREADS.find((x) => x.id === d.threadId);
          const vLabel = d.versions ? `V${d.versions.length}` : null;
          return (
            <button key={d.id}
              onClick={() => (d.type === "quote" ? onOpen(d.id) : flash("Invoices and expenses open next"))}
              className="w-full text-left px-2.5 py-2 flex items-start gap-2.5"
              style={{ background: T.card, borderTop: i ? `1px solid ${T.hair}` : "none" }}>
              <span className="shrink-0 rounded flex items-center justify-center"
                style={{ width: 34, height: 34,
                         background: d.type === "quote" ? T.chalkDim : d.type === "invoice" ? T.greenDim : T.hivizDim,
                         color: d.type === "quote" ? T.chalk : d.type === "invoice" ? T.green : T.hiviz, fontSize: F.md }}>
                {d.type === "quote" ? "◱" : d.type === "invoice" ? "$" : "▤"}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-baseline gap-1.5">
                  <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{d.subject}</span>
                  <span className="ml-auto shrink-0" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, ...nums }}>
                    {money0(docAmount(d))}
                  </span>
                </div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...nums, ...clip }}>
                  {d.num}{vLabel ? ` · ${vLabel}` : ""} · {d.issued}
                  {d.vendor ? ` · ${d.vendor}` : t ? ` · ${t.name || t.phone}` : ""}
                </div>
                <div className="mt-1"><Badge s={d.status} map={DOC_STATUS} /></div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}




/* ============================================================ SCHEDULE
   Three states, three shapes, because how real a date is should be
   visible before you read a word of it:

     MENTIONED  the customer's own words, no date at all. Cannot be
                drawn in a cell without inventing the placement, so it
                waits in a rail above the grid until you place it.
     TENTATIVE  a WEEK, not a day. Draws as a hatched band across the
                week. Concrete is weather-bound; a day you cannot hold
                is a day you will have to walk back.
     COMMITTED  agreed. Solid blocks on actual days.

   One crew means one job at a time, so the conflict that matters is
   simply having told two people the same week.
============================================================ */
const SCHED_STATE = {
  mentioned: { label: "Mentioned", fg: T.ink2, bg: "#EFF1F3" },
  tentative: { label: "Tentative", fg: "#8A6100", bg: "#FDF6E3" },
  committed: { label: "Committed", fg: T.green, bg: T.greenDim },
};

/* days on site the crew can actually cover in a week */
const WEEK_CAPACITY = 5;
const MONTH_CAPACITY = 12;

const SCHED = [
  { id: "e1", threadId: 1, state: "committed", start: "2026-08-19", days: 2, crew: "Coy + Luis" },
  { id: "e2", threadId: 2, state: "tentative", week: "2026-08-23", days: 3 },
  { id: "e3", threadId: 4, state: "tentative", week: "2026-08-23", days: 5 },
  { id: "e4", threadId: 3, state: "mentioned", said: "Wants it before the shop goes up" },
  { id: "e5", threadId: 5, state: "mentioned", said: "Soon as you can get to it" },
  { id: "e6", threadId: 2, state: "committed", start: "2026-09-08", days: 3, crew: "Coy + Luis" },
  { id: "e7", threadId: 4, state: "tentative", week: "2026-09-20", days: 5 },
  { id: "e8", threadId: 1, state: "tentative", week: "2026-10-11", days: 2 },
];

/* ---- dates, kept local to this screen ---- */
const dParse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dKey = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const dAdd = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return x; };
const weekStart = (dt) => dAdd(dt, -dt.getDay());
const sameDay = (a, b) => dKey(a) === dKey(b);
const SCHED_TODAY = dParse("2026-08-17");

/* the days a committed job actually occupies, skipping Sundays */
const committedDays = (e) => {
  const out = [];
  let cur = dParse(e.start);
  while (out.length < e.days) {
    if (cur.getDay() !== 0) out.push(dKey(cur));
    cur = dAdd(cur, 1);
  }
  return out;
};

const schedWho = (e) => {
  const t = THREADS.find((x) => x.id === e.threadId);
  return t ? (t.name || t.aiGuess || t.phone) : "Unknown";
};
const schedType = (e) => {
  const t = THREADS.find((x) => x.id === e.threadId);
  return t ? t.type : "Other";
};

/* ---- load per week, and the conflicts that fall out of it ---- */
function weekLoad(entries, wkStart) {
  const wkKey = dKey(wkStart);
  const days = [...Array(7)].map((_, i) => dKey(dAdd(wkStart, i)));
  const committed = entries.filter((e) => e.state === "committed" &&
    committedDays(e).some((k) => days.includes(k)));
  const tentative = entries.filter((e) => e.state === "tentative" && e.week === wkKey);
  const used = committed.reduce((n, e) => n + committedDays(e).filter((k) => days.includes(k)).length, 0)
    + tentative.reduce((n, e) => n + e.days, 0);
  return { wkKey, days, committed, tentative, used, jobs: committed.length + tentative.length };
}

function findConflicts(entries) {
  const out = [];
  const seen = new Set();
  entries.forEach((e) => {
    const wk = e.state === "tentative" ? e.week : e.state === "committed" ? dKey(weekStart(dParse(e.start))) : null;
    if (!wk || seen.has(wk)) return;
    seen.add(wk);
    const L = weekLoad(entries, dParse(wk));
    if (L.jobs > 1) {
      out.push({
        wk, kind: "double",
        text: `You have told ${L.jobs} people the week of ${MON[dParse(wk).getMonth()]} ${dParse(wk).getDate()}.`,
        who: [...L.committed, ...L.tentative].map(schedWho).join(" and "),
      });
    } else if (L.used > WEEK_CAPACITY) {
      out.push({
        wk, kind: "over",
        text: `Week of ${MON[dParse(wk).getMonth()]} ${dParse(wk).getDate()} is ${L.used} days against ${WEEK_CAPACITY}.`,
        who: [...L.committed, ...L.tentative].map(schedWho).join(", "),
      });
    }
  });
  return out;
}

const VIEWS = [["week", "Week"], ["month", "Month"], ["quarter", "Quarter"], ["year", "Year"]];

function ScheduleScreen({ onBack, onOpenDusty }) {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(SCHED_TODAY);
  const [stateFilter, setStateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const types = [...new Set(SCHED.map(schedType))];

  const entries = SCHED.filter((e) => {
    if (stateFilter !== "all" && e.state !== stateFilter) return false;
    if (typeFilter && schedType(e) !== typeFilter) return false;
    return true;
  });

  const placed = entries.filter((e) => e.state !== "mentioned");
  const mentioned = entries.filter((e) => e.state === "mentioned");
  const conflicts = findConflicts(placed);
  const filtersOn = stateFilter !== "all" || Boolean(typeFilter) || freeOnly;

  const step = (n) => {
    if (view === "week") setCursor((c) => dAdd(c, 7 * n));
    else if (view === "month") setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
    else if (view === "quarter") setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 3 * n, 1));
    else setCursor((c) => new Date(c.getFullYear() + n, c.getMonth(), 1));
  };

  const heading = view === "week"
    ? `Week of ${MON[weekStart(cursor).getMonth()]} ${weekStart(cursor).getDate()}`
    : view === "year" ? String(cursor.getFullYear())
    : view === "quarter" ? `${MON[cursor.getMonth()]}–${MON[(cursor.getMonth() + 2) % 12]} ${cursor.getFullYear()}`
    : `${MON[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const Chip = ({ on, onClick, children, tone }) => (
    <button onClick={onClick} className="px-2.5 rounded shrink-0"
      style={{ height: 28, border: `1px solid ${on ? (tone || T.ink) : T.hair}`,
               background: on ? (tone || T.ink) : T.card, color: on ? "#fff" : T.ink2,
               fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>{children}</button>
  );

  return (
    <div className="pb-4">
      <div className="px-2.5 pt-2.5">
        <button onClick={onBack} className="flex items-center gap-1 mb-1.5" style={{ ...eyebrow, color: T.ink2 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>‹</span> More
        </button>
      </div>

      {/* view switch */}
      <div className="flex gap-1 px-2.5 pb-2">
        {VIEWS.map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className="flex-1 rounded"
            style={{ height: 30, border: `1px solid ${view === k ? T.ink : T.hair}`,
                     background: view === k ? T.ink : T.card, color: view === k ? "#fff" : T.ink2,
                     fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>{l}</button>
        ))}
      </div>

      {/* period — the calendar and its nav are the page */}
      <div className="flex items-center gap-2 px-2.5 pb-2">
        <button onClick={() => step(-1)} aria-label="Previous" className="rounded flex items-center justify-center shrink-0"
          style={{ width: 32, height: 32, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2 }}>‹</button>
        <div className="flex-1 text-center" style={{ minWidth: 0 }}>
          <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05, ...clip }}>{heading}</div>
        </div>
        <button onClick={() => step(1)} aria-label="Next" className="rounded flex items-center justify-center shrink-0"
          style={{ width: 32, height: 32, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2 }}>›</button>
        <button onClick={() => setFiltersOpen((f) => !f)} aria-label="Filters" aria-expanded={filtersOpen}
          className="rounded flex items-center justify-center shrink-0 relative"
          style={{ width: 32, height: 32, border: `1px solid ${filtersOpen || filtersOn ? T.ink : T.hair}`,
                   background: filtersOpen ? T.ink : T.card }}>
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path d="M1.6 2.6h11.8L9.1 7.5v4.3l-3.2 1.6V7.5z" fill="none"
              stroke={filtersOpen ? "#fff" : T.ink2} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          {filtersOn && !filtersOpen && (
            <span className="absolute rounded-full" style={{ top: -3, right: -3, width: 8, height: 8, background: T.hiviz }} />
          )}
        </button>
      </div>

      {filtersOpen && (
        <div className="mx-2.5 mb-2 rounded px-2 py-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div style={{ ...eyebrow, color: T.ink2, marginBottom: 4 }}>State</div>
          <div className="flex gap-1 pb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <Chip on={stateFilter === "all"} onClick={() => setStateFilter("all")}>All</Chip>
            {Object.entries(SCHED_STATE).map(([k, v]) => (
              <Chip key={k} on={stateFilter === k} onClick={() => setStateFilter(k)}
                tone={k === "committed" ? T.green : k === "tentative" ? "#8A6100" : T.ink2}>{v.label}</Chip>
            ))}
          </div>
          <div style={{ ...eyebrow, color: T.ink2, marginBottom: 4 }}>Work</div>
          <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <Chip on={freeOnly} onClick={() => setFreeOnly((f) => !f)} tone={T.chalk}>{"Where I'm free"}</Chip>
            {types.map((t) => (
              <Chip key={t} on={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>{t}</Chip>
            ))}
          </div>
        </div>
      )}

      {view === "month" && <MonthGrid cursor={cursor} entries={placed} freeOnly={freeOnly} />}
      {view === "week" && <WeekView cursor={cursor} entries={placed} />}
      {view === "quarter" && <QuarterView cursor={cursor} entries={placed} freeOnly={freeOnly} />}
      {view === "year" && <YearLoad cursor={cursor} entries={placed} />}

      {/* ---- below the calendar ----
           These are CONDITIONS, not commentary — computed facts about your
           own data, the same kind of thing as an unread count. They stay on
           the page, because if a double-booking only lived in the chat you
           would have to ask in order to find out about it. Tapping one opens
           Dusty already holding that week. ---- */}
      <div className="mt-2.5">
        {conflicts.map((c) => (
          <button key={c.wk}
            onClick={() => onOpenDusty({
              label: `the week of ${MON[dParse(c.wk).getMonth()]} ${dParse(c.wk).getDate()}`,
              prompts: ["Who should move?", "Where is my next open week?", "Can the crew split?"] })}
            className="w-full text-left px-3 py-2 flex items-start gap-2"
            style={{ background: T.hivizDim, borderTop: `1px solid #F7C9A8`, borderBottom: `1px solid #F7C9A8` }}>
            <span style={{ color: T.hiviz, fontSize: 12, lineHeight: 1.4 }}>●</span>
            <span className="min-w-0 flex-1">
              <span style={{ display: "block", fontSize: F.sm, color: T.ink, lineHeight: 1.4 }}>{c.text}</span>
              <span style={{ display: "block", fontSize: F.xs, color: T.ink2 }}>{c.who}</span>
            </span>
            <span className="shrink-0 flex items-center gap-1" style={{ ...eyebrow, fontSize: 9, color: "#8A4200" }}>
              <Emblem size={12} /> Ask
            </span>
          </button>
        ))}

        {mentioned.length > 0 && (
          <div className="pt-3">
            <div className="px-3 pb-1 flex items-baseline justify-between">
              <span style={{ ...eyebrow, color: T.ink2 }}>Mentioned · no date yet</span>
              <span style={{ ...eyebrow, fontSize: 9 }}>{mentioned.length} waiting for a week</span>
            </div>
            <div className="flex gap-1.5 px-2.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {mentioned.map((e) => (
                <div key={e.id} className="rounded px-2.5 py-2 shrink-0"
                  style={{ width: 208, background: T.card, border: `1px dashed ${T.ink3}` }}>
                  <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{schedWho(e)}</div>
                  <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.4 }}>“{e.said}”</div>
                  <button className="w-full mt-1.5 rounded"
                    style={{ height: 28, background: T.chalk, color: "#fff", fontFamily: disp,
                             fontSize: F.sm, textTransform: "uppercase" }}>Pencil a week</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- month: solid blocks on days, hatched bands across weeks ---- */
const HATCH = "repeating-linear-gradient(45deg, #FDF6E3 0 6px, #F3E6C4 6px 12px)";

function MonthGrid({ cursor, entries, freeOnly }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = weekStart(first);
  const weeks = [...Array(6)].map((_, w) => dAdd(gridStart, w * 7));

  return (
    <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
      <div className="grid grid-cols-7" style={{ borderBottom: `1px solid ${T.hair}` }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center py-1" style={{ ...eyebrow, fontSize: 9 }}>{d}</div>
        ))}
      </div>

      {weeks.map((wk, wi) => {
        const L = weekLoad(entries, wk);
        const free = L.jobs === 0;
        if (freeOnly && !free) {
          return (
            <div key={wi} className="px-2 py-1.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, opacity: .35 }}>
              <div style={{ ...eyebrow, fontSize: 9 }}>
                {MON[wk.getMonth()]} {wk.getDate()} · {L.used} days booked
              </div>
            </div>
          );
        }
        return (
          <div key={wi} style={{ borderBottom: `1px solid ${T.hairSoft}`,
                                 background: freeOnly && free ? T.greenDim : "transparent" }}>
            <div className="grid grid-cols-7">
              {[...Array(7)].map((_, i) => {
                const day = dAdd(wk, i);
                const inMonth = day.getMonth() === cursor.getMonth();
                const key = dKey(day);
                const today = sameDay(day, SCHED_TODAY);
                const onDay = L.committed.filter((e) => committedDays(e).includes(key));
                return (
                  <div key={i} className="px-1 pt-1" style={{ minHeight: 46, minWidth: 0,
                        borderRight: i < 6 ? `1px solid ${T.hairSoft}` : "none",
                        opacity: inMonth ? 1 : .32 }}>
                    <div style={{ fontFamily: disp, fontSize: F.xs, ...nums,
                                  color: today ? "#fff" : T.ink3,
                                  background: today ? T.ink : "transparent",
                                  borderRadius: 3, width: 17, height: 15, textAlign: "center", lineHeight: "15px" }}>
                      {day.getDate()}
                    </div>
                    {onDay.map((e) => (
                      <div key={e.id} className="mt-0.5 rounded"
                        style={{ background: T.green, height: 13, paddingInline: 2,
                                 fontSize: 8.5, color: "#fff", fontFamily: disp,
                                 overflow: "hidden", whiteSpace: "nowrap", lineHeight: "13px" }}>
                        {schedWho(e).split(" ")[0]}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {L.tentative.map((e) => (
              <div key={e.id} className="mx-1 mb-1 rounded flex items-center gap-1.5 px-1.5"
                style={{ height: 17, background: HATCH, border: `1px solid #E6D2A0` }}>
                <span style={{ fontFamily: disp, fontSize: 9.5, color: "#8A6100",
                               textTransform: "uppercase", letterSpacing: ".06em", ...clip }}>
                  {schedWho(e)} · {e.days}d tentative
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---- week: the days themselves ---- */
function WeekView({ cursor, entries }) {
  const wk = weekStart(cursor);
  const L = weekLoad(entries, wk);
  return (
    <div className="mx-2.5">
      {L.tentative.length > 0 && (
        <div className="rounded px-2.5 py-2 mb-1.5" style={{ background: HATCH, border: `1px solid #E6D2A0` }}>
          <div style={{ ...eyebrow, color: "#8A6100" }}>Tentative this week — no days picked</div>
          {L.tentative.map((e) => (
            <div key={e.id} style={{ fontSize: F.sm, color: T.ink }}>{schedWho(e)} · {e.days} days</div>
          ))}
        </div>
      )}
      <div className="rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
        {[...Array(7)].map((_, i) => {
          const day = dAdd(wk, i);
          const key = dKey(day);
          const onDay = L.committed.filter((e) => committedDays(e).includes(key));
          const today = sameDay(day, SCHED_TODAY);
          return (
            <div key={i} className="flex items-stretch"
              style={{ background: today ? T.chalkDim : T.card, borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
              <div className="px-2 py-2 shrink-0" style={{ width: 54, borderRight: `1px solid ${T.hairSoft}` }}>
                <div style={{ ...eyebrow, fontSize: 9 }}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day.getDay()]}</div>
                <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, lineHeight: 1, ...nums }}>{day.getDate()}</div>
              </div>
              <div className="flex-1 px-2 py-2" style={{ minWidth: 0 }}>
                {onDay.length === 0 && (
                  <div style={{ fontSize: F.xs, color: T.ink3 }}>{day.getDay() === 0 ? "—" : "Open"}</div>
                )}
                {onDay.map((e) => (
                  <div key={e.id} className="rounded px-2 py-1" style={{ background: T.greenDim, borderLeft: `2px solid ${T.green}` }}>
                    <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{schedWho(e)}</div>
                    <div style={{ fontSize: F.xs, color: T.ink2, ...clip }}>{schedType(e)} · {e.crew || "Crew TBD"}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- quarter: thirteen weeks, and how full each one is ---- */
function QuarterView({ cursor, entries, freeOnly }) {
  const start = weekStart(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const rows = [...Array(13)].map((_, i) => dAdd(start, i * 7));
  return (
    <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
      {rows.map((wk, i) => {
        const L = weekLoad(entries, wk);
        const free = L.jobs === 0;
        if (freeOnly && !free) return null;
        const pct = Math.min(1, L.used / WEEK_CAPACITY);
        return (
          <div key={i} className="px-2.5 py-2 flex items-center gap-2"
            style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none",
                     background: free ? T.greenDim : "transparent" }}>
            <div className="shrink-0" style={{ width: 46 }}>
              <div style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600, ...nums }}>
                {MON[wk.getMonth()]} {wk.getDate()}
              </div>
            </div>
            <div className="flex-1" style={{ minWidth: 0 }}>
              <div style={{ height: 14, background: T.hairSoft, borderRadius: 2, overflow: "hidden", display: "flex" }}>
                {L.committed.map((e) => (
                  <span key={e.id} style={{ width: `${(committedDays(e).length / WEEK_CAPACITY) * 100}%`, background: T.green }} />
                ))}
                {L.tentative.map((e) => (
                  <span key={e.id} style={{ width: `${(e.days / WEEK_CAPACITY) * 100}%`, background: HATCH }} />
                ))}
              </div>
              <div style={{ fontSize: F.xs, color: T.ink3, ...clip, marginTop: 1 }}>
                {free ? "Open" : [...L.committed, ...L.tentative].map(schedWho).join(", ")}
              </div>
            </div>
            <div className="shrink-0 text-right" style={{ width: 34 }}>
              <div style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600, ...nums,
                            color: pct > 1 || L.used > WEEK_CAPACITY ? T.red : L.used ? T.ink : T.ink3 }}>
                {L.used}d
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- year: not a grid. Twelve months of load against capacity ---- */
function YearLoad({ cursor, entries }) {
  const y = cursor.getFullYear();
  const months = [...Array(12)].map((_, m) => {
    let com = 0, ten = 0;
    entries.forEach((e) => {
      if (e.state === "committed") {
        com += committedDays(e).filter((k) => { const d = dParse(k); return d.getFullYear() === y && d.getMonth() === m; }).length;
      } else if (e.state === "tentative") {
        const d = dParse(e.week);
        if (d.getFullYear() === y && d.getMonth() === m) ten += e.days;
      }
    });
    return { m, com, ten };
  });
  const peak = Math.max(MONTH_CAPACITY, ...months.map((x) => x.com + x.ten));
  const H = 92;

  return (
    <div className="mx-2.5">
      <div className="rounded px-2.5 pt-2.5 pb-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div style={{ ...eyebrow, color: T.ink2 }}>Days on site vs what a month holds</div>
        <div className="flex items-end gap-1" style={{ height: H, marginTop: 8, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: (MONTH_CAPACITY / peak) * H,
                        borderTop: `1px dashed ${T.ink3}` }} />
          {months.map(({ m, com, ten }) => (
            <div key={m} className="flex-1 flex flex-col justify-end items-center" style={{ height: H, minWidth: 0 }}>
              {ten > 0 && <span style={{ width: "100%", height: (ten / peak) * H, background: HATCH, borderTop: `1px solid #E6D2A0` }} />}
              {com > 0 && <span style={{ width: "100%", height: (com / peak) * H, background: T.green }} />}
              {com + ten === 0 && <span style={{ width: "100%", height: 2, background: T.hair }} />}
            </div>
          ))}
        </div>
        <div className="flex gap-1" style={{ marginTop: 3 }}>
          {months.map(({ m, com, ten }) => (
            <div key={m} className="flex-1 text-center" style={{ minWidth: 0 }}>
              <div style={{ ...eyebrow, fontSize: 8.5, color: com + ten ? T.ink2 : T.ink3 }}>{MON[m][0]}</div>
              <div style={{ fontFamily: disp, fontSize: 9.5, ...nums, color: com + ten ? T.ink : T.hair }}>{com + ten || "–"}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3" style={{ marginTop: 6, borderTop: `1px solid ${T.hairSoft}`, paddingTop: 6 }}>
          <span className="flex items-center gap-1" style={{ fontSize: F.xs, color: T.ink2 }}>
            <span style={{ width: 9, height: 9, background: T.green }} /> Committed
          </span>
          <span className="flex items-center gap-1" style={{ fontSize: F.xs, color: T.ink2 }}>
            <span style={{ width: 9, height: 9, background: HATCH, border: "1px solid #E6D2A0" }} /> Tentative
          </span>
          <span className="flex items-center gap-1" style={{ fontSize: F.xs, color: T.ink3 }}>
            <span style={{ width: 9, height: 0, borderTop: `1px dashed ${T.ink3}` }} /> {MONTH_CAPACITY}-day month
          </span>
        </div>
      </div>
      <div className="px-1 pt-2" style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5 }}>
        A year of day cells would be mostly white — you work 7 to 15 days a month.
        The question a year answers is which months are empty, so it is a load chart, not a grid.
      </div>
    </div>
  );
}

/* ---- the scopes you have going ----
   A scope is a draft until a quote comes off it. Drafts pile up fast —
   a measure you started in a driveway, a slab you priced and never sent —
   so this list has to make it obvious what is unfinished and easy to bin
   the ones that were never real. Deleting takes two taps, never one. */
const scopeStats = (sc) => computeJob(sc.sections, sc.cfg);

function ScopesScreen({ scopes, onOpen, onNew, onDelete }) {
  const [confirming, setConfirming] = useState(null);
  const drafts = scopes.filter((x) => !x.docId);
  const quoted = scopes.filter((x) => x.docId);

  const Row = ({ sc }) => {
    const r = scopeStats(sc);
    const t = THREADS.find((x) => x.id === sc.threadId);
    const who = t ? (t.name || t.aiGuess || t.phone) : null;
    const isConfirming = confirming === sc.id;

    if (isConfirming) {
      return (
        <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: T.redDim, borderBottom: `1px solid ${T.hairSoft}` }}>
          <div style={{ minWidth: 0, flex: 1, fontSize: F.sm, color: T.ink }}>
            Delete {who || "this scope"}? <span style={{ color: T.ink2 }}>It has not been quoted.</span>
          </div>
          <button onClick={() => setConfirming(null)} className="px-2.5 rounded shrink-0"
            style={{ height: 30, border: `1px solid ${T.hair}`, background: "#fff", color: T.ink2,
                     fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>Keep</button>
          <button onClick={() => { onDelete(sc.id); setConfirming(null); }} className="px-2.5 rounded shrink-0"
            style={{ height: 30, background: T.red, color: "#fff", fontFamily: disp, fontSize: F.sm,
                     textTransform: "uppercase" }}>Delete</button>
        </div>
      );
    }

    return (
      <div className="flex items-stretch" style={{ borderBottom: `1px solid ${T.hairSoft}`, background: T.card }}>
        <button onClick={() => onOpen(sc.id)} className="flex-1 text-left px-3 py-2.5 flex items-center gap-2.5" style={{ minWidth: 0 }}>
          {t ? <Avatar label={who} kind={t.kind} dim={!t.named} size={34} />
             : <span className="shrink-0 rounded-full flex items-center justify-center"
                 style={{ width: 34, height: 34, border: `1px dashed ${T.hiviz}`, color: T.hiviz, fontSize: 15 }}>?</span>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip,
                          color: who ? T.ink : T.hiviz }}>
              {who || "No customer yet"}
            </div>
            <div style={{ fontSize: F.xs, color: T.ink3, ...nums, ...clip }}>
              {sc.sections.length} section{sc.sections.length > 1 ? "s" : ""} · {num(r.sqft, 0)} sq ft · {sc.updated}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, ...nums }}>{moneyK(r.bidTotal)}</div>
            <div style={{ ...eyebrow, fontSize: 9, color: sc.docId ? T.green : T.ink3 }}>
              {sc.docId ? "Quoted" : "Draft"}
            </div>
          </div>
        </button>
        <button onClick={() => setConfirming(sc.id)} aria-label="Delete scope"
          className="shrink-0 flex items-center justify-center"
          style={{ width: 40, borderLeft: `1px solid ${T.hairSoft}`, color: T.ink3 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2.5 3.5h9M5.5 3.5V2h3v1.5M3.6 3.5l.6 8.2h5.6l.6-8.2M6 6v4M8 6v4"
              fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div className="pb-4">
      <div className="px-2.5 pt-2.5">
        <button onClick={onNew} className="w-full rounded flex items-center justify-center gap-1.5"
          style={{ height: 42, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.md,
                   textTransform: "uppercase", letterSpacing: ".08em" }}>
          <span style={{ fontSize: 17, lineHeight: 1 }}>+</span> New scope
        </button>
      </div>

      {scopes.length === 0 && (
        <div className="px-4 text-center" style={{ paddingTop: 40 }}>
          <div style={{ display: "inline-block", opacity: .45, marginBottom: 12 }}>
            <Emblem size={32} ring={T.ink3} core={T.hairSoft} />
          </div>
          <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, textTransform: "uppercase" }}>Nothing on the board</div>
          <p style={{ fontSize: F.sm, color: T.ink3, lineHeight: 1.5, maxWidth: 280, margin: "6px auto 0" }}>
            Start one here, or hit Scope on a thread and it opens already holding what the customer told you.
          </p>
        </div>
      )}

      {drafts.length > 0 && (
        <>
          <div className="px-3 pt-3 pb-1 flex items-baseline justify-between">
            <span style={{ ...eyebrow, color: T.ink2 }}>Drafts</span>
            <span style={{ ...eyebrow, fontSize: 9 }}>{drafts.length} unfinished</span>
          </div>
          <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
            {drafts.map((sc) => <Row key={sc.id} sc={sc} />)}
          </div>
        </>
      )}

      {quoted.length > 0 && (
        <>
          <div className="px-3 pt-3 pb-1" style={{ ...eyebrow, color: T.ink2 }}>Quoted</div>
          <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
            {quoted.map((sc) => <Row key={sc.id} sc={sc} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* ---- attaching a scope to whoever it belongs to ----
   A scope with no customer is a scope you cannot quote, invoice or
   schedule, so this is the one thing a blank scope should be nagging
   about. Vendors and subs are not offered — you do not scope for them. */
function CustomerPicker({ open, onClose, onPick, onNew }) {
  const [q, setQ] = useState("");
  const people = THREADS.filter((t) => t.kind === "lead");
  const term = q.trim().toLowerCase();
  const shown = term
    ? people.filter((t) => [t.name, t.phone, t.aiGuess, t.type, t.addr].some((v) => (v || "").toLowerCase().includes(term)))
    : people;

  return (
    <Drawer open={open} onClose={onClose} title="Attach a customer"
      sub="Who is this scope for?">
      <div className="px-3 pt-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder="Search name, number or address"
          className="w-full px-2.5 rounded outline-none"
          style={{ border: `1px solid ${T.hair}`, background: T.card, height: 36, fontSize: F.sm }} />
      </div>

      <button onClick={onNew} className="w-full text-left px-3 py-3 mt-2 flex items-center gap-3"
        style={{ borderTop: `1px solid ${T.hairSoft}`, borderBottom: `1px solid ${T.hairSoft}` }}>
        <span className="shrink-0 rounded-full flex items-center justify-center"
          style={{ width: 34, height: 34, border: `1px dashed ${T.chalk}`, color: T.chalk, fontSize: 18, lineHeight: 1 }}>+</span>
        <span style={{ fontSize: F.sm, fontWeight: 600, color: T.chalk }}>New customer</span>
      </button>

      {shown.length === 0 && (
        <div className="px-3 py-6 text-center" style={{ fontSize: F.sm, color: T.ink3 }}>
          Nobody matches that.
        </div>
      )}

      {shown.map((t) => {
        const dims = dimsFromThread(t);
        return (
          <button key={t.id} onClick={() => onPick(t)}
            className="w-full text-left px-3 py-2.5 flex items-center gap-2.5"
            style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
            <Avatar label={t.named ? t.name : (t.aiGuess || t.phone)} kind={t.kind} dim={!t.named} size={34} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>
                {t.named ? t.name : t.phone}
              </div>
              <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
                {t.type}{t.addr ? ` · ${t.addr.split(",")[0]}` : ""}
              </div>
              {dims && (
                <div style={{ fontSize: F.micro, color: T.chalk, textTransform: "uppercase", fontFamily: disp }}>
                  ◉ {dims[0]} × {dims[1]} from the call
                </div>
              )}
            </div>
            <Badge s={t.status} />
          </button>
        );
      })}
    </Drawer>
  );
}

/* v8's scopeFromThread: if the conversation gave us dimensions, the
   scope opens already holding them. That is the whole point of the
   Scope button on a thread — you never retype what was already said. */
function seedSections(thread) {
  const dims = thread && dimsFromThread(thread);
  if (dims) return [{
    id: 1, name: `${thread.type} — from the call`,
    Lft: dims[0], Lin: 0, Wft: dims[1], Win: 0, depthIn: 4, psi: 4000, src: "thread",
  }];
  return [{ id: 1, name: "Section 1", Lft: 10, Lin: 0, Wft: 10, Win: 0, depthIn: 4, psi: 4000 }];
}

const CAL_TARGET = 3877.86;

function ScopeScreen({ scope, thread, onBack, onOpenDusty, onQuote, onAttach, onChange }) {
  const [tab, setTab] = useState("scope");
  const [openCards, setOpenCards] = useState({ materials: true, labor: false, equip: false });

  /* the record is the source of truth — every edit writes back so the
     draft survives leaving the screen */
  const sections = scope.sections;
  const cfg = scope.cfg;
  const setSections = (u) => onChange({ sections: typeof u === "function" ? u(scope.sections) : u });
  const setCfg = (u) => onChange({ cfg: typeof u === "function" ? u(scope.cfg) : u });
  const setC = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const r = useMemo(() => computeJob(sections, cfg), [sections, cfg]);

  const addSection = () => setSections((a) => [{
    id: Date.now(), name: `Section ${a.length + 1}`,
    Lft: 10, Lin: 0, Wft: 10, Win: 0, depthIn: 4, psi: 4000,
  }, ...a]);
  const dropSection = (id) => setSections((a) => (a.length > 1 ? a.filter((x) => x.id !== id) : a));

  const title = thread ? (thread.name || thread.aiGuess || thread.phone) : "New scope";
  const sub = thread ? thread.aiTitle : "Not attached to a customer yet";

  /* the 12×20×4″ calibration job — when the scope matches it, show the
     gap against the known target and offer to solve markup back to it */
  const jobFiles = thread ? FILES.filter((f) => f.threadId === thread.id) : [];

  /* attached after the fact: the sections were built blind, so offer what
     the conversation already said rather than silently overwriting */
  const [dimsUsed, setDimsUsed] = useState(false);
  const [seededFrom] = useState(() => scope.threadId);
  const threadDims = thread && dimsFromThread(thread);
  const offerDims = !dimsUsed && threadDims && thread.id !== seededFrom ? threadDims : null;

  const isCal = sections.length === 1 && Math.abs(r.sqft - 240) < 0.01 && Number(sections[0].depthIn) === 4;
  const calDelta = r.bidTotal - CAL_TARGET;

  return (
    <div>
      {/* who this scope belongs to */}
      <div className="px-2.5 pt-2.5">
        <button onClick={onBack} className="flex items-center gap-1 mb-1.5" style={{ ...eyebrow, color: T.ink2 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>‹</span> All scopes
        </button>
        <div className="flex items-start justify-between gap-2">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05, ...clip }}>{title}</div>
            <div style={{ fontSize: F.xs, color: thread ? T.ink3 : T.hiviz, ...clip }}>{sub}</div>
          </div>
          {thread && <Badge s={thread.status} />}
        </div>

        {/* a scope with nobody on it cannot be quoted, invoiced or scheduled */}
        {!thread && (
          <button onClick={onAttach} className="w-full mt-2 rounded flex items-center justify-center gap-1.5"
            style={{ height: 38, border: `1px dashed ${T.chalk}`, background: T.chalkDim, color: T.chalk,
                     fontFamily: disp, fontSize: F.md, textTransform: "uppercase", letterSpacing: ".06em" }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Attach a customer
          </button>
        )}
        <div style={{ fontSize: F.xs, color: T.ink3, ...nums }}>
          Tax {(r.taxRate * 100).toFixed(2)}% · Zip {cfg.zip}
        </div>
      </div>

      {/* the four tabs, as in v8 */}
      <div className="flex mt-2 px-2.5" style={{ gap: 2 }}>
        {[["scope", "Scope"], ["costs", "Costs"], ["notes", "Notes"], ["files", "Files"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="flex-1"
            style={{ height: 34, background: tab === k ? T.card : "transparent",
                     borderBottom: tab === k ? `2px solid ${T.hiviz}` : `1px solid ${T.hair}`,
                     fontFamily: disp, fontSize: F.sm, fontWeight: 600, textTransform: "uppercase",
                     color: tab === k ? T.ink : T.ink3 }}>{l}</button>
        ))}
      </div>

      {/* ---- SCOPE ---- */}
      {tab === "scope" && (
        <div className="p-2.5">
          {/* ---- the margin, where the decisions get made ----
               Moved off the quote page. By the time you are looking at the
               document the price is already set; the moment that matters is
               while the scope is still moving under your hands. ---- */}
          <div className="rounded px-2.5 py-2 mb-1.5" style={{ background: T.dark, color: "#fff" }}>
            <div className="flex justify-between items-baseline" style={{ ...nums }}>
              <span style={{ fontSize: F.sm, color: "#C3CBD4" }}>Cost {money(r.subtotal)}</span>
              <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: T.hiviz }}>{money(r.markupAmt)}</span>
            </div>
            <div className="flex justify-between items-baseline" style={{ marginTop: -2 }}>
              <span style={{ ...eyebrow, fontSize: 9, color: "#7D8894" }}>what it costs you</span>
              <span style={{ ...eyebrow, fontSize: 9, color: "#7D8894" }}>profit · {(r.marginPct * 100).toFixed(1)}% margin</span>
            </div>
            <input type="range" min="0" max="60" step="0.5" value={cfg.markupPct * 100}
              onChange={(e) => setC({ markupPct: Number(e.target.value) / 100 })}
              className="w-full" style={{ marginTop: 4 }} />
            <div className="flex justify-between items-baseline" style={{ fontSize: F.micro, color: "#7D8894", ...nums }}>
              <span>MARKUP {(cfg.markupPct * 100).toFixed(1)}%</span>
              <span>{money0(r.profitPerDay)}/DAY</span>
              <span style={{ color: "#C3CBD4" }}>BID {money(r.bidTotal)}</span>
            </div>
          </div>

          {/* ---- what you are selling, and what it fetches ----
               Every quantity sits with its own rate instead of being stranded
               in a separate row under a ruler. Two rows, four pairs. ---- */}
          <div className="rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
            <div className="grid grid-cols-2">
              {[
                { qty: num(r.sqft, 0), unit: "sq ft", rate: money(r.perSqft), per: "/sf" },
                { qty: num(r.sqyd, 1), unit: "sq yd", rate: money(r.perSqyd), per: "/sy" },
                { qty: num(r.perimeter, 0), unit: "lin ft", rate: num(r.cy) + " CY", per: "concrete" },
                { qty: num(r.totalDays, 1), unit: "days", rate: money0(r.perDay), per: "/day" },
              ].map((c, i) => (
                <div key={c.unit} className="px-2.5 py-2 flex items-baseline justify-between gap-1.5"
                  style={{ minWidth: 0,
                           borderRight: i % 2 === 0 ? `1px solid ${T.hairSoft}` : "none",
                           borderTop: i > 1 ? `1px solid ${T.hairSoft}` : "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1, ...nums }}>{c.qty}</div>
                    <div style={{ ...eyebrow, fontSize: 9 }}>{c.unit}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink2, ...nums }}>{c.rate}</div>
                    <div style={{ ...eyebrow, fontSize: 9, letterSpacing: ".08em" }}>{c.per}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {offerDims && (
            <div className="mt-1.5 rounded px-2.5 py-2"
              style={{ background: T.chalkDim, border: `1px solid #C3D6F5` }}>
              <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.45 }}>
                {(thread.name || "That call").split(" ")[0]} gave <b>{offerDims[0]} × {offerDims[1]}</b> on the phone.
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => {
                    setSections([{ id: Date.now(), name: `${thread.type} — from the call`,
                      Lft: offerDims[0], Lin: 0, Wft: offerDims[1], Win: 0, depthIn: 4, psi: 4000, src: "thread" }]);
                    setDimsUsed(true);
                  }}
                  className="flex-1 rounded" style={{ height: 32, background: T.chalk, color: "#fff",
                    fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>Use it</button>
                <button onClick={() => setDimsUsed(true)} className="flex-1 rounded"
                  style={{ height: 32, border: `1px solid ${T.hair}`, background: "#fff", color: T.ink2,
                           fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>Keep mine</button>
              </div>
            </div>
          )}

          {isCal && (
            <div className="mt-1.5 rounded px-2.5 py-2"
              style={{ background: Math.abs(calDelta) < 50 ? T.greenDim : T.hivizDim,
                       border: `1px solid ${Math.abs(calDelta) < 50 ? "#BFE3CE" : "#F7C9A8"}` }}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div style={eyebrow}>Calibration · 12×20×4″</div>
                  <div style={{ fontSize: F.xs, color: T.ink2, ...nums }}>Target {money(CAL_TARGET)}</div>
                </div>
                <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, ...nums,
                              color: Math.abs(calDelta) < 50 ? T.green : T.hiviz }}>
                  {calDelta >= 0 ? "+" : "−"}{money(Math.abs(calDelta))}
                </div>
              </div>
              <button onClick={() => setC({ markupPct: r.subtotal ? CAL_TARGET / r.subtotal - 1 : 0 })}
                className="w-full mt-1.5 rounded"
                style={{ height: 32, background: T.ink, color: "#fff", fontFamily: disp,
                         fontSize: F.sm, textTransform: "uppercase" }}>Solve markup to target</button>
            </div>
          )}

          <div className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sections.map((sec) => {
              const c = r.per.find((x) => x.id === sec.id);
              const set = (k) => (v) => setSections((arr) => arr.map((x) => (x.id === sec.id ? { ...x, [k]: v } : x)));
              return (
                <div key={sec.id} className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
                  <div className="flex items-start justify-between gap-2 px-2.5 pt-2">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <input value={sec.name} onChange={(e) => set("name")(e.target.value)}
                        className="bg-transparent outline-none w-full"
                        style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }} />
                      {sec.src === "thread" && (
                        <div style={{ fontSize: F.micro, color: T.chalk, textTransform: "uppercase" }}>◉ From the conversation</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: T.chalk, ...nums }}>{num(c?.sqft ?? 0, 0)}</div>
                      <div style={{ fontSize: F.micro, color: T.ink3 }}>SQ FT · {num(c?.cy ?? 0)} CY</div>
                    </div>
                  </div>
                  <div className="px-2.5 py-2" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <DimRow axis="L" ft={sec.Lft} inches={sec.Lin} onFt={set("Lft")} onIn={set("Lin")} />
                    <DimRow axis="W" ft={sec.Wft} inches={sec.Win} onFt={set("Wft")} onIn={set("Win")} />
                    <div className="flex gap-1.5 items-end">
                      <div style={{ width: 92 }}><NumField label="Depth" value={sec.depthIn} onChange={set("depthIn")} suffix="in" /></div>
                      <div className="flex-1" style={{ minWidth: 0 }}>
                        <div style={eyebrow}>PSI</div>
                        <div className="flex rounded overflow-hidden mt-0.5" style={{ border: `1px solid ${T.hair}`, height: 40 }}>
                          {[3000, 4000, 5000].map((psi) => (
                            <button key={psi} onClick={() => set("psi")(psi)} className="flex-1"
                              style={{ background: sec.psi === psi ? T.chalk : "#fff", color: sec.psi === psi ? "#fff" : T.ink3,
                                       fontFamily: disp, fontSize: F.sm, fontWeight: 600 }}>{psi / 1000}K</button>
                          ))}
                        </div>
                      </div>
                      {sections.length > 1 && (
                        <button onClick={() => dropSection(sec.id)} aria-label="Remove section"
                          className="rounded shrink-0 flex items-center justify-center"
                          style={{ width: 40, height: 40, border: `1px solid ${T.hair}`, background: "#fff", color: T.ink3 }}>
                          <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                            <path d="M1 1 L12 12 M12 1 L1 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={addSection} className="w-full mt-2 rounded"
            style={{ height: 40, border: `1px dashed ${T.chalk}`, color: T.chalk, background: "#fff",
                     fontFamily: disp, fontSize: F.md, textTransform: "uppercase" }}>+ Add section</button>
          <button onClick={() => onQuote && onQuote(sections, cfg)} className="w-full mt-1.5 rounded"
            style={{ height: 44, background: T.hiviz, color: "#fff", fontFamily: disp, fontSize: F.lg,
                     textTransform: "uppercase", letterSpacing: ".12em" }}>Generate quote</button>
        </div>
      )}

      {/* ---- COSTS ---- */}
      {tab === "costs" && (
        <div className="p-2.5" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[["materials", "Materials", r.materials, r.materialsTotal],
            ["labor", "Labor", r.labor, r.laborTotal],
            ["equip", "Equip + OH", r.equipment, r.equipTotal]].map(([key, label, items, total]) => (
            <div key={key} className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <button onClick={() => setOpenCards((o) => ({ ...o, [key]: !o[key] }))}
                className="w-full flex items-center justify-between px-2.5" style={{ height: 42 }}>
                <span className="flex items-center gap-1.5">
                  <span style={{ fontFamily: disp, fontSize: F.xs, color: T.ink3, width: 10 }}>{openCards[key] ? "−" : "+"}</span>
                  <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
                </span>
                <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }}>{money(total)}</span>
              </button>
              {openCards[key] && (
                <div className="px-2.5 pb-2.5" style={{ borderTop: `1px solid ${T.hair}` }}>
                  {items.map((it, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 py-1.5"
                      style={{ borderBottom: i < items.length - 1 ? `1px solid ${T.hairSoft}` : "none" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: F.sm, color: it.flag ? T.hiviz : T.ink, ...clip }}>{it.name}</div>
                        <div style={{ fontSize: F.micro, color: T.ink3, ...nums }}>
                          {num(it.qty, 1)} {it.unit} × {money(it.unitCost)}
                          {it.auto && <span style={{ color: T.chalk }}> · AUTO</span>}
                        </div>
                      </div>
                      <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>{money(it.total)}</div>
                    </div>
                  ))}
                  {key === "materials" && (
                    <div className="grid grid-cols-2 gap-x-2 pt-2 mt-1.5" style={{ borderTop: `1px solid ${T.hair}` }}>
                      <Toggle on={cfg.mesh.on} label="Wire mesh" onChange={(v) => setC({ mesh: { ...cfg.mesh, on: v } })} />
                      <Toggle on={cfg.rebar4.on} label="#4 rebar" onChange={(v) => setC({ rebar4: { ...cfg.rebar4, on: v } })} />
                      <Toggle on={cfg.gravelBase.on} label="Gravel base" onChange={(v) => setC({ gravelBase: { ...cfg.gravelBase, on: v } })} />
                      <Toggle on={cfg.demo.on} label="Demo" onChange={(v) => setC({ demo: { ...cfg.demo, on: v } })} />
                      <Toggle on={cfg.dowels.on} label="Dowels" onChange={(v) => setC({ dowels: { ...cfg.dowels, on: v } })} />
                      <Toggle on={cfg.vaporBarrier.on} label="Vapor barrier" onChange={(v) => setC({ vaporBarrier: { ...cfg.vaporBarrier, on: v } })} />
                    </div>
                  )}
                  {key === "labor" && (
                    <div className="grid grid-cols-2 gap-1.5 pt-2 mt-1.5" style={{ borderTop: `1px solid ${T.hair}` }}>
                      <NumField label="Mobilization" value={cfg.mobilization} onChange={(v) => setC({ mobilization: v })} />
                      <NumField label="Burn rate" value={cfg.burnRate} onChange={(v) => setC({ burnRate: v })} suffix="/hr" />
                      <NumField label="Crew" value={cfg.crewSize} onChange={(v) => setC({ crewSize: v })} />
                      <NumField label="Production" value={cfg.productionRate} onChange={(v) => setC({ productionRate: v })} suffix="sf/p/d" />
                    </div>
                  )}
                  {key === "equip" && (
                    <div className="pt-2 mt-1.5" style={{ borderTop: `1px solid ${T.hair}` }}>
                      <div style={eyebrow}>Placement</div>
                      <div className="mt-1">
                        <Segmented small value={cfg.placement} onChange={(v) => setC({ placement: v })}
                          options={[["tailgate", "Chute"], ["buggy", "Buggy"], ["pump", "Pump"]]} />
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 mt-1.5">
                        <Toggle on={cfg.trailer.on} label="Dump trailer" onChange={(v) => setC({ trailer: { ...cfg.trailer, on: v } })} />
                        <Toggle on={cfg.skid.on} label="Mini skid" onChange={(v) => setC({ skid: { ...cfg.skid, on: v } })} />
                        <Toggle on={cfg.saw.on} label="Concrete saw" onChange={(v) => setC({ saw: { ...cfg.saw, on: v } })} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="rounded px-2.5 py-2.5" style={{ background: T.dark, color: "#fff" }}>
            <div className="flex justify-between items-baseline">
              <span style={{ ...eyebrow, color: "#7D8894" }}>Subtotal</span>
              <span style={{ fontFamily: disp, fontSize: F.md, ...nums, color: "#C3CBD4" }}>{money(r.subtotal)}</span>
            </div>
            <div className="flex justify-between items-baseline mt-1">
              <span style={{ ...eyebrow, color: "#7D8894" }}>
                Markup {(cfg.markupPct * 100).toFixed(1)}% · margin {(r.marginPct * 100).toFixed(1)}%
              </span>
              <span style={{ fontFamily: disp, fontSize: F.md, ...nums, color: T.hiviz }}>{money(r.markupAmt)}</span>
            </div>
            <input type="range" min="0" max="60" step="0.5" value={cfg.markupPct * 100}
              onChange={(e) => setC({ markupPct: Number(e.target.value) / 100 })} className="w-full" />
            <div className="flex items-baseline justify-between pt-2" style={{ borderTop: `1px solid ${T.darkHair}` }}>
              <span style={{ fontFamily: disp, fontSize: F.md, textTransform: "uppercase", letterSpacing: ".14em", color: "#C3CBD4" }}>Total bid</span>
              <span style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, color: T.hiviz, ...nums }}>{money(r.bidTotal)}</span>
            </div>
            <button onClick={() => onQuote && onQuote(sections, cfg)} className="w-full mt-2 rounded"
              style={{ height: 42, background: T.hiviz, color: "#fff", fontFamily: disp, fontSize: F.lg,
                       textTransform: "uppercase", letterSpacing: ".12em" }}>Generate quote</button>
            <div style={{ ...eyebrow, fontSize: 9, color: "#7D8894", marginTop: 6, lineHeight: 1.5, letterSpacing: ".06em" }}>
              One global markup and crew-hour labor — v8 math, known wrong.
              Per-cost-type margin and per-sqft labor still to come.
            </div>
          </div>
        </div>
      )}

      {/* ---- NOTES ---- */}
      {tab === "notes" && (
        <div className="p-2.5" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="rounded px-2.5 py-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
            <div style={eyebrow}>Scope of work — written from the build, not typed</div>
            {scopeBullets(cfg, r).map((b) => (
              <div key={b} className="flex gap-1.5" style={{ fontSize: F.sm, lineHeight: 1.5, color: T.ink2 }}>
                <span style={{ color: T.hiviz }}>—</span><span>{b}</span>
              </div>
            ))}
          </div>
          <div className="rounded px-2.5 py-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
            <div style={eyebrow}>What the conversation said</div>
            <div style={{ fontSize: F.sm, color: thread ? T.ink2 : T.ink3, lineHeight: 1.5 }}>
              {thread ? thread.aiSummary : "No thread attached — nothing pulled in."}
            </div>
            {thread && (
              <button onClick={onOpenDusty} className="w-full mt-2 rounded flex items-center justify-center gap-1.5"
                style={{ height: 36, border: `1px solid ${T.hair}`, background: "#fff",
                         fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", color: T.ink2 }}>
                <Emblem size={14} /> Ask Dusty about this job
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- PLANS ---- */}
      {tab === "files" && (
        <div className="p-2.5">
          {jobFiles.length > 0 ? (
            <>
              <div className="rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
                {jobFiles.map((f, i) => <FileRow key={f.id} f={f} first={i === 0} />)}
              </div>
              <button className="w-full mt-2 rounded"
                style={{ height: 40, border: `1px dashed ${T.chalk}`, color: T.chalk, background: "#fff",
                         fontFamily: disp, fontSize: F.md, textTransform: "uppercase" }}>+ Add photo or plan</button>
            </>
          ) : (
          <div className="rounded px-3 py-6 text-center" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
            <div style={{ display: "inline-block", opacity: .45, marginBottom: 10 }}>
              <Emblem size={30} ring={T.ink3} core={T.hairSoft} />
            </div>
            <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, textTransform: "uppercase" }}>No files on this job</div>
            <p style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5, maxWidth: 260, margin: "6px auto 12px" }}>
              Engineer sets, site photos, markups and receipts land here and stay tied to the sections above.
            </p>
            <button className="rounded" style={{ border: `1px solid ${T.hair}`, background: "#fff", color: T.ink2,
              fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", padding: "9px 16px" }}>Add a file</button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}



/* ============================================================ MONEY SIDE
   Atlas's rule holds and is worth keeping: the pipeline panel is the
   REVENUE side (leads, close rate, activity) and this tab is the MONEY
   side (actual dollars, bills, deposits, realised margin). Nothing
   appears in both except pipeline value, and even that means different
   things in each place.

   Deposits come first on purpose. No deposit, no pour.
============================================================ */
const BILLS = [
  { id: "b1", who: "Gulf Coast Ready Mix", what: "Old Hammond — 60 CY", amount: 14168, due: "Aug 20", days: 3, kind: "material" },
  { id: "b2", who: "United Rentals", what: "Skid steer, 14 days", amount: 3250, due: "Aug 25", days: 8, kind: "equipment" },
  { id: "b3", who: "Luis Alvarez", what: "Finishing — Plunket patio", amount: 980, due: "Aug 26", days: 9, kind: "sub" },
  { id: "b4", who: "State Farm", what: "General liability", amount: 2400, due: "Sep 1", days: 15, kind: "insurance" },
];

const INCOMING = [
  { id: "i1", who: "Gulfline Paving", what: "Progress draw · 40%", amount: 13648, due: "Aug 28", days: 11, firm: true },
  { id: "i2", who: "T. Boudreaux", what: "Deposit — invoiced", amount: 4840, due: "Aug 22", days: 5, firm: true },
  { id: "i3", who: "Dale Hawkins", what: "Deposit if he signs", amount: 750, due: "Sep 2", days: 16, firm: false },
];

const DEPOSITS = [
  { id: "p1", who: "Gulfline Paving", amount: 8530, state: "paid", when: "Jun 2" },
  { id: "p2", who: "T. Boudreaux", amount: 4840, state: "invoiced", when: "sent Aug 1" },
  { id: "p3", who: "Robin Plunket", amount: 390, state: "none", when: "not asked" },
];

/* what you are paying now vs what the open bids assumed */
const DRIFT = [
  { id: "d1", item: "4000 PSI ready mix", unit: "CY", bid: 155.00, now: 161.00, quotes: 3 },
  { id: "d2", item: "Wire mesh 10ga", unit: "roll", bid: 110.00, now: 112.50, quotes: 3 },
  { id: "d3", item: "#4 rebar 20ft", unit: "pc", bid: 14.50, now: 13.80, quotes: 1 },
];

const KIND_TONE = { material: M.comDark, equipment: T.violet, sub: M.inDark, insurance: T.ink2 };

function MoneyRow({ left, sub, right, rightSub, tone, urgent }) {
  return (
    <div className="px-3 py-2 flex items-center gap-2.5" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
      <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, background: tone || T.hair }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{left}</div>
        <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{sub}</div>
      </div>
      <div className="text-right shrink-0">
        <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, ...nums }}>{right}</div>
        <div style={{ ...eyebrow, fontSize: 9, color: urgent ? T.hiviz : T.ink3 }}>{rightSub}</div>
      </div>
    </div>
  );
}

function MoneyCard({ title, note, children, right }) {
  return (
    <div className="mx-2.5 mt-2.5 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
      <div className="px-3 pt-2.5 pb-1.5 flex items-baseline justify-between gap-2">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, lineHeight: 1.1 }}>{title}</div>
          {note && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{note}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function MoneySide({ onOpenDusty }) {
  const billsTotal = BILLS.reduce((n, b) => n + b.amount, 0);
  const inFirm = INCOMING.filter((x) => x.firm).reduce((n, x) => n + x.amount, 0);
  const inSoft = INCOMING.filter((x) => !x.firm).reduce((n, x) => n + x.amount, 0);
  const depOut = DEPOSITS.filter((d) => d.state !== "paid").reduce((n, d) => n + d.amount, 0);
  const drifted = DRIFT.filter((d) => d.now > d.bid);
  const driftExposure = drifted.reduce((n, d) => n + (d.now - d.bid) * (d.unit === "CY" ? 58 : 8), 0);

  return (
    <div>
      {/* deposits first — no deposit, no pour */}
      <MoneyCard title="Deposits" note="Nothing gets poured on a promise"
        right={<span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: depOut ? T.hiviz : T.green, ...nums }}>{moneyK(depOut)} out</span>}>
        {DEPOSITS.map((d) => (
          <MoneyRow key={d.id} left={d.who}
            sub={d.state === "paid" ? `Cleared ${d.when}` : d.state === "invoiced" ? `Invoiced, ${d.when}` : "No deposit asked for yet"}
            right={money0(d.amount)} rightSub={d.state === "paid" ? "paid" : d.state === "invoiced" ? "waiting" : "not asked"}
            tone={d.state === "paid" ? M.inLight : d.state === "invoiced" ? M.projLight : T.hiviz}
            urgent={d.state === "none"} />
        ))}
      </MoneyCard>

      {/* out */}
      <MoneyCard title="Going out" note="Sorted by what lands first"
        right={<span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: M.outDark, ...nums }}>{moneyK(billsTotal)}</span>}>
        {BILLS.map((b) => (
          <MoneyRow key={b.id} left={b.who} sub={b.what} right={money0(b.amount)}
            rightSub={`${b.due} · ${b.days}d`} tone={KIND_TONE[b.kind]} urgent={b.days <= 5} />
        ))}
      </MoneyCard>

      {/* in */}
      <MoneyCard title="Coming in" note="Firm money and money that still has an if in it"
        right={
          <span className="text-right">
            <span style={{ display: "block", fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: M.inDark, ...nums }}>{moneyK(inFirm)}</span>
            <span style={{ ...eyebrow, fontSize: 9 }}>+{moneyK(inSoft)} if</span>
          </span>
        }>
        {INCOMING.map((x) => (
          <MoneyRow key={x.id} left={x.who} sub={x.what} right={money0(x.amount)}
            rightSub={x.firm ? `${x.due} · ${x.days}d` : "not firm"}
            tone={x.firm ? M.inLight : M.projLight} />
        ))}
      </MoneyCard>

      {/* drift — the one that quietly eats open bids */}
      <MoneyCard title="Material drift" note="What you pay now vs what your open bids assumed"
        right={<span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: driftExposure > 0 ? T.hiviz : T.green, ...nums }}>−{moneyK(driftExposure)}</span>}>
        {DRIFT.map((d) => {
          const up = d.now > d.bid, delta = d.now - d.bid;
          return (
            <MoneyRow key={d.id} left={d.item}
              sub={`${money(d.bid)} bid · ${money(d.now)} now · ${d.quotes} open quote${d.quotes > 1 ? "s" : ""}`}
              right={`${up ? "+" : "−"}${money(Math.abs(delta))}`}
              rightSub={up ? "per " + d.unit : "in your favour"}
              tone={up ? T.hiviz : M.inLight} urgent={up} />
          );
        })}
        <button onClick={() => onOpenDusty({ label: "material drift",
            prompts: ["Which open quotes are underwater?", "Reprice the Hawkins driveway", "What did Gulf Coast just send?"] })}
          className="w-full px-3 py-2 flex items-center justify-center gap-1.5"
          style={{ borderTop: `1px solid ${T.hairSoft}`, color: T.ink2, fontFamily: disp,
                   fontSize: F.sm, textTransform: "uppercase" }}>
          <Emblem size={13} /> Which quotes does this hurt?
        </button>
      </MoneyCard>

      {/* the one that needs actuals */}
      <MoneyCard title={<span>Job profitability{DOT}</span>} note="Bid margin vs what you actually kept">
        <div className="px-3 py-3" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
          <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
            This is where you find out whether the estimate was right — Gulfline
            reported 39% and kept 12.8%. It needs actual costs filed against
            finished jobs, and there are none yet.
          </div>
          <div style={{ ...eyebrow, fontSize: 9, marginTop: 6 }}>Waiting on receipts for 2–3 closed jobs</div>
        </div>
      </MoneyCard>
    </div>
  );
}


/* ============================================================ ACTIVITY
   Two different animals, deliberately kept apart:

     CONDITIONS  things that need you to act. They persist until the
                 thing is resolved. These are the alert row.
     ACTIVITY    things that HAPPENED. A log. There is no "done" state
                 and nothing to clear.

   JobTread puts both behind one bell, which forces a bad trade: clear
   the badge and you lose the to-do, or keep the to-do and the badge
   never reaches zero. So activity here is a feed you scan, marked with
   a line for where you left off, and it never asks to be emptied.

   "Opened your quote" is the highest-signal event a contractor gets —
   it is the moment to call — so it is styled to stand out.
============================================================ */
const ACT_KIND = {
  msg_in:    { label: "Text in",        tone: T.chalk,  glyph: "‹" },
  msg_out:   { label: "Text out",       tone: T.ink3,   glyph: "›" },
  call_in:   { label: "Call in",        tone: T.chalk,  glyph: "‹" },
  call_miss: { label: "Missed call",    tone: T.hiviz,  glyph: "!" },
  doc_open:  { label: "Opened quote",   tone: T.violet, glyph: "◱" },
  doc_sent:  { label: "Quote sent",     tone: T.ink3,   glyph: "◱" },
  signed:    { label: "Signed",         tone: T.green,  glyph: "✓" },
  payment:   { label: "Payment",        tone: T.green,  glyph: "$" },
  invoice:   { label: "Invoice sent",   tone: T.ink3,   glyph: "$" },
  receipt:   { label: "Receipt filed",  tone: T.ink3,   glyph: "▤" },
  scheduled: { label: "Scheduled",      tone: T.chalk,  glyph: "▦" },
  note:      { label: "Note",           tone: "#8A6100", glyph: "◈" },
};

const ACTIVITY = [
  { id: "a1",  tid: 2, kind: "doc_open", at: "9:52a",  day: "Today", text: "Dale Hawkins opened quote 26-368", sub: "Second time today · 4 min on the page", hot: true },
  { id: "a2",  tid: 2, kind: "msg_in",   at: "9:41a",  day: "Today", ch: "sms",   text: "“Also how long would the whole thing take?”" },
  { id: "a3",  tid: 2, kind: "msg_in",   at: "9:38a",  day: "Today", ch: "sms",   text: "“Did you get a chance to look at that quote?”" },
  { id: "a4",  tid: 11, kind: "msg_in",  at: "9:20a",  day: "Today", ch: "sms",   text: "“yeah that works”", sub: "Unsorted — no history on this number" },
  { id: "a5",  tid: 8, kind: "receipt",  at: "8:40a",  day: "Today", text: "Gulf Coast Ready Mix · $14,168", sub: "Filed to Old Hammond — marks a production day" },
  { id: "a6",  tid: 3, kind: "call_miss", at: "7:55a", day: "Today", ch: "call",  text: "Marisol Vega left a voicemail", sub: "30×40 shop slab" },
  { id: "a7",  tid: 2, kind: "call_miss", at: "8:41a", day: "Today", ch: "call",  text: "Dale Hawkins called, no voicemail" },
  { id: "a8",  tid: 4, kind: "invoice",  at: "4:12p",  day: "Yesterday", ch: "email", text: "Invoice INV-1042 sent to T. Boudreaux", sub: "$4,840 deposit · due Aug 22" },
  { id: "a9",  tid: 1, kind: "doc_sent", at: "9:40a",  day: "Yesterday", text: "Estimate 26-372 drafted for Robin Plunket", sub: "Not sent yet" },
  { id: "a10", tid: 2, kind: "note",     at: "8:05a",  day: "Yesterday", ch: "note",  text: "You noted: “took it to 13.9”", sub: "Internal — never sent" },
  { id: "a11", tid: 8, kind: "payment",  at: "Aug 14", day: "Earlier", text: "Gulfline Paving paid $8,530", sub: "Deposit · 25% of contract" },
  { id: "a14", tid: 8, kind: "msg_in",   at: "11:04a", day: "Today", ch: "email",
    text: "“Can you send the updated total for the apron?”", sub: "Anita Broussard · ap@gulflinepaving.com" },
  { id: "a15", tid: 8, kind: "doc_sent", at: "Aug 12", day: "Earlier", ch: "email",
    text: "Quote 26-341 sent to Ray Doucet", sub: "Opened twice · not accepted" },
  { id: "a12", tid: 9, kind: "signed",   at: "Jul 30", day: "Earlier", text: "Watkins signed and paid in full", sub: "$7,200 · driveway repair" },
  { id: "a13", tid: 10, kind: "note",    at: "Aug 4",  day: "Earlier", text: "Nguyen went with somebody cheaper", sub: "About $1,000 under · worth a call in spring" },
];

/* PEOPLE — contacts belonging to a customer, keyed by customer id.
   A residential customer has exactly one and never sees this layer.
   A company has several, and each one carries its own addresses:
   the PM you talk to, and the bookkeeper who pays. Mirrors
   contacts.customer_id + contacts.role in migration 008. */
const PEOPLE = {
  8: [
    { id: "p1", name: "Ray Doucet", role: "Project manager", primary: true,
      phones: [{ v: "(225) 555-0155", label: "Cell", primary: true }],
      emails: [{ v: "rdoucet@gulflinepaving.com", label: "", primary: true }] },
    { id: "p2", name: "Anita Broussard", role: "Bookkeeper", primary: false,
      phones: [{ v: "(225) 555-0190", label: "Office", primary: true }],
      emails: [{ v: "ap@gulflinepaving.com", label: "Invoices", primary: true }] },
  ],
};

/* MAILBOXES — your side of the envelope. You will run more than one: the
   address on the truck, and the agent inbox things get forwarded into.
   A reply must leave from whichever one they wrote to, or Ray answers a
   mailbox he has never seen. Mirrors messages.to_addr in migration 007. */
const MAILBOXES = {
  admin: "admin@saccobuilt.com",
  agent: "sacco@agentmail.to",
};

/* INBOUND — the last message on each thread: the address it came FROM,
   which resolves to a contact, and the mailbox of yours it landed ON.
   Held separately in the mock only because messages are not wired yet. */
const INBOUND = {
  1: { channel: "email", from: "rplunket@gmail.com",         to: MAILBOXES.admin, at: "9:12a" },
  2: { channel: "sms",   from: "(225) 555-0198",             to: null,            at: "8:41a" },
  /* the whole reason this exists: Gulfline's bookkeeper wrote in, so the
     thread is on Anita's address even though Ray is the main contact */
  8: { channel: "email", from: "ap@gulflinepaving.com",      to: MAILBOXES.agent, at: "11:04a" },
};

const SEEN_BEFORE = "a8";   /* where you left off last time you looked */

const activityFor = (tid) => ACTIVITY.filter((a) => a.tid === tid);

function ActivityFeed({ items, showWho, divider, onItem }) {
  /* onItem makes every row a way in — tap what happened, land where it
     happened. Without it the feed stays a plain read. */
  const Row = onItem ? "button" : "div";
  if (!items.length) {
    return (
      <div className="px-3 py-6 text-center" style={{ fontSize: F.sm, color: T.ink3 }}>
        Nothing has happened here yet.
      </div>
    );
  }
  const days = [...new Set(items.map((a) => a.day))];
  let markedDivider = false;

  return (
    <div>
      {days.map((d) => (
        <div key={d}>
          <div className="px-3 pt-2.5 pb-1" style={{ ...eyebrow, color: T.ink2 }}>{d}</div>
          {items.filter((a) => a.day === d).map((a) => {
            const k = ACT_KIND[a.kind] || ACT_KIND.note;
            const t = showWho ? THREADS.find((x) => x.id === a.tid) : null;
            let line = null;
            if (divider && !markedDivider && a.id === SEEN_BEFORE) {
              markedDivider = true;
              line = (
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span style={{ flex: 1, height: 1, background: T.hair }} />
                  <span style={{ ...eyebrow, fontSize: 9, color: T.ink3 }}>Where you left off</span>
                  <span style={{ flex: 1, height: 1, background: T.hair }} />
                </div>
              );
            }
            return (
              <div key={a.id}>
                {line}
                <Row {...(onItem ? { onClick: () => onItem(a), type: "button" } : {})}
                  className={`px-3 py-2 flex items-start gap-2.5${onItem ? " w-full text-left" : ""}`}
                  style={{ borderTop: `1px solid ${T.hairSoft}`,
                           background: a.hot ? T.violetDim : "transparent" }}>
                  <span className="shrink-0 rounded flex items-center justify-center"
                    style={{ width: 22, height: 22, marginTop: 1,
                             background: a.hot ? T.violet : "transparent",
                             border: a.hot ? "none" : `1px solid ${T.hair}`,
                             color: a.hot ? "#fff" : k.tone,
                             fontFamily: disp, fontSize: F.sm, fontWeight: 700 }}>{k.glyph}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: F.sm, lineHeight: 1.4, fontWeight: a.hot ? 600 : 400 }}>{a.text}</div>
                    {a.sub && <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4 }}>{a.sub}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div style={{ ...eyebrow, fontSize: 9 }}>{a.at}</div>
                    {t && <div style={{ fontSize: 9.5, color: T.ink3, ...clip, maxWidth: 74 }}>{t.name || t.phone}</div>}
                  </div>
                </Row>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}


/* ============================================================ CUSTOMER
   Everything one person has ever been to the business, on one page.
   Reached from a thread and from the customer list — same page either
   way, so there is only one place a fact about somebody lives.

   Locations are plural. A customer is not one address: Boudreaux has a
   house and an addition, Gulfline has three lots. The address belongs
   to the JOB, and the customer holds the set of them.
============================================================ */
const CUST_JOBS = {
  1: [{ id: "j1", title: "Back patio", addr: "1142 Sherwood Dr", status: "qualified", value: 3900, days: "2.0" }],
  2: [{ id: "j2", title: "Driveway", addr: "88 Perkins Rd", status: "quoted", value: 7465, days: "3.0" },
      { id: "j3", title: "Apron add-on", addr: "88 Perkins Rd", status: "scoping", value: 750, days: "0.5" }],
  3: [{ id: "j4", title: "Shop slab", addr: "410 Government St", status: "new", value: 12100, days: "—" }],
  4: [{ id: "j5", title: "Addition foundation", addr: "77 Highland Rd", status: "contacted", value: 24200, days: "5.0" }],
  8: [{ id: "j6", title: "Old Hammond lot", addr: "10423 Old Hammond Hwy", status: "progress", value: 34120, days: "14.0" }],
  9: [{ id: "j7", title: "Driveway repair", addr: "3320 Lanier Dr", status: "won", value: 7200, days: "1.5" }],
  10: [{ id: "j8", title: "Patio", addr: "—", status: "lost", value: 5200, days: "—" }],
};

const CUST_MONEY = {
  2: { invoiced: 750, paid: 750, outstanding: 0 },
  4: { invoiced: 4840, paid: 0, outstanding: 4840 },
  8: { invoiced: 22178, paid: 8530, outstanding: 13648 },
  9: { invoiced: 7200, paid: 7200, outstanding: 0 },
};

/* ===== WHO AN OUTBOUND MESSAGE IS FOR =====
   A phone number and an email address are not details on a record, they are
   the routing key — a thread exists because one of them matched. So the
   send path resolves a person first and takes that person's address, rather
   than reading one flat field off the party. Same resolver feeds the
   customer page, so the two can never disagree about who Ray is. */
function peopleFor(t) {
  if (!t) return [];
  if (PEOPLE[t.id]) return PEOPLE[t.id];
  return [{
    id: "p0", name: t.named ? t.name : "", role: "", primary: true,
    phones: t.phone ? [{ v: t.phone, label: "Cell", primary: true }] : [],
    emails: t.email ? [{ v: t.email, label: "", primary: true }] : [],
  }];
}

/* Resolution order, and it matters that reply-to-the-thread wins:
   1. the address this conversation actually arrived on, resolved to whoever
      owns it — answer the person who wrote to you, not the person on file;
   2. failing that, the main contact — the green dot on the customer page;
   3. failing that, anyone with an address on this channel, said out loud;
   4. nothing, and the send button stays dead.
   The mailbox is the other half: a reply leaves from whichever of your
   addresses they wrote to. */
function addressFor(t, channel) {
  const list = peopleFor(t);
  const kind = channel === "email" ? "emails" : "phones";
  const pick = (q) => ((q[kind] || []).find((e) => e.primary) || (q[kind] || [])[0] || {}).v || "";
  const inb = t ? INBOUND[t.id] : null;
  const onChannel = inb && inb.channel === (channel === "email" ? "email" : "sms");
  const from = onChannel && inb.to ? inb.to : MAILBOXES.admin;

  if (onChannel && inb.from) {
    const owner = list.find((q) => (q[kind] || []).some((e) => e.v === inb.from));
    if (owner) return { to: inb.from, who: owner.name, role: owner.role, from, reply: true, fallback: false };
    /* an address nobody owns yet — a forward, or a person not on file */
    return { to: inb.from, who: "", role: "", from, reply: true, fallback: false, orphan: true };
  }

  const main = list.find((q) => q.primary) || list[0];
  if (main && pick(main)) return { to: pick(main), who: main.name, role: main.role, from, reply: false, fallback: false };
  const alt = list.find((q) => pick(q));
  if (alt) return { to: pick(alt), who: alt.name, role: alt.role, from, reply: false, fallback: true };
  return { to: "", who: "", role: "", from, reply: false, fallback: false };
}

/* ===== EDITABLE CONTACT LINES =====
   One address is a row, not a field. Tap the value to edit in place — you are
   standing on a driveway holding the phone in one hand, so there is no sheet
   to open and nothing to save. Tap the dot to make it the one Dusty replies
   to. Blank on blur removes it. */
function ContactLines({ kind, items, setItems, top, mark }) {
  const [editing, setEditing] = useState(-1);
  const isEmail = kind === "email";
  const head = isEmail
    ? (items.length > 1 ? `${items.length} emails` : "Email")
    : (items.length > 1 ? `${items.length} phones` : "Phone");

  const commit = (i, raw) => {
    const v = raw.trim();
    setItems((list) => {
      if (!v) return list.filter((_, n) => n !== i);
      const next = list.map((r, n) => (n === i ? { ...r, v } : r));
      /* first one entered is the one we reply to */
      return next.some((r) => r.primary)
        ? next
        : next.map((r, n) => (n === 0 ? { ...r, primary: true } : r));
    });
    setEditing(-1);
  };

  const makePrimary = (i) =>
    setItems((list) => list.map((r, n) => ({ ...r, primary: n === i })));

  const add = () => {
    setItems((list) => [...list, { v: "", label: "", primary: list.length === 0 }]);
    setEditing(items.length);
  };

  return (
    <div className="px-3 py-2" style={{ borderTop: top ? `1px solid ${T.hairSoft}` : "none" }}>
      <div className="flex items-baseline justify-between">
        <span style={{ ...eyebrow }}>{head}</span>
        <button onClick={add} style={{ ...eyebrow, color: T.chalk }}
          aria-label={isEmail ? "Add an email address" : "Add a phone number"}>+ Add</button>
      </div>

      {items.length === 0 && (
        <button onClick={add} className="w-full text-left"
          style={{ fontSize: F.sm, color: T.ink3, minHeight: 30 }}>
          {isEmail ? "No email yet — tap to add" : "No number yet — tap to add"}
        </button>
      )}

      {items.map((r, i) => (
        <div key={i} className="flex items-center gap-2" style={{ minHeight: 32 }}>
          {/* primary marker doubles as the control that sets it */}
          <button onClick={() => makePrimary(i)}
            aria-label={r.primary ? "Primary — replies go here" : "Make this the primary"}
            className="shrink-0 flex items-center justify-center"
            style={{ width: 18, height: 30, color: r.primary ? T.green : T.hair, fontSize: 11 }}>
            {r.primary ? "◉" : "○"}
          </button>

          {editing === i ? (
            <input autoFocus defaultValue={r.v}
              type={isEmail ? "email" : "tel"}
              inputMode={isEmail ? "email" : "tel"}
              autoCapitalize="off" autoCorrect="off" spellCheck="false"
              placeholder={isEmail ? "name@example.com" : "(225) 555-0100"}
              onBlur={(e) => commit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.target.blur();
                if (e.key === "Escape") { e.target.value = r.v; e.target.blur(); }
              }}
              className="flex-1 min-w-0"
              style={{ fontSize: F.sm, ...nums, height: 30, background: T.hivizDim,
                       border: `1px solid ${T.hiviz}`, borderRadius: 3, padding: "0 6px",
                       outline: "none" }} />
          ) : (
            <button onClick={() => setEditing(i)}
              className="flex-1 min-w-0 text-left flex items-baseline gap-1.5"
              style={{ minHeight: 30 }}>
              <span style={{ fontSize: F.sm, ...nums, ...clip }}>
                {r.v || (isEmail ? "tap to add" : "tap to add")}
              </span>
              {r.label && <span style={{ ...eyebrow, fontSize: 9, color: T.ink3 }}>{r.label}</span>}
              {/* the address this conversation is actually on — a reply goes
                  here regardless of which one is marked primary */}
              {mark && r.v === mark && (
                <span className="shrink-0" style={{ ...eyebrow, fontSize: 9, color: T.chalk,
                  background: T.chalkDim, borderRadius: 2, padding: "1px 4px" }}>in use</span>
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* PeopleBlock — the customer/contact split made visible.
   Only companies render this. One person expanded at a time, because on a
   phone two open address lists is already a scroll. The expanded person
   reuses ContactLines, so an address behaves identically whether it hangs
   off a homeowner or off a bookkeeper. */
function PeopleBlock({ people, setPeople, mark }) {
  const [openId, setOpenId] = useState(people.length ? people[0].id : null);
  /* One person is the ordinary case, and it should not cost a tap or look
     like a list of one. The layer appears the moment a second person does. */
  const solo = people.length === 1;

  /* ContactLines always calls setItems with a function, so this adapts it
     to the person it belongs to without ContactLines knowing about people */
  const setKind = (pid, kind) => (fn) =>
    setPeople((list) => list.map((p) => (p.id === pid ? { ...p, [kind]: fn(p[kind]) } : p)));

  /* the one Dusty answers to when a message came from the company rather
     than from anybody in particular */
  const makePrimary = (pid) =>
    setPeople((list) => list.map((p) => ({ ...p, primary: p.id === pid })));

  const addPerson = () => {
    const id = "p" + Date.now();
    setPeople((list) => [...list, { id, name: "", role: "", primary: list.length === 0, phones: [], emails: [] }]);
    setOpenId(id);
  };

  const rename = (pid, raw) =>
    setPeople((list) => list.map((p) => (p.id === pid ? { ...p, name: raw.trim() } : p)));

  return (
    <div className="mx-2.5 mt-2.5 rounded overflow-hidden"
      style={{ background: T.card, border: `1px solid ${T.hair}` }}>
      <div className="px-3 py-2 flex items-baseline justify-between"
        style={{ borderBottom: solo ? "none" : `1px solid ${T.hairSoft}`, paddingBottom: solo ? 0 : undefined }}>
        <span style={{ ...eyebrow }}>{solo ? "Contact" : `${people.length} people`}</span>
        <button onClick={addPerson} style={{ ...eyebrow, color: T.chalk }}>+ Person</button>
      </div>

      {people.length === 0 && (
        <button onClick={addPerson} className="w-full text-left px-3 py-3"
          style={{ fontSize: F.sm, color: T.ink3 }}>Nobody on this account yet — tap to add</button>
      )}

      {people.map((p, i) => {
        const open = openId === p.id;
        const mail = (p.emails.find((e) => e.primary) || p.emails[0] || {}).v;
        const tel = (p.phones.find((e) => e.primary) || p.phones[0] || {}).v;
        return (
          <div key={p.id} style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
            {!solo && (
            <div className="flex items-center gap-2 px-3 py-2">
              <button onClick={() => makePrimary(p.id)}
                aria-label={p.primary ? "Main contact" : "Make this the main contact"}
                className="shrink-0 flex items-center justify-center"
                style={{ width: 18, height: 30, color: p.primary ? T.green : T.hair, fontSize: 11 }}>
                {p.primary ? "◉" : "○"}
              </button>
              <button onClick={() => setOpenId(open ? null : p.id)}
                className="flex-1 min-w-0 text-left" style={{ minHeight: 30 }}>
                <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>
                  {p.name || "Unnamed"}
                </div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
                  {p.role || "No role"}{!open && (tel || mail) ? ` · ${tel || mail}` : ""}
                </div>
              </button>
              <span className="shrink-0" style={{ color: T.ink3, fontSize: 13,
                transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms" }}>›</span>
            </div>
            )}

            {(solo || open) && (
              <div style={{ background: solo ? "transparent" : T.hairSoft }}>
                {!solo && (
                <div className="px-3 pt-2">
                  <div style={{ ...eyebrow, marginBottom: 2 }}>Name and role</div>
                  <div className="flex gap-1.5">
                    <input defaultValue={p.name} placeholder="Name"
                      onBlur={(e) => rename(p.id, e.target.value)}
                      className="flex-1 min-w-0"
                      style={{ fontSize: F.sm, height: 30, background: T.card,
                               border: `1px solid ${T.hair}`, borderRadius: 3, padding: "0 6px", outline: "none" }} />
                    <input defaultValue={p.role} placeholder="Role"
                      onBlur={(e) => setPeople((list) =>
                        list.map((q) => (q.id === p.id ? { ...q, role: e.target.value.trim() } : q)))}
                      className="flex-1 min-w-0"
                      style={{ fontSize: F.sm, height: 30, background: T.card,
                               border: `1px solid ${T.hair}`, borderRadius: 3, padding: "0 6px", outline: "none" }} />
                  </div>
                </div>
                )}
                <ContactLines kind="phone" items={p.phones} setItems={setKind(p.id, "phones")} top={!solo} mark={mark} />
                <ContactLines kind="email" items={p.emails} setItems={setKind(p.id, "emails")} top mark={mark} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CustomerScreen({ thread, onBack, onScope, onAbout, onOpenDusty }) {
  const [tab, setTab] = useState("activity");

  /* Addresses accumulate — a person hands you a number on the phone and an
     email off a web form, and the bookkeeper turns up later. So each one is a
     row you can edit in place, not a fixed field. Mirrors contact_emails /
     contact_phones in migration 007. Mock: local state, resets on close. */
  /* Every customer holds people — a homeowner just holds one. Seeding the
     solo case from the record's own fields means there is one code path,
     and the layer only becomes visible when a second person exists. */
  const [people, setPeople] = useState(() => peopleFor(thread));
  /* which channel you are reading. All hooks live above the early return. */
  const [chan, setChan] = useState("all");

  /* Reading and changing are different jobs. The page is flat text until you
     flip it, so a stray tap on a jobsite cannot open a field over the number
     you were reading. Phones, emails and people stay live in both modes —
     adding an address is a different gesture from correcting a name. */
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(() =>
    thread ? (thread.named ? thread.name : (thread.aiGuess || thread.phone)) : "");
  /* An address belongs to the job; the customer only holds the set. So a
     location row here writes back to the job it came from, never to the
     customer record — there is one home for the fact. */
  const [jobAddr, setJobAddr] = useState({});

  if (!thread) return null;

  const who = name;
  const jobs = (CUST_JOBS[thread.id] || []).map((j) =>
    jobAddr[j.id] !== undefined ? { ...j, addr: jobAddr[j.id] } : j);
  const money = CUST_MONEY[thread.id] || { invoiced: 0, paid: 0, outstanding: 0 };
  const acts = activityFor(thread.id);
  const inbound = INBOUND[thread.id] || null;
  const locations = [];
  jobs.forEach((j) => {
    if (!j.addr || j.addr === "—") return;
    const g = locations.find((x) => x.addr === j.addr);
    if (g) g.jobs.push(j); else locations.push({ addr: j.addr, jobs: [j] });
  });
  const setAddr = (group, v) => {
    const next = v.trim();
    if (!next || next === group.addr) return;
    setJobAddr((m) => {
      const o = { ...m };
      group.jobs.forEach((j) => { o[j.id] = next; });
      return o;
    });
  };
  const lifetime = jobs.filter((j) => j.status === "won" || j.status === "progress")
    .reduce((n, j) => n + j.value, 0);

  const Action = ({ label, onClick, primary }) => (
    <button onClick={onClick} className="flex-1 rounded"
      style={{ height: 34, minWidth: 0,
               background: primary ? T.ink : T.card, color: primary ? "#fff" : T.ink2,
               border: primary ? "none" : `1px solid ${T.hair}`,
               fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>{label}</button>
  );

  return (
    <div className="pb-4">
      {/* Back and Edit are the two page-level controls, so they share a rail.
         It rides under the 84px header assembly and stays put, and the whole
         strip goes hi-viz while editing so the mode is legible after you have
         scrolled past the button itself. */}
      <div className="sticky flex items-center justify-between px-2.5"
        style={{ top: 84, zIndex: 30, height: 34,
                 background: editing ? T.hivizDim : T.slab,
                 borderBottom: `1px solid ${editing ? T.hiviz : T.hairSoft}`,
                 transition: "background 160ms" }}>
        <button onClick={onBack} className="flex items-center gap-1" style={{ ...eyebrow, color: T.ink2 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>‹</span> Back
        </button>
        <button onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          style={{ ...eyebrow, color: editing ? T.hiviz : T.ink2,
                   fontWeight: editing ? 700 : 600, minHeight: 30, padding: "0 2px" }}>
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <div className="px-2.5 pt-2.5">
        <div className="flex items-start gap-2.5">
          <Avatar label={who} kind={thread.kind} dim={!thread.named} size={44} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...eyebrow, fontSize: 9, marginBottom: 1 }}>Customer</div>
            <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
              {editing ? (
                <input defaultValue={who} placeholder="Customer name"
                  onBlur={(e) => setName(e.target.value.trim() || who)}
                  className="flex-1 min-w-0"
                  style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, height: 30,
                           background: T.card, border: `1px solid ${T.hiviz}`, borderRadius: 3,
                           padding: "0 6px", outline: "none" }} />
              ) : (
                <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.06, ...clip }}>{who}</div>
              )}
              <span className="shrink-0"><Badge s={thread.status} /></span>
            </div>
            {lifetime > 0 && (
              <div style={{ ...eyebrow, fontSize: 9, marginTop: 2 }}>{moneyK(lifetime)} lifetime</div>
            )}
          </div>
        </div>

        <div className="flex gap-1.5 mt-2.5">
          <Action label="Call" primary />
          <Action label="Text" />
          <Action label="Scope" onClick={() => onScope(thread)} />
          <Action label="Ask" onClick={() => onAbout(thread)} />
        </div>
      </div>

      {/* contact block */}
      <PeopleBlock people={people} setPeople={setPeople} mark={inbound ? inbound.from : null} />

      <div className="mx-2.5 mt-2 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="px-3 py-2">
          <div style={{ ...eyebrow, marginBottom: 2 }}>
            {locations.length > 1 ? `${locations.length} locations` : "Location"}
          </div>
          {locations.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3 }}>No address yet</div>}
          {locations.map((g) => (
            <div key={g.addr} style={{ marginTop: 1 }}>
              <div className="flex items-baseline gap-1.5" style={{ fontSize: F.sm, lineHeight: 1.5 }}>
                <span className="shrink-0" style={{ color: T.chalk }}>◆</span>
                {editing ? (
                  <input defaultValue={g.addr}
                    onBlur={(e) => setAddr(g, e.target.value)}
                    className="flex-1 min-w-0"
                    style={{ fontSize: F.sm, height: 28, background: T.card,
                             border: `1px solid ${T.hiviz}`, borderRadius: 3,
                             padding: "0 6px", outline: "none" }} />
                ) : (
                  <span style={{ ...clip }}>{g.addr}</span>
                )}
              </div>
              <div style={{ fontSize: F.xs, color: T.ink3, paddingLeft: 15, ...clip }}>
                {g.jobs.map((j) => j.title).join(" · ")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* money */}
      {money.invoiced > 0 && (
        <div className="mx-2.5 mt-2 rounded grid grid-cols-3" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          {[["Invoiced", money.invoiced, T.ink], ["Paid", money.paid, M.inDark],
            ["Outstanding", money.outstanding, money.outstanding > 0 ? T.hiviz : T.ink3]].map(([k, v, c], i) => (
            <div key={k} className="px-2.5 py-2" style={{ borderLeft: i ? `1px solid ${T.hairSoft}` : "none", minWidth: 0 }}>
              <div style={{ ...eyebrow, fontSize: 9 }}>{k}</div>
              <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: c, ...nums }}>{moneyK(v)}</div>
            </div>
          ))}
        </div>
      )}

      {/* tabs */}
      <div className="flex mt-2.5 px-2.5" style={{ gap: 2 }}>
        {[["activity", "Activity"], ["jobs", `Jobs (${jobs.length})`], ["notes", "About them"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="flex-1"
            style={{ height: 34, background: tab === k ? T.card : "transparent",
                     borderBottom: tab === k ? `2px solid ${T.hiviz}` : `1px solid ${T.hair}`,
                     fontFamily: disp, fontSize: F.sm, fontWeight: 600, textTransform: "uppercase",
                     color: tab === k ? T.ink : T.ink3 }}>{l}</button>
        ))}
      </div>

      {tab === "activity" && (
        <>
          {/* Email is a channel, not a section — so it is a filter here, not
              a page of its own. All is the summary; pick one and you are
              reading that conversation on its own. */}
          <div className="mx-2.5 mt-1.5 flex gap-1 overflow-x-auto">
            {[["all", "All"], ["email", "Email"], ["sms", "Text"], ["call", "Calls"], ["note", "Notes"]].map(([k, l]) => {
              const n = k === "all" ? acts.length : acts.filter((a) => a.ch === k).length;
              const on = chan === k;
              return (
                <button key={k} onClick={() => setChan(k)} disabled={!n}
                  className="shrink-0 rounded px-2.5"
                  style={{ height: 28, background: on ? T.ink : T.card,
                           color: on ? "#fff" : (n ? T.ink2 : T.ink3),
                           border: `1px solid ${on ? T.ink : T.hair}`,
                           fontFamily: disp, fontSize: F.xs, textTransform: "uppercase",
                           opacity: n ? 1 : .45 }}>
                  {l}{n > 0 && k !== "all" ? ` · ${n}` : ""}
                </button>
              );
            })}
          </div>
          <div className="mx-2.5 mt-1.5 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
            <ActivityFeed items={chan === "all" ? acts : acts.filter((a) => a.ch === chan)}
              onItem={(a) => onOpenDusty && onOpenDusty({
                label: who, threadId: thread.id,
                channel: a.ch && a.ch !== "call" ? a.ch : "note" })} />
          </div>
          {chan !== "all" && chan !== "call" && (
            <button onClick={() => onOpenDusty && onOpenDusty({ label: who, threadId: thread.id, channel: chan })}
              className="mx-2.5 mt-2 rounded"
              style={{ display: "block", width: "calc(100% - 20px)", height: 40,
                       border: `1px dashed ${T.chalk}`, color: T.chalk, background: T.card,
                       fontFamily: disp, fontSize: F.md, textTransform: "uppercase" }}>
              Pick up this {chan === "email" ? "email" : "text"} in Dusty
            </button>
          )}
        </>
      )}

      {tab === "jobs" && (
        <div className="mx-2.5 mt-1.5 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          {jobs.length === 0 && (
            <div className="px-3 py-6 text-center" style={{ fontSize: F.sm, color: T.ink3 }}>No jobs yet.</div>
          )}
          {jobs.map((j, i) => (
            <button key={j.id} onClick={() => onScope(thread)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2.5"
              style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{j.title}</div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{j.addr} · {j.days} days</div>
              </div>
              <div className="text-right shrink-0">
                <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, ...nums }}>{moneyK(j.value)}</div>
                <Badge s={j.status} />
              </div>
            </button>
          ))}
        </div>
      )}

      {tab === "notes" && (
        <div className="mx-2.5 mt-1.5 rounded overflow-hidden" style={{ background: "#FDF6E3", border: `1px solid #E6D2A0` }}>
          <div className="px-3 py-2" style={{ fontSize: F.xs, color: "#8A6100", lineHeight: 1.45 }}>
            Internal. Sits on their record and is never sent to them.
          </div>
          {(thread.internal || []).map((n, i) => (
            <div key={i} className="px-3 py-2" style={{ borderTop: `1px solid #E6D2A0` }}>
              <div style={{ ...eyebrow, fontSize: 9, color: "#8A6100" }}>{n.who === "you" ? "You" : "Dusty"} · {n.at}</div>
              <div style={{ fontSize: F.sm, lineHeight: 1.5 }}>{n.text}</div>
            </div>
          ))}
          <button onClick={() => onAbout(thread)} className="w-full px-3 py-2.5 flex items-center justify-center gap-1.5"
            style={{ borderTop: `1px solid #E6D2A0`, color: "#8A4200", fontFamily: disp,
                     fontSize: F.sm, textTransform: "uppercase" }}>
            <Emblem size={13} /> Add a note
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- the list ---- */
function CustomersScreen({ onOpen, onBack }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("customers");
  const people = THREADS.filter((t) => !t.unsorted &&
    (kind === "customers" ? t.kind === "lead" : t.kind === "vendor" || t.kind === "sub"));
  const term = q.trim().toLowerCase();
  const shown = term
    ? people.filter((t) => [t.name, t.phone, t.aiGuess, t.type].some((v) => (v || "").toLowerCase().includes(term)))
    : people;

  return (
    <div className="pb-4">
      <div className="px-2.5 pt-2.5">
        <button onClick={onBack} className="flex items-center gap-1 mb-1.5" style={{ ...eyebrow, color: T.ink2 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>‹</span> More
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, number or job type"
          className="w-full px-2.5 rounded outline-none"
          style={{ border: `1px solid ${T.hair}`, background: T.card, height: 36, fontSize: F.sm }} />
      </div>

      <div className="flex gap-1 px-2.5 pt-2 pb-1.5">
        {[["customers", "Customers"], ["vendors", "Vendors & subs"]].map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className="px-2.5 rounded"
            style={{ height: 30, border: `1px solid ${kind === k ? T.ink : T.hair}`,
                     background: kind === k ? T.ink : T.card, color: kind === k ? "#fff" : T.ink2,
                     fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>{l}</button>
        ))}
      </div>

      <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
        {shown.map((t, i) => {
          const jobs = CUST_JOBS[t.id] || [];
          const lifetime = jobs.filter((j) => j.status === "won" || j.status === "progress")
            .reduce((n, j) => n + j.value, 0);
          return (
            <button key={t.id} onClick={() => onOpen(t)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2.5"
              style={{ background: T.card, borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
              <Avatar label={t.named ? t.name : t.phone} kind={t.kind} dim={!t.named} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>
                  {t.named ? t.name : t.phone}
                </div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
                  {jobs.length ? `${jobs.length} job${jobs.length > 1 ? "s" : ""}` : "No jobs"} · {t.type}
                </div>
              </div>
              <div className="text-right shrink-0">
                {lifetime > 0 && (
                  <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, ...nums }}>{moneyK(lifetime)}</div>
                )}
                <Badge s={t.status} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/* ============================================================ THE STREAM
   One mark, one voice. The emblem in the header is the only animated
   thing; this bar is what it SAYS. It is always present, it never
   changes height, and it never pushes the page around — so it cannot
   interrupt you. It only changes what it is saying.

   Two living states, both in motion, deliberately different in feel:
     DREAMING — slow green pulse. Idle, but consolidating. Organic.
     WORKING  — counter-rotation. Real inbound work. Mechanical.

   Dreaming lines are drawn FROM THE DATA, never generic. A fortune
   cookie gets ignored inside a week; an observation about Gulfline
   does not. Dim and grey when dreaming, bright when working — the
   change in character does the signalling, not movement.
============================================================ */
const PROC_EVENTS = [
  { id: "p1", kind: "call_in",  who: "Dale Hawkins",    detail: "reading voicemail",          filed: "filed to Hawkins driveway" },
  { id: "p2", kind: "msg_in",   who: "225-481-3302",    detail: "new text thread",             filed: "saved to unsorted — no match" },
  { id: "p3", kind: "email_in", who: "Gulfline Paving", detail: "reading email + attachments", filed: "filed to Old Hammond lot" },
  { id: "p4", kind: "call_in",  who: "Marisol Vega",    detail: "reading voicemail",           filed: "updated — shop slab · 40×60" },
  { id: "p5", kind: "msg_in",   who: "T. Boudreaux",    detail: "reading text thread",         filed: "no new information extracted" },
];
const PROC_GLYPHS = { call_in: "◉", msg_in: "◈", email_in: "✉" };

/* Dreaming. Dusty thinking out loud about work that already exists.
   Three flavours, all true statements about the book of business:
   a standing figure, a memory, or an observation about the quiet. */
const DREAM_LINES = [
  "3 quotes out · 41,180 waiting on somebody else",
  "Gulfline deposit cleared Tuesday · 8,530",
  "Dale has opened 26-368 four times and not called",
  "turning over the Old Hammond numbers again",
  "quiet. suspiciously quiet.",
  "nothing needs you right now",
  "ready mix is up 4 percent since May · 155 to 161",
  "two drafts have been sitting a week",
  "Boudreaux invoice goes past due Saturday",
  "thinking about how much of June was demo work",
];

/* Both shapes, so they can be judged side by side rather than described.
   "inset"  — starts at the emblem, runs to the right edge. Fixed width, still.
   "pill"   — starts at the emblem, ends where the words end. More like an
              utterance, but the right edge moves as content cycles. */
function StreamBar({ event, dream, variant = "inset", onOpen }) {
  const working = !!event;
  const filing = working && event.filing;
  const glyph = working ? (PROC_GLYPHS[event.kind] || "◈") : null;
  const isPill = variant === "pill";

  return (
    <div className="sc-glass" style={{ height: 30, paddingLeft: 10, paddingBottom: 4,
                  display: "flex", alignItems: "flex-start",
                  pointerEvents: "none" }}>
      <button onClick={onOpen} aria-label={working ? "Activity — working" : "Activity"}
        className="flex items-center gap-2 text-left sc-stream"
        style={{ pointerEvents: "auto",
                 height: 26,
                 /* tethered to the emblem: the words trail out from under it */
                 marginLeft: 2,
                 paddingLeft: 8, paddingRight: isPill ? 12 : 14,
                 flex: isPill ? "0 1 auto" : "1 1 auto",
                 marginRight: isPill ? 0 : 10,
                 minWidth: 0, maxWidth: "100%",
                 borderRadius: isPill ? 13 : 4,
                 background: working ? "rgba(20,24,28,.92)" : "rgba(20,24,28,.58)",
                 backdropFilter: "blur(12px)",
                 border: `1px solid ${working ? T.darkHair : "rgba(255,255,255,.10)"}`,
                 boxShadow: working ? "0 6px 18px rgba(10,14,18,.28)" : "none" }}>

        {/* DREAMING: the green core alone, breathing. No rotation — rotation
            is reserved for real work, so the two never read the same. */}
        {!working && (
          <span className="sc-dream-dot shrink-0"
            style={{ width: 6, height: 6, borderRadius: 3, background: T.pulse }} />
        )}

        {working && (
          <span style={{ color: T.pulse, fontSize: F.xs, fontFamily: disp,
                         letterSpacing: ".08em", flexShrink: 0 }}>{glyph}</span>
        )}

        {working && (
          <span style={{ color: "#fff", fontSize: F.xs, fontWeight: 600,
                         whiteSpace: "nowrap", flexShrink: 0 }}>{event.who}</span>
        )}

        {/* keyed on content so each new line fades in rather than snapping */}
        <span key={working ? `${event.id}${filing ? "f" : ""}` : dream}
              className="sc-stream-text"
              style={{ fontSize: F.xs, minWidth: 0,
                       overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                       fontFamily: body,
                       fontStyle: working ? "normal" : "italic",
                       color: filing ? T.pulse : working ? T.ink3 : "rgba(255,255,255,.46)" }}>
          {working ? `· ${filing ? event.filed : event.detail}` : dream}
        </span>

        {filing && (
          <span style={{ color: T.pulse, fontSize: F.xs, fontFamily: disp,
                         letterSpacing: ".06em", whiteSpace: "nowrap", flexShrink: 0 }}>✓</span>
        )}
      </button>
    </div>
  );
}

/* ============================================================ ALERTS
   One row, sitting on the footer. Every entry is a CONDITION computed
   from the data — not a message Dusty decided to send — and every one
   names a specific customer or job, because "3 things need attention"
   is not something you can act on.

   Tapping opens Dusty already holding that customer. The row is the
   doorway into a conversation, not the conversation.
============================================================ */
function buildAsks() {
  /* Dusty's own open questions — not a mirror of the inbox. A customer
     waiting on you is a condition and belongs on Threads, where the Needs
     you chip already counts it. What lands here is only what Dusty cannot
     decide alone, so the number stays small enough to clear. */
  const out = [];

  THREADS.filter((t) => t.draft).forEach((t) => {
    const who = t.named ? t.name : (t.aiGuess || t.phone);
    out.push({
      id: `d${t.id}`, threadId: t.id, tone: T.chalk,
      text: `Send the ${t.draft.channel === "email" ? "email" : "text"} to ${who.split(" ")[0]}?`,
      detail: t.draft.body,
    });
  });

  const unsorted = THREADS.filter((t) => t.unsorted);
  if (unsorted.length) {
    out.push({
      id: "unsorted", tone: T.hiviz, unsorted: true,
      text: unsorted.length === 1 ? "Who is this message from?" : `Who are these ${unsorted.length} messages from?`,
      detail: unsorted.map((t) => t.phone).join(" · "),
    });
  }

  return out;
}

/* ============================================================ NAV
   Footer: four destinations plus Dusty, who sits dead center because
   he is the thing you reach for most and the thumb lands there.
   Everything else lives one tap deeper behind More.
============================================================ */
const MORE_TABS = ["jobs", "schedule", "customers", "vendors", "logs", "money", "docs", "customer"];

const MORE_GROUPS = [
  {
    head: "Work",
    rows: [
      { k: "jobs", label: "Jobs", sub: "The spine — every section, cost and receipt" },
      { k: "schedule", label: "Schedule", sub: "Mentioned, tentative, committed" },
      { k: "logs", label: "Daily logs", sub: "Photos, updates, and the workday record" },
      { k: "docs", label: "Documents", sub: "Quotes, invoices and expenses" },
    ],
  },
  {
    head: "People",
    rows: [
      { k: "customers", label: "Customers", sub: "Keyed by phone, with their whole history" },
      { k: "vendors", label: "Vendors & subs", sub: "Who you buy from, who you hand work to" },
    ],
  },
  {
    head: "Money",
    rows: [
      { k: "money", label: "Receipts & invoices", sub: "Quoted vs actual, kept live" },
      { k: "pipeline", label: "Pipeline", sub: "The full board — health, activity, margin" },
    ],
  },
];

function MoreScreen({ onGo, onPipeline, streamVariant, setStreamVariant }) {
  return (
    <div className="pb-4">
      {/* TEMPORARY — here so both stream shapes can be judged live rather
          than described. Delete once the shape is chosen. */}
      <div className="px-3 pt-3 pb-1" style={{ ...eyebrow, color: T.ink2 }}>Stream shape</div>
      <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
        <div className="flex">
          {[["inset", "Inset", "runs to the right edge"],
            ["pill", "Pill", "ends where the words end"]].map(([k, label, sub], i) => (
            <button key={k} onClick={() => setStreamVariant(k)}
              className="flex-1 px-3 py-2.5 text-left"
              style={{ borderLeft: i === 0 ? "none" : `1px solid ${T.hairSoft}`,
                       background: streamVariant === k ? T.hairSoft : T.card }}>
              <div style={{ fontSize: F.sm, fontWeight: 600,
                            color: streamVariant === k ? T.ink : T.ink2 }}>{label}</div>
              <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.3 }}>{sub}</div>
            </button>
          ))}
        </div>
      </div>

      {MORE_GROUPS.map((g) => (
        <div key={g.head}>
          <div className="px-3 pt-3 pb-1" style={{ ...eyebrow, color: T.ink2 }}>{g.head}</div>
          <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
            {g.rows.map((r, i) => (
              <button key={r.k} onClick={() => (r.k === "pipeline" ? onPipeline() : onGo(r.k))}
                className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2"
                style={{ background: T.card, borderTop: i === 0 ? "none" : `1px solid ${T.hairSoft}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{r.label}</div>
                  <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{r.sub}</div>
                </div>
                <span style={{ color: T.ink3, flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="px-3 pt-3" style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5 }}>
        Settings and your account stay in the header — same place on every page.
      </div>
    </div>
  );
}

const NavIcon = ({ k, on }) => {
  const c = on ? T.ink : T.ink3;
  const p = { fill: "none", stroke: c, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  const box = { width: 19, height: 19, viewBox: "0 0 19 19" };
  if (k === "threads") return <svg {...box}><path {...p} d="M2.6 4.4h13.8v8.4H8.9l-4 3v-3H2.6z" /></svg>;
  if (k === "jobs") return <svg {...box}><path {...p} d="M2.6 6.5 9.5 3.2l6.9 3.3-6.9 3.3z" /><path {...p} d="M2.6 10.6l6.9 3.3 6.9-3.3" /></svg>;
  /* scope — a slab with its dimension called out */
  if (k === "scope") return (
    <svg {...box}>
      <rect {...p} x="2.4" y="5.4" width="14.2" height="8.2" rx="1" />
      <path {...p} d="M2.4 3.1h14.2M3.6 2.1v2M15.4 2.1v2" />
    </svg>
  );
  if (k === "cash") return <svg {...box}><rect {...p} x="2.4" y="5.1" width="14.2" height="8.8" rx="1.2" /><circle {...p} cx="9.5" cy="9.5" r="2.3" /></svg>;
  if (k === "more") return (
    <svg {...box}>
      {[4.6, 9.5, 14.4].map((x) => <circle key={x} cx={x} cy="9.5" r="1.35" fill={c} />)}
    </svg>
  );
  return null;
};

/* ============================================================ SHEETS */
function OverheadSheet({ open, onClose, items, setItems, nut }) {
  if (!open) return null;
  const toggle = (id) => setItems(items.map((o) => (o.id === id ? { ...o, active: !o.active } : o)));
  const CAT = { fixed: T.chalk, equipment: T.hiviz, insurance: T.violet, variable: T.ink3 };
  return (
    <Drawer open={open} onClose={onClose} title="Monthly overhead"
      sub="Fixed costs · where the floor comes from"
      right={<span style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, color: T.hiviz, ...nums, lineHeight: 1 }}>{money0(nut)}</span>}>
        <div className="px-4 py-1">
          {items.map((o) => (
            <div key={o.id} className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <button onClick={() => toggle(o.id)} className="rounded-full shrink-0 relative"
                style={{ width: 34, height: 20, background: o.active ? T.ink : "#C6CCD3", transition: "background .15s" }}>
                <span className="absolute rounded-full" style={{ width: 16, height: 16, background: "#fff", top: 2, left: o.active ? 16 : 2, transition: "left .15s" }} />
              </button>
              <span style={{ width: 3, height: 22, background: CAT[o.category] || T.ink3, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: F.sm, color: o.active ? T.ink : T.ink3 }}>{o.label}</div>
                <div style={{ ...eyebrow, fontSize: 9 }}>
                  {o.cadence}{o.cadence === "monthly" ? ` · day ${o.due_day}` : ` · ${MON[(o.due_month || 1) - 1]} ${o.due_day}`}
                </div>
              </div>
              <div style={{ fontFamily: disp, fontSize: F.md, color: o.active ? T.ink : T.ink3, ...nums }}>{money0(o.amount)}</div>
            </div>
          ))}
          <button className="w-full rounded-lg mt-3" style={{ height: 40, border: `1px dashed ${T.hair}`, color: T.ink2, fontSize: F.sm }}>
            + Add a fixed cost
          </button>
        </div>
        <div className="px-4 py-3" style={{ background: T.hairSoft, marginTop: 8 }}>
          <div className="flex items-baseline justify-between">
            <div style={{ fontSize: F.sm }}>Your draw · day {COMP.draw_day}</div>
            <div style={{ fontFamily: disp, fontSize: F.lg, ...nums }}>{money0(COMP.monthly_draw)}</div>
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <div style={{ fontSize: F.sm }}>Off the top · entity 5 · estimator 3 · tax 3</div>
            <div style={{ fontFamily: disp, fontSize: F.lg, ...nums }}>{OFF_TOP_PCT}%</div>
          </div>
        </div>
    </Drawer>
  );
}

/* the four footer destinations — Dusty is a conversation, not a landing */
const HOME_TABS = [["threads", "Threads"], ["scope", "Scope"], ["cash", "Cash"], ["more", "More"]];

function SettingsSheet({ open, onClose, onFixedCosts, onAccount, home, setHome }) {
  const groups = [
    {
      head: "The business",
      rows: [
        { label: "Fixed costs & overhead", sub: "What the business burns every month", go: onFixedCosts },
        { label: "Pay yourself", sub: "Fixed draw or share of profit" },
        { label: "Rates & markup", sub: "Per-sqft labor, materials, per-cost-type margin" },
      ],
    },
    {
      head: "How it goes out",
      rows: [
        { label: "Company & letterhead", sub: "Name, address, quote appearance" },
        { label: "Phone & messaging", sub: "Numbers, forwarding, recording notice" },
      ],
    },
    {
      head: "Account",
      rows: [
        { label: "Profile and contact", sub: USER.email, go: onAccount },
        { label: "Team and seats", sub: "Who's on the org, what they can see", go: onAccount },
        { label: "Billing and plan", sub: "Subscription and invoices", go: onAccount },
        { label: "Notifications", sub: "What reaches your phone", go: onAccount },
      ],
    },
  ];

  /* one running index so the stagger carries across the groups */
  let n = 0;

  return (
    <Drawer open={open} onClose={onClose} title="Menu" hideClose below>
      {/* the account moved in here — it was a second avatar in the header,
          which is one control too many on a phone */}
      <button onClick={onAccount} className="sc-menu-item w-full text-left px-4 py-3 flex items-center gap-3"
        style={{ borderBottom: `1px solid ${T.hair}`, animationDelay: "60ms" }}>
        <Avatar label={USER.name} size={42} />
        <span className="min-w-0 flex-1">
          <span style={{ display: "block", fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...clip }}>{USER.name}</span>
          <span style={{ display: "block", fontSize: F.xs, color: T.ink3, ...clip }}>
            {USER.org} · {USER.role}
          </span>
        </span>
        <span style={{ color: T.ink3 }}>›</span>
      </button>

      {/* Where the app lands when you open it. Yours is Threads today, but
          in pour season the schedule is the first thing you want, so this
          is a setting rather than a decision made for you. */}
      <div className="sc-menu-item" style={{ animationDelay: "80ms" }}>
        <div className="px-4 pt-3 pb-1" style={{ ...eyebrow, color: T.ink2 }}>This app</div>
        <div className="px-4 pb-3" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <div style={{ fontSize: F.sm, fontWeight: 600 }}>Opens on</div>
          <div className="flex gap-1.5 mt-1.5">
            {HOME_TABS.map(([k, l]) => (
              <button key={k} onClick={() => setHome && setHome(k)}
                aria-pressed={home === k}
                className="flex-1 rounded"
                style={{ height: 32, background: home === k ? T.ink : T.card,
                         color: home === k ? "#fff" : T.ink2,
                         border: `1px solid ${home === k ? T.ink : T.hair}`,
                         fontFamily: disp, fontSize: F.xs, textTransform: "uppercase" }}>{l}</button>
            ))}
          </div>
          <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>
            Takes effect next time you open the app
          </div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.head}>
          <div className="px-4 pt-3 pb-1 sc-menu-item"
            style={{ ...eyebrow, color: T.ink2, animationDelay: `${100 + (n++) * 40}ms` }}>{g.head}</div>
          {g.rows.map((r) => (
            <button key={r.label} onClick={r.go}
              className="sc-menu-item w-full text-left px-4 py-3 flex items-center justify-between gap-2"
              style={{ borderBottom: `1px solid ${T.hairSoft}`, animationDelay: `${100 + (n++) * 40}ms` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: F.sm, fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: F.xs, color: T.ink2, ...clip }}>{r.sub}</div>
              </div>
              <span style={{ color: T.ink3, flexShrink: 0 }}>›</span>
            </button>
          ))}
        </div>
      ))}

      <div className="px-4 pt-4 sc-menu-item" style={{ animationDelay: `${100 + n * 40}ms` }}>
        <button className="w-full rounded-lg"
          style={{ padding: "11px 0", border: `1px solid ${T.hair}`, color: T.red, fontFamily: disp,
                   fontSize: F.md, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
          Sign out
        </button>
      </div>
    </Drawer>
  );
}

/* ============================================================ MAIN */
const USER = { name: "Coy Sacco", org: "Sacco Builders", email: "admin@saccobuilt.com", role: "Owner" };

const SEARCH_HINT = {
  threads: "Search name, number, or what it's about",
  jobs: "Search jobs", cash: "Search payments and draws", docs: "Search documents",
  more: "Search everything", schedule: "Search the schedule", scope: "Search sections and scopes",
  customers: "Search customers", vendors: "Search vendors and subs",
  logs: "Search daily logs", money: "Search receipts and invoices",
};

/* ============================================================ THREADS
   Ported back from v8 unchanged in behaviour: AI-named rows, tap to
   expand into the summary + extracted chips + Open / Call / Scope.
   Threads is a high-level list of ALL conversations — leads, subs,
   vendors — not just leads.
============================================================ */
const STATUS = {
  new:       { label: "New",       bg: T.chalkDim,  fg: T.chalk },
  contacted: { label: "Contacted", bg: T.violetDim, fg: T.violet },
  qualified: { label: "Qualified", bg: "#FDF6E3",   fg: "#8A6100" },
  quoted:    { label: "Quoted",    bg: T.hivizDim,  fg: "#C24A00" },
  won:       { label: "Won",       bg: T.greenDim,  fg: T.green },
  progress:  { label: "Pouring",   bg: "#E6F5ED",   fg: "#0E6F63" },
  lost:      { label: "Lost",      bg: "#EFF1F3",   fg: T.ink2 },
};

/* c = bubble color. Only the buckets that want acting on are warm; the
   stage filters stay cool so orange keeps meaning "this is on you".
   Ordered by how often you reach for them, not by the funnel. */
const FILTERS = [
  { k: "today", l: "Today", c: T.ink },
  { k: "needs", l: "Needs you", c: T.hiviz },
  { k: "unsorted", l: "Unsorted", c: T.hiviz },
  /* the outbox. a draft is something you owe someone, so it stays warm. */
  { k: "drafts", l: "Drafts", c: T.chalk },
  { k: "unscoped", l: "Unscoped", c: T.chalk },
  { k: "quoted", l: "Quoted", c: T.violet },
  { k: "progress", l: "Pouring", c: "#0E6F63" },
  { k: "won", l: "Won", c: null },
  { k: "lost", l: "Lost", c: null },
  { k: "vendors", l: "Vendors", c: null },
  { k: "all", l: "All", c: null },
];

/* "today" is anything that moved in the last few hours — the mock carries
   relative stamps, so this reads them rather than pretending to parse dates */
const isToday = (t) => /^(\d+m|\d+h|\d{1,2}:\d{2}[ap])$/.test(t.last);

const THREADS = [
  {
    id: 1, kind: "lead", name: "Robin Plunket", named: true, phone: "(225) 555-0142",
    email: "rplunket@gmail.com", addr: "1142 Sherwood Dr, Baton Rouge, LA 70815",
    type: "Patio", status: "qualified", value: 3900,
    unread: 0, needsReply: false, last: "9:12a", scoped: true,
    /* Mock only. Real shape lives in messages(status='draft') — see
       migration 007. Cleared by approving it in Dusty. */
    draft: { channel: "email", at: "8m", body: "Robin — confirming the 20th works. Deposit link below." },
    aiTitle: "12×20 back patio, broom finish",
    aiSummary: "Wants it poured before the 20th. No demo — grass now. Measured Thursday, confirmed 240 sq ft.",
    internal: [
      { who: "you", at: "Thu 4:02p", text: "she's ready to go, don't overthink the price" },
      { who: "dusty", at: "Thu 4:02p", text: "Noted. At 240 sq ft you are in the $8–15 band, and your last two patios went out at $16.20 and $15.40 a foot. Holding 15% markup puts this at $3,878." },
    ],
    events: [
      { id: "a", extracted: [["Dimensions", "12 × 20 ft"], ["Existing slab", "None"], ["Finish", "Broom"], ["Deadline", "The 20th"]] },
      { id: "d", extracted: [["Confirmed", "240 sq ft"], ["Depth", '4"'], ["Reinforcement", "Wire mesh"]] },
    ],
  },
  {
    id: 2, kind: "lead", name: "Dale Hawkins", named: true, phone: "(225) 555-0198",
    email: "dhawkins@gmail.com", addr: "88 Perkins Rd, Baton Rouge, LA 70808",
    type: "Driveway", status: "quoted", value: 7500,
    unread: 2, needsReply: true, last: "34m", scoped: true,
    draft: { channel: "email", at: "22m", body: "Dale — the 4 in slab holds the numbers. Happy to walk the timeline." },
    aiTitle: "Driveway quote — asking to add apron",
    aiSummary: "Reviewing the quote you sent. Wife wants the apron added and they're asking how many days the whole job takes. Two texts unanswered.",
    internal: [
      { who: "you", at: "Aug 9, 8:01a", text: "he's shopping this against somebody. what can I give up" },
      { who: "dusty", at: "Aug 9, 8:02a", text: "Your floor on this one is $6,510 — that is hard cost plus the job's share of the monthly nut, over 0.89. You sent $7,465. You have about $955 before you are working for free." },
      { who: "you", at: "Aug 9, 8:05a", text: "took it to 13.9" },
    ],
    events: [],
  },
  {
    id: 3, kind: "lead", name: "Marisol Vega", named: true, phone: "(225) 555-0177",
    email: "", addr: "410 Government St, Baton Rouge, LA 70802",
    type: "Slab", status: "new", value: 12100,
    unread: 1, needsReply: true, last: "2h", scoped: false,
    aiTitle: "30×40 shop slab — never called back",
    aiSummary: "Left a voicemail this morning asking for a slab for a shop building. No contact since. Biggest unscoped job in the list.",
    internal: [
      { who: "you", at: "Today 10:20a", text: "30x40 shop — is that commercial rules" },
      { who: "dusty", at: "Today 10:20a", text: "1,200 sq ft puts it in your $6–10 band, and a shop slab usually wants a thickened edge and 5,000 PSI. I have not priced it — you have no depth from her yet." },
    ],
    events: [{ id: "a", extracted: [["Dimensions", "30 × 40 ft"], ["Use", "Shop building"]] }],
  },
  {
    id: 5, kind: "lead", name: "", named: false, aiGuess: "Cameron", phone: "(985) 570-4968",
    type: "Sidewalk", status: "new", value: 2400,
    unread: 1, needsReply: true, last: "3h", scoped: false,
    aiTitle: "Sidewalk replacement, ~60 ft",
    aiSummary: "Called about replacing a cracked front walk, roughly sixty feet. Didn't give a name or address — worth a callback to pin down.",
    events: [{ id: "a", extracted: [["Length", "60 ft"], ["Width", "4 ft"], ["Condition", "Cracked, tree roots"]] }],
  },
  {
    id: 4, kind: "lead", name: "T. Boudreaux", named: true, phone: "(225) 555-0163",
    email: "tboudreaux@outlook.com", addr: "77 Highland Rd, Baton Rouge, LA 70808",
    type: "Foundation", status: "contacted", value: 24200,
    unread: 0, needsReply: false, last: "Yest", scoped: false,
    aiTitle: "Addition foundation — plans received",
    aiSummary: "Emailed an engineer's plan set for a room addition. Waiting on you to review and say what else you need.",
    events: [],
  },
  {
    /* the commercial case. party 'company' means the record you bill is not
       a person, so the addresses live on the people below it rather than
       on the customer itself. Mirrors customers.kind in migration 008. */
    id: 8, kind: "lead", party: "company", name: "Gulfline Paving", named: true, phone: "(225) 555-0155",
    email: "ap@gulflinepaving.com", addr: "10423 Old Hammond Hwy, Baton Rouge, LA 70816",
    type: "Slab", status: "progress", value: 34120,
    unread: 0, needsReply: false, last: "11:04a", scoped: true,
    aiTitle: "Old Hammond lot — pouring now",
    aiSummary: "Approved in May, crew is on it. Progress draw of $13,648 goes out on the 28th.",
    events: [],
  },
  {
    id: 9, kind: "lead", name: "Watkins", named: true, phone: "(225) 555-0121",
    email: "", addr: "3320 Lanier Dr, Baton Rouge, LA 70816",
    type: "Driveway", status: "won", value: 7200,
    unread: 0, needsReply: false, last: "Jul 30", scoped: true,
    aiTitle: "Driveway repair — done and collected",
    aiSummary: "Poured in July, paid in full. Actual costs still not filed against it.",
    events: [],
  },
  {
    id: 10, kind: "lead", name: "Nguyen", named: true, phone: "(225) 555-0190",
    email: "", addr: "", type: "Patio", status: "lost", value: 5200,
    unread: 0, needsReply: false, last: "Aug 4", scoped: true,
    aiTitle: "Went with somebody cheaper",
    aiSummary: "Said another outfit came in about a thousand under. No hard feelings, worth a call in spring.",
    events: [],
  },
  {
    id: 11, kind: "unknown", name: "", named: false, phone: "(225) 555-0288",
    type: "Other", status: "new", value: 0,
    unread: 1, needsReply: true, last: "41m", scoped: false, unsorted: true,
    aiTitle: "“yeah that works”",
    aiSummary: "Two words with nothing in front of them. No earlier calls or texts from this number — Dusty cannot tell what it is answering.",
    events: [],
  },
  {
    id: 12, kind: "unknown", name: "", named: false, phone: "(985) 555-0413",
    type: "Other", status: "new", value: 0,
    unread: 0, needsReply: false, last: "1h", scoped: false, unsorted: true,
    aiTitle: "Missed call, no voicemail",
    aiSummary: "Rang twice this morning and left nothing. Not in your contacts and no prior history.",
    events: [],
  },
  {
    id: 13, kind: "unknown", name: "", named: false, phone: "(225) 555-0377",
    type: "Other", status: "new", value: 0,
    unread: 1, needsReply: true, last: "3h", scoped: false, unsorted: true,
    aiTitle: "“Can you still do Saturday”",
    aiSummary: "Could be a customer, could be a sub. Nothing else from this number to go on.",
    events: [],
  },
  {
    id: 6, kind: "sub", name: "Luis Alvarez", named: true, phone: "(225) 555-0111",
    type: "Other", status: "contacted", value: 0,
    unread: 0, needsReply: false, last: "Yest", scoped: false,
    aiTitle: "Not available until Monday",
    aiSummary: "Can't help until Monday. Affects any pour you were planning to schedule this week.",
    events: [],
  },
  {
    id: 7, kind: "vendor", name: "Gulf Coast Ready Mix", named: true, phone: "(225) 555-0100",
    type: "Vendor", status: "contacted", value: 0,
    unread: 0, needsReply: false, last: "Mon", scoped: false,
    aiTitle: "4000 PSI going up $6/CY on the 1st",
    aiSummary: "Price increase notice — 4000 PSI moves from $155 to $161 per yard starting the 1st. Affects every open quote you haven't sent.",
    events: [],
  },
];

const dimsFromThread = (t) => {
  for (const e of t.events || []) {
    const d = (e.extracted || []).find(([k]) => /dimension/i.test(k))?.[1];
    if (d) { const m = d.match(/(\d+)\s*×\s*(\d+)/); if (m) return [+m[1], +m[2]]; }
    const len = (e.extracted || []).find(([k]) => /length/i.test(k))?.[1];
    const wid = (e.extracted || []).find(([k]) => /width/i.test(k))?.[1];
    if (len && wid) return [parseInt(len, 10), parseInt(wid, 10)];
  }
  return null;
};

const Badge = ({ s, map = STATUS }) => {
  const v = map[s] || Object.values(map)[0];
  return <span style={{ background: v.bg, color: v.fg, fontFamily: disp, fontSize: F.micro, fontWeight: 600,
    letterSpacing: ".1em", textTransform: "uppercase", padding: "3px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>{v.label}</span>;
};

const AVATAR_COLORS = ["#1B5FD9", "#6B4BD6", "#0F8A4F", "#C24A00", "#8A6100", "#0E7C86"];
const Avatar = ({ label, kind, dim, size = 34 }) => {
  const ch = (label || "?").trim().charAt(0).toUpperCase();
  const idx = (label || "?").charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <span className="shrink-0 rounded-full flex items-center justify-center"
      style={{ width: size, height: size, background: dim ? T.hair : AVATAR_COLORS[idx],
               color: dim ? T.ink3 : "#fff", fontFamily: disp, fontSize: size * 0.44, fontWeight: 700 }}>
      {kind === "vendor" ? "▣" : kind === "sub" ? "⚒" : ch}
    </span>
  );
};

function ThreadRow({ t, expanded, onToggle, first, onScope, onAbout, onSort, onCustomer }) {
  const dims = dimsFromThread(t);
  const label = t.named ? t.name : (t.aiGuess || t.phone);
  const chips = (t.events || []).filter((e) => e.extracted).flatMap((e) => e.extracted).slice(0, 5);
  return (
    <div style={{ background: T.card, borderTop: first ? "none" : `1px solid ${T.hair}` }}>
      <div className="w-full px-2.5 py-2 flex gap-2.5 items-start">
        {/* the face opens the person, the body opens the conversation */}
        <button onClick={() => !t.unsorted && onCustomer && onCustomer(t)}
          aria-label={`Open ${label}`} className="shrink-0">
          <Avatar label={label} kind={t.kind} dim={!t.named} />
        </button>
        <button onClick={onToggle} aria-expanded={expanded}
          className="text-left" style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-baseline gap-1.5" style={{ minWidth: 0 }}>
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, lineHeight: 1.2, ...clip, color: t.named ? T.ink : T.ink2 }}>
              {t.named ? t.name : t.phone}
            </span>
            {!t.named && t.aiGuess && (
              <span className="shrink-0" style={{ fontSize: F.micro, color: T.violet, background: T.violetDim,
                borderRadius: 3, padding: "1px 4px", textTransform: "uppercase" }}>✦ {t.aiGuess}?</span>
            )}
            {t.kind === "vendor" && <span className="shrink-0" style={eyebrow}>Vendor</span>}
            {t.kind === "sub" && <span className="shrink-0" style={eyebrow}>Sub</span>}
            <span className="ml-auto shrink-0" style={{ fontSize: F.micro, color: T.ink3 }}>{t.last}</span>
          </div>
          {/* The name leads. This line is what it is about, and it reads as
              subordinate: body face instead of condensed display, one step
              down the scale, regular weight, secondary ink. */}
          <div style={{ fontFamily: body, fontSize: F.sm, fontWeight: 400, color: T.ink2, lineHeight: 1.35, ...clip }}>{t.aiTitle}</div>
          <div className="flex items-center gap-1.5 mt-1" style={{ minWidth: 0 }}>
            <Badge s={t.status} />
            {t.value > 0 && <span style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600, color: T.ink2, ...nums }}>{moneyK(t.value)}</span>}
            {t.unsorted && (
              <span style={{ fontSize: F.micro, color: T.hiviz, textTransform: "uppercase", fontFamily: disp }}>Unsorted</span>
            )}
            {t.draft && (
              <span className="rounded px-1" style={{ fontSize: F.micro, color: T.chalk, background: T.chalkDim,
                textTransform: "uppercase", fontFamily: disp }}>
                {t.draft.channel === "email" ? "Draft email" : "Draft text"}
              </span>
            )}
            {!t.scoped && t.kind === "lead" && !t.unsorted && (
              <span style={{ fontSize: F.micro, color: T.hiviz, textTransform: "uppercase", fontFamily: disp }}>Unscoped</span>
            )}
            {t.unread > 0 && (
              <span className="ml-auto shrink-0 rounded-full" style={{ minWidth: 16, height: 16, background: T.hiviz,
                color: "#fff", fontSize: F.micro, fontWeight: 700, display: "flex", alignItems: "center",
                justifyContent: "center", padding: "0 4px" }}>{t.unread}</span>
            )}
          </div>
        </button>
      </div>
      {expanded && (
        <div className="px-2.5 pb-2.5" style={{ paddingLeft: 47 }}>
          <div className="px-2.5 py-2 rounded" style={{ background: T.slab, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>{t.aiSummary}</div>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {chips.map(([k, v]) => (
                <span key={k + v} className="px-1.5 py-0.5 rounded" style={{ background: T.chalkDim, fontSize: F.xs, whiteSpace: "nowrap" }}>
                  <span style={{ color: T.chalk }}>{k}</span> <b>{v}</b>
                </span>
              ))}
            </div>
          )}


          {!t.unsorted && (
            <button onClick={() => onCustomer && onCustomer(t)}
              className="w-full mt-1.5 rounded px-2.5 py-1.5 flex items-center justify-between gap-2"
              style={{ border: `1px solid ${T.hair}`, background: "#fff" }}>
              <span style={{ fontSize: F.xs, color: T.ink2 }}>
                Everything about {(t.name || t.phone).split(" ")[0]} — jobs, money, history
              </span>
              <span style={{ color: T.ink3, flexShrink: 0 }}>›</span>
            </button>
          )}

          {/* Nothing is guessed here. When the system cannot place a message
              it says so plainly and hands it to you, rather than filing it
              somewhere wrong and quietly poisoning the counts. */}
          {t.unsorted && (
            <button onClick={() => onSort && onSort(t)}
              className="w-full mt-1.5 rounded px-2.5 py-2 flex items-center gap-2 text-left"
              style={{ background: T.hivizDim, border: `1px solid #F7C9A8` }}>
              <Emblem size={15} />
              <span className="min-w-0 flex-1">
                <span style={{ display: "block", fontSize: F.sm, fontWeight: 600, color: "#8A4200" }}>
                  Tell Dusty what this is
                </span>
                <span style={{ display: "block", fontSize: F.xs, color: T.ink2, ...clip }}>
                  Who it is, or which job it answers
                </span>
              </span>
              <span style={{ color: "#8A4200", flexShrink: 0 }}>›</span>
            </button>
          )}

          {/* Two channels on one customer. WITH them is correspondence and
              can be sent. ABOUT them is you and Dusty and never can be —
              there is deliberately no path from an internal note to a reply
              box, because eventually one would get sent. */}
          {t.kind === "lead" && !t.unsorted && (
            <button onClick={() => onAbout && onAbout(t)}
              className="w-full mt-1.5 rounded px-2 py-1.5 flex items-center gap-2 text-left"
              style={{ background: "#FDF6E3", border: `1px solid #E6D2A0` }}>
              <Emblem size={14} />
              <span className="min-w-0 flex-1">
                <span style={{ display: "block", fontSize: F.xs, color: "#8A6100", ...clip }}>
                  {t.internal && t.internal.length
                    ? `“${t.internal[t.internal.length - 1].text}”`
                    : "Nothing noted about this one yet"}
                </span>
              </span>
              <span style={{ ...eyebrow, fontSize: 9, color: "#8A6100", flexShrink: 0 }}>
                About them{t.internal ? ` · ${t.internal.length}` : ""}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================ PIPELINE
   The filter chips on the Threads page COUNT things. This panel WEIGHS
   them — dollars and speed. No number appears in both places.

   pipelineNumbers() is derived live from THREADS. Everything in PLACE
   below needs a field or a feed that does not exist yet; those render
   with a dot and the panel says so at the bottom. See the field spec
   for what each one requires before it can be real.
============================================================ */
function pipelineNumbers() {
  const open = THREADS.filter((t) => t.kind === "lead" && !t.unsorted
    && t.status !== "won" && t.status !== "lost" && t.status !== "progress");
  const scoped = open.filter((t) => t.scoped);
  const unscoped = open.filter((t) => !t.scoped);
  const quoted = open.filter((t) => t.status === "quoted");
  const sum = (a) => a.reduce((n, t) => n + (t.value || 0), 0);
  return {
    total: sum(open), scopedValue: sum(scoped), unscopedValue: sum(unscoped),
    bidsOut: quoted.length, bidsOutValue: sum(quoted),
    counts: {
      all: THREADS.length,
      today: THREADS.filter(isToday).length,
      needs: THREADS.filter((t) => t.needsReply).length,
      unsorted: THREADS.filter((t) => t.unsorted).length,
      drafts: THREADS.filter((t) => t.draft).length,
      unscoped: unscoped.length,
      quoted: quoted.length,
      progress: THREADS.filter((t) => t.status === "progress").length,
      won: THREADS.filter((t) => t.status === "won").length,
      lost: THREADS.filter((t) => t.status === "lost").length,
      vendors: THREADS.filter((t) => t.kind === "vendor" || t.kind === "sub").length,
    },
  };
}

/* Placeholders. Each needs a field, a feed, or a state that isn't built. */
const PLACE = {
  closeRate: 31, followUps: 3, daysToBid: 1.8,
  callsIn: 14, callsOut: 9, textsIn: 22, textsOut: 17, respMin: 47,
  avgJob: 9400, perSqft: 7.62, margin: 24.8, matRatio: 39,
  jobsWon: 4, totalLeads: 15, backlog: 41200,
  week: [{ d: "M", c: 3, t: 5 }, { d: "T", c: 2, t: 4 }, { d: "W", c: 4, t: 3 },
         { d: "T", c: 1, t: 6 }, { d: "F", c: 5, t: 2 }, { d: "S", c: 0, t: 1 }, { d: "S", c: 0, t: 0 }],
  funnel: [["New", 15], ["Contacted", 11], ["Qualified", 8], ["Quoted", 6], ["Won", 4]],
  byType: [["Driveway", 34], ["Slab", 26], ["Patio", 18], ["Foundation", 14], ["Sidewalk", 8]],
  revenue: [18, 22, 31, 27, 38, 34],
};

const DOT = <span style={{ color: T.hiviz, fontSize: 12, lineHeight: 0 }}> •</span>;

const Metric = ({ label, value, sub, color, place }) => (
  <div className="px-2.5 py-2" style={{ minWidth: 0 }}>
    <div style={eyebrow}>{label}{place && DOT}</div>
    <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05,
                  color: color || T.ink, ...nums, ...clip }}>{value}</div>
    {sub && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{sub}</div>}
  </div>
);

const MetricGrid = ({ items }) => (
  <div className="grid grid-cols-2" style={{ borderTop: `1px solid ${T.hair}` }}>
    {items.map((m, i) => (
      <div key={m.label} style={{ borderBottom: `1px solid ${T.hairSoft}`,
                                  borderRight: i % 2 === 0 ? `1px solid ${T.hairSoft}` : "none" }}>
        <Metric {...m} />
      </div>
    ))}
  </div>
);

const SectionHead = ({ children, note }) => (
  <div className="px-3 pt-3 pb-1 flex items-baseline justify-between gap-2">
    <div style={{ ...eyebrow, color: T.ink2 }}>{children}</div>
    {note && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{note}</div>}
  </div>
);

/* ---- small charts ---- */
const DayBars = ({ week }) => {
  const max = Math.max(...week.map((d) => Math.max(d.c, d.t)), 1);
  return (
    <div className="flex items-end gap-1" style={{ height: 62 }}>
      {week.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ minWidth: 0 }}>
          <div className="flex items-end justify-center gap-[2px] w-full" style={{ height: 46 }}>
            <span style={{ width: 6, height: Math.max(1, (d.c / max) * 46), background: T.chalk }} />
            <span style={{ width: 6, height: Math.max(1, (d.t / max) * 46), background: T.hiviz }} />
          </div>
          <span style={{ fontFamily: disp, fontSize: 9.5, color: T.ink3 }}>{d.d}</span>
        </div>
      ))}
    </div>
  );
};

const Funnel = ({ rows }) => {
  const max = rows[0][1] || 1;
  return (
    <div>
      {rows.map(([k, v], i) => (
        <div key={k} className="flex items-center gap-2 py-[3px]">
          <span style={{ width: 62, fontSize: F.xs, color: T.ink2, ...clip }}>{k}</span>
          <div className="flex-1" style={{ background: T.hairSoft, height: 13 }}>
            <div style={{ width: `${(v / max) * 100}%`, height: 13,
                          background: i === rows.length - 1 ? T.green : T.chalk,
                          opacity: i === rows.length - 1 ? 1 : 1 - i * 0.13 }} />
          </div>
          <span style={{ width: 20, textAlign: "right", fontFamily: disp, fontSize: F.sm, ...nums }}>{v}</span>
        </div>
      ))}
    </div>
  );
};

const DONUT_COLORS = [T.chalk, T.hiviz, T.violet, T.green, T.ink3];
const Donut = ({ data }) => {
  const total = data.reduce((n, [, v]) => n + v, 0) || 1;
  const R = 30, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" className="shrink-0">
      {data.map(([k, v], i) => {
        const len = (v / total) * C;
        const seg = (
          <circle key={k} cx="39" cy="39" r={R} fill="none" strokeWidth="13"
            stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
            transform="rotate(-90 39 39)" />
        );
        off += len;
        return seg;
      })}
    </svg>
  );
};

const Spark = ({ vals, w = 108, h = 32 }) => {
  const max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / span) * (h - 5) - 2.5}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline points={pts} fill="none" stroke={T.pulse} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/* ---- the drop-down from the header: four numbers, one door ---- */
function PipelineDrop({ open, onClose, onFull, p }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const rows = [
    { l: "Pipeline", v: moneyK(p.total), s: `${moneyK(p.scopedValue)} scoped · ${moneyK(p.unscopedValue)} still a guess`, c: "#fff" },
    { l: "Bids out", v: moneyK(p.bidsOutValue), s: `${p.bidsOut} sitting in their hands`, c: T.hiviz },
    { l: "Follow-ups due", v: PLACE.followUps, s: "quoted, quiet 5+ days", c: "#fff", place: true },
    { l: "Days to bid", v: PLACE.daysToBid.toFixed(1), s: "lead in → quote sent", c: "#fff", place: true },
  ];
  return (
    <div className="fixed inset-0 z-[45]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="absolute sc-glass sc-drop"
        style={{ top: 54, left: 8, right: 8, borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
        <div className="grid grid-cols-2">
          {rows.map((r, i) => (
            <div key={r.l} className="px-3 py-2.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,.09)",
                       borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,.09)" : "none" }}>
              <div style={{ ...eyebrow, color: "rgba(255,255,255,.55)" }}>{r.l}{r.place && DOT}</div>
              <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05, color: r.c, ...nums }}>{r.v}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.42)", ...clip }}>{r.s}</div>
            </div>
          ))}
        </div>
        <button onClick={onFull} className="w-full px-3 flex items-center justify-between"
          style={{ height: 42, color: "#fff", fontFamily: disp, fontSize: F.md, letterSpacing: ".06em", textTransform: "uppercase" }}>
          <span>Full pipeline</span>
          <span style={{ color: T.hiviz }}>›</span>
        </button>
      </div>
    </div>
  );
}

/* ---- the whole board, behind one tap ---- */
function PipelinePanel({ open, onClose, p }) {
  const winRate = Math.round((PLACE.jobsWon / PLACE.totalLeads) * 100);
  return (
    <Drawer open={open} onClose={onClose} full title="Pipeline" sub="Everything the board can say">
      <SectionHead note="checked every morning">Health</SectionHead>
      <MetricGrid items={[
        { label: "Pipeline", value: moneyK(p.total), sub: `${moneyK(p.unscopedValue)} of it unscoped`, color: T.ink },
        { label: "Close rate", value: `${PLACE.closeRate}%`, sub: "quoted → won", color: T.chalk, place: true },
        { label: "Needs you", value: p.counts.needs, sub: "waiting on your reply", color: T.hiviz },
        { label: "Bids out", value: moneyK(p.bidsOutValue), sub: `${p.bidsOut} quotes in their hands`, color: T.ink },
      ]} />

      <SectionHead note="this week">Activity</SectionHead>
      <MetricGrid items={[
        { label: "Calls in / out", value: `${PLACE.callsIn} / ${PLACE.callsOut}`, sub: "answering vs reaching out", place: true },
        { label: "Texts in / out", value: `${PLACE.textsIn} / ${PLACE.textsOut}`, sub: "concrete closes by phone", place: true },
        { label: "Avg response", value: `${PLACE.respMin}m`, sub: "lead in → first contact", color: PLACE.respMin > 60 ? T.red : T.green, place: true },
        { label: "Follow-ups due", value: PLACE.followUps, sub: "your warm list — call today", color: T.hiviz, place: true },
      ]} />

      <SectionHead note="where the profit is">Money &amp; margin</SectionHead>
      <MetricGrid items={[
        { label: "Avg job size", value: moneyK(PLACE.avgJob), sub: "trending up = better mix", place: true },
        { label: "Avg $/sq ft", value: `$${PLACE.perSqft.toFixed(2)}`, sub: "your own rate, not a benchmark", place: true },
        { label: "Margin", value: `${PLACE.margin}%`, sub: "needs actual costs to be true", color: T.violet, place: true },
        { label: "Material ratio", value: `${PLACE.matRatio}%`, sub: "materials ÷ bid", place: true },
      ]} />

      <SectionHead note="last 7 days">Calls vs texts</SectionHead>
      <div className="px-3 pb-1">
        <DayBars week={PLACE.week} />
        <div className="flex items-center gap-3 pt-1.5">
          <span className="flex items-center gap-1" style={{ fontSize: F.xs, color: T.ink2 }}>
            <span style={{ width: 8, height: 8, background: T.chalk }} /> Calls
          </span>
          <span className="flex items-center gap-1" style={{ fontSize: F.xs, color: T.ink2 }}>
            <span style={{ width: 8, height: 8, background: T.hiviz }} /> Texts
          </span>
        </div>
      </div>

      <SectionHead note="where they stall">Lead funnel</SectionHead>
      <div className="px-3 pb-1"><Funnel rows={PLACE.funnel} /></div>

      <SectionHead note="what feeds you">By project type</SectionHead>
      <div className="px-3 pb-1 flex items-center gap-3">
        <Donut data={PLACE.byType} />
        <div className="flex-1 min-w-0">
          {PLACE.byType.map(([k, v], i) => (
            <div key={k} className="flex items-center gap-1.5" style={{ padding: "1.5px 0" }}>
              <span style={{ width: 8, height: 8, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
              <span style={{ fontSize: F.xs, color: T.ink2, flex: 1, ...clip }}>{k}</span>
              <span style={{ fontFamily: disp, fontSize: F.xs, color: T.ink3, ...nums }}>{v}%</span>
            </div>
          ))}
        </div>
      </div>

      <SectionHead note="6 months">Revenue trend</SectionHead>
      <div className="px-3 pb-2 flex items-center gap-3">
        <Spark vals={PLACE.revenue} />
        <div style={{ fontSize: F.xs, color: T.ink3 }}>Concrete is seasonal here. This is where you learn when to push.</div>
      </div>

      <SectionHead>Batting average</SectionHead>
      <MetricGrid items={[
        { label: "Won / leads", value: `${PLACE.jobsWon} / ${PLACE.totalLeads}`, sub: `${winRate}% — 25% is solid`, color: T.green, place: true },
        { label: "Days to bid", value: PLACE.daysToBid.toFixed(1), sub: "over 2 and you're slow", place: true },
        { label: "Backlog", value: moneyK(PLACE.backlog), sub: "won, not started — your net", color: T.chalk, place: true },
        { label: "Unscoped", value: p.counts.unscoped, sub: "no dimensions yet", color: T.ink },
      ]} />

      <div className="mx-3 my-3 px-3 py-2.5 rounded" style={{ background: T.hivizDim, border: `1px solid ${T.hiviz}33` }}>
        <div className="flex items-start gap-1.5">
          <span style={{ color: T.hiviz, fontSize: 13, lineHeight: 1.2 }}>•</span>
          <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45 }}>
            Anything dotted is a placeholder — the layout is real, the number is not.
            Each one needs a field, a feed, or a state that is not built yet.
            Pipeline, bids out, needs you and unscoped are live off your threads.
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/* the three worth a permanent slot — the rest are stages, and you go
   looking for a stage rather than glancing at it */
const FRONT = ["today", "needs", "drafts", "unsorted"];

function ThreadsScreen({ query, counts, onScope, onAbout, onSort, onCustomer }) {
  const [filter, setFilter] = useState("today");
  const [expandedId, setExpandedId] = useState(null);
  const [moreFilters, setMoreFilters] = useState(false);

  const hiddenActive = !FRONT.includes(filter);
  const frontChips = hiddenActive
    ? [FILTERS.find((f) => f.k === filter), ...FILTERS.filter((f) => FRONT.includes(f.k)).slice(0, 3)]
    : FILTERS.filter((f) => FRONT.includes(f.k));

  const visible = THREADS.filter((t) => {
    if (filter === "today" && !isToday(t)) return false;
    if (filter === "needs" && !t.needsReply) return false;
    if (filter === "unsorted" && !t.unsorted) return false;
    if (filter === "drafts" && !t.draft) return false;
    if (filter === "unscoped" && (t.scoped || t.kind !== "lead" || t.unsorted)) return false;
    if (filter === "quoted" && t.status !== "quoted") return false;
    if (filter === "progress" && t.status !== "progress") return false;
    if (filter === "won" && t.status !== "won") return false;
    if (filter === "lost" && t.status !== "lost") return false;
    if (filter === "vendors" && t.kind !== "vendor" && t.kind !== "sub") return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [t.name, t.phone, t.aiTitle, t.aiSummary, t.type].some((v) => (v || "").toLowerCase().includes(q));
  });

  return (
    <div>
      {/* One row, no scrolling. The three you reach for live out here; the
          rest sit behind the funnel. If you pick one from inside, it takes
          the front slot so you can always see what you are filtered to. */}
      <div className="flex gap-1 px-2.5 pt-2.5 pb-1.5 items-center">
        {frontChips.map(({ k, l, c }) => {
          const on = filter === k;
          const n = counts[k];
          return (
            <button key={k} onClick={() => setFilter(k)}
              className="pl-2.5 pr-2 rounded flex items-center gap-1.5"
              style={{ height: 30, flex: "0 1 auto", minWidth: 0,
                       border: `1px solid ${on ? T.ink : T.hair}`,
                       background: on ? T.ink : T.card, color: on ? "#fff" : T.ink2,
                       fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>
              <span style={{ ...clip }}>{l}</span>
              {n > 0 && (
                <span className="flex items-center justify-center rounded-full shrink-0"
                  style={{ minWidth: 17, height: 17, padding: "0 4px",
                           background: on ? "rgba(255,255,255,.92)" : (c || T.hairSoft),
                           color: on ? T.ink : (c ? "#fff" : T.ink2),
                           fontFamily: disp, fontSize: F.xs, fontWeight: 700, ...nums }}>{n}</span>
              )}
            </button>
          );
        })}

        <button onClick={() => setMoreFilters((o) => !o)} aria-label="All filters"
          aria-expanded={moreFilters}
          className="rounded flex items-center justify-center shrink-0 relative ml-auto"
          style={{ width: 32, height: 30,
                   border: `1px solid ${moreFilters || hiddenActive ? T.ink : T.hair}`,
                   background: moreFilters ? T.ink : T.card }}>
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path d="M1.6 2.6h11.8L9.1 7.5v4.3l-3.2 1.6V7.5z" fill="none"
              stroke={moreFilters ? "#fff" : T.ink2} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          {hiddenActive && !moreFilters && (
            <span className="absolute rounded-full" style={{ top: -3, right: -3, width: 8, height: 8, background: T.hiviz }} />
          )}
        </button>
      </div>

      {moreFilters && (
        <div className="mx-2.5 mb-2 rounded px-2 py-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div className="grid grid-cols-2 gap-1">
            {FILTERS.map(({ k, l, c }) => {
              const on = filter === k;
              const n = counts[k];
              return (
                <button key={k} onClick={() => { setFilter(k); setMoreFilters(false); }}
                  className="rounded px-2.5 flex items-center justify-between gap-1.5"
                  style={{ height: 32, border: `1px solid ${on ? T.ink : T.hair}`,
                           background: on ? T.ink : T.card, color: on ? "#fff" : T.ink2,
                           fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", minWidth: 0 }}>
                  <span style={{ ...clip }}>{l}</span>
                  <span className="flex items-center justify-center rounded-full shrink-0"
                    style={{ minWidth: 17, height: 17, padding: "0 4px",
                             background: on ? "rgba(255,255,255,.92)" : (n > 0 ? (c || T.hairSoft) : "transparent"),
                             color: on ? T.ink : (n > 0 ? (c ? "#fff" : T.ink2) : T.ink3),
                             fontFamily: disp, fontSize: F.xs, fontWeight: 700, ...nums }}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mx-2.5 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
        {visible.length === 0 && (
          <div className="px-3 py-6 text-center" style={{ background: T.card, fontSize: F.sm, color: T.ink3 }}>
            Nothing matches that. Clear the search or pick another filter.
          </div>
        )}
        {visible.map((t, i) => (
          <ThreadRow key={t.id} t={t} first={i === 0}
            expanded={expandedId === t.id}
            onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
            onScope={onScope} onAbout={onAbout} onSort={onSort} onCustomer={onCustomer} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================ OTHER TABS
   Honest empty states. Each says what lands here and offers the
   one action that starts it — an empty screen is an invitation,
   not an apology. Replace with the real screens as they land.
============================================================ */
const STUBS = {
  jobs: {
    title: "Jobs",
    line: "The spine. Sections, cost cards, receipts, invoices and daily logs all hang off a job.",
    action: "New job",
  },
  vendors: {
    title: "Vendors & subs",
    line: "Who you buy from and who you hand work to. Price notices land against the vendor that sent them.",
    action: "Add a vendor",
  },
  logs: {
    title: "Daily logs",
    line: "Photos and updates tagged to a job. Doubles as the workday record the bid floor is computed from.",
    action: "Post a log",
  },
  money: {
    title: "Money",
    line: "Receipts photographed in the field, invoices out, payments in — all hanging off the job so quoted-vs-actual stays live.",
    action: "Snap a receipt",
  },
};

function TabStub({ tab, onCreate, onBack }) {
  const s = STUBS[tab];
  if (!s) return null;
  return (
    <div className="px-4" style={{ paddingTop: onBack ? 14 : 54, paddingBottom: 40, textAlign: "center" }}>
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 mb-6"
          style={{ ...eyebrow, color: T.ink2 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>‹</span> More
        </button>
      )}
      <div style={{ display: "inline-block", opacity: .5, marginBottom: 14 }}>
        <Emblem size={34} ring={T.ink3} core={T.hairSoft} />
      </div>
      <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
        {s.title}
      </div>
      <p style={{ fontSize: F.sm, color: T.ink3, lineHeight: 1.5, maxWidth: 300, margin: "8px auto 18px" }}>
        {s.line}
      </p>
      <button onClick={onCreate} className="rounded-lg"
        style={{ background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.md, fontWeight: 700,
                 letterSpacing: ".05em", textTransform: "uppercase", padding: "11px 20px" }}>
        {s.action}
      </button>
      <div style={{ ...eyebrow, fontSize: 9, marginTop: 16 }}>Not built yet</div>
    </div>
  );
}

/* ============================================================ SHEETS */
/* ------------------------------------------------------------------
   DRAWER — slides in from the right, full height.
   The title row is sticky inside the panel, so the page name and the
   close mark stay on the same line while the body scrolls under them.
   Everything that used to be a bottom sheet now comes through here.
------------------------------------------------------------------ */
function Drawer({ open, onClose, title, sub, right, children, hideClose, full, below }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    /* Three shapes, one component. full: fills the width under the header.
       below: still a side drawer, but it starts under the header assembly
       so the stream and the burger are never covered — nothing should hide
       the thing you use to get out. Default: covers everything. */
    <div className={`fixed left-0 right-0 bottom-0 ${full ? "z-30" : "z-50 sc-scrim"}`}
      style={{ top: full || below ? 84 : 0,
               background: full ? "transparent" : "rgba(18,22,26,.44)" }}
      onClick={full ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}
        className={`absolute top-0 right-0 bottom-0 flex flex-col ${full ? "sc-fullpage left-0" : "sc-drawer"}`}
        style={{ width: full ? "auto" : "min(408px, 90vw)", background: T.card,
                 boxShadow: full ? "none" : "-14px 0 40px rgba(10,14,18,.22)" }}>

        {/* sticky title row — name and close on one line */}
        <div className="sticky top-0 z-10 shrink-0 px-4 flex items-center gap-3"
          style={{ minHeight: 54, background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05, ...clip }}>{title}</div>
            {sub && <div style={{ ...eyebrow, marginTop: 1, ...clip }}>{sub}</div>}
          </div>
          {right}
          {hideClose ? (
            /* the header burger sits on top and closes this itself —
               reserve its footprint so the title does not run under it */
            <span className="shrink-0" style={{ width: 32, height: 32 }} aria-hidden="true" />
          ) : (
            <button onClick={onClose} aria-label="Close"
              className="shrink-0 rounded-lg flex items-center justify-center"
              style={{ width: 32, height: 32, border: `1px solid ${T.hair}`, background: T.card }}>
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                <path d="M1 1 L12 12 M12 1 L1 12" stroke={T.ink} strokeWidth="1.8" strokeLinecap="square" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* Kept as `Sheet` so the panels that already used it don't change. */
function Sheet({ open, onClose, title, sub, children }) {
  return <Drawer open={open} onClose={onClose} title={title} sub={sub}>{children}</Drawer>;
}

/* Dusty, cold entry: a list of channels, not a blank chat box. */
const CHANNELS = [
  { id: "c1", name: "Gulfline · Old Hammond", last: "Confirmed the 14-day rental, adding it to actuals.", when: "2h", group: "Today",
    turns: [
      { who: "you", text: "add the rental to gulfline actuals" },
      { who: "dusty", text: "Fourteen days at $232.14 a day — $3,249.96. That lands against equipment, not materials. Filed it. That job's actual equipment is now $3,249.96 against $3,000 budgeted." },
    ] },
  { id: "c2", name: "Costs & pricing", last: "Your 4000 PSI is up $4.10/CY since May.", when: "Yesterday", group: "This week",
    turns: [
      { who: "you", text: "has concrete gone up" },
      { who: "dusty", text: "Your 4000 PSI moved from $232.03 to $236.13 a yard since May — up $4.10, about 1.8%. Gulf Coast also sent notice of another $6/CY on the 1st. That one affects every open quote you have not sent yet." },
    ] },
  { id: "c3", name: "Duplessis driveway", last: "Need the depth on section 2 before I can price it.", when: "Tue", group: "This week",
    turns: [
      { who: "you", text: "price the duplessis driveway" },
      { who: "dusty", text: "I have section 1 at 24 × 30. Section 2 has a width but no depth — I am not going to guess it. Four inches or six?" },
    ] },
  { id: "c4", name: "What did I keep on Gulfline", last: "12.8%, not the 39% JobTread showed you.", when: "Aug 4", group: "Earlier",
    turns: [
      { who: "you", text: "what did i actually keep on gulfline" },
      { who: "dusty", text: "$4,370 on a $34,120 contract — 12.8%. JobTread reported 39% because the $4,000 discount got entered against cost as well as price. Job costs were $24,297, your overhead share $1,700, and 11% came off the top before any of it." },
    ] },
];

/* ============================================================ DUSTY
   Full screen, not a drawer — this is a place you work, not a panel
   you peek at. Default view is a new chat; history lives behind the
   hamburger and slides in from the LEFT, so it never collides with
   the right-hand drawers used everywhere else in the app.
============================================================ */
/* ============================================================ DUSTY
   One Dusty, everywhere, full screen — this is a place you work, not a
   panel you peek at.

   What changes per page is not the assistant, it is what it already
   knows: the week you are looking at, the scope under your hands, the
   customer whose thread is open.

   Conversations about a customer are that customer's INTERNAL channel.
   They live on the thread next to the real correspondence but can never
   be sent — see the note in the composer.
============================================================ */
function DustyScreen({ asks, onAsk, open, onClose, context, onOpenThread }) {
  const [railOpen, setRailOpen] = useState(false);
  const [railTab, setRailTab] = useState("chats");
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  /* Dusty is composing a reply. Same mark, same motion as the header bar —
     that animation means the AI is working, wherever it appears. */
  const [replying, setReplying] = useState(false);
  /* The channel is chosen BEFORE the words are written, because you write an
     email differently than a text. "note" is internal and has no send path —
     that is the default and the safe one. */
  const [channel, setChannel] = useState("note");
  /* An outbound draft waiting on a human. Nothing leaves without a tap. */
  const [outDraft, setOutDraft] = useState(null);
  const replyTimer = useRef(null);
  useEffect(() => () => clearTimeout(replyTimer.current), []);

  /* leaving a customer channel resets the surface — you should never inherit
     "email" into a conversation about something else */
  useEffect(() => { setChannel("note"); setOutDraft(null); }, [activeId]);

  const send = () => {
    if (!draft.trim()) return;
    const asked = draft.trim();
    setDraft(""); setReplying(true);
    replyTimer.current = setTimeout(() => {
      setReplying(false);
      /* on an outbound surface Dusty comes back with something to approve,
         not something already gone */
      /* One composer, many purposes. What changes between a reply, a quote
         and an invoice is the payload and the subject Dusty proposes — not
         the surface, not the approval, not the row it writes. */
      if (channel !== "note") {
        const wantsQuote = /quote|bid|estimate|proposal/i.test(asked);
        const wantsInvoice = /invoice|bill|payment|deposit/i.test(asked);
        const label = outParty ? (outParty.named ? outParty.name : outParty.phone) : "";
        setOutDraft({
          channel, body: asked,
          purpose: wantsQuote ? "quote" : wantsInvoice ? "invoice" : "reply",
          subject: wantsQuote ? `Quote — ${label}`
            : wantsInvoice ? `Invoice — ${label}`
            : out.reply ? `Re: ${outParty && outParty.sub ? outParty.sub : label}` : label,
          payload: wantsQuote
            ? { kind: "link", label: "Quote v3 · opens in their browser",
                sub: "They can download a PDF from the page" }
            : wantsInvoice
            ? { kind: "link", label: "Invoice · pay online",
                sub: "Marks itself paid when it clears" }
            : null,
        });
      }
    }, 2400);
  };

  /* a customer context opens straight into that customer's channel, and on
     the surface you were reading — picking up an email should not drop you
     into a note. Runs after the activeId reset above, so it wins. */
  useEffect(() => {
    if (!open) return;
    setActiveId(context && context.threadId ? `t${context.threadId}` : null);
    if (context && context.channel) setChannel(context.channel);
  }, [open, context]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (attachOpen) setAttachOpen(false);
      else if (railOpen) setRailOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, railOpen, attachOpen]);

  if (!open) return null;

  /* every customer with internal notes is a channel, alongside the
     free-standing ones */
  const customerChannels = THREADS.filter((t) => t.internal && t.internal.length).map((t) => ({
    id: `t${t.id}`, threadId: t.id, name: `About ${t.name || t.phone}`,
    last: t.internal[t.internal.length - 1].text, when: t.internal[t.internal.length - 1].at,
    group: "Customers", turns: t.internal,
  }));
  const all = [...customerChannels, ...CHANNELS];
  const active = all.find((c) => c.id === activeId);
  const groups = [...new Set(all.map((c) => c.group))];

  /* Where an outbound message would actually go. A customer who has only ever
     texted has no email on file, so this can legitimately be empty — and the
     send button stays dead until it is not. */
  const outParty = active && active.threadId
    ? THREADS.find((t) => t.id === active.threadId) : null;
  const out = addressFor(outParty, channel);
  const outTo = out.to;
  /* Name the human, not just the string. On a company this is the whole
     point — "to Ray Doucet" is checkable at a glance, an address is not. */
  const outLabel = outTo
    ? (out.who ? `${out.who} · ${outTo}` : outTo)
    : "";

  const startNew = () => { setActiveId(null); setRailOpen(false); setDraft(""); };

  /* Tap what happened, land where it happened. If that customer has an
     internal channel, open it with the context already loaded; if not,
     fall back to the thread itself. */
  const openFromActivity = (a) => {
    const id = `t${a.tid}`;
    setRailOpen(false);
    if (all.some((c) => c.id === id)) { setActiveId(id); return; }
    if (onOpenThread) onOpenThread(a.tid);
  };

  /* Dusty stops at the header. The bar keeps working over the top of it —
     you should never lose sight of the app because you opened the chat. */
  return (
    <div className="fixed left-0 right-0 bottom-0 z-30" style={{ top: 84, background: T.slab }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Dusty"
        className="absolute inset-0 flex flex-col sc-fullpage"
        style={{ background: T.slab }}>

        {/* header */}
        <div className="shrink-0 px-2.5 pt-2.5 pb-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
          <button onClick={() => setRailOpen(true)} aria-label="History and activity"
            className="rounded-lg flex flex-col items-center justify-center gap-[3.5px] shrink-0"
            style={{ width: 30, height: 30, border: `1px solid ${T.hair}`, background: T.card }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 13, height: 1.5, background: T.ink2, borderRadius: 1 }} />
            ))}
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Emblem key={activeId || "new"} size={20} stroke={2.6} className="sc-em-tap" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, lineHeight: 1.1, ...clip }}>
                {active ? active.name : "New chat"}
              </div>
              {context && (
                <div style={{ ...eyebrow, fontSize: 9, color: T.chalk, ...clip }}>
                  Looking at {context.label}
                </div>
              )}
            </div>
          </div>

          {active && active.threadId && onOpenThread && (
            <button onClick={() => onOpenThread(active.threadId)} className="rounded shrink-0 px-2"
              style={{ height: 30, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2,
                       fontFamily: disp, fontSize: F.sm, textTransform: "uppercase" }}>Thread</button>
          )}
          <button onClick={startNew} aria-label="New chat"
            className="rounded-lg flex items-center justify-center shrink-0"
            style={{ width: 30, height: 30, border: `1px solid ${T.hair}`, background: T.card,
                     color: T.ink2, fontSize: 18, lineHeight: 1 }}>+</button>
          <button onClick={onClose} aria-label="Close"
            className="rounded-lg flex items-center justify-center shrink-0"
            style={{ width: 30, height: 30, border: `1px solid ${T.hair}`, background: T.card }}>
            <svg width="12" height="12" viewBox="0 0 13 13" aria-hidden="true">
              <path d="M1 1 L12 12 M12 1 L1 12" stroke={T.ink} strokeWidth="1.8" strokeLinecap="square" />
            </svg>
          </button>
        </div>

        {/* transcript */}
        <div className="flex-1 overflow-y-auto">
          {!active ? (
            <>
            {/* What Dusty is waiting on. It sits above the prompts because
                it is the reason the mark was quickening — you tapped to find
                out what it wanted, so it says so first. */}
            {asks && asks.length > 0 && (
              <div className="mx-2.5 mt-2.5 rounded overflow-hidden"
                style={{ background: T.card, border: `1px solid ${T.hair}` }}>
                <div className="px-3 py-2 flex items-baseline justify-between"
                  style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
                  <span style={{ ...eyebrow }}>
                    {asks.length === 1 ? "1 question" : `${asks.length} questions`}
                  </span>
                  <span style={{ ...eyebrow, fontSize: 9, color: T.ink3 }}>from Dusty</span>
                </div>
                {asks.map((a) => (
                  <button key={a.id} onClick={() => onAsk && onAsk(a)}
                    className="w-full text-left px-3 py-2 flex items-start gap-2"
                    style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                    <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, background: a.tone, marginTop: 6 }} />
                    <span className="min-w-0 flex-1">
                      <span style={{ display: "block", fontSize: F.sm, lineHeight: 1.4 }}>{a.text}</span>
                      <span style={{ display: "block", fontSize: F.xs, color: T.ink3, ...clip }}>{a.detail}</span>
                    </span>
                    <span className="shrink-0" style={{ color: T.ink3, fontSize: 13, marginTop: 3 }}>›</span>
                  </button>
                ))}
              </div>
            )}
            <div className="px-4 py-5 text-center">
              <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600 }}>What are we working on?</div>
              <p style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5, maxWidth: 290, margin: "4px auto 12px" }}>
                {context
                  ? `Dusty can see ${context.label} and everything behind it.`
                  : "Dusty has your jobs, costs, threads and receipts."}
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {(context?.prompts || ["What did I keep on that last job?", "Price a 24×30 driveway", "What is my floor this month?"]).map((q) => (
                  <button key={q} onClick={() => setDraft(q)} className="px-2.5 py-1.5 rounded"
                    style={{ background: T.card, border: `1px solid ${T.hair}`, fontSize: F.xs, color: T.ink2 }}>{q}</button>
                ))}
              </div>
            </div>
            </>
          ) : (
            <div className="px-3 py-3">
              {active.threadId && (
                <div className="rounded px-2.5 py-1.5 mb-2.5" style={{ background: "#FDF6E3", border: `1px solid #E6D2A0` }}>
                  <div style={{ fontSize: F.xs, color: "#8A6100", lineHeight: 1.4 }}>
                    Internal. This sits on their thread but is never sent to them.
                  </div>
                </div>
              )}
              {active.turns.map((t, i) => (
                <div key={i} className={t.who === "you" ? "flex justify-end" : "flex justify-start"} style={{ marginBottom: 9 }}>
                  <div className="px-3 py-2 rounded-lg" style={{
                    maxWidth: "86%",
                    background: t.who === "you" ? T.ink : T.card,
                    color: t.who === "you" ? "#fff" : T.ink,
                    border: t.who === "you" ? "none" : `1px solid ${T.hair}`,
                    fontSize: F.sm, lineHeight: 1.5,
                  }}>{t.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dusty working — sits directly above the composer, clears itself */}
        {replying && (
          <div className="shrink-0 px-2.5 pb-1.5 flex items-center gap-2">
            {/* no second emblem — the mark in the header is already working,
                and two spinning marks compete instead of reinforcing */}
            <span className="sc-dream-dot shrink-0"
              style={{ width: 5, height: 5, borderRadius: 3, background: T.pulse }} />
            <span style={{ fontSize: F.xs, color: T.ink3, fontFamily: body }}>Dusty is working</span>
          </div>
        )}

        {/* An outbound draft, held. Human in the loop is structural: this card
            is the only way anything reaches a customer, and it takes a tap. */}
        {outDraft && (
          <div className="shrink-0 mx-2.5 mb-1.5 rounded overflow-hidden"
            style={{ background: T.card, border: `1px solid ${T.chalk}` }}>
            <div className="px-2.5 py-1.5"
              style={{ background: T.chalkDim, borderBottom: `1px solid ${T.chalk}` }}>
              <div className="flex items-center gap-1.5">
                <span style={{ ...eyebrow, color: T.chalk }}>
                  {outDraft.purpose === "quote" ? "Draft quote"
                    : outDraft.purpose === "invoice" ? "Draft invoice"
                    : outDraft.channel === "email" ? "Draft email" : "Draft text"}
                </span>
                {out.reply && <span style={{ ...eyebrow, fontSize: 9, color: T.ink3 }}>reply</span>}
              </div>
              <div style={{ ...eyebrow, fontSize: 9, color: out.fallback ? T.hiviz : T.ink2, ...clip, marginTop: 1 }}>
                to {outLabel || "no address on file"}
                {out.fallback ? " · not main contact" : ""}
                {out.orphan ? " · not on file" : ""}
              </div>
              {outDraft.channel === "email" && outTo && (
                <div style={{ ...eyebrow, fontSize: 9, color: T.ink3, ...clip }}>
                  from {out.from}
                </div>
              )}
            </div>
            {/* Email needs a subject and a text does not. Dusty proposes it,
                but it sits on its own line — it is the first thing the
                customer reads and it should never be buried in the body. */}
            {outDraft.channel === "email" && (
              <input defaultValue={outDraft.subject || ""} placeholder="Subject"
                onChange={(e) => { outDraft.subject = e.target.value; }}
                className="w-full px-2.5"
                style={{ fontSize: F.sm, fontWeight: 600, height: 32, background: T.card,
                         border: "none", borderBottom: `1px solid ${T.hairSoft}`, outline: "none" }} />
            )}

            {/* Talk to change what it says, tap to fix what is wrong. The body
                is editable in place so correcting one word does not require a
                conversation, and what you type becomes the draft. */}
            <textarea defaultValue={outDraft.body}
              onChange={(e) => { outDraft.body = e.target.value; }}
              rows={outDraft.channel === "email" ? 6 : 3}
              className="w-full px-2.5 py-2"
              style={{ fontSize: F.sm, lineHeight: 1.5, background: T.card, border: "none",
                       outline: "none", resize: "none", display: "block" }} />

            {/* What is riding along. A quote travels as a link to a page you
                host, so the payload is a URL, not a file — the link stays
                current when the quote is revised and a PDF does not. */}
            {outDraft.payload && (
              <div className="mx-2.5 mb-2 rounded flex items-center gap-2 px-2 py-1.5"
                style={{ background: T.slab, border: `1px solid ${T.hair}` }}>
                <span className="shrink-0 rounded flex items-center justify-center"
                  style={{ width: 26, height: 26, background: T.card, border: `1px solid ${T.hair}`,
                           color: T.chalk, fontFamily: disp, fontSize: 9, fontWeight: 700 }}>
                  {outDraft.payload.kind === "link" ? "LINK" : "PDF"}
                </span>
                <span className="min-w-0 flex-1">
                  <span style={{ display: "block", fontSize: F.xs, fontWeight: 600, ...clip }}>{outDraft.payload.label}</span>
                  <span style={{ display: "block", fontSize: F.micro, color: T.ink3, ...clip }}>{outDraft.payload.sub}</span>
                </span>
              </div>
            )}
            <div className="flex gap-1.5 px-2.5 pb-2">
              <button onClick={() => { setDraft(outDraft.body); setOutDraft(null); }}
                className="flex-1 rounded"
                style={{ height: 32, background: T.card, border: `1px solid ${T.hair}`,
                         fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", color: T.ink2 }}>
                Keep working
              </button>
              <button onClick={() => setOutDraft(null)} disabled={!outTo}
                className="flex-1 rounded"
                style={{ height: 32, background: outTo ? T.green : T.hair, color: "#fff", border: "none",
                         fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
                         opacity: outTo ? 1 : .7 }}>
                {outTo ? "Approve & send" : "No address"}
              </button>
            </div>
          </div>
        )}

        {/* composer */}
        <div className="shrink-0 px-2.5 pt-2 pb-2" style={{ background: T.card, borderTop: `1px solid ${T.hair}` }}>
          {/* Which surface am I speaking on. Only on a customer channel —
              a general chat with Dusty has nobody to send to. */}
          {active && active.threadId && (
            <div className="flex items-center gap-1 pb-2">
              {[["note", "Note", true], ["email", "Email", true], ["sms", "Text", false]].map(([k, label, live]) => (
                <button key={k} onClick={() => live && setChannel(k)} disabled={!live}
                  className="rounded px-2.5"
                  style={{ height: 26,
                           background: channel === k ? T.ink : T.card,
                           color: channel === k ? "#fff" : (live ? T.ink2 : T.ink3),
                           border: `1px solid ${channel === k ? T.ink : T.hair}`,
                           fontFamily: disp, fontSize: F.xs, textTransform: "uppercase",
                           opacity: live ? 1 : .55 }}>
                  {label}{!live && " · soon"}
                </button>
              ))}
              <span className="ml-auto" style={{ ...eyebrow, fontSize: 9, color: T.ink3, ...clip }}>
                {channel === "note" ? "stays internal" : `to ${out.who || outTo || "no address"}`}
              </span>
            </div>
          )}
          {attachOpen && (
            <div className="flex gap-1.5 pb-2">
              {[["Photo", "Camera opens to the shutter"], ["Files", "Plans, PDFs, sheets"], ["Receipt", "Snap it — Dusty reads it"]].map(([l, sub]) => (
                <button key={l} onClick={() => setAttachOpen(false)} className="flex-1 rounded px-2 py-2 text-left"
                  style={{ background: T.slab, border: `1px solid ${T.hair}`, minWidth: 0 }}>
                  <div style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600 }}>{l}</div>
                  <div style={{ fontSize: 9.5, color: T.ink3, lineHeight: 1.3 }}>{sub}</div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <button onClick={() => setAttachOpen((o) => !o)} aria-label="Attach"
              className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 34, height: 34, border: `1px solid ${T.hair}`,
                       background: attachOpen ? T.ink : T.card, color: attachOpen ? "#fff" : T.ink2,
                       fontSize: 19, lineHeight: 1 }}>+</button>

            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
              placeholder={
                channel === "email" ? "Tell Dusty what the email should say"
                : channel === "sms" ? "Tell Dusty what to text"
                : active && active.threadId ? "Note or ask — stays internal" : "Ask Dusty"}
              className="flex-1 px-2.5 py-2 rounded-lg outline-none resize-none"
              style={{ border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm,
                       maxHeight: 96, lineHeight: 1.4, fontFamily: body }} />

            <button onPointerDown={() => setRecording(true)} onPointerUp={() => setRecording(false)}
              onPointerLeave={() => setRecording(false)} aria-label="Hold to talk"
              className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 34, height: 34, border: `1px solid ${recording ? T.hiviz : T.hair}`,
                       background: recording ? T.hiviz : T.card }}>
              <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                <rect x="5.4" y="1.6" width="4.2" height="7.6" rx="2.1" fill="none"
                  stroke={recording ? "#fff" : T.ink2} strokeWidth="1.5" />
                <path d="M3 7.4a4.5 4.5 0 0 0 9 0" fill="none" stroke={recording ? "#fff" : T.ink2}
                  strokeWidth="1.5" strokeLinecap="round" />
                <path d="M7.5 11.9v1.6" stroke={recording ? "#fff" : T.ink2} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {draft.trim() && (
              <button onClick={send} aria-label="Send"
                className="rounded-lg flex items-center justify-center shrink-0"
                style={{ width: 34, height: 34, background: T.ink, color: "#fff" }}>
                <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                  <path d="M7.5 12.4V2.8M3.4 6.9 7.5 2.6l4.1 4.3" fill="none" stroke="#fff"
                    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* history */}
        {railOpen && (
          <div className="absolute inset-0 z-10 sc-scrim" style={{ background: "rgba(18,22,26,.44)" }}
            onClick={() => setRailOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Chat history"
              className="absolute top-0 left-0 bottom-0 flex flex-col sc-rail"
              style={{ width: "min(300px, 82vw)", background: T.card, boxShadow: "14px 0 40px rgba(10,14,18,.22)" }}>
              <div className="shrink-0 px-3 flex items-center justify-between gap-2"
                style={{ minHeight: 48, borderBottom: `1px solid ${T.hair}` }}>
                <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>
                  {railTab === "chats" ? "History" : "Activity"}
                </div>
                <button onClick={() => setRailOpen(false)} aria-label="Close history"
                  className="rounded-lg flex items-center justify-center"
                  style={{ width: 28, height: 28, border: `1px solid ${T.hair}` }}>
                  <svg width="11" height="11" viewBox="0 0 13 13" aria-hidden="true">
                    <path d="M1 1 L12 12 M12 1 L1 12" stroke={T.ink} strokeWidth="1.8" strokeLinecap="square" />
                  </svg>
                </button>
              </div>
              {/* two doors onto the same rail: what you said, what happened */}
              <div className="shrink-0 flex" style={{ borderBottom: `1px solid ${T.hair}` }}>
                {[["chats", "Chats"], ["activity", "Activity"]].map(([k, label]) => (
                  <button key={k} onClick={() => setRailTab(k)}
                    className="flex-1"
                    style={{ height: 36, fontFamily: disp, fontSize: F.sm, letterSpacing: ".06em",
                             textTransform: "uppercase",
                             color: railTab === k ? T.ink : T.ink3,
                             background: "transparent",
                             borderBottom: `2px solid ${railTab === k ? T.hiviz : "transparent"}` }}>
                    {label}
                  </button>
                ))}
              </div>

              {railTab === "chats" && (
                <div className="px-2.5 py-2 shrink-0">
                  <button onClick={startNew} className="w-full rounded-lg"
                    style={{ height: 34, background: T.ink, color: "#fff", fontFamily: disp,
                             fontSize: F.sm, letterSpacing: ".06em", textTransform: "uppercase" }}>+ New chat</button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {railTab === "chats" ? groups.map((g) => (
                  <div key={g}>
                    <div className="px-3 pt-2 pb-1" style={{ ...eyebrow, color: T.ink2 }}>{g}</div>
                    {all.filter((c) => c.group === g).map((c) => (
                      <button key={c.id} onClick={() => { setActiveId(c.id); setRailOpen(false); }}
                        className="w-full text-left px-3 py-2"
                        style={{ background: c.id === activeId ? T.hairSoft : "transparent",
                                 borderBottom: `1px solid ${T.hairSoft}` }}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{c.name}</span>
                          <span style={{ ...eyebrow, fontSize: 9, flexShrink: 0 }}>{c.when}</span>
                        </div>
                        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 1, ...clip }}>{c.last}</div>
                      </button>
                    ))}
                  </div>
                )) : (
                  <ActivityFeed items={ACTIVITY} showWho divider onItem={openFromActivity} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CREATE_ROWS = [
  { k: "job", label: "New job", sub: "Start the spine — customer, address, sections" },
  { k: "thread", label: "New thread", sub: "A conversation that hasn't become a job yet" },
  { k: "receipt", label: "Photograph a receipt", sub: "Camera first. Dusty reads it and files it." },
  { k: "invoice", label: "Send an invoice", sub: "Against a won job" },
  { k: "payment", label: "Record a payment", sub: "Money that actually landed" },
  { k: "log", label: "Daily log", sub: "Photos and an update — also counts the day worked" },
];

function CreateDrop({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[45]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="absolute sc-glass sc-drop"
        style={{ top: 54, left: 8, right: 8, borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
        {CREATE_ROWS.map((r, i) => (
          <button key={r.label} onClick={onClose}
            className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2"
            style={{ borderTop: i ? "1px solid rgba(255,255,255,.09)" : "none" }}>
            <span className="min-w-0">
              <span style={{ display: "block", fontFamily: disp, fontSize: F.md, fontWeight: 600, color: "#fff", ...clip }}>{r.label}</span>
              <span style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,.45)", ...clip }}>{r.sub}</span>
            </span>
            <span style={{ color: T.hiviz, flexShrink: 0 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserSheet({ open, onClose, onBack }) {
  return (
    <Drawer open={open} onClose={onClose} title="Account" below
      right={onBack ? (
        <button onClick={onBack} style={{ ...eyebrow, color: T.ink2 }}>‹ Menu</button>
      ) : null}>
      <div className="px-4 pb-3 flex items-center gap-3" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
        <Avatar label={USER.name} size={44} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, ...clip }}>{USER.name}</div>
          <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{USER.email}</div>
        </div>
      </div>
      <button className="w-full text-left px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
        <span className="min-w-0">
          <span style={{ display: "block", fontSize: F.sm, fontWeight: 600 }}>{USER.org}</span>
          <span style={{ display: "block", fontSize: F.xs, color: T.ink3, marginTop: 1 }}>{USER.role} · switch organization</span>
        </span>
        <span style={{ color: T.ink3, fontSize: F.md }}>›</span>
      </button>
      {["Profile and contact", "Team and seats", "Billing and plan", "Notifications"].map((r) => (
        <button key={r} className="w-full text-left px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <span style={{ fontSize: F.sm }}>{r}</span>
          <span style={{ color: T.ink3, fontSize: F.md }}>›</span>
        </button>
      ))}
      <div className="px-4 pt-3">
        <button className="w-full rounded-lg"
          style={{ padding: "11px 0", border: `1px solid ${T.hair}`, color: T.red, fontFamily: disp,
                   fontSize: F.md, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
          Sign out
        </button>
      </div>
    </Drawer>
  );
}

export default function CashFlow() {
  const [selMonth, setSelMonth] = useState(NOW_IDX);
  const [selWeek, setSelWeek] = useState(null);
  const [picked, setPicked] = useState(null);
  const [layers, setLayers] = useState({ collected: true, committed: true, projected: true, net: true });
  const [legendOpen, setLegendOpen] = useState(false);
  const [mode, setMode] = useState("accrual");
  const [ohOpen, setOhOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [overhead, setOverhead] = useState(OVERHEAD_SEED);
  /* home is where the app lands on open; tab is where you are now. Changing
     home does not yank you off the page you are reading. */
  const [home, setHome] = useState("threads");
  const [tab, setTab] = useState(home);
  const [dustyOpen, setDustyOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pipeOpen, setPipeOpen] = useState(false);
  const [fullPipe, setFullPipe] = useState(false);
  const [scopes, setScopes] = useState([
    { id: "s1", threadId: 1, sections: seedSections(THREADS[0]), cfg: DEFAULTS, updated: "9:48a", docId: null },
    { id: "s2", threadId: null,
      sections: [{ id: 1, name: "Section 1", Lft: 18, Lin: 0, Wft: 24, Win: 0, depthIn: 4, psi: 4000 }],
      cfg: DEFAULTS, updated: "Yesterday", docId: null },
  ]);
  const [openScopeId, setOpenScopeId] = useState(null);
  const openScope = scopes.find((x) => x.id === openScopeId) || null;
  const [docs, setDocs] = useState(DOCS_SEED);
  const [activeDocId, setActiveDocId] = useState(null);
  const [toast, setToast] = useState("");
  const [emTap, setEmTap] = useState(0);
  const [emTapping, setEmTapping] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const tapEmblem = () => { setEmTap((n) => n + 1); setEmTapping(true); setTimeout(() => setEmTapping(false), 660); };
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const touchScope = (id, patch) =>
    setScopes((all) => all.map((x) => (x.id === id ? { ...x, ...patch, updated: "Just now" } : x)));

  const newScope = (thread) => {
    const id = "s" + Date.now();
    setScopes((all) => [{
      id, threadId: thread ? thread.id : null,
      sections: seedSections(thread), cfg: DEFAULTS, updated: "Just now", docId: null,
    }, ...all]);
    setOpenScopeId(id);
    setTab("scope");
  };

  /* Scope from a thread reopens that customer's live draft rather than
     starting a second one for the same job. */
  const scopeFromThread = (t) => {
    const existing = scopes.find((x) => x.threadId === t.id && !x.docId);
    if (existing) { setOpenScopeId(existing.id); setTab("scope"); return; }
    newScope(t);
  };

  const makeQuote = (sections, cfg) => {
    const t = openScope && THREADS.find((x) => x.id === openScope.threadId);
    const existing = t && docs.find((d) => d.threadId === t.id && d.type === "quote");
    if (existing) {
      setDocs((ds) => ds.map((d) => (d.id === existing.id ? { ...d, snapshot: snap(sections, cfg) } : d)));
      setActiveDocId(existing.id); setTab("docs");
      if (openScope) touchScope(openScope.id, { docId: existing.id });
      flash("Scope pushed into " + existing.num);
      return;
    }
    const id = "d" + Date.now();
    setDocs((ds) => [{
      id, type: "quote", num: "26-" + (380 + ds.length), threadId: t ? t.id : null,
      status: "draft", issued: "Aug 17, 2026", sortAt: 20260817,
      subject: t ? `${t.name || t.phone} ${t.type}` : "Untitled scope",
      snapshot: snap(sections, cfg),
      versions: [{ v: 1, at: "Now", docType: "estimate", detail: "group",
                   markupPct: cfg.markupPct, pay: "10/50/40", note: "Generated from scope" }],
    }, ...ds]);
    setActiveDocId(id); setTab("docs");
    if (openScope) touchScope(openScope.id, { docId: id });
    flash("Draft estimate created");
  };
  const pipe = useMemo(pipelineNumbers, []);

  /* which fifth of the footer the rule sits under */
  useEffect(() => { if (tab !== "customer") lastTab.current = tab; }, [tab]);

  /* Dusty is the same assistant everywhere; what changes is what it can
     already see. This is that. */
  const [dustyCtx, setDustyCtx] = useState(null);

  /* ---- processing bar state ----
     procEvent: the current inbound event being shown, or null.
     dreamIdx: which dreaming line is showing while nothing is working.
     thinking: true while the bar is visible — drives the emblem. */
  const [procEvent, setProcEvent] = useState(null);
  const [thinking, setThinking]   = useState(false);
  const [dreamIdx, setDreamIdx]   = useState(0);
  /* both shapes wired live so they can be judged, not described */
  const [streamVariant, setStreamVariant] = useState("inset");
  const procTimer = useRef(null);

  /* Dreaming cycles slowly — 7s a line. Fast enough to feel alive,
     slow enough that you can finish reading one while working. */
  useEffect(() => {
    if (thinking) return;
    const t = setInterval(() => setDreamIdx((n) => (n + 1) % DREAM_LINES.length), 7000);
    return () => clearInterval(t);
  }, [thinking]);

  /* Demo: real work interrupts the dream, then hands it back.
     Each event: 2.2s reading → 1.6s filed → back to dreaming for 9s.
     Nothing slides. The bar is always there; only the words change. */
  useEffect(() => {
    let idx = 0;
    function next() {
      const ev = { ...PROC_EVENTS[idx % PROC_EVENTS.length], filing: false };
      idx++;
      setProcEvent(ev); setThinking(true);
      procTimer.current = setTimeout(() => {
        /* the mark stills the instant the work lands, but the words
           stay a beat longer so you can see where it went */
        setProcEvent((e) => (e ? { ...e, filing: true } : e));
        setThinking(false);
        procTimer.current = setTimeout(() => {
          setProcEvent(null);
          procTimer.current = setTimeout(next, 9000);
        }, 1600);
      }, 2200);
    }
    procTimer.current = setTimeout(next, 3000);
    return () => clearTimeout(procTimer.current);
  }, []);
  const [customerId, setCustomerId] = useState(null);
  const lastTab = useRef("threads");
  /* Two different counts, kept apart on purpose. asks is what Dusty wants
     from you and rides on the emblem; needsCount is what customers want from
     you and rides on Threads, reading the same query as the Needs you chip. */
  const asks = useMemo(buildAsks, []);
  const needsCount = THREADS.filter((t) => t.needsReply).length;
  const openDusty = (ctx) => { setDustyCtx(ctx || null); setDustyOpen(true); };
  const pageContext = dustyCtx || (
    tab === "scope" && openScope
      ? { label: `this scope${openScope.threadId ? " · " + (THREADS.find((x) => x.id === openScope.threadId)?.name || "") : ""}`,
          threadId: openScope.threadId,
          prompts: ["Am I above my floor?", "What would 6 inches do to this?", "Price it like the last driveway"] }
    : tab === "schedule"
      ? { label: "the schedule", prompts: ["Where am I free in September?", "Who is double-booked?", "Can I reach the 20th?"] }
    : tab === "cash"
      ? { label: "cash flow", prompts: ["What is my runway?", "What lands before Friday?", "Show me November"] }
    : tab === "threads"
      ? { label: "your threads", prompts: ["Who is waiting on me?", "What is unscoped?", "Draft a follow-up"] }
    : null
  );

  const markIdx = tab === "threads" ? 0 : tab === "scope" ? 1
    : tab === "cash" ? 3 : (tab === "more" || MORE_TABS.includes(tab)) ? 4 : 0;

  const nut = useMemo(() => overhead.filter((o) => o.active)
    .reduce((s, o) => s + (o.cadence === "monthly" ? o.amount : o.cadence === "quarterly" ? o.amount / 3 : o.amount / 12), 0), [overhead]);
  const months = useMemo(() => RIBBON.map((r) => monthBucket(r.y, r.m, overhead, layers.projected)), [overhead, layers.projected]);
  const M = RIBBON[selMonth];
  const weeks = useMemo(() => weeksOf(M.y, M.m, overhead, layers.projected), [M, overhead, layers.projected]);
  const days = useMemo(() => (selWeek != null && weeks[selWeek] ? daysOf(weeks[selWeek].weekStart, overhead) : []), [selWeek, weeks, overhead]);
  const bandData = selWeek != null ? days : weeks;
  const sel = picked != null ? bandData[picked] : null;

  const burn = nut + (COMP.mode === "fixed_draw" ? COMP.monthly_draw : 0);
  const since = (d) => dnum(d) > dnum(ANCHOR.as_of) && dnum(d) <= dnum(TODAY);
  const cashNow = ANCHOR.balance
    + PAYMENTS.filter((p) => since(p.received_on)).reduce((s, p) => s + p.amount, 0)
    - RECEIPTS.filter((r) => since(r.on)).reduce((s, r) => s + r.amount, 0)
    - overheadHits(overhead, fromNum(dnum(ANCHOR.as_of) + 1), TODAY).reduce((s, h) => s + h.amount, 0)
    - drawHits(fromNum(dnum(ANCHOR.as_of) + 1), TODAY).reduce((s, h) => s + h.amount, 0);
  const runway = burn > 0 ? cashNow / burn : 0;
  const drift = ANCHOR.balance - ANCHOR.expected;
  const owed = INVOICES.reduce((s, i) => s + (i.status === "sent" ? i.amount - (paidByInv[i.id] || 0) : 0), 0);
  const monthNet = months[selMonth].totalIn - months[selMonth].totalOut;

  const runColor = runway < 1 ? "#FF6B4A" : runway < 2 ? T.hiviz : T.pulse;

  const Cell = ({ label, value, color, onClick, sub }) => (
    <button onClick={onClick} className="flex-1 text-left px-3 py-2" style={{ minWidth: 0 }}>
      <div style={{ ...eyebrow, color: "#78838F", fontSize: 9 }}>{label}</div>
      <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, color: color || "#fff", lineHeight: 1.05, ...nums }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: "#78838F", ...nums }}>{sub}</div>}
    </button>
  );

  return (
    <div style={{ fontFamily: body, background: T.slab, minHeight: "100vh", color: T.ink, paddingBottom: 68 }}>
      <style>{`
        *{-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{height:0;width:0}
        .sc-glass{
          background:rgba(20,24,28,.72);
          -webkit-backdrop-filter:blur(18px) saturate(150%);
          backdrop-filter:blur(18px) saturate(150%);
          border-bottom:1px solid rgba(255,255,255,.10);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.16), 0 6px 20px rgba(10,14,18,.20);
        }
        .sc-glass-btn{
          background:rgba(255,255,255,.10);
          border:1px solid rgba(255,255,255,.16);
          transition:background .15s;
        }
        .sc-glass-btn:active{ background:rgba(255,255,255,.20); }
        @keyframes scDrawerIn{ from{ transform:translateX(100%); } to{ transform:translateX(0); } }
        @keyframes scScrimIn{ from{ opacity:0; } to{ opacity:1; } }
        .sc-search::placeholder{ color:rgba(255,255,255,.45); }

        /* plus — two crossed bars that rotate 45° into an × */
        .sc-plus-bar, .sc-plus-bar::before{
          display:block; width:17px; height:2px; background:#fff; border-radius:3px;
          position:absolute; left:50%; top:50%; margin-left:-8.5px; margin-top:-1px;
          transition: transform 350ms ease-in-out;
        }
        .sc-plus-bar::before{ content:''; left:0; top:0; margin:0; transform:rotate(90deg); }
        .sc-plus[data-status='open'] .sc-plus-bar{ transform:rotate(45deg); }

        /* burger — bar + ::before + ::after, folding to an X on open */
        .sc-burger-bar,
        .sc-burger-bar::before,
        .sc-burger-bar::after{
          display:block; width:18px; height:2px;
          background:#fff; border-radius:3px;
          position:absolute; left:50%; margin-left:-9px;
          transition: transform 350ms ease-in-out, background 200ms linear;
        }
        .sc-burger-bar{ top:50%; transform:translateY(-50%); }
        .sc-burger-bar::before, .sc-burger-bar::after{ content:''; }
        .sc-burger-bar::before{ top:-6px; }
        .sc-burger-bar::after{ bottom:-6px; }
        .sc-burger[data-status='open'] .sc-burger-bar{
          background:transparent; transform:rotate(180deg);
        }
        .sc-burger[data-status='open'] .sc-burger-bar::before{ top:0; transform:rotate(45deg); }
        .sc-burger[data-status='open'] .sc-burger-bar::after{ bottom:0; transform:rotate(-45deg); }
        /* open, it sits on the panel rather than the glass, so it inks up */
        .sc-burger[data-status='open']{ background:transparent; border-color:transparent; }
        .sc-burger[data-status='open'] .sc-burger-bar::before,
        .sc-burger[data-status='open'] .sc-burger-bar::after{ background:#12161A; }

        /* ---- emblem: tapped, the mark turns a quarter and lands on itself.
           The diamond and the square counter-rotate 90°, which for shapes with
           four-fold symmetry is a full return — it winds up and settles back
           into exactly the mark it started as. The core pulses through it. ---- */
        .sc-em-diamond, .sc-em-square, .sc-em-core{
          transform-box: fill-box; transform-origin: center;
        }
        /* the core breathes while Dusty has a question. Slow — 4.6s,
           a shorter draw in and a longer settle out — so it reads as alive
           rather than as an alarm. Still is the resting state you earn. */
        .sc-em-breathe .sc-em-core{ animation: scEmBreath 4.6s cubic-bezier(.42,0,.32,1) infinite; }
        /* still a breath, not a spin — rotation is reserved for working */
        .sc-em-asking .sc-em-core{ animation-duration: 1.9s; }
        @keyframes scEmBreath{
          0%{ transform: scale(.86); opacity:.55; }
          38%{ transform: scale(1.12); opacity:1; }
          52%{ transform: scale(1.06); opacity:.95; }
          100%{ transform: scale(.86); opacity:.55; }
        }
        .sc-em-tap .sc-em-diamond{ animation: scEmTurn 620ms cubic-bezier(.22,.9,.24,1); }
        .sc-em-tap .sc-em-square{ animation: scEmTurnBack 620ms cubic-bezier(.22,.9,.24,1); }
        .sc-em-tap .sc-em-core{ animation: scEmCore 620ms cubic-bezier(.22,.9,.24,1); }
        @keyframes scEmTurn{ from{ transform: rotate(0deg); } to{ transform: rotate(90deg); } }
        @keyframes scEmTurnBack{ from{ transform: rotate(0deg); } to{ transform: rotate(-90deg); } }
        @keyframes scEmCore{
          0%{ transform: scale(1); }
          34%{ transform: scale(.55); }
          72%{ transform: scale(1.18); }
          100%{ transform: scale(1); }
        }

        /* ---- thinking: diamond and square counter-rotate continuously,
           core pulses faster than breathing. This is the "AI is working"
           state — triggered by inbound calls, texts, emails, and while
           Dusty is generating a response. Stills the moment work is done.
           Still is the state you earn. ---- */
        .sc-em-think .sc-em-diamond{ animation: scThinkTurn 1.4s linear infinite; }
        .sc-em-think .sc-em-square{ animation: scThinkBack 1.4s linear infinite; }
        .sc-em-think .sc-em-core{ animation: scThinkCore 1.1s cubic-bezier(.42,0,.32,1) infinite; }
        @keyframes scThinkTurn{ from{ transform:rotate(0deg); } to{ transform:rotate(360deg); } }
        @keyframes scThinkBack{ from{ transform:rotate(0deg); } to{ transform:rotate(-360deg); } }
        @keyframes scThinkCore{
          0%{ transform:scale(.72); opacity:.5; }
          45%{ transform:scale(1.18); opacity:1; }
          100%{ transform:scale(.72); opacity:.5; }
        }

        /* processing bar slides in under the header, slides away when done */
        /* DREAMING — the core alone, slow and organic. No rotation:
           rotation means real work, and the two must never read alike. */
        @keyframes scDream{
          0%,100%{ transform: scale(.82); opacity:.55; }
          50%    { transform: scale(1.10); opacity:1; }
        }
        .sc-em-dream .sc-em-core{ animation: scDream 3.4s ease-in-out infinite; transform-origin:50px 50px; }
        .sc-dream-dot{ animation: scDream 3.4s ease-in-out infinite; }
        /* the stream never changes height, so it can never push the page */
        .sc-stream{ transition: background 420ms ease, border-color 420ms ease, box-shadow 420ms ease; }
        .sc-stream-text{ animation: scStreamIn 420ms ease; }
        @keyframes scStreamIn{ from{ opacity:0; transform: translateY(3px); } to{ opacity:1; transform:none; } }

        /* ---- footer: press gives way under the thumb, then settles ---- */
        .sc-tab{ -webkit-tap-highlight-color:transparent; }
        .sc-tab-ico{ display:block; transition: transform 160ms cubic-bezier(.22,.9,.24,1); }
        .sc-tab:active .sc-tab-ico{ transform: scale(.84); }
        .sc-tab-lbl{ transition: color 160ms linear; }
        /* becoming the current tab: a single short rise, not a bounce */
        .sc-tab-pop{ animation: scTabPop 320ms cubic-bezier(.22,.9,.24,1); }
        @keyframes scTabPop{
          0%{ transform: translateY(0) scale(.86); }
          55%{ transform: translateY(-3px) scale(1.06); }
          100%{ transform: translateY(0) scale(1); }
        }
        /* the underline that marks where you are */
        .sc-tab-mark{
          position:absolute; top:0; height:2px; background:${T.hiviz};
          transition: left 260ms cubic-bezier(.22,.9,.24,1), width 260ms cubic-bezier(.22,.9,.24,1);
        }

        /* menu rows rise into place behind the panel, staggered */
        .sc-menu-item{ opacity:0; transform:translateY(1.4rem); animation:scMenuIn 420ms cubic-bezier(.17,.67,0,.87) forwards; }
        @keyframes scMenuIn{ to{ opacity:1; transform:translateY(0); } }
        @media (prefers-reduced-motion: reduce){
          .sc-burger-bar, .sc-burger-bar::before, .sc-burger-bar::after{ transition:none; }
          .sc-plus-bar, .sc-plus-bar::before{ transition:none; }
          .sc-menu-item{ animation:none; opacity:1; transform:none; }
          .sc-em-tap .sc-em-diamond, .sc-em-tap .sc-em-square, .sc-em-tap .sc-em-core{ animation:none; }
          .sc-em-breathe .sc-em-core{ animation:none; }
          .sc-em-asking .sc-em-core{ animation:none; }
          .sc-em-think .sc-em-diamond, .sc-em-think .sc-em-square, .sc-em-think .sc-em-core{ animation:none; }
          .sc-em-dream .sc-em-core, .sc-dream-dot,
          .sc-stream-text{ animation:none; }
          .sc-tab-ico, .sc-tab-pop{ transition:none; animation:none; }
          .sc-tab-mark{ transition:none; }
        }
        @keyframes scDropIn{ from{ opacity:0; transform:translateY(-8px); } to{ opacity:1; transform:translateY(0); } }
        .sc-drop{ animation:scDropIn .18s cubic-bezier(.22,.85,.3,1); }
        @keyframes scRailIn{ from{ transform:translateX(-100%); } to{ transform:translateX(0); } }
        @keyframes scPageIn{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
        .sc-rail{ animation:scRailIn .24s cubic-bezier(.22,.85,.3,1); will-change:transform; }
        @keyframes scRiseIn{ from{ transform:translateY(100%); } to{ transform:translateY(0); } }
        .sc-rise{ animation:scRiseIn .26s cubic-bezier(.22,.85,.3,1); will-change:transform; }
        .sc-fullpage{ animation:scPageIn .2s cubic-bezier(.22,.85,.3,1); }
        .sc-drawer{ animation:scDrawerIn .26s cubic-bezier(.22,.85,.3,1); will-change:transform; }
        .sc-scrim{ animation:scScrimIn .2s ease-out; }
        @media (prefers-reduced-motion: reduce){
          .sc-drawer,.sc-scrim,.sc-drop,.sc-rail,.sc-fullpage,.sc-rise{ animation:none; }
        }
        @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
          .sc-glass{ background:rgba(20,24,28,.96); }
        }
      `}</style>

      {/* ---- frosted glass header + processing bar ---- */}
      <div style={{ position: "sticky", top: 0, zIndex: setOpen ? 60 : 40 }}>
        <div className="px-2.5 flex items-center justify-between gap-2 sc-glass"
          style={{ height: 54, borderBottom: "none", boxShadow: "none" }}>
        <button onClick={() => { tapEmblem(); setTab("threads"); }}
          className="flex items-center gap-2 shrink-0" style={{ height: 44 }}>
          {/* the one mark. tap > working > dreaming — never two at once */}
          <Emblem key={`h${emTap}`} size={24} stroke={3}
            className={emTapping ? "sc-em-tap" : thinking ? "sc-em-think" : "sc-em-dream"} />
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: "#fff",
                         letterSpacing: ".08em", textTransform: "lowercase" }}>
            scopecrete<span style={{ color: T.hiviz }}>.ai</span>
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* search — expands a bar under the glass, not a row on the page */}
          <button onClick={() => { setSearchOpen((o) => !o); setPipeOpen(false); }} aria-label="Search"
            className="rounded-lg flex items-center justify-center sc-glass-btn"
            style={{ width: 32, height: 32, background: searchOpen ? "rgba(255,255,255,.22)" : undefined }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <circle cx="6.4" cy="6.4" r="4.5" fill="none" stroke="#fff" strokeWidth="1.6" />
              <path d="M9.8 9.8 L13.4 13.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          {/* pipeline — ascending bars, like signal strength */}
          <button onClick={() => { setPipeOpen((o) => !o); setSearchOpen(false); }} aria-label="Pipeline"
            className="rounded-lg flex items-end justify-center gap-[2.5px] sc-glass-btn"
            style={{ width: 32, height: 32, paddingBottom: 9,
                     background: pipeOpen ? "rgba(255,255,255,.22)" : undefined }}>
            {[5, 8, 11, 14].map((h, i) => (
              <span key={i} style={{ width: 3, height: h, borderRadius: 0.5,
                                     background: i === 3 ? T.hiviz : "#fff" }} />
            ))}
          </button>

          {/* + turns into the × that closes it, same as the burger */}
          <button onClick={() => { setCreateOpen((o) => !o); setSearchOpen(false); setPipeOpen(false); }}
            aria-label={createOpen ? "Close" : "Create"} aria-expanded={createOpen}
            className="sc-plus sc-glass-btn rounded-lg flex items-center justify-center"
            data-status={createOpen ? "open" : "closed"}
            style={{ width: 32, height: 32, position: "relative" }}>
            <span className="sc-plus-bar" aria-hidden="true" />
          </button>

          {/* burger, after Andy Bell: one centred bar with two pseudo-element
              bars above and below, which fold into an X while the menu is open */}
          <button onClick={() => setSetOpen((o) => !o)} className="sc-burger sc-glass-btn rounded-lg"
            data-status={setOpen ? "open" : "closed"}
            aria-expanded={setOpen} aria-label={setOpen ? "Close menu" : "Open menu"}
            style={{ width: 32, height: 32, position: "relative" }}>
            <span className="sc-burger-bar" aria-hidden="true" />
          </button>
        </div>
      </div>

        <StreamBar event={procEvent} dream={DREAM_LINES[dreamIdx]}
          variant={streamVariant} onOpen={() => openDusty(null)} />
        </div>{/* end sticky header wrapper */}

      {/* search bar — lives under the glass, same place on every page */}
      {searchOpen && (
        <div className="sticky z-30 px-2.5 py-2 sc-glass" style={{ top: 84 }}>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={SEARCH_HINT[tab] || "Search"}
            className="w-full px-2.5 rounded outline-none sc-search"
            style={{ height: 34, fontSize: F.sm, color: "#fff",
                     background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)" }} />
          {tab !== "threads" && (
            <div style={{ ...eyebrow, color: "rgba(255,255,255,.42)", marginTop: 5 }}>
              Searches threads today — the rest hooks up as each page lands
            </div>
          )}
        </div>
      )}

      <PipelineDrop open={pipeOpen} onClose={() => setPipeOpen(false)}
        onFull={() => { setPipeOpen(false); setFullPipe(true); }} p={pipe} />

      {tab === "cash" && (<>
      {/* ---- one summary row ---- */}
      <div className="flex items-stretch" style={{ background: T.dark }}>
        <Cell label="Runway" value={`${runway.toFixed(1)}mo`} color={runColor} onClick={() => setOhOpen(true)} sub={`−${moneyK(burn)}/mo`} />
        <div style={{ width: 1, background: T.darkHair, margin: "8px 0" }} />
        <Cell label="Cash" value={moneyK(cashNow)} sub={Math.abs(drift) > 100 ? `drift ${moneyK(drift)}` : null} />
        <div style={{ width: 1, background: T.darkHair, margin: "8px 0" }} />
        <Cell label="Owed you" value={moneyK(owed)} color="#5B93F0" />
      </div>

      {/* ---- WEEK BAND (above the ribbon) ---- */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div className="px-3 pt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => { setSelWeek(null); setPicked(null); }}
              style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, color: selWeek != null ? T.chalk : T.ink, letterSpacing: ".04em" }}>
              {MON[M.m].toUpperCase()} {M.y}
            </button>
            {selWeek != null && weeks[selWeek] && (
              <>
                <span style={{ color: T.ink3, fontSize: F.xs }}>›</span>
                <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, letterSpacing: ".04em" }}>
                  WK {parse(weeks[selWeek].start).d}
                </span>
              </>
            )}
            <span style={{ ...eyebrow, fontSize: 9 }}>{selWeek != null ? "days" : "weeks"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, ...nums, color: monthNet >= 0 ? T.green : T.red }}>
              {monthNet >= 0 ? "+" : ""}{moneyK(monthNet)}
            </span>
            <button onClick={() => setMode(mode === "cash" ? "accrual" : "cash")}
              style={{ ...eyebrow, fontSize: 9, color: T.chalk, border: `1px solid ${T.hair}`, borderRadius: 20, padding: "2px 7px" }}>
              {mode}
            </button>
          </div>
        </div>
        <div className="px-2 pb-1">
          <Band buckets={bandData} picked={picked} isDays={selWeek != null}
            onPick={(i) => {
              if (selWeek == null) { if (picked === i) { setSelWeek(i); setPicked(null); } else setPicked(i); }
              else setPicked(picked === i ? null : i);
            }} />
        </div>
      </div>

      {/* ---- MONTH RIBBON ---- */}
      <div style={{ background: T.card, marginTop: 6, borderTop: `1px solid ${T.hair}` }}>
        <div className="px-3 pt-1.5 pb-0.5 flex items-center justify-between">
          <span style={{ ...eyebrow, fontSize: 9 }}>Swipe · tap a month</span>
          <button onClick={() => setLegendOpen(!legendOpen)} className="flex items-center gap-1.5 rounded-full px-2"
            style={{ height: 22, border: `1px solid ${T.hair}` }}>
            <span style={{ width: 7, height: 7, background: T.ink }} />
            <span style={{ width: 7, height: 7, background: T.chalk }} />
            <span style={{ width: 7, height: 7, background: T.hivizDim, border: `1px solid ${T.hiviz}` }} />
            <span style={{ width: 7, height: 7, background: T.redDim, border: `1px solid ${T.red}` }} />
            <span style={{ ...eyebrow, fontSize: 9, color: T.ink2 }}>{legendOpen ? "hide" : "key"}</span>
          </button>
        </div>
        <Ribbon months={months} layers={layers} selected={selMonth}
          onSelect={(i) => { setSelMonth(i); setSelWeek(null); setPicked(null); }} />
      </div>

      {/* ---- legend, expanded ---- */}
      {legendOpen && (
        <div className="px-4 py-2" style={{ background: T.card, borderTop: `1px solid ${T.hairSoft}` }}>
          {[
            { k: "collected", sw: <span style={{ width: 11, height: 11, background: T.ink, display: "block" }} />, label: "Collected — cash landed", v: months.reduce((s, b) => s + b.collected, 0) },
            { k: "committed", sw: <span style={{ width: 11, height: 11, background: T.chalk, display: "block" }} />, label: "Committed — owed to you", v: months.reduce((s, b) => s + b.committed, 0) },
            { k: "projected", sw: <span style={{ width: 11, height: 11, background: T.hivizDim, border: `1.5px solid ${T.hiviz}`, display: "block" }} />, label: `Projected — quoted × ${CLOSE.rate}%`, v: months.reduce((s, b) => s + b.projected, 0) },
          ].map((r) => (
            <button key={r.k} onClick={() => setLayers((l) => ({ ...l, [r.k]: !l[r.k] }))}
              className="flex items-center gap-2 w-full" style={{ opacity: layers[r.k] ? 1 : .35, padding: "4px 0" }}>
              {r.sw}
              <span style={{ fontSize: F.sm, flex: 1, textAlign: "left" }}>{r.label}</span>
              <span style={{ fontFamily: disp, fontSize: F.md, ...nums }}>{moneyK(r.v)}</span>
            </button>
          ))}
          <div className="flex items-center gap-2" style={{ padding: "4px 0" }}>
            <span style={{ width: 11, height: 11, background: T.redDim, border: `1px solid ${T.red}`, display: "block" }} />
            <span style={{ fontSize: F.sm, flex: 1 }}>Out — costs, overhead, draw</span>
            <span style={{ fontFamily: disp, fontSize: F.md, color: T.red, ...nums }}>{moneyK(months.reduce((s, b) => s + b.totalOut, 0))}</span>
          </div>
          <button onClick={() => setLayers((l) => ({ ...l, net: !l.net }))}
            className="flex items-center gap-2 w-full" style={{ opacity: layers.net ? 1 : .35, padding: "4px 0", borderTop: `1px solid ${T.hairSoft}` }}>
            <svg width="11" height="11" style={{ overflow: "visible", flexShrink: 0 }}>
              <line x1="0" y1="5.5" x2="11" y2="5.5" stroke={T.pulse} strokeWidth="2" strokeDasharray="3 2.5" />
            </svg>
            <span style={{ fontSize: F.sm, flex: 1, textAlign: "left" }}>Cash position — what's left in the account</span>
            <span style={{ fontFamily: disp, fontSize: F.md, color: T.pulse, ...nums }}>{moneyK(cashNow)}</span>
          </button>
          <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4, paddingTop: 2 }}>
            The line runs forward from your last balance check. Its own scale, not the bars'.
          </div>
        </div>
      )}

      {/* ---- detail ---- */}
      {sel && (
        <div className="px-4 py-3" style={{ background: T.card, marginTop: 6 }}>
          <div className="flex items-baseline justify-between">
            <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, letterSpacing: ".03em" }}>
              {sel.isDay ? `${DOWL[dowOf(sel.start)]} ${MON[parse(sel.start).m]} ${parse(sel.start).d}`
                : `Week of ${MON[parse(sel.start).m]} ${parse(sel.start).d}${sel.partial ? " · partial" : ""}`}
            </div>
            <button onClick={() => setPicked(null)} style={{ fontSize: F.xs, color: T.ink3 }}>close</button>
          </div>
          {sel.events.in.length + sel.events.out.length === 0 &&
            <div style={{ fontSize: F.sm, color: T.ink3, padding: "6px 0" }}>Nothing moved.</div>}
          {sel.events.in.map((e, i) => (
            <div key={"i" + i} className="flex items-baseline justify-between" style={{ padding: "2.5px 0" }}>
              <span className="flex items-center gap-1.5" style={{ fontSize: F.sm, color: T.ink2 }}>
                <span style={{ width: 7, height: 7, background: e.kind === "collected" ? T.ink : T.chalkDim, border: e.kind === "collected" ? "none" : `1px solid ${T.chalk}` }} />
                {e.label}
              </span>
              <span style={{ fontFamily: disp, fontSize: F.md, color: e.kind === "collected" ? T.ink : T.chalk, ...nums }}>{money0(e.amount)}</span>
            </div>
          ))}
          {sel.events.out.map((e, i) => (
            <div key={"o" + i} className="flex items-baseline justify-between" style={{ padding: "2.5px 0" }}>
              <span className="flex items-center gap-1.5" style={{ fontSize: F.sm, color: T.ink2 }}>
                <span style={{ width: 7, height: 7, background: T.redDim, border: `1px solid ${T.red}` }} />{e.label}
              </span>
              <span style={{ fontFamily: disp, fontSize: F.md, color: T.red, ...nums }}>-{money0(e.amount)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between" style={{ marginTop: 5, paddingTop: 5, borderTop: `1.5px solid ${T.ink}` }}>
            <span style={{ fontFamily: disp, fontSize: F.md, letterSpacing: ".06em", textTransform: "uppercase" }}>Net</span>
            <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, ...nums, color: sel.totalIn - sel.totalOut >= 0 ? T.green : T.red }}>
              {money0(sel.totalIn - sel.totalOut)}
            </span>
          </div>
        </div>
      )}

      {/* ---- jobs ---- */}
      <div className="px-4 py-3" style={{ background: T.card, marginTop: 6 }}>
        <div style={eyebrow}>Won work</div>
        {JOBS.filter((j) => j.status === "won").map((j) => {
          const paid = PAYMENTS.filter((p) => p.job === j.id).reduce((s, p) => s + p.amount, 0);
          const ow = INVOICES.filter((i) => i.job === j.id && i.status === "sent").reduce((s, i) => s + i.amount, 0);
          return (
            <div key={j.id} className="py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div style={{ fontSize: F.sm, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.name}</div>
                  <div style={{ ...eyebrow, fontSize: 9 }}>{j.num} · {money0(j.total)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div style={{ fontFamily: disp, fontSize: F.md, color: M.inDark, ...nums }}>{moneyK(paid)} in</div>
                  {ow > 0 && <div style={{ fontSize: F.xs, color: T.chalk, ...nums }}>{moneyK(ow)} owed</div>}
                </div>
              </div>
              <div style={{ height: 4, background: T.hairSoft, position: "relative", overflow: "hidden", marginTop: 5 }}>
                <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, (paid / j.total) * 100)}%`, background: M.inLight, borderRadius: 2 }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.min(100, (paid / j.total) * 100)}%`,
                  width: `${Math.max(0, Math.min(100 - (paid / j.total) * 100, (ow / j.total) * 100))}%`, background: M.comLight, opacity: .6, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>

      <MoneySide onOpenDusty={openDusty} />

      <div className="px-4 py-5" style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5 }}>
        Mock data. Projection still spreads pipeline evenly — it needs an expected start date per quoted job.
      </div>
      </>)}

      {tab === "threads" && (
        <ThreadsScreen query={query} counts={pipe.counts} onScope={scopeFromThread}
          onCustomer={(t) => { setCustomerId(t.id); setTab("customer"); }}
          onAbout={(t) => openDusty({ label: t.name || t.phone, threadId: t.id })}
          onSort={(t) => openDusty({
            label: `an unsorted message from ${t.phone}`,
            prompts: ["This is Robin about the patio", "It's a vendor, file it", "Not work — ignore it"],
          })} />
      )}

      {tab === "scope" && (
        openScope ? (
          <ScopeScreen key={openScope.id} scope={openScope}
            thread={THREADS.find((x) => x.id === openScope.threadId) || null}
            onBack={() => setOpenScopeId(null)}
            onChange={(patch) => touchScope(openScope.id, patch)}
            onOpenDusty={() => openDusty(null)} onQuote={makeQuote}
            onAttach={() => setPickOpen(true)} />
        ) : (
          <ScopesScreen scopes={scopes} onOpen={(id) => setOpenScopeId(id)}
            onNew={() => newScope(null)}
            onDelete={(id) => { setScopes((all) => all.filter((x) => x.id !== id)); flash("Scope deleted"); }} />
        )
      )}

      {tab === "more" && (
        <MoreScreen onGo={(k) => setTab(k)} onPipeline={() => setFullPipe(true)}
          streamVariant={streamVariant} setStreamVariant={setStreamVariant} />
      )}

      {tab === "docs" && (
        activeDocId ? (
          <DocView doc={docs.find((d) => d.id === activeDocId)}
            thread={THREADS.find((t) => t.id === docs.find((d) => d.id === activeDocId)?.threadId) || THREADS[0]}
            onBack={() => setActiveDocId(null)}
            onUpdate={(d) => setDocs((ds) => ds.map((x) => (x.id === d.id ? d : x)))}
            flash={flash} />
        ) : (
          <DocsScreen docs={docs} onOpen={(id) => setActiveDocId(id)}
            onBack={() => setTab("more")} flash={flash} />
        )
      )}

      {tab === "customer" && (
        <CustomerScreen thread={THREADS.find((t) => t.id === customerId)}
          onBack={() => { setCustomerId(null); setTab(lastTab.current); }}
          onScope={scopeFromThread}
          onAbout={(t) => openDusty({ label: t.name || t.phone, threadId: t.id })}
          onOpenDusty={openDusty} />
      )}

      {tab === "customers" && (
        <CustomersScreen onBack={() => setTab("more")}
          onOpen={(t) => { setCustomerId(t.id); setTab("customer"); }} />
      )}

      {tab === "schedule" && (
        <ScheduleScreen onBack={() => setTab("more")} onOpenDusty={openDusty} />
      )}

      {MORE_TABS.includes(tab) && tab !== "docs" && tab !== "schedule" && tab !== "customers" && (
        <TabStub tab={tab} onCreate={() => setCreateOpen(true)}
          onBack={() => setTab("more")} />
      )}

      {/* ---- footer nav: Dusty dead center, More bottom right ----
           Tapping is the most repeated gesture in the app, so the motion is
           short and happens once: the icon gives way under the thumb, the
           newly current tab rises, and the rule slides to meet it. */}
      <div className="fixed bottom-0 left-0 right-0 flex items-stretch z-30"
        style={{ background: T.card, borderTop: `1px solid ${T.hair}`, height: 58,
                 paddingBottom: "env(safe-area-inset-bottom)", position: "fixed" }}>
        <span className="sc-tab-mark" style={{ left: `${markIdx * 20}%`, width: "20%" }} aria-hidden="true" />
        {[
          { k: "threads", label: "Threads" },
          { k: "scope", label: "Scope" },
          { k: "dusty" },
          { k: "cash", label: "Cash" },
          { k: "more", label: "More" },
        ].map((t) => {
          if (t.k === "dusty") {
            /* the emblem carries it — no word underneath */
            return (
              <button key={t.k} onClick={() => { tapEmblem(); openDusty(null); }}
                aria-label={thinking ? "Dusty — working"
                  : asks.length > 0 ? `Dusty — ${asks.length} question${asks.length > 1 ? "s" : ""} for you` : "Dusty"}
                className="sc-tab flex-1 flex items-center justify-center">
                <span className="sc-tab-ico">
                  {/* still / breathing / asking / working. No badge: the mark
                      quickens when Dusty has questions and settles when it
                      does not, so it keeps one voice. */}
                  <Emblem key={emTap} size={30} stroke={2.8}
                    className={emTapping ? "sc-em-tap"
                      : thinking ? "sc-em-think"
                      : (asks.length > 0 ? "sc-em-breathe sc-em-asking" : "")} />
                </span>
              </button>
            );
          }
          const active = t.k === "more"
            ? (tab === "more" || MORE_TABS.includes(tab))
            : tab === t.k;
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              aria-current={active ? "page" : undefined}
              className="sc-tab flex-1 flex flex-col items-center justify-center gap-1">
              <span className={`sc-tab-ico${active ? " sc-tab-pop" : ""}`} key={`${t.k}-${active}`}
                style={{ position: "relative" }}>
                <NavIcon k={t.k} on={active} />
                {/* counts replies owed, not unread — a number you can clear */}
                {t.k === "threads" && needsCount > 0 && (
                  <span className="absolute rounded-full flex items-center justify-center"
                    style={{ top: -4, left: "calc(50% + 4px)", minWidth: 14, height: 14, padding: "0 3px",
                             background: T.hiviz, color: "#fff", fontFamily: disp, fontSize: 9.5,
                             fontWeight: 700, ...nums, lineHeight: 1 }}>{needsCount}</span>
                )}
              </span>
              <span className="sc-tab-lbl" style={{ ...eyebrow, fontSize: 9, color: active ? T.ink : T.ink3 }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      <OverheadSheet open={ohOpen} onClose={() => setOhOpen(false)} items={overhead} setItems={setOverhead} nut={nut} />
      <SettingsSheet open={setOpen} onClose={() => setSetOpen(false)}
        home={home} setHome={setHome}
        onFixedCosts={() => { setSetOpen(false); setOhOpen(true); }}
        onAccount={() => { setSetOpen(false); setUserOpen(true); }} />
      <DustyScreen open={dustyOpen} onClose={() => { setDustyOpen(false); setDustyCtx(null); }}
        context={pageContext} asks={asks}
        onAsk={(a) => {
          if (a.threadId) {
            const t = THREADS.find((x) => x.id === a.threadId);
            openDusty({ label: t.name || t.phone, threadId: t.id });
          } else if (a.unsorted) {
            setTab("threads");
            openDusty({ label: "the unsorted messages",
              prompts: ["Who are these from?", "File them for me", "Anything urgent in there?"] });
          }
        }}
        onOpenThread={() => { setDustyOpen(false); setDustyCtx(null); setTab("threads"); }} />
      <CreateDrop open={createOpen} onClose={() => setCreateOpen(false)} />
      <UserSheet open={userOpen} onClose={() => setUserOpen(false)}
        onBack={() => { setUserOpen(false); setSetOpen(true); }} />
      <PipelinePanel open={fullPipe} onClose={() => setFullPipe(false)} p={pipe} />

      {/* attaching keeps the scope you already built — no seq bump, no remount */}
      <CustomerPicker open={pickOpen} onClose={() => setPickOpen(false)}
        onPick={(t) => {
          if (openScope) touchScope(openScope.id, { threadId: t.id });
          setPickOpen(false); flash(`Scope attached to ${t.name || t.phone}`);
        }}
        onNew={() => { setPickOpen(false); setCreateOpen(true); }} />

      {toast && (
        <div className="fixed left-1/2 z-50 px-3 py-2 rounded"
          style={{ bottom: 96, transform: "translateX(-50%)", background: T.ink, color: "#fff",
                   fontSize: F.sm, whiteSpace: "nowrap", boxShadow: "0 6px 20px rgba(10,14,18,.28)" }}>{toast}</div>
      )}
    </div>
  );
}
