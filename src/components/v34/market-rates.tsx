"use client";
/**
 * Market rate — the first of the Budget's three tabs (Coy, 2026-10-09; Claude
 * Design "Budget v3" P2 / D1). The going rates the app looked up (web search,
 * sourced quotes — src/lib/draft/rates.ts) read against this budget step by
 * step, the job's price a square foot against the area's installed range, and
 * finished jobs of the same kind once they have actual costs filed.
 *
 * Nothing here changes a price except "Use": it writes a unit cost on that one
 * line (through the line's own PATCH), marked as an estimate from the going rate
 * until Coy confirms it on the Proposed budget, with Undo. The Proposal reads
 * the proposed budget only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, money, strong, DOWL, MON } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { bucketOf } from "@/lib/cost-analysis";
import { COLORS } from "@/components/v34/cost-analysis";
import { markEstimate } from "@/lib/estimate-flag";
import { askDusty } from "@/components/v34/budget-tabs";
import { DustyEmblem } from "@/components/v34/dusty-avatar";
import { quotedLine } from "@/lib/find-on-sheet";
import {
  jobRange, marketRows, scaleOf, sectionRows, COST_TYPE_LABEL, type MarketSection, type SectionRow, unitCostFromRate, rateStatus, RATE_UNIT_LABEL,
  type AreaSize, type MarketLine, type RateLite, type StepRow,
} from "@/lib/budget-v3";

interface MarketData {
  has_budget: boolean; job_type: string | null; city: string | null;
  lines: MarketLine[]; areas: Array<AreaSize & { name: string }>; sqft: number | null; lf: number | null;
  steps: Array<{ key: string; label: string; line_ids: string[] }>;
  rates: { place: string; asked_at: string; queries: string[]; rates: RateLite[]; dropped: number; error: string | null } | null;
  money: { oh: number | null; margin: number | null };
  totals: { price: number; total: number; profit: number; priced: boolean } | null;
  days: number | null; crew_size: number | null;
  past: Array<{ id: string; name: string; sqft: number; days: number | null; closed_at: string; per_sf: number; margin: number | null }>;
  can_keep: boolean;
  sections: Array<MarketSection & { sheets: Array<{ id: string; number: string | null; title: string | null }>; rates_at: string | null;
    items?: Array<{ key: string; name: string; cost_type: string; unit: string; from: string }>;
    total?: { low: number; high: number; unit: string | null; per_low: number | null; per_high: number | null; basis: string } | null }>;
  section_rates: RateLite[];
  note?: string;
  error?: string;
}
type Used = { value: number; unit: string; prevCost: number | null; prevDesc: string | null; site: string };

const DARK = "#2A2A2A", DARK_LABEL = "#A8A39A", DARK_2 = "#C9CFD6", DARK_GREEN = "#6FBF73", ORANGE = "#F2610C", DARK_RED = "#F08A7A";
const STATUS: Record<string, { word: string; color: string }> = {
  under: { word: "Under", color: T.hivizText }, inside: { word: "Inside", color: T.green }, over: { word: "Over", color: T.red },
  unpriced: { word: "Not priced", color: T.red }, no_data: { word: "No rate", color: T.ink3 }, no_line: { word: "Not on budget", color: T.ink3 },
};
const fmtUnit = (u: string | null) => (u ? RATE_UNIT_LABEL[u] ?? u : "");
const per = (v: number | null, u: string | null) => (v === null ? "—" : `${money(v)}/${fmtUnit(u)}`);
function when(iso: string) {
  const d = new Date(iso);
  const day = (Date.now() - d.getTime()) < 6 * 86400_000 ? DOWL[(d.getDay() + 6) % 7] : `${MON[d.getMonth()]} ${d.getDate()}`;
  return `${day} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export function MarketRates({ jobId, refresh, onChanged, onSheets }: {
  jobId: string; refresh: number; onChanged: () => void;
  /** Open a sheet beside the budget with the section's line boxed on it. */
  onSheets?: (sectionId: string, sheetId: string | null) => void;
}) {
  const [d, setD] = useState<MarketData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [used, setUsed] = useState<Record<string, Used>>({});
  // What a Use tap is doing, or why it didn't, shown on its own row (Coy, 2026-10-11: "these buttons don't do anything").
  const [useNote, setUseNote] = useState<Record<string, string>>({});
  const [ref, wide] = useWide<HTMLDivElement>(900);

  const load = useCallback(async () => {
    try { setD(await send(`/api/jobs/${jobId}/budget/market`, "GET")); setErr(null); } catch (e) { setErr(String((e as Error).message ?? e)); }
  }, [jobId]);
  useEffect(() => {
    let off = false;
    send(`/api/jobs/${jobId}/budget/market`, "GET").then((b) => { if (!off) { setD(b); setErr(null); } }).catch((e) => { if (!off) setErr(String((e as Error).message ?? e)); });
    return () => { off = true; };
  }, [jobId, refresh]);

  const job = useMemo(() => ({ sqft: d?.sqft ?? null, lf: d?.lf ?? null }), [d]);
  // Only steps with a line on this budget: an old driveway lookup's concrete and
  // finishing steps don't belong on a removal job (Coy, 2026-10-11).
  const rows = useMemo(() => (d ? marketRows(d.steps, d.rates?.rates ?? [], d.lines, d.areas, job).filter((r) => r.lines.length > 0) : []), [d, job]);
  const secRows = useMemo(() => (d?.sections ? sectionRows(d.sections, d.lines, d.section_rates ?? []) : []), [d]);
  const [secBusy, setSecBusy] = useState<string | null>(null);
  // The emblem on a section researches it from its scope of work (Coy, 2026-10-11).
  const lookUpSections = async (ids: string[]) => {
    setSecBusy(ids[0] ?? null); setErr(null);
    try { setD(await send(`/api/jobs/${jobId}/budget/market`, "POST", { sections: ids })); } catch (e) { setErr(String((e as Error).message ?? e)); }
    setSecBusy(null);
  };
  const [digBusy, setDigBusy] = useState<string | null>(null);
  // A cost with no price: the AI icon looks harder for that one (Coy, 2026-10-11).
  const digItem = async (sectionId: string, key: string) => {
    setDigBusy(`${sectionId}:${key}`); setErr(null);
    try { setD(await send(`/api/jobs/${jobId}/budget/market`, "POST", { sections: [sectionId], item: key })); } catch (e) { setErr(String((e as Error).message ?? e)); }
    setDigBusy(null);
  };
  // Dusty makes Price book items, a group and an assembly from the research — his plan, Coy's Apply.
  const makeAsk = (sectionName: string, rows: Array<{ name: string; cost_type: string; range: string }>, whole: boolean) =>
    `From the going-rate research on the section "${sectionName}", make ${whole ? `Price book cost items for its scope of work, in a group named "${sectionName}", and an assembly "${sectionName}" holding them` : "a Price book cost item"} — each priced at the middle of its range and marked as an estimate from the research:\n${rows.map((x) => `- ${x.name} (${COST_TYPE_LABEL[x.cost_type] ?? x.cost_type}): ${x.range}`).join("\n")}`;
  const mineSf = d?.totals && d.sqft ? d.totals.total / d.sqft : null;


  const toggle = (k: string) => setOpen((s) => {
    const n = new Set(wide ? s : []);
    if (s.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const use = async (row: StepRow, value: number) => {
    const note = (t: string) => setUseNote((n) => ({ ...n, [row.step]: t }));
    if (!d || !row.rate || row.lines.length !== 1) return note("No single line on the budget to write it to.");
    const line = row.lines[0];
    const cost = unitCostFromRate(value, { unit: row.unit!, kind: row.kind! }, line, d.areas, job, d.money);
    if (cost === null) return note(d.money.oh === null || d.money.margin === null ? "Set the job's O.H. and margin first, to turn an installed price into a cost." : `Can't turn a price per ${fmtUnit(row.unit)} into ${line.name}'s unit (${line.unit || "none"}) — give the section a size, or the line a quantity.`);
    note("Writing it to the budget…");
    const basis = `going rate ${money(value)}/${fmtUnit(row.unit)} (${row.kind === "installed_price" ? "installed, at your O.H. and margin" : "cost"}), ${row.rate.site}, ${d.rates ? when(d.rates.asked_at) : ""}`.trim();
    try {
      await send(`/api/jobs/${jobId}/budget/lines/${line.id}`, "PATCH", { unit_cost: cost, description: markEstimate(line.description ?? null, basis) });
      setUsed((u) => ({ ...u, [row.step]: { value, unit: fmtUnit(row.unit), prevCost: line.unit_cost, prevDesc: line.description ?? null, site: row.rate!.site } }));
      note("");
      await load(); onChanged();
    } catch (e) { note(String((e as Error).message ?? e)); }
  };
  const undo = async (row: StepRow) => {
    const u = used[row.step];
    if (!u || row.lines.length !== 1) return;
    try {
      await send(`/api/jobs/${jobId}/budget/lines/${row.lines[0].id}`, "PATCH", { unit_cost: u.prevCost, description: u.prevDesc });
      setUsed((x) => { const n = { ...x }; delete n[row.step]; return n; });
      await load(); onChanged();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  };

  if (!d) return <div ref={ref} className="px-3 py-6" style={{ color: err ? T.red : T.ink3, fontSize: F.sm }}>{err ?? "Reading the going rates…"}</div>;

  const counted = rows.filter((r) => r.rate && r.lines.length);
  const tally = { inside: counted.filter((r) => r.status === "inside").length, under: counted.filter((r) => r.status === "under").length, over: counted.filter((r) => r.status === "over").length };
  const kept = d.rates?.rates.length ?? 0;
  const lineName = (id: string) => d.lines.find((l) => l.id === id)?.name ?? "";


  const pastCard = (
    <div className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "10px 12px" }}>
      <div style={eyebrow}>Past jobs{d.job_type ? ` · ${d.job_type}` : ""}</div>
      {d.past.length === 0
        ? <div style={{ fontSize: 12, color: T.ink3, marginTop: 4 }}>No finished jobs of this kind have actual costs filed yet. Once a job&apos;s receipts are on its Actual costs, its $/SF and margin show here.</div>
        : <>
          {d.past.map((p) => (
            <div key={p.id} className="flex items-baseline gap-2" style={{ padding: "5px 0", borderTop: `1px solid ${T.hairSoft}` }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <a href={`/dashboard/scope/${p.id}?tab=actuals`} style={{ fontSize: 13, color: T.ink, ...clip, display: "block" }}>{p.name}</a>
                <div style={{ fontSize: 11, color: T.ink3 }}>{Math.round(p.sqft).toLocaleString()} SF · {MON[new Date(p.closed_at).getMonth()]} {p.days ? `· ${p.days} days` : ""}</div>
              </div>
              <span style={{ fontFamily: strong, fontWeight: 600, ...nums }}>{money(p.per_sf)}</span>
              {p.margin !== null && <span style={{ fontSize: 12, width: 44, textAlign: "right", color: p.margin >= 0.22 ? T.green : T.hivizText, ...nums }}>{Math.round(p.margin * 100)}%</span>}
            </div>
          ))}
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>
            {d.past.length} job{d.past.length === 1 ? "" : "s"} · avg {money(d.past.reduce((a, p) => a + p.per_sf, 0) / d.past.length)}{mineSf !== null ? ` · this job ${money(mineSf)}` : ""}
          </div>
        </>}
    </div>
  );

  const renderUse = (r: StepRow) => {
    const u = used[r.step];
    if (u) return (
      <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: T.ink2 }}>
        <span style={{ width: 7, height: 7, borderRadius: 9, background: T.hiviz }} />
        ✎ {money(u.value)}/{u.unit} written to {r.lines[0]?.name}
        <button onClick={() => void undo(r)} style={{ color: T.chalk, fontWeight: 600, cursor: "pointer" }}>Undo</button>
      </div>
    );
    if (!r.rate || r.low === null || r.high === null) return null;
    if (r.lines.length !== 1) return <div style={{ fontSize: 11.5, color: T.ink3 }}>{r.lines.length ? `${r.lines.length} lines price this step — change them on the Proposed budget.` : "No line on the budget for this step."}</div>;
    const can = (v: number) => unitCostFromRate(v, { unit: r.unit!, kind: r.kind! }, r.lines[0], d.areas, job, d.money) !== null;
    const btn = (v: number) => (
      <button key={v} onClick={() => void use(r, v)} title={can(v) ? undefined : "Can't turn this rate into the line's unit"}
        style={{ height: 28, padding: "0 8px", borderRadius: 3, border: `1px solid ${T.ink}`, background: T.card, color: T.ink, opacity: can(v) ? 1 : 0.4,
          fontFamily: disp, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap", cursor: can(v) ? "pointer" : "default" }}>
        Use {money(v)}/{fmtUnit(r.unit)}
      </button>
    );
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {btn(r.low)}{r.high !== r.low && btn(r.high)}
        {!wide && r.mine !== null && <span style={{ fontSize: 11.5, color: T.ink3 }}>Keep {money(r.mine)}</span>}
        {useNote[r.step] && <div style={{ flexBasis: "100%", fontSize: 11.5, color: useNote[r.step].endsWith("…") ? T.ink3 : T.red }}>{useNote[r.step]}</div>}
      </div>
    );
  };
  const quote = (x: RateLite) => (
    <div key={x.url + x.quote} className="rounded" style={{ background: T.sunk, padding: "6px 8px", fontSize: 12 }}>
      <div style={{ color: T.ink }}>“{x.quote}”</div>
      <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
        <a href={x.url} target="_blank" rel="noopener noreferrer" style={{ color: T.chalk }}>{x.site}</a> · {x.split === "all" ? "all-in" : x.split} · {x.kind === "installed_price" ? "what customers pay" : "your cost"} · {money(x.low)}{x.high !== x.low ? `–${money(x.high)}` : ""}/{fmtUnit(x.unit)}
      </div>
    </div>
  );
  const dot = (r: StepRow) => <span style={{ width: 8, height: 8, borderRadius: 9, flexShrink: 0, background: COLORS[bucketOf(r.lines[0]?.cost_type ?? "other")] }} />;
  const statusWord = (r: StepRow) => {
    const s = used[r.step] ? { word: "Used", color: T.hivizText } : STATUS[r.status];
    return <span style={{ fontFamily: disp, fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: s.color, whiteSpace: "nowrap" }}>{s.word}</span>;
  };
  const basisLine = (r: StepRow) => {
    if (r.mine === null || !r.unit) return null;
    const l = r.lines[0];
    const own = r.lines.length === 1 && l && fmtUnit(r.unit).toLowerCase() === (l.unit || "").toLowerCase().replace(/^sqft$/, "sf");
    return <div style={{ fontSize: 11.5, color: T.ink3 }}>
      Your number is the line{r.lines.length > 1 ? "s'" : "'s"} {r.kind === "installed_price" ? "price" : "cost"}{own ? "" : ` spread over the area, per ${fmtUnit(r.unit)}`}.
      {r.kind === "installed_price" ? " Use brings the rate back to a cost at this job's O.H. and margin." : ""} Use writes a unit cost in its place.
    </div>;
  };

  // ── By section: the job's own sections, the plan set's first (Coy, 2026-10-09). ──
  const secLabel = (r: SectionRow) => r.qty === null ? "no size yet" : `${Math.round(r.qty).toLocaleString()} ${fmtUnit(r.unit)}`;
  const totOf = (r: SectionRow) => d.sections.find((x) => x.id === r.section.id)?.total ?? null;
  const secStatus = (r: SectionRow) => {
    const m: Record<string, { word: string; color: string }> = { ...STATUS, no_size: { word: "No size", color: T.hivizText }, no_line: { word: "No items", color: T.ink3 } };
    // No going rate: a button that researches it, or Dusty's estimate once the costs are priced (Coy, 2026-10-11).
    if (r.status === "no_data") {
      const est = totOf(r);
      return <button onClick={(e) => { e.stopPropagation(); if (!secBusy) void lookUpSections([r.section.id]); }} disabled={!!secBusy}
        title={est ? "Dusty's estimate from the priced costs — tap to research again" : "No going rate found yet — tap to have Dusty research this section"}
        style={{ fontFamily: disp, fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: est ? T.chalk : T.hivizText, whiteSpace: "nowrap", cursor: secBusy ? "wait" : "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
        {secBusy === r.section.id ? "Researching…" : est ? "Estimate" : "Research"}</button>;
    }
    const x = m[r.status];
    return <span style={{ fontFamily: disp, fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: x.color, whiteSpace: "nowrap" }}>{x.word}</span>;
  };
  const sheetChips = (r: SectionRow) => {
    const sh = d.sections.find((x) => x.id === r.section.id)?.sheets ?? [];
    if (!sh.length || !onSheets) return null;
    return (
      <span className="inline-flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {sh.map((x) => (
          <button key={x.id} onClick={() => onSheets(r.section.id, x.id)} title={`See where on ${x.number}${x.title ? ` ${x.title}` : ""}`}
            style={{ height: 20, padding: "0 6px", borderRadius: 3, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{x.number}</button>
        ))}
      </span>
    );
  };
  const sectionCard = (
    <div className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
      <div className="flex items-center gap-2 flex-wrap" style={{ padding: "8px 12px", borderBottom: `1px solid ${T.hair}` }}>
        <span style={eyebrow}>By section</span>
        {secRows.some((r) => r.section.origin === "bid") && <span style={{ fontSize: 11, color: T.ink3 }}>from the plan set</span>}
        <span className="flex-1" />
        {secBusy && <span style={{ fontSize: 11, color: T.ink3 }}>Dusty is researching…</span>}
      </div>
      {wide && (
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: "minmax(0,1.6fr) 110px 110px 150px 110px 80px", padding: "5px 12px", ...eyebrow, borderBottom: `1px solid ${T.hairSoft}` }}>
          <span>Section · sheets</span><span>Size</span><span style={{ textAlign: "right" }}>Your price</span><span>Going rate</span><span style={{ textAlign: "right" }}>Yours per unit</span><span>Status</span>
        </div>
      )}
      {secRows.map((r) => {
        const k = `sec:${r.section.id}`;
        const isOpen = open.has(k);
        const est = totOf(r);
        const rangeTxt = r.low !== null && r.high !== null ? `${money(r.low)}${r.high !== r.low ? `–${money(r.high)}` : ""}/${fmtUnit(r.unit)}`
          : est ? (est.per_low !== null && est.unit ? `≈${money(est.per_low)}–${money(est.per_high!)}/${fmtUnit(est.unit)}` : `≈${money(est.low)}–${money(est.high)}`) : "—";
        const yours = r.kind === "cost" ? r.per_cost : r.per_price;
        const bidLine = quotedLine(r.section.source_ref) ?? r.section.source_ref;
        return (
          <div key={k} style={{ borderTop: `1px solid ${T.hairSoft}`, background: isOpen ? T.sunk : "transparent" }}>
            {wide ? (
              <div className="grid items-center gap-2" onClick={() => toggle(k)} style={{ gridTemplateColumns: "minmax(0,1.6fr) 110px 110px 150px 110px 80px", padding: "7px 12px", cursor: "pointer" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}><button onClick={(e) => { e.stopPropagation(); if (!secBusy) void lookUpSections([r.section.id]); }} disabled={!!secBusy}
                    title={`Research ${r.section.name} from its scope of work`} aria-label={`Research ${r.section.name}`} style={{ flexShrink: 0, cursor: secBusy ? "wait" : "pointer", lineHeight: 0 }}>
                    <DustyEmblem size={22} state={secBusy === r.section.id ? "thinking" : "idle"} still={secBusy !== r.section.id} /></button><span style={{ fontSize: 13.5, ...clip }}>{r.section.name}</span>{sheetChips(r)}</div>
                  <div style={{ fontSize: 11, color: T.ink3, ...clip }}>{r.lines.length ? `${r.lines.length} item${r.lines.length === 1 ? "" : "s"}${r.unpriced ? ` · ${r.unpriced} not priced` : ""}` : "no items yet"}</div>
                </div>
                <span style={{ fontSize: 12.5, color: r.qty === null ? T.hivizText : T.ink2, ...nums }}>{secLabel(r)}</span>
                <span style={{ textAlign: "right", fontSize: 13, ...nums }}>{r.lines.length ? money(r.price) : "—"}</span>
                <span style={{ fontSize: 12.5, ...nums }}>{rangeTxt}{r.kind === "cost" ? <span style={{ fontSize: 10.5, color: T.ink3 }}> cost</span> : null}</span>
                <span style={{ textAlign: "right", fontFamily: strong, fontWeight: 600, fontSize: 14, ...nums }}>{per(yours, r.unit)}</span>
                {secStatus(r)}
              </div>
            ) : (
              <div className="grid items-center gap-2" onClick={() => toggle(k)} style={{ gridTemplateColumns: "minmax(0,1fr) 96px 74px", padding: "8px 12px", cursor: "pointer" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}><button onClick={(e) => { e.stopPropagation(); if (!secBusy) void lookUpSections([r.section.id]); }} disabled={!!secBusy}
                    title={`Research ${r.section.name} from its scope of work`} aria-label={`Research ${r.section.name}`} style={{ flexShrink: 0, cursor: secBusy ? "wait" : "pointer", lineHeight: 0 }}>
                    <DustyEmblem size={22} state={secBusy === r.section.id ? "thinking" : "idle"} still={secBusy !== r.section.id} /></button><span style={{ fontSize: 13.5, ...clip }}>{r.section.name}</span></div>
                  <div className="flex items-center gap-1.5 flex-wrap" style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>
                    <span style={{ color: r.qty === null ? T.hivizText : T.ink3 }}>{secLabel(r)}</span>{sheetChips(r)}
                  </div>
                </div>
                <div style={{ ...nums }}><div style={{ fontSize: 12.5 }}>{rangeTxt}</div><div style={{ fontSize: 10.5, color: T.ink3 }}>going rate</div></div>
                <div style={{ textAlign: "right" }}><div style={{ fontFamily: strong, fontWeight: 600, fontSize: 14, ...nums }}>{yours === null ? (r.lines.length ? money(r.price) : "—") : money(yours)}</div>{secStatus(r)}</div>
              </div>
            )}
            {isOpen && (
              <div className="flex flex-col gap-1.5" style={{ padding: "0 12px 10px", fontSize: 12 }}>
                {bidLine && <div style={{ color: T.ink2 }}>From the plans: “{bidLine}”</div>}
                {r.section.sow?.length ? (
                  <div style={{ color: T.ink2 }}>
                    <div style={{ ...eyebrow, marginBottom: 2 }}>Scope of work</div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>{r.section.sow.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  </div>
                ) : <div style={{ color: T.hivizText }}>No scope of work yet. Write it (or have Dusty draft it) on the Proposed budget; the lookup reads it to find a price for each step.</div>}
                {r.section.notes && <div style={{ color: T.ink2 }}><span style={eyebrow}>Notes</span> {r.section.notes}</div>}
                {(() => {
                  const sec = d.sections.find((x) => x.id === r.section.id);
                  const items = sec?.items ?? [];
                  if (!items.length) return null;
                  const rangeOf = (key: string) => {
                    const rs = r.rates.filter((x) => x.item === key);
                    if (!rs.length) return null;
                    const lo = Math.min(...rs.map((x) => x.low)), hi = Math.max(...rs.map((x) => x.high));
                    return { rs, text: `${money(lo)}${hi !== lo ? `–${money(hi)}` : ""}/${[...new Set(rs.map((x) => fmtUnit(x.unit)))].join(", ")}` };
                  };
                  const priced = items.map((it) => ({ it, g: rangeOf(it.key) })).filter((x) => x.g);
                  const tot = sec?.total ?? null;
                  return (
                    <div>
                      <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
                        <span style={eyebrow}>Costs in the scope of work</span>
                        <span className="flex-1" />
                        {priced.length > 0 && <button onClick={() => askDusty(makeAsk(r.section.name, priced.map((x) => ({ name: x.it.name, cost_type: x.it.cost_type, range: x.g!.text })), true), false)}
                          title="Ask Dusty to make Price book items, a group and an assembly from these" style={{ color: T.chalk, fontWeight: 600, fontSize: 11.5, cursor: "pointer" }}>Make items, group & assembly ›</button>}
                      </div>
                      {items.map((it) => {
                        const g = rangeOf(it.key);
                        const k2 = `${k}:${it.key}`;
                        const busy = digBusy === `${r.section.id}:${it.key}`;
                        return (
                          <div key={it.key} style={{ borderTop: `1px solid ${T.hairSoft}`, padding: "4px 0" }}>
                            <div className="grid items-center gap-2" onClick={() => g && setOpen((o) => { const n = new Set(o); if (n.has(k2)) n.delete(k2); else n.add(k2); return n; })}
                              style={{ gridTemplateColumns: "84px minmax(0,1fr) auto 22px", cursor: g ? "pointer" : "default", color: T.ink2 }}>
                              <span style={{ fontSize: 10.5, fontFamily: disp, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.ink3, whiteSpace: "nowrap" }}>{COST_TYPE_LABEL[it.cost_type] ?? it.cost_type}</span>
                              <span style={{ minWidth: 0, ...clip }}>{it.name}</span>
                              <span style={{ ...nums, whiteSpace: "nowrap", textAlign: "right" }}>{g ? g.text : <span style={{ color: T.ink3 }}>{busy ? "digging…" : "no price found"}</span>}</span>
                              {g ? (
                                <button onClick={(e) => { e.stopPropagation(); askDusty(makeAsk(r.section.name, [{ name: it.name, cost_type: it.cost_type, range: g.text }], false), false); }}
                                  title={`Ask Dusty to make "${it.name}" a Price book item`} aria-label={`Make ${it.name} an item`} style={{ color: T.chalk, fontWeight: 700, cursor: "pointer" }}>+</button>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); if (!digBusy) void digItem(r.section.id, it.key); }} disabled={!!digBusy}
                                  title={`Dig deeper for a price on ${it.name}`} aria-label={`Dig deeper on ${it.name}`} style={{ lineHeight: 0, cursor: digBusy ? "wait" : "pointer" }}>
                                  <DustyEmblem size={18} state={busy ? "thinking" : "idle"} still={!busy} /></button>
                              )}
                            </div>
                            {g && open.has(k2) && <div className="flex flex-col gap-1" style={{ paddingLeft: 92, marginTop: 3 }}>{g.rs.map(quote)}</div>}
                          </div>
                        );
                      })}
                      {tot && (
                        <div style={{ borderTop: `1px solid ${T.hair}`, padding: "5px 0 0", color: T.ink2 }}>
                          <div className="flex items-baseline gap-2"><span style={{ fontWeight: 600 }}>Section, all in</span><span className="flex-1" />
                            <span style={{ ...nums, fontWeight: 600 }}>{money(tot.low)}{tot.high !== tot.low ? `–${money(tot.high)}` : ""}{tot.per_low !== null && tot.unit ? ` · ${money(tot.per_low)}–${money(tot.per_high!)}/${fmtUnit(tot.unit)}` : ""}</span></div>
                          <div style={{ fontSize: 11, color: T.ink3 }}>Dusty&rsquo;s estimate from the costs above, not a price{tot.basis ? `: ${tot.basis}` : "."}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {r.by_type.length > 0 && (
                  <div>
                    <div style={{ ...eyebrow, marginBottom: 2 }}>Going rates by cost type</div>
                    {r.by_type.map((t) => (
                      <div key={`${t.split}|${t.kind}|${t.unit}`} className="flex items-baseline gap-2" style={{ color: T.ink2 }}>
                        <span style={{ width: 92, flexShrink: 0, fontWeight: 600 }}>{COST_TYPE_LABEL[t.split] ?? t.split}</span>
                        <span style={{ ...nums, whiteSpace: "nowrap" }}>{money(t.low)}{t.high !== t.low ? `–${money(t.high)}` : ""}/{fmtUnit(t.unit)}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: T.ink3, ...clip }}>{t.kind === "installed_price" ? "what customers pay" : "your cost"} · {t.sources} source{t.sources === 1 ? "" : "s"}{t.what.length ? ` · ${t.what.slice(0, 3).join(", ")}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {r.status === "no_size" && <div style={{ color: T.hivizText }}>Measure it in Takeoffs (or type its size on the Proposed budget) to compare it per {r.unit ? fmtUnit(r.unit) : "unit"}.</div>}
                {r.lines.map((l) => (
                  <div key={l.id} className="flex items-baseline gap-2" style={{ color: T.ink2 }}>
                    <span style={{ flex: 1, minWidth: 0, ...clip }}>{l.name}</span>
                    <span style={{ ...nums }}>{l.ext_price === null ? "not priced" : money(l.ext_price)}</span>
                  </div>
                ))}
                {r.rates.length ? r.rates.map(quote) : <div style={{ color: T.ink3 }}>{d.sections.find((x) => x.id === r.section.id)?.rates_at ? "The search found no price for this kind of work." : "Not looked up yet."}</div>}
                <button onClick={() => askDusty(`About the going rate for the section "${r.section.name}" on this job (${secLabel(r)}): is my number right, and what should it cost per ${fmtUnit(r.unit) || "unit"}?`, false)}
                  style={{ alignSelf: "flex-start", color: T.chalk, fontWeight: 600, cursor: "pointer" }}>Ask Dusty about this section</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const lookedUp = d.rates
    ? `${d.rates.place} · looked up ${when(d.rates.asked_at)} · ${d.rates.queries.length} searches, ${kept} price${kept === 1 ? "" : "s"} kept`
    : "Tap the emblem on a section to research it from its scope of work.";

  return (
    <div ref={ref} className="px-3 py-3 flex flex-col gap-2" style={{ color: T.ink }}>
      <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12, color: T.ink3 }}>
        <span style={{ minWidth: 0, flex: 1 }}>{lookedUp}</span>
      </div>
      {d.rates?.error && <div style={{ fontSize: 12, color: T.red }}>{d.rates.error}</div>}
      {d.note && <div style={{ fontSize: 12, color: T.hivizText }}>{d.note}</div>}
      {err && <div style={{ fontSize: 12, color: T.red }}>{err}</div>}
      {!d.has_budget && <div style={{ fontSize: 12.5, color: T.ink2 }}>Add items on the Proposed budget, then compare them here.</div>}

      {pastCard}

      {secRows.length > 0 && sectionCard}

      {/* By step shows an older driveway lookup only; steps now come from each section's scope of work (Coy, 2026-10-11). */}
      {rows.length > 0 && <div className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="flex items-baseline gap-2" style={{ padding: "8px 12px", borderBottom: `1px solid ${T.hair}` }}>
          <span style={eyebrow}>By step</span>
          {d.rates && <span style={{ fontSize: 11, color: T.ink3 }}>looked up {when(d.rates.asked_at)}</span>}
        </div>
        {wide && rows.length > 0 && (
          <div className="grid items-center gap-2" style={{ gridTemplateColumns: "20px minmax(0,1.1fr) 150px minmax(0,1.6fr) 110px 86px 190px", padding: "5px 12px", ...eyebrow, borderBottom: `1px solid ${T.hairSoft}` }}>
            <span /><span>Step · line</span><span>Going rate</span><span>Source</span><span style={{ textAlign: "right" }}>Your budget</span><span>Status</span><span />
          </div>
        )}
        {rows.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12.5, color: T.ink3 }}>{d.rates ? "None of the rates kept matches a step of this budget." : "Look up the going rates to compare this budget, step by step."}</div>}
        {rows.map((r) => {
          const isOpen = open.has(r.step);
          const range2 = r.low !== null && r.high !== null ? `${money(r.low)}${r.high !== r.low ? `–${money(r.high)}` : ""}` : "—";
          return (
            <div key={r.step} style={{ borderTop: `1px solid ${T.hairSoft}`, background: isOpen ? T.sunk : "transparent" }}>
              {wide ? (
                <div className="grid items-center gap-2" onClick={() => toggle(r.step)} style={{ gridTemplateColumns: "20px minmax(0,1.1fr) 150px minmax(0,1.6fr) 110px 86px 190px", padding: "7px 12px", cursor: "pointer" }}>
                  {dot(r)}
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, ...clip }}>{r.label}</div><div style={{ fontSize: 11, color: T.ink3, ...clip }}>{r.lines.map((l) => l.name).join(", ") || "no line"}</div></div>
                  <div style={{ ...nums }}><span style={{ fontSize: 13 }}>{range2}</span> <span style={{ fontSize: 11, color: T.ink3 }}>per {fmtUnit(r.unit)}</span></div>
                  <div style={{ minWidth: 0 }}>{r.rate ? <><div style={{ fontSize: 12, ...clip }}>“{r.rate.quote}”</div>
                    <div style={{ fontSize: 11, color: T.ink3, ...clip }}>{r.rate.site} · {r.rate.split === "all" ? "all-in" : r.rate.split} · {r.kind === "installed_price" ? "installed" : "cost"}{r.more.length ? ` · +${r.more.length} more` : ""}</div></> : <span style={{ fontSize: 12, color: T.ink3 }}>—</span>}</div>
                  <div style={{ textAlign: "right", fontFamily: strong, fontWeight: 600, fontSize: 14, ...nums }}>{per(r.mine, r.unit)}</div>
                  {statusWord(r)}
                  <div onClick={(e) => e.stopPropagation()}>{renderUse(r)}</div>
                </div>
              ) : (
                <div className="grid items-center gap-2" onClick={() => toggle(r.step)} style={{ gridTemplateColumns: "minmax(0,1fr) 92px 72px", padding: "8px 12px", cursor: "pointer" }}>
                  <div className="flex items-start gap-2" style={{ minWidth: 0 }}>
                    <span style={{ marginTop: 5 }}>{dot(r)}</span>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, ...clip }}>{r.label}</div><div style={{ fontSize: 11, color: T.ink3, ...clip }}>{r.lines.map((l) => l.name).join(", ") || "no line"}</div></div>
                  </div>
                  <div style={{ ...nums }}><div style={{ fontSize: 12.5 }}>{range2}</div><div style={{ fontSize: 10.5, color: T.ink3 }}>per {fmtUnit(r.unit)}</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ fontFamily: strong, fontWeight: 600, fontSize: 14, ...nums }}>{r.mine === null ? "—" : money(r.mine)}</div>{statusWord(r)}</div>
                </div>
              )}
              {isOpen && (
                <div className="flex flex-col gap-1.5" style={{ padding: "0 12px 10px" }}>
                  {!wide && r.rate && quote(r.rate)}
                  {r.more.map(quote)}
                  {!wide && renderUse(r)}
                  {basisLine(r)}
                  <button onClick={() => askDusty(`About the going rate for ${r.label.toLowerCase()} on this job (${lineName(r.lines[0]?.id ?? "") || "no line yet"}): is my number right?`, false)}
                    style={{ alignSelf: "flex-start", fontSize: 12, color: T.chalk, fontWeight: 600, cursor: "pointer" }}>Ask Dusty about this step</button>
                </div>
              )}
            </div>
          );
        })}
        {counted.length > 0 && (
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.hair}`, fontSize: 12, color: T.ink2 }}>
            {tally.inside} of {counted.length} step{counted.length === 1 ? "" : "s"} inside the going rate · {tally.under} under · {tally.over} over
          </div>
        )}
      </div>}
      <div style={{ fontSize: 11.5, color: T.ink3 }}>
        Rates are references with their source. Nothing becomes a budget number until you tap Use — and then it is marked as an estimate until you confirm it on the Proposed budget. The Proposal reads the proposed budget only.
        {!d.can_keep && " Lookups are kept on the draft budget's build until migration 094 is applied."}
      </div>
    </div>
  );
}

/** The job's price per SF against the going rate, with the size and total it is worked out from and
 *  where the range came from (Coy, 2026-10-15: "merge … so I can see where I sit in the range and
 *  understand how that range was calculated"). On Market rate, and in the job's dark totals box. */
export function PriceVsRange({ d, flat }: { d: MarketData; flat?: boolean }) {
  const range = jobRange(d.rates?.rates ?? []);
  const mineSf = d.totals && d.sqft ? d.totals.total / d.sqft : null;
  const jobFlag = mineSf !== null && range ? rateStatus(mineSf, range.low, range.high) : null;
  const used = (d.rates?.rates ?? []).filter((r) => r.step === "job" && r.kind === "installed_price" && r.split === "all");
  const sites = [...new Set(used.map((r) => r.site))];
  const sc = scaleOf([range?.low, range?.high, mineSf, ...d.past.map((p) => p.per_sf)]);
  const x = (v: number) => (sc ? `${((v - sc.min) / (sc.max - sc.min)) * 100}%` : "0%");
  return (
    <div className={flat ? "" : "rounded"} style={{ background: DARK, color: "#fff", padding: "12px 14px" }}>
      <div className="flex items-start gap-3">
        <div style={{ minWidth: 0 }}>
          <div style={{ ...eyebrow, color: DARK_LABEL }}>Your price · market rate</div>
          <div style={{ fontFamily: strong, fontSize: 26, fontWeight: 700, lineHeight: 1.1, ...nums }}>{mineSf !== null ? `${money(mineSf)}/SF` : "—"}</div>
          <div style={{ fontSize: 12, color: DARK_2, marginTop: 2, ...nums }}>
            {d.totals ? money(d.totals.total) : "No price yet"} ÷ {d.sqft ? `${Math.round(d.sqft).toLocaleString()} SF of concrete` : "no SF measured"}
          </div>
        </div>
        <span className="flex-1" />
        {jobFlag && jobFlag !== "unpriced" && (
          <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap",
            color: jobFlag === "inside" ? DARK_GREEN : jobFlag === "under" ? ORANGE : DARK_RED }}>
            {jobFlag === "inside" ? "Inside the range" : jobFlag === "under" ? "Under" : "Over"}
          </span>
        )}
      </div>
      {sc && (range || mineSf !== null) && (
        <>
          <div className="relative" style={{ height: 18, marginTop: 12 }}>
            <span style={{ position: "absolute", left: 0, right: 0, top: 8, height: 3, background: "#4A4A4A" }} />
            {range && <span style={{ position: "absolute", left: x(range.low), width: `calc(${x(range.high)} - ${x(range.low)})`, top: 8, height: 3, background: DARK_LABEL }} />}
            {range && <span title="typical" style={{ position: "absolute", left: x(range.typical), top: 6, width: 1, height: 7, background: "#fff" }} />}
            {d.past.map((p) => <span key={p.id} title={`${p.name} ${money(p.per_sf)}/SF`} style={{ position: "absolute", left: x(p.per_sf), top: 5, width: 9, height: 9, marginLeft: -4.5, borderRadius: 99, border: `1.5px solid ${DARK_2}` }} />)}
            {mineSf !== null && <span style={{ position: "absolute", left: x(mineSf), top: 2, width: 3, height: 15, marginLeft: -1.5, background: ORANGE }} />}
          </div>
          <div className="flex justify-between" style={{ fontSize: 10.5, color: DARK_LABEL, ...nums }}>
            <span>{money(sc.min)}</span>
            <span className="flex gap-3"><span>▬ range</span>{d.past.length > 0 && <span>○ past jobs</span>}<span style={{ color: ORANGE }}>▍ this job</span></span>
            <span>{money(sc.max)}</span>
          </div>
        </>
      )}
      <div style={{ fontSize: 12, color: DARK_2, marginTop: 6, lineHeight: 1.45, whiteSpace: "normal", overflowWrap: "anywhere", ...nums }}>
        {range
          ? <>Going rate installed {money(range.low)}–{money(range.high)}/SF, typical {money(range.typical)}: the middle of {range.sources} installed price{range.sources === 1 ? "" : "s"} per SF{d.city ? ` near ${d.city}` : ""}{d.rates ? `, looked up ${when(d.rates.asked_at)}` : ""}{sites.length ? ` from ${sites.slice(0, 4).join(", ")}${sites.length > 4 ? ` and ${sites.length - 4} more` : ""}` : ""}.</>
          : d.rates ? `No installed price per SF in the ${when(d.rates.asked_at)} lookup.` : "Going rate not looked up yet (Budget → Market rate)."}
      </div>
    </div>
  );
}

/** The same card loading itself, for the job's dark totals box. */
export function RailMarket({ jobId, refresh = 0 }: { jobId: string; refresh?: number }) {
  const [d, setD] = useState<MarketData | null>(null);
  useEffect(() => {
    let off = false;
    send(`/api/jobs/${jobId}/budget/market`, "GET").then((b) => { if (!off) setD(b); }).catch(() => {});
    return () => { off = true; };
  }, [jobId, refresh]);
  if (!d) return null;
  return <div style={{ borderTop: "1px solid #3A3A3A" }}><PriceVsRange d={d} flat /></div>;
}
