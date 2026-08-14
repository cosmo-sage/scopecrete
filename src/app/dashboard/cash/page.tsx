"use client";

/* ============================================================
   ScopeCrete — Cash Flow
   Ported from the v12 mock (scopecrete-v12-cashflow.jsx). The
   aggregation math (bucket/weeksOf/daysOf/overheadHits/drawHits)
   is unchanged from that spec — only the data source moved from
   hardcoded mock arrays to /api/dashboard/cashflow, which reads
   jobs/invoices/payments/receipts/overhead_items/org_cost_settings/
   balance_checkpoints.

   Layout, top to bottom (see DECISIONS.md §5-6):
     ScopeCrete header      sticky, on every page
     Summary row            runway / cash / owed, one strip
     Week band              the open month, broken into weeks
     Month ribbon            continuous, swipeable, tap to open
     Legend                 collapsed to a chip
     Detail / jobs
   Footer nav is the shared dashboard tab bar (src/app/dashboard/layout.tsx),
   not a page-local one — v12's own footer nav was dropped here so there's
   only one tab bar on screen.
   ============================================================ */

import { useState, useMemo, useRef, useEffect } from "react";

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
const F = { xxl: 34, xl: 26, lg: 19, md: 15, sm: 13, xs: 11, micro: 9.5 };
const disp = "'Barlow Condensed', system-ui, sans-serif";
const body = "'IBM Plex Sans', system-ui, sans-serif";
const eyebrow = { fontFamily: disp, fontSize: F.micro, letterSpacing: ".14em", textTransform: "uppercase" as const, color: T.ink3, lineHeight: 1.3 };
const nums = { fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("en-US");
const moneyK = (n: number) => {
  const v = Math.abs(Number(n) || 0), s = n < 0 ? "-" : "";
  return v >= 1000 ? s + "$" + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k" : s + "$" + Math.round(v);
};

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOWL = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DOW = ["M","T","W","T","F","S","S"];
const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; };
const dnum = (s: string) => { const { y, m, d } = parse(s); return Date.UTC(y, m, d) / 86400000; };
const fromNum = (n: number) => { const t = new Date(n * 86400000); return key(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
const dowOf = (s: string) => { const { y, m, d } = parse(s); return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; };
const mondayOf = (s: string) => fromNum(dnum(s) - dowOf(s));
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/* ============================================================ types (shape of /api/dashboard/cashflow) */
interface Job { id: string; num: string; name: string; status: string; total: number }
interface Invoice { id: string; job: string; label: string; amount: number; due_on: string; status: string }
interface Payment { id: string; inv: string; job: string; amount: number; received_on: string }
interface Receipt { id: string; job: string; vendor: string; amount: number; on: string; type: string }
interface OverheadItem { id: string; label: string; category: string; amount: number; cadence: string; due_day: number | null; due_month: number | null; active: boolean }
interface Comp { mode: "fixed_draw" | "pct_profit"; monthly_draw: number; draw_day: number; profit_pct: number }
interface Anchor { as_of: string; balance: number; expected: number }
interface Close { rate: number; sample: number }
interface CashflowData {
  today: string; anchor: Anchor; jobs: Job[]; invoices: Invoice[]; payments: Payment[];
  receipts: Receipt[]; overhead: OverheadItem[]; comp: Comp; offTopPct: number; close: Close;
}

/* ============================================================ EMBLEM */
const Emblem = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
    <rect x="4" y="4" width="92" height="92" fill="none" stroke={T.ink} strokeWidth="7" />
    <rect x="22" y="22" width="56" height="56" fill="none" stroke={T.hiviz} strokeWidth="7" />
    <rect x="38" y="38" width="24" height="24" fill={T.ink} />
  </svg>
);

/* ============================================================ RIBBON */
function Ribbon({ months, layers, selected, onSelect, anchor, today, nowIdx }: any) {
  const MW = 54, H = 158, padT = 14, padB = 22;
  const W = months.length * MW, plotH = H - padT - padB;
  const axisY = padT + plotH * 0.58;
  const upH = axisY - padT, dnH = padT + plotH - axisY;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = nowIdx * MW + MW / 2 - el.clientWidth / 2; }, [nowIdx]);

  const maxIn = Math.max(...months.map((b: any) =>
    (layers.collected ? b.collected : 0) + (layers.committed ? b.committed : 0) + (layers.projected ? b.projected : 0)), 1);
  const maxOut = Math.max(...months.map((b: any) => b.totalOut), 1);
  const barW = 24;

  let run = anchor.balance;
  const pts = months.map((b: any, i: number) => {
    if (dnum(b.end) >= dnum(anchor.as_of)) run += b.collected + b.committed - b.totalOut;
    return { x: MW * i + MW / 2, v: run, past: dnum(b.end) <= dnum(today) };
  });
  const lo = Math.min(0, ...pts.map((p: any) => p.v)), hi = Math.max(anchor.balance, ...pts.map((p: any) => p.v));
  const netY = (v: number) => padT + plotH - ((v - lo) / Math.max(hi - lo, 1)) * plotH;

  return (
    <div ref={scroller} style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch", background: T.card }}>
      <svg width={W} height={H} style={{ display: "block" }}>
        <defs>
          <pattern id="h12" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill={T.hivizDim} />
            <line x1="0" y1="0" x2="0" y2="5" stroke={T.hiviz} strokeWidth="1.6" opacity=".5" />
          </pattern>
        </defs>
        {months.map((b: any, i: number) => {
          const jan = parse(b.start).m === 0;
          return (
            <g key={"bg" + b.id}>
              {selected === i && <rect x={MW * i} y={0} width={MW} height={H - 16} fill={T.hairSoft} />}
              {jan && <line x1={MW * i} y1={2} x2={MW * i} y2={H - 16} stroke={T.hair} strokeWidth="1" />}
              {jan && <text x={MW * i + 3} y={10} style={{ fontFamily: disp, fontSize: 9, fill: T.ink3, letterSpacing: ".1em" }}>{parse(b.start).y}</text>}
              {i === nowIdx && <rect x={MW * i} y={0} width={MW} height={H - 16} fill="none" stroke={T.hiviz} strokeWidth="1" strokeDasharray="3 3" />}
            </g>
          );
        })}
        <line x1={0} y1={axisY} x2={W} y2={axisY} stroke={T.ink} strokeWidth="1.25" />
        {months.map((b: any, i: number) => {
          const cx = MW * i + MW / 2, x = cx - barW / 2, sel = selected === i;
          let y = axisY; const seg: any[] = [];
          if (layers.collected && b.collected > 0) { const h = (b.collected / maxIn) * upH; y -= h; seg.push({ y, h, fill: T.ink }); }
          if (layers.committed && b.committed > 0) { const h = (b.committed / maxIn) * upH; y -= h; seg.push({ y, h, fill: T.chalk }); }
          if (layers.projected && b.projected > 0) { const h = (b.projected / maxIn) * upH; y -= h; seg.push({ y, h, fill: "url(#h12)" }); }
          const outH = (b.totalOut / maxOut) * dnH * 0.85;
          return (
            <g key={b.id} onClick={() => onSelect(i)} style={{ cursor: "pointer" }}>
              <rect x={MW * i} y={0} width={MW} height={H} fill="transparent" />
              {seg.map((s, k) => <rect key={k} x={x} y={s.y} width={barW} height={s.h} fill={s.fill} />)}
              {b.totalOut > 0 && <rect x={x} y={axisY} width={barW} height={outH} fill={T.redDim} stroke={T.red} strokeWidth=".75" />}
              <text x={cx} y={H - 5} textAnchor="middle"
                style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".04em",
                  fill: i === nowIdx ? T.hiviz : sel ? T.ink : T.ink3, fontWeight: sel || i === nowIdx ? 700 : 400 }}>{b.label}</text>
            </g>
          );
        })}
        {layers.net && (
          <>
            <polyline fill="none" stroke={T.pulse} strokeWidth="1.6" strokeDasharray="3 2.5"
              points={pts.map((p: any) => `${p.x},${netY(p.v)}`).join(" ")} />
            {pts.map((p: any, i: number) => <circle key={i} cx={p.x} cy={netY(p.v)} r="2" fill={T.pulse} opacity={p.past ? 1 : .5} />)}
          </>
        )}
      </svg>
    </div>
  );
}

