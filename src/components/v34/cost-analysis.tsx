"use client";

/**
 * Cost Analysis — inside the budget, under Job totals (Coy, 2026-10-08; brief
 * /mnt/project-files/job-page/claude-design-brief.md). Replaces "How it adds up".
 *
 *  1. Materials · Labor · Equipment · Miscellaneous (· Subcontract) · Overhead, then
 *     Net profit and Price — each a row with its $ and share of the price, tapped
 *     open to its line items by section.
 *  2. $ · /SF · /SY · /LF turns every number into a cost per unit, for the whole
 *     job or one section (a curb's $/LF and a slab's $/SF are read apart).
 *  3. Crew and days: people × days × hours a day → man-days, man-hours, SF a crew
 *     day, labor per man-hour, and whether the price clears the job minimum.
 *  4. Gross and net profit, in all, per day and per man-day.
 *
 * Every number is src/lib/cost-analysis.ts over the engine's line results.
 */

import React, { useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, money, money0 } from "@/lib/v34/tokens";
import { Cell } from "@/components/v34/cell";
import { quantities, type SectionInput } from "@/lib/engine";
import { analyse, crewMath, perUnit, type AnalysisLine, type Bucket } from "@/lib/cost-analysis";

export const COLORS: Record<Bucket | "overhead" | "risk" | "profit", string> = {
  risk: "#B5412C",
  material: "#1E5AA8", labor: "#D97757", equipment: "#6A55B0", subcontract: "#2F8A5B", other: "#8C8578",
  overhead: "#C9A227", profit: "#2F8A5B",
};
type Per = "$" | "sf" | "sy" | "lf";
const PER_LABEL: Record<Per, string> = { $: "$", sf: "/SF", sy: "/SY", lf: "/LF" };

export function CostAnalysis({ lines, sections, tax, discount, overheadPct, days, crew, dayMinimum, onCrew, wide }: {
  lines: AnalysisLine[];
  sections: Array<SectionInput & { id: string }>;
  tax: number; discount: number; overheadPct: number | null;
  days: number | null;
  /** null = migration 093 not applied: crew size can't be kept yet. */
  crew: { size: number | null; hours: number | null } | null;
  dayMinimum: number | null;
  onCrew: (patch: { duration_days?: number | null; crew_size?: number | null; crew_hours?: number | null }) => Promise<string | null>;
  wide: boolean;
}) {
  const [section, setSection] = useState<string>("all");
  const [per, setPer] = useState<Per>(() => {
    try { const v = localStorage.getItem("sc:cost-per"); if (v === "$" || v === "sf" || v === "sy" || v === "lf") return v; } catch { /* no storage */ }
    return "$";
  });
  const pickPer = (p: Per) => { setPer(p); try { localStorage.setItem("sc:cost-per", p); } catch { /* no storage */ } };
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [err, setErr] = useState<string | null>(null);

  const areas = useMemo(() => sections.map((s) => {
    const q = quantities(s);
    return { id: s.id, name: s.name || "Unnamed area", sqft: q.sqft, lf: q.count_unit === "LF" ? q.count : null };
  }), [sections]);
  const a = useMemo(() => analyse(lines, areas, { section, tax, discount }), [lines, areas, section, tax, discount]);
  const c = crewMath({ size: crew?.size ?? null, days, hours: crew?.hours ?? null }, a);

  // A per-unit choice that doesn't fit what's picked falls back to dollars.
  const denom = per === "sf" ? a.units.sf : per === "sy" ? a.units.sy : per === "lf" ? a.units.lf : 1;
  const perOk = per === "$" || denom > 0;
  const shownPer: Per = perOk ? per : "$";
  const fmt = (v: number) => {
    if (shownPer === "$") return money0(v);
    const u = perUnit(v, denom);
    return u === null ? "—" : `${money(u)}${PER_LABEL[shownPer]}`;
  };
  const share = (v: number) => (a.price - a.discount > 0 ? `${((v / (a.price - a.discount)) * 100).toFixed(1)}%` : "");
  const name = (id: string | null) => (id ? areas.find((x) => x.id === id)?.name ?? "Whole job" : "Whole job");
  const save = async (patch: Parameters<typeof onCrew>[0]) => { setErr(await onCrew(patch)); };

  const rows: Array<{ k: string; label: string; v: number; color: string; lines?: AnalysisLine[]; note?: string }> = [
    ...a.rows.map((r) => ({ k: r.bucket, label: r.label, v: r.cost, color: COLORS[r.bucket], lines: r.lines })),
    { k: "overhead", label: overheadPct !== null ? `Overhead ${overheadPct}%` : "Overhead", v: a.overhead, color: COLORS.overhead,
      note: `${overheadPct !== null ? `${overheadPct}% of` : "On"} ${money0(a.direct)} direct cost${section === "all" ? "" : " in this section"} — what it takes to run the business, not this job.` },
    ...(a.risk > 0 ? [{ k: "risk", label: "Risk", v: a.risk, color: COLORS.risk,
      note: "Contingency, the job's risk checklist and carrying cost — set aside in the price, not profit. Set on the budget's Risk." }] : []),
  ];
  const sold = a.price - a.discount;
  const bar = [...rows.map((r) => ({ c: r.color, v: r.v })), { c: COLORS.profit, v: Math.max(0, a.net) }];

  const pill = (on: boolean): React.CSSProperties => ({ height: 26, padding: "0 9px", fontSize: F.xs, fontWeight: 600,
    background: on ? T.ink : T.card, color: on ? T.card : T.ink2, cursor: "pointer", whiteSpace: "nowrap" });
  const big = (v: number | null, sub: string, tone?: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: disp, fontSize: 24, fontWeight: 700, lineHeight: 1.05, color: tone ?? T.ink, ...nums }}>{v === null ? "—" : money0(v)}</div>
      <div style={{ fontSize: 10.5, color: T.ink3 }}>{sub}</div>
    </div>
  );

  const breakdown = (
    <div style={{ minWidth: 0 }}>
      <div className="flex rounded overflow-hidden" style={{ height: 8, background: T.hairSoft }} aria-hidden="true">
        {sold > 0 && bar.filter((b) => b.v > 0).map((b, i) => <span key={i} style={{ width: `${(b.v / Math.max(sold, a.direct + a.overhead + a.risk)) * 100}%`, background: b.c }} />)}
      </div>
      <div className="mt-1.5 rounded" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
        {rows.map((r, i) => {
          const isOpen = open.has(r.k);
          const can = (r.lines?.length ?? 0) > 0 || !!r.note;
          return (
            <div key={r.k} style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
              <button onClick={() => can && toggle(r.k)} aria-expanded={can ? isOpen : undefined} disabled={!can}
                className="w-full flex items-center gap-2 px-2.5 text-left" style={{ minHeight: 40, cursor: can ? "pointer" : "default", ...nums }}>
                <span aria-hidden="true" style={{ width: 10, fontSize: 10, color: T.ink3, display: "inline-block", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", visibility: can ? "visible" : "hidden" }}>▸</span>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: r.color, flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: F.sm, fontWeight: 600, ...clip }}>{r.label}</span>
                <span style={{ fontSize: F.xs, color: T.ink3, width: 48, textAlign: "right" }}>{share(r.v)}</span>
                <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, minWidth: 84, textAlign: "right" }}>{r.lines && !r.lines.length ? "—" : fmt(r.v)}</span>
              </button>
              {isOpen && r.note && <div className="px-2.5 pb-2" style={{ fontSize: F.xs, color: T.ink2, paddingLeft: 40 }}>{r.note}</div>}
              {isOpen && r.lines && r.lines.length > 0 && (
                <div className="pb-1.5" style={{ background: T.slab }}>
                  {[...new Set(r.lines.map((l) => l.section_id && areas.some((x) => x.id === l.section_id) ? l.section_id : null))].map((sid) => {
                    const ls = r.lines!.filter((l) => (l.section_id && areas.some((x) => x.id === l.section_id) ? l.section_id : null) === sid);
                    return (
                      <div key={sid ?? "job"}>
                        {section === "all" && areas.length + 1 > 1 && (
                          <div className="px-2.5 pt-1.5" style={{ ...eyebrow, paddingLeft: 40, color: T.ink3 }}>{name(sid)}</div>
                        )}
                        {ls.map((l) => (
                          <div key={l.id} className="flex items-baseline gap-2 py-1" style={{ paddingLeft: 40, paddingRight: 10, fontSize: F.xs, ...nums }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", color: T.ink, ...clip }}>{l.name}</span>
                              <span style={{ display: "block", color: T.ink3, fontSize: 10 }}>{l.qty === null ? "—" : l.qty.toLocaleString("en-US", { maximumFractionDigits: 2 })} {l.unit} × {l.unit_cost === null ? "—" : money(l.unit_cost)}</span>
                            </span>
                            <span style={{ fontWeight: 600 }}>{fmt(l.ext_cost ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {/* What's left, and the price the rows add up to. */}
        <div className="flex items-center gap-2 px-2.5" style={{ minHeight: 38, borderTop: `1px solid ${T.hair}`, ...nums }}>
          <span style={{ width: 10 }} />
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COLORS.profit, flex: "none" }} />
          <span style={{ flex: 1, fontSize: F.sm, fontWeight: 600 }}>Net profit</span>
          <span style={{ fontSize: F.xs, color: T.ink3, width: 48, textAlign: "right" }}>{share(a.net)}</span>
          <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, minWidth: 84, textAlign: "right", color: a.net < 0 ? T.red : T.green }}>{fmt(a.net)}</span>
        </div>
        {a.discount > 0 && (
          <div className="flex items-center gap-2 px-2.5" style={{ minHeight: 30, borderTop: `1px solid ${T.hairSoft}`, fontSize: F.xs, color: T.ink2, ...nums }}>
            <span style={{ width: 23 }} /><span style={{ flex: 1 }}>Discount (off the price)</span><span style={{ minWidth: 84, textAlign: "right" }}>− {fmt(a.discount)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-2.5" style={{ minHeight: 40, borderTop: `1px solid ${T.hair}`, background: T.slab, ...nums }}>
          <span style={{ width: 23 }} />
          <span style={{ flex: 1, fontFamily: disp, fontSize: F.md, fontWeight: 700, textTransform: "uppercase" }}>Price</span>
          <span style={{ fontSize: F.xs, color: T.ink3 }}>{a.tax > 0 ? `+ ${money0(a.tax)} tax` : ""}</span>
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, minWidth: 84, textAlign: "right" }}>{fmt(sold)}</span>
        </div>
      </div>
      {a.unpriced.length > 0 && (
        <div className="mt-1" style={{ fontSize: F.xs, color: T.hiviz }}>
          Left out until priced: {a.unpriced.slice(0, 4).map((l) => l.name).join(", ")}{a.unpriced.length > 4 ? ` +${a.unpriced.length - 4}` : ""}
        </div>
      )}
    </div>
  );

  const numBox = (label: string, value: number | null, onSave: (v: number | null) => void, hint?: string, disabled?: boolean) => (
    <label className="flex flex-col gap-0.5" style={{ minWidth: 0 }}>
      <span style={{ ...eyebrow }}>{label}</span>
      {disabled ? <span style={{ fontSize: F.xs, color: T.ink3, height: 28, display: "flex", alignItems: "center" }}>{hint}</span>
        : <span className="inline-flex items-center rounded" style={{ border: `1px solid ${T.hair}`, background: T.card, height: 30, width: "100%", maxWidth: 110, paddingLeft: 2 }}>
            <Cell value={value} label={label} placeholder={hint ?? ""} onSave={onSave} width={64} />
          </span>}
    </label>
  );

  const crewBox = (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...eyebrow }}>Crew and days</div>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {numBox("Crew", crew?.size ?? null, (v) => void save({ crew_size: v === null ? null : Math.round(v) }), crew ? "people" : "waits for 093", !crew)}
        {numBox("Days", days, (v) => void save({ duration_days: v }), "days")}
        {numBox("Hours a day", crew?.hours ?? null, (v) => void save({ crew_hours: v }), "8", !crew)}
      </div>
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
      <div className="mt-2" style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.6, ...nums }}>
        {c.manDays !== null
          ? <>{c.manDays.toLocaleString("en-US", { maximumFractionDigits: 1 })} man-days · {c.manHours!.toLocaleString("en-US", { maximumFractionDigits: 1 })} man-hours</>
          : <span style={{ color: T.ink3 }}>Set {c.needs.join(" and ")} for man-days and man-hours.</span>}
        {c.sfPerDay !== null && <> · {Math.round(c.sfPerDay).toLocaleString("en-US")} SF a crew day</>}
        {c.laborPerHour !== null && <> · labor {money(c.laborPerHour)} a man-hour</>}
        <div>
          {dayMinimum !== null && days !== null && days > 0 ? (() => {
            const min = dayMinimum * days;
            const short = min - sold;
            return <>Job minimum {money0(min)} ({days} × {money0(dayMinimum)}) · {section !== "all" ? "for the whole job" : short > 0 ? <span style={{ color: T.red }}>short by {money0(short)}</span> : a.unpriced.length ? <span style={{ color: T.ink3 }}>not all priced yet</span> : <span style={{ color: T.green }}>cleared</span>}</>;
          })() : <span style={{ color: T.ink3 }}>Job minimum needs {dayMinimum === null ? "a day minimum (Settings → Cost book)" : "days"}.</span>}
        </div>
      </div>
    </div>
  );

  const profitBox = (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...eyebrow }}>Profit{a.margin !== null ? ` · margin ${(a.margin * 100).toFixed(1)}%` : ""}
        {a.unpriced.length > 0 && <span style={{ color: T.hiviz }}> · partial, until every item is priced</span>}</div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
        {big(c.grossPerDay, "gross a day", a.gross < 0 ? T.red : undefined)}
        {big(c.netPerDay, "net a day", a.net < 0 ? T.red : T.green)}
        {big(a.gross, "gross profit · price − direct cost")}
        {big(a.net, a.risk > 0 ? "net profit · gross − overhead − risk" : "net profit · gross − overhead")}
      </div>
      {c.netPerManDay !== null && <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 6, ...nums }}>{money0(c.netPerManDay)} net a man-day</div>}
      {days === null && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>Set the days for profit a day.</div>}
    </div>
  );

  return (
    <div className="mt-2.5 pt-2" style={{ borderTop: `1px solid ${T.hair}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Cost analysis</span>
        <span className="flex-1" />
        {areas.length > 1 && (
          <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Which section"
            style={{ height: 26, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.xs, borderRadius: 4, padding: "0 4px", maxWidth: 160 }}>
            <option value="all">Whole job</option>
            {areas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        <span className="inline-flex rounded overflow-hidden" role="group" aria-label="Show as" style={{ border: `1px solid ${T.hair}` }}>
          {(["$", "sf", "sy", "lf"] as Per[]).filter((p) => p !== "lf" || a.units.lf > 0 || per === "lf").map((p, i) => (
            <button key={p} onClick={() => pickPer(p)} aria-pressed={shownPer === p} style={{ ...pill(shownPer === p), borderLeft: i ? `1px solid ${T.hair}` : "none" }}>{PER_LABEL[p]}</button>
          ))}
        </span>
      </div>
      {!perOk && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>No {per === "lf" ? "lineal feet" : "area"} measured {section === "all" ? "on this job" : "in this section"} — shown in dollars.</div>}
      {shownPer !== "$" && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2, ...nums }}>
        Over {shownPer === "lf" ? `${a.units.lf.toLocaleString("en-US", { maximumFractionDigits: 1 })} LF` : shownPer === "sy" ? `${a.units.sy.toLocaleString("en-US", { maximumFractionDigits: 1 })} SY` : `${a.units.sf.toLocaleString("en-US", { maximumFractionDigits: 1 })} SF`}
        {section === "all" ? " on the whole job" : ""}
      </div>}
      <div className={wide ? "mt-2 grid gap-4" : "mt-2 flex flex-col gap-3"} style={wide ? { gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)" } : undefined}>
        {breakdown}
        <div className="flex flex-col gap-3">
          {profitBox}
          {crewBox}
        </div>
      </div>
    </div>
  );
}