/* ============================================================ BAND */
function Band({ buckets, picked, onPick, isDays, today }: any) {
  const H = 118, padT = 8, padB = 24;
  const plotH = H - padT - padB, axisY = padT + plotH / 2;
  const max = Math.max(...buckets.map((b: any) => Math.max(b.collected + b.committed + b.projected, b.totalOut)), 1);
  const n = buckets.length, W = 340, slot = W / n, bw = Math.min(isDays ? 20 : 40, slot * 0.6);
  const half = plotH / 2 - 3;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <line x1={0} y1={axisY} x2={W} y2={axisY} stroke={T.hair} strokeWidth="1" />
      {buckets.map((b: any, i: number) => {
        const cx = slot * i + slot / 2, x = cx - bw / 2, sel = picked === i;
        const isNow = dnum(today) >= dnum(b.start) && dnum(today) <= dnum(b.end);
        let y = axisY; const seg: any[] = [];
        if (b.collected > 0) { const h = (b.collected / max) * half; y -= h; seg.push({ y, h, fill: T.ink }); }
        if (b.committed > 0) { const h = (b.committed / max) * half; y -= h; seg.push({ y, h, fill: T.chalk }); }
        if (b.projected > 0) { const h = (b.projected / max) * half; y -= h; seg.push({ y, h, fill: "url(#h12)" }); }
        const outH = (b.totalOut / max) * half;
        const net = b.totalIn - b.totalOut, quiet = b.totalIn === 0 && b.totalOut === 0;
        return (
          <g key={b.id} onClick={() => onPick(i)} style={{ cursor: "pointer" }}>
            <rect x={slot * i} y={0} width={slot} height={H} fill={sel ? T.hairSoft : "transparent"} />
            {seg.map((s, k) => <rect key={k} x={x} y={s.y} width={bw} height={s.h} fill={s.fill} />)}
            {b.totalOut > 0 && <rect x={x} y={axisY} width={bw} height={outH} fill={T.redDim} stroke={T.red} strokeWidth=".75" />}
            {quiet && <circle cx={cx} cy={axisY} r="2" fill={T.hair} />}
            <text x={cx} y={H - 12} textAnchor="middle"
              style={{ fontFamily: disp, fontSize: 10, fill: isNow ? T.hiviz : sel ? T.ink : T.ink3, fontWeight: isNow ? 700 : 400 }}>{b.label}</text>
            {!quiet && (
              <text x={cx} y={H - 2} textAnchor="middle"
                style={{ fontFamily: disp, fontSize: 9.5, ...nums, fill: net >= 0 ? T.green : T.red }}>
                {net >= 0 ? "+" : ""}{moneyK(net)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================ SHEETS */
function OverheadSheet({ open, onClose, items, nut, comp, offTopPct }: any) {
  if (!open) return null;
  const CAT: Record<string, string> = { fixed: T.chalk, equipment: T.hiviz, insurance: T.violet, variable: T.ink3 };
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: "rgba(18,22,26,.44)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-t-2xl"
        style={{ background: T.card, maxHeight: "86vh", overflowY: "auto", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="sticky top-0 px-4 pt-3 pb-2.5" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <div style={eyebrow}>Fixed costs · where the floor comes from</div>
          <div className="flex items-baseline justify-between mt-0.5">
            <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1 }}>Monthly overhead</div>
            <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, color: T.hiviz, ...nums, lineHeight: 1 }}>{money0(nut)}</div>
          </div>
        </div>
        <div className="px-4 py-1">
          {items.length === 0 && (
            <div style={{ fontSize: F.sm, color: T.ink3, padding: "12px 0" }}>No fixed costs entered yet.</div>
          )}
          {items.map((o: OverheadItem) => (
            <div key={o.id} className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <span className="rounded-full shrink-0" style={{ width: 34, height: 20, background: o.active ? T.ink : "#C6CCD3", position: "relative" }}>
                <span className="absolute rounded-full" style={{ width: 16, height: 16, background: "#fff", top: 2, left: o.active ? 16 : 2 }} />
              </span>
              <span style={{ width: 3, height: 22, background: CAT[o.category] || T.ink3, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: F.sm, color: o.active ? T.ink : T.ink3 }}>{o.label}</div>
                <div style={{ ...eyebrow, fontSize: 9 }}>
                  {o.cadence}{o.cadence === "monthly" ? ` · day ${o.due_day ?? "—"}` : ` · ${MON[(o.due_month || 1) - 1]} ${o.due_day ?? "—"}`}
                </div>
              </div>
              <div style={{ fontFamily: disp, fontSize: F.md, color: o.active ? T.ink : T.ink3, ...nums }}>{money0(o.amount)}</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3" style={{ background: T.hairSoft, marginTop: 8 }}>
          <div className="flex items-baseline justify-between">
            <div style={{ fontSize: F.sm }}>Your draw · day {comp.draw_day}</div>
            <div style={{ fontFamily: disp, fontSize: F.lg, ...nums }}>{money0(comp.monthly_draw)}</div>
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <div style={{ fontSize: F.sm }}>Off the top</div>
            <div style={{ fontFamily: disp, fontSize: F.lg, ...nums }}>{offTopPct}%</div>
          </div>
        </div>
        <div className="px-4 pb-5 pt-3">
          <button onClick={onClose} className="w-full rounded-lg"
            style={{ height: 44, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.md, letterSpacing: ".08em", textTransform: "uppercase" }}>Done</button>
        </div>
      </div>
    </div>
  );
}

function SettingsSheet({ open, onClose, onFixedCosts }: any) {
  if (!open) return null;
  const rows = [
    { label: "Fixed costs & overhead", sub: "What the business burns every month", go: onFixedCosts },
    { label: "Pay yourself", sub: "Fixed draw or share of profit" },
    { label: "Rates & markup", sub: "Per-sqft labor, materials, per-cost-type margin" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: "rgba(18,22,26,.44)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-t-2xl"
        style={{ background: T.card, maxHeight: "80vh", overflowY: "auto", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
          <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600 }}>Settings</div>
        </div>
        {rows.map((r) => (
          <button key={r.label} onClick={r.go} className="w-full text-left px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
            <div>
              <div style={{ fontSize: F.sm, fontWeight: 600 }}>{r.label}</div>
              <div style={{ fontSize: F.xs, color: T.ink2 }}>{r.sub}</div>
            </div>
            <span style={{ color: T.ink3 }}>{">"}</span>
          </button>
        ))}
        <div className="px-4 py-4">
          <button onClick={onClose} className="w-full rounded-lg"
            style={{ height: 44, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.md, letterSpacing: ".08em", textTransform: "uppercase" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ MAIN */
export default function CashFlow() {
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [selMonth, setSelMonth] = useState<number | null>(null);
  const [selWeek, setSelWeek] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [layers, setLayers] = useState({ collected: true, committed: true, projected: true, net: true });
  const [legendOpen, setLegendOpen] = useState(false);
  const [mode, setMode] = useState<"cash" | "accrual">("accrual");
  const [ohOpen, setOhOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);

  // org_id is resolved server-side from the session — never sent by the client.
  useEffect(() => {
    fetch("/api/dashboard/cashflow")
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          setAuthError(r.status === 401 ? "Sign in to see your cash flow." : "Your account isn't attached to an org yet.");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, []);

  const TODAY = data?.today || new Date().toISOString().slice(0, 10);
  const { RIBBON, NOW_IDX } = useMemo(() => {
    const { y, m } = parse(TODAY), out: { y: number; m: number }[] = [];
    for (let i = -14; i <= 10; i++) { const t = y * 12 + m + i; out.push({ y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }); }
    return { RIBBON: out, NOW_IDX: 14 };
  }, [TODAY]);

  useEffect(() => { if (selMonth === null) setSelMonth(NOW_IDX); }, [NOW_IDX, selMonth]);

  // ---- aggregation (unchanged from v12; reads live data instead of mock consts) ----
  const jobs = data?.jobs ?? [];
  const invoices = data?.invoices ?? [];
  const payments = data?.payments ?? [];
  const receipts = data?.receipts ?? [];
  const overhead = data?.overhead ?? [];
  const comp = data?.comp ?? { mode: "fixed_draw" as const, monthly_draw: 0, draw_day: 28, profit_pct: 0 };
  const anchor = data?.anchor ?? { as_of: TODAY, balance: 0, expected: 0 };
  const close = data?.close ?? { rate: 0, sample: 0 };

  const paidByInv = useMemo(() => {
    const m: Record<string, number> = {};
    payments.forEach((p) => { m[p.inv] = (m[p.inv] || 0) + p.amount; });
    return m;
  }, [payments]);

  const overheadHits = (items: OverheadItem[], s: string, e: string) => {
    const hits: any[] = [];
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
  };
  const drawHits = (s: string, e: string) => {
    if (comp.mode !== "fixed_draw") return [];
    const hits: any[] = [];
    for (let n = dnum(s); n <= dnum(e); n++) {
      const iso = fromNum(n);
      if (parse(iso).d === comp.draw_day) hits.push({ label: "Your draw", amount: comp.monthly_draw, on: iso, kind: "draw" });
    }
    return hits;
  };
  const bucket = (start: string, end: string, label: string, sub: string | null, overheadItems: OverheadItem[], showProjected: boolean, allowProjected: boolean) => {
    const inR = (d: string) => dnum(d) >= dnum(start) && dnum(d) <= dnum(end);
    const pays = payments.filter((p) => inR(p.received_on));
    const collected = pays.reduce((s, p) => s + p.amount, 0);
    let committed = 0; const commits: any[] = [];
    invoices.forEach((inv) => {
      const outstanding = inv.amount - (paidByInv[inv.id] || 0);
      if (outstanding <= 0 || inv.status === "draft") return;
      if (inR(inv.due_on)) { committed += outstanding; commits.push({ ...inv, outstanding }); }
    });
    let projected = 0;
    if (showProjected && allowProjected && dnum(end) > dnum(TODAY)) {
      const pipeline = jobs.filter((j) => j.status === "quoted").reduce((s, j) => s + j.total, 0) * (close.rate / 100);
      projected = (pipeline / 120) * (dnum(end) - dnum(start) + 1);
    }
    const recs = receipts.filter((r) => inR(r.on));
    const oh = overheadHits(overheadItems, start, end), dr = drawHits(start, end);
    const costOut = recs.reduce((s, r) => s + r.amount, 0);
    const overheadOut = oh.reduce((s, h) => s + h.amount, 0);
    const drawOut = dr.reduce((s, h) => s + h.amount, 0);
    return {
      id: start, start, end, label, sub, collected, committed, projected,
      costOut, overheadOut, drawOut,
      totalIn: collected + committed + projected,
      totalOut: costOut + overheadOut + drawOut,
      events: {
        in: [
          ...pays.map((p) => ({ label: (jobs.find((j) => j.id === p.job) || {} as any).num + " payment", amount: p.amount, kind: "collected" })),
          ...commits.map((c) => ({ label: (jobs.find((j) => j.id === c.job) || {} as any).num + " " + c.label.toLowerCase() + " due", amount: c.outstanding, kind: "committed" })),
        ],
        out: [...recs.map((r) => ({ label: r.vendor, amount: r.amount, kind: r.type })), ...oh, ...dr],
      },
    };
  };
  const monthBucket = (y: number, m: number, oh: OverheadItem[], sp: boolean) => bucket(key(y, m, 1), key(y, m, lastDay(y, m)), MON[m], null, oh, sp, true);
  const weeksOf = (y: number, m: number, oh: OverheadItem[], sp: boolean) => {
    const first = key(y, m, 1), last = key(y, m, lastDay(y, m)), out: any[] = [];
    let cur = mondayOf(first);
    while (dnum(cur) <= dnum(last)) {
      const wkEnd = fromNum(dnum(cur) + 6);
      const s = dnum(cur) < dnum(first) ? first : cur, e = dnum(wkEnd) > dnum(last) ? last : wkEnd;
      const b: any = bucket(s, e, `${parse(s).d}–${parse(e).d}`, null, oh, sp, true);
      b.weekStart = cur; b.partial = s !== cur || e !== wkEnd;
      out.push(b); cur = fromNum(dnum(cur) + 7);
    }
    return out;
  };
  const daysOf = (weekStart: string, oh: OverheadItem[]) => Array.from({ length: 7 }, (_, i) => {
    const d = fromNum(dnum(weekStart) + i);
    const b: any = bucket(d, d, DOW[i], String(parse(d).d), oh, false, false);
    b.isDay = true; return b;
  });

  const months = useMemo(() => RIBBON.map((r) => monthBucket(r.y, r.m, overhead, layers.projected)),
    [RIBBON, overhead, layers.projected, jobs, invoices, payments, receipts, close, comp]);
  const curSelMonth = selMonth ?? NOW_IDX;
  const M = RIBBON[curSelMonth] || RIBBON[NOW_IDX];
  const weeks = useMemo(() => (M ? weeksOf(M.y, M.m, overhead, layers.projected) : []),
    [M, overhead, layers.projected, jobs, invoices, payments, receipts, close, comp]);
  const days = useMemo(() => (selWeek != null && weeks[selWeek] ? daysOf(weeks[selWeek].weekStart, overhead) : []),
    [selWeek, weeks, overhead]);
  const bandData = selWeek != null ? days : weeks;
  const sel = picked != null ? bandData[picked] : null;

  const nut = useMemo(() => overhead.filter((o) => o.active)
    .reduce((s, o) => s + (o.cadence === "monthly" ? o.amount : o.cadence === "quarterly" ? o.amount / 3 : o.amount / 12), 0), [overhead]);
  const burn = nut + (comp.mode === "fixed_draw" ? comp.monthly_draw : 0);
  const since = (d: string) => dnum(d) > dnum(anchor.as_of) && dnum(d) <= dnum(TODAY);
  const cashNow = anchor.balance
    + payments.filter((p) => since(p.received_on)).reduce((s, p) => s + p.amount, 0)
    - receipts.filter((r) => since(r.on)).reduce((s, r) => s + r.amount, 0)
    - overheadHits(overhead, fromNum(dnum(anchor.as_of) + 1), TODAY).reduce((s, h) => s + h.amount, 0)
    - drawHits(fromNum(dnum(anchor.as_of) + 1), TODAY).reduce((s, h) => s + h.amount, 0);
  const runway = burn > 0 ? cashNow / burn : 0;
  const drift = anchor.balance - anchor.expected;
  const owed = invoices.reduce((s, i) => s + (i.status === "sent" ? i.amount - (paidByInv[i.id] || 0) : 0), 0);
  const monthNet = months[curSelMonth] ? months[curSelMonth].totalIn - months[curSelMonth].totalOut : 0;
  const runColor = runway < 1 ? "#FF6B4A" : runway < 2 ? T.hiviz : T.pulse;

  if (authError) {
    return (
      <div style={{ fontFamily: body, background: T.slab, minHeight: "100vh", color: T.ink }}>
        <div className="sticky top-0 z-30 px-3 flex items-center" style={{ height: 46, background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <Emblem size={20} />
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, marginLeft: 8 }}>SCOPE<span style={{ color: T.hiviz }}>CRETE</span></span>
        </div>
        <div style={{ padding: 24, fontSize: F.sm, color: T.ink2 }}>{authError}</div>
      </div>
    );
  }

  if (loading || !M) {
    return (
      <div style={{ fontFamily: body, background: T.slab, minHeight: "100vh", color: T.ink }}>
        <div className="sticky top-0 z-30 px-3 flex items-center" style={{ height: 46, background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <Emblem size={20} />
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, marginLeft: 8 }}>SCOPE<span style={{ color: T.hiviz }}>CRETE</span></span>
        </div>
        <div style={{ padding: 24, fontSize: F.sm, color: T.ink3 }}>Loading cash flow…</div>
      </div>
    );
  }

  const Cell = ({ label, value, color, onClick, sub }: { label: string; value: string; color?: string; onClick?: () => void; sub?: string | null }) => (
    <button onClick={onClick} className="flex-1 text-left px-3 py-2" style={{ minWidth: 0 }}>
      <div style={{ ...eyebrow, color: "#78838F", fontSize: 9 }}>{label}</div>
      <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, color: color || "#fff", lineHeight: 1.05, ...nums }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: "#78838F", ...nums }}>{sub}</div>}
    </button>
  );

  return (
    <div style={{ fontFamily: body, background: T.slab, minHeight: "100vh", color: T.ink }}>
      <style>{`*{-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{height:0}`}</style>

      {/* ---- ScopeCrete header: sticky, every page ---- */}
      <div className="sticky top-0 z-30 px-3 flex items-center justify-between"
        style={{ height: 46, background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2">
          <Emblem size={20} />
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, letterSpacing: ".02em" }}>
            SCOPE<span style={{ color: T.hiviz }}>CRETE</span>
          </span>
        </div>
        <button onClick={() => setSetOpen(true)} className="flex flex-col items-center justify-center gap-[3px]"
          style={{ width: 30, height: 30 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 15, height: 1.5, background: T.ink }} />)}
        </button>
      </div>

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
                <span style={{ color: T.ink3, fontSize: F.xs }}>{">"}</span>
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
          <Band buckets={bandData} picked={picked} isDays={selWeek != null} today={TODAY}
            onPick={(i: number) => {
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
        <Ribbon months={months} layers={layers} selected={curSelMonth} anchor={anchor} today={TODAY} nowIdx={NOW_IDX}
          onSelect={(i: number) => { setSelMonth(i); setSelWeek(null); setPicked(null); }} />
      </div>

      {/* ---- legend, expanded ---- */}
      {legendOpen && (
        <div className="px-4 py-2" style={{ background: T.card, borderTop: `1px solid ${T.hairSoft}` }}>
          {[
            { k: "collected", sw: <span style={{ width: 11, height: 11, background: T.ink, display: "block" }} />, label: "Collected — cash landed", v: months.reduce((s, b) => s + b.collected, 0) },
            { k: "committed", sw: <span style={{ width: 11, height: 11, background: T.chalk, display: "block" }} />, label: "Committed — owed to you", v: months.reduce((s, b) => s + b.committed, 0) },
            { k: "projected", sw: <span style={{ width: 11, height: 11, background: T.hivizDim, border: `1.5px solid ${T.hiviz}`, display: "block" }} />, label: `Projected — quoted × ${close.rate}%${close.sample < 5 ? " (provisional)" : ""}`, v: months.reduce((s, b) => s + b.projected, 0) },
          ].map((r) => (
            <button key={r.k} onClick={() => setLayers((l) => ({ ...l, [r.k]: !(l as any)[r.k] }))}
              className="flex items-center gap-2 w-full" style={{ opacity: (layers as any)[r.k] ? 1 : .35, padding: "4px 0" }}>
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
          {sel.events.in.map((e: any, i: number) => (
            <div key={"i" + i} className="flex items-baseline justify-between" style={{ padding: "2.5px 0" }}>
              <span className="flex items-center gap-1.5" style={{ fontSize: F.sm, color: T.ink2 }}>
                <span style={{ width: 7, height: 7, background: e.kind === "collected" ? T.ink : T.chalkDim, border: e.kind === "collected" ? "none" : `1px solid ${T.chalk}` }} />
                {e.label}
              </span>
              <span style={{ fontFamily: disp, fontSize: F.md, color: e.kind === "collected" ? T.ink : T.chalk, ...nums }}>{money0(e.amount)}</span>
            </div>
          ))}
          {sel.events.out.map((e: any, i: number) => (
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
        {jobs.filter((j) => j.status === "won").length === 0 && (
          <div style={{ fontSize: F.sm, color: T.ink3, padding: "8px 0" }}>No won jobs yet.</div>
        )}
        {jobs.filter((j) => j.status === "won").map((j) => {
          const paid = payments.filter((p) => p.job === j.id).reduce((s, p) => s + p.amount, 0);
          const ow = invoices.filter((i) => i.job === j.id && i.status === "sent").reduce((s, i) => s + i.amount, 0);
          const pct = j.total > 0 ? paid / j.total : 0;
          return (
            <div key={j.id} className="py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div style={{ fontSize: F.sm, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.name}</div>
                  <div style={{ ...eyebrow, fontSize: 9 }}>{j.num} · {money0(j.total)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div style={{ fontFamily: disp, fontSize: F.md, color: T.green, ...nums }}>{moneyK(paid)} in</div>
                  {ow > 0 && <div style={{ fontSize: F.xs, color: T.chalk, ...nums }}>{moneyK(ow)} owed</div>}
                </div>
              </div>
              <div style={{ height: 4, background: T.hairSoft, position: "relative", overflow: "hidden", marginTop: 5 }}>
                <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, pct * 100)}%`, background: T.green }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.min(100, pct * 100)}%`,
                  width: `${j.total > 0 ? Math.max(0, Math.min(100 - pct * 100, (ow / j.total) * 100)) : 0}%`, background: T.chalk, opacity: .55 }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-5" style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5 }}>
        Projection still spreads pipeline evenly — it needs an expected start date per quoted job (DECISIONS.md §5, known gap).
      </div>

      <OverheadSheet open={ohOpen} onClose={() => setOhOpen(false)} items={overhead} nut={nut} comp={comp} offTopPct={data?.offTopPct ?? 11} />
      <SettingsSheet open={setOpen} onClose={() => setSetOpen(false)}
        onFixedCosts={() => { setSetOpen(false); setOhOpen(true); }} />
    </div>
  );
}
