"use client";
/**
 * Plan Room step 4 — Budget (design/plan-room). Each takeoff group and the
 * budget line that counts it, priced by the engine's own budget() from the
 * job's budget (so these are the job page's numbers), with each shape as a
 * child row showing its share. Send to budget picks a card from the Price
 * book; the line's quantity is the group's measured total (rule
 * from_takeoff) — re-measure and it moves.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, strong, light, nums } from "@/lib/v34/tokens";
import { budget as priceBudget, takeoffUnit, type BudgetLine, type BudgetSettings, type SectionInput, type TakeoffTotal } from "@/lib/engine";
import { fmtQty, KIND_UNIT } from "@/lib/takeoff";
import { Sheet as Drawer } from "@/components/v34/primitives";
import { call, KIND_LABEL, sheetLabel, type Param, type PlansData } from "./shared";

interface Card { id: string; name: string; unit: string; unit_cost: number | null; cost_type: string; cost_group_id: string | null }
interface Budget {
  estimate: { tax_on: boolean; discount_amount: number } | null;
  options: Array<{ id: string; label: string }>;
  lines: Array<BudgetLine & { takeoff_parameter_id?: string | null }>;
  cards: Card[]; groups: Array<{ id: string; name: string }>;
  settings: BudgetSettings; takeoff?: Record<string, TakeoffTotal>;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function useBudget(jobId: string, tick: number) {
  const [b, setB] = useState<Budget | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/budget`, "GET").then((x) => { if (!off) { setB(x as Budget); setErr(null); } }).catch((e) => { if (!off) setErr(String(e.message ?? e)); });
    return () => { off = true; };
  }, [jobId, tick]);
  return { b, err };
}

export function BudgetStep({ jobId, data, b, sections, onSend }: { jobId: string; data: PlansData; b: Budget | null; sections?: SectionInput[]; onSend: (p: Param) => void }) {
  // Priced with the job's sections, so lines counted from an area price as on the Budget.
  const res = useMemo(() => b ? priceBudget(b.lines, b.options.map((o) => o.id), b.settings, sections ?? [], null,
    { tax_on: b.estimate?.tax_on ?? true, discount: b.estimate?.discount_amount ?? 0, takeoff: b.takeoff }) : null, [b, sections]);
  const linkedLines = (p: Param) => (b?.lines ?? []).filter((l) => l.takeoff_parameter_id === p.id);
  // Since 069 a group's takeoffs go into budget sections, priced by the section's own lines, not by
  // a line counted from the group (Coy, 2026-10-11: "Why does it show no rate, when the budget is
  // ready?"). The sections a group's shapes are in, and what their lines come to.
  const inSections = (p: Param) => {
    const ids = [...new Set(data.measurements.filter((m) => m.parameter_id === p.id && m.section_id).map((m) => m.section_id as string))];
    if (!ids.length || !res) return null;
    const lines = (b?.lines ?? []).filter((l) => l.section_id && ids.includes(l.section_id));
    const priced = lines.map((l) => res.lines[l.id]?.ext_price).filter((x): x is number => typeof x === "number");
    const names = ids.map((id) => (sections ?? []).find((x) => x.id === id)?.name || "a section");
    return { names, lines: lines.length, total: priced.length ? priced.reduce((a, x) => a + x, 0) : null, unpriced: lines.length - priced.length };
  };
  const sum = (unit: string) => data.params.filter((p) => KIND_UNIT[p.kind] === unit).reduce((a, p) => a + (data.totals[p.id]?.qty ?? 0), 0);
  const planSections = new Set(data.measurements.map((m) => m.section_id).filter(Boolean) as string[]);
  const fromPlans = (b?.lines ?? []).filter((l) => l.takeoff_parameter_id || (l.section_id && planSections.has(l.section_id))).reduce((a, l) => a + (res?.lines[l.id]?.ext_price ?? 0), 0);
  const sheets = new Map(data.sheets.map((s) => [s.id, s]));
  return (
    <div className="p-3 lg:p-5" style={{ maxWidth: 1100 }}>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {[["From the plans", money(fromPlans), "price of the lines counted from takeoffs"], ["Flatwork", fmtQty(sum("SF"), "SF"), "area groups"],
          ["Linear", fmtQty(sum("LF"), "LF"), "linear groups"], ["Count", fmtQty(sum("EA"), "EA"), "count groups"]].map(([k, v, d]) => (
          <div key={k} className="rounded p-3" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
            <div style={eyebrow}>{k}</div>
            <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 20, ...nums }}>{v}</div>
            <div style={{ fontSize: F.xs, color: T.ink3 }}>{d}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="hidden md:grid px-3 py-2 gap-2" style={{ gridTemplateColumns: "1.7fr 1.3fr 110px 80px 100px 120px", ...eyebrow, borderBottom: `1px solid ${T.hair}` }}>
          <span>Takeoff parameters → group</span><span>Sheet · method</span><span style={{ textAlign: "right" }}>Qty</span><span>Unit</span><span style={{ textAlign: "right" }}>Rate</span><span style={{ textAlign: "right" }}>Total</span>
        </div>
        {!data.params.length && <div className="p-3" style={{ fontSize: F.sm, color: T.ink3 }}>No takeoff groups yet — add them on the Takeoff step.</div>}
        {data.params.map((p) => {
          const t = data.totals[p.id];
          const ls = linkedLines(p);
          const shapes = data.measurements.filter((m) => m.parameter_id === p.id);
          return (
            <div key={p.id} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
              {(ls.length ? ls : [null]).map((l, i) => {
                const r = l ? res?.lines[l.id] : null;
                const sec = l ? null : inSections(p);
                return (
                  <div key={l?.id ?? "none"} className="md:grid px-3 py-2 gap-2" style={{ gridTemplateColumns: "1.7fr 1.3fr 110px 80px 100px 120px", background: T.slab, fontWeight: 600, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: F.sm, ...clip }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: p.color, marginRight: 6 }} />{l ? `${l.name} ← ${p.name}` : p.name}</div>
                      <div style={{ fontSize: 11, color: l ? T.ink3 : T.hivizText, fontWeight: 400 }}>{KIND_LABEL[p.kind]} · {shapes.length} takeoff{shapes.length === 1 ? "" : "s"}{l ? "" : sec ? ` · in ${sec.names.join(", ")}` : " · no budget line"}</div>
                    </div>
                    <div style={{ fontSize: F.xs, color: T.ink3, fontWeight: 400 }}>{r?.blocked.length ? <span style={{ color: T.hivizText }}>{r.blocked[0]}</span>
                      : sec ? `${sec.lines} budget item${sec.lines === 1 ? "" : "s"}${sec.unpriced ? ` · ${sec.unpriced} not priced yet` : ""}` : ""}</div>
                    <div style={{ textAlign: "right", fontSize: F.sm, ...nums }}>{t?.qty !== null && t?.qty !== undefined ? (l && (takeoffUnit(l.unit) === "CY" || takeoffUnit(l.unit) === "SY" || (takeoffUnit(l.unit) === "LF" && t.unit === "SF")) ? `${(r?.qty ?? 0).toFixed(2)}` : fmtQty(t.qty, t.unit).replace(/ \w+$/, "")) : "—"}</div>
                    <div style={{ fontSize: F.sm }}>{l ? l.unit : t?.unit}</div>
                    <div style={{ textAlign: "right", fontSize: F.sm, ...nums, color: l || sec ? T.ink : T.hivizText }}>{l && l.unit_cost !== null ? `$${l.unit_cost}`
                      : sec && sec.total !== null && t?.qty ? `$${(sec.total / t.qty).toFixed(2)}/${t.unit}` : sec ? "—" : "no rate"}</div>
                    <div style={{ textAlign: "right", fontFamily: strong, fontSize: 13, ...nums }}>
                      {r?.ext_price !== null && r?.ext_price !== undefined ? money(r.ext_price) : l ? "—" : sec ? (sec.total !== null ? money(sec.total) : "—") : (
                        i === 0 && <button onClick={() => onSend(p)} style={{ fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: T.hivizText, cursor: "pointer" }}>Send to budget</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {shapes.map((m, i) => {
                const q = t?.parts.find((x) => x.id === m.id);
                const l = ls[0];
                const r = l ? res?.lines[l.id] : null;
                const share = q?.qty && t?.qty ? q.qty / t.qty : null;
                const s = sheets.get(m.sheet_id);
                return (
                  <div key={m.id} className="md:grid px-3 py-1.5 gap-2" style={{ gridTemplateColumns: "1.7fr 1.3fr 110px 80px 100px 120px", paddingLeft: 34, fontSize: F.xs, color: T.ink2, alignItems: "center" }}>
                    <div className="flex items-center gap-2" style={{ minWidth: 0 }}><span style={{ width: 4, height: 16, background: p.color, borderRadius: 2 }} /><span style={clip}>{m.name ?? `${p.name} ${i + 1}`}</span></div>
                    <div>{s ? sheetLabel(s) : "—"} · {m.method}</div>
                    <div style={{ textAlign: "right", ...nums }}>{q?.qty !== null && q?.qty !== undefined ? fmtQty(q.qty, KIND_UNIT[p.kind]) : <span style={{ color: T.hivizText }}>{q?.reason}</span>}</div>
                    <div>{share !== null ? `${Math.round(share * 100)}%` : ""}</div>
                    <div />
                    <div style={{ textAlign: "right", ...nums }}>{share !== null && r?.ext_price ? money(r.ext_price * share) : ""}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ fontSize: F.xs, color: T.ink3 }}>
        <span style={{ flex: 1, minWidth: 220 }}>Section rows stay linked. Re-measure on the plan and the budget line moves with it.</span>
        <Link href={`/dashboard/scope/${jobId}`} style={{ fontFamily: disp, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: T.chalk }}>Open the job&apos;s budget ›</Link>
      </div>
    </div>
  );
}

/** Pick the card a takeoff group is counted as. Cards whose unit matches the group's come first. */
/**
 * Send takeoffs to the budget as sections (migration 069; Coy, 2026-10-03:
 * "Pushing to budget should push the area measured under the group. And I
 * should be able to select the individual measurements to push"). The group's
 * shapes with ticks; each its own section (grouped under this group on the
 * budget), all in one section, or into a section already there. Cost items are
 * added to the sections after — this prices nothing.
 */
export function SendSheet({ jobId, p, initial, whole, data, onClose, onSent }: {
  whole?: boolean;
  jobId: string; p: Param | null; data: PlansData | null; onClose: () => void; onSent: () => void;
  /** Takeoffs ticked in the Parameters panel — those come ticked here instead of the ones not yet sent. */
  initial?: string[];
}) {
  const shapes = useMemo(() => (p && data ? data.measurements.filter((m) => m.parameter_id === p.id) : []), [p, data]);
  const [pickState, setPick] = useState<{ k: string; ids: Set<string> } | null>(null);
  const key = `${p?.id ?? ""}:${(initial ?? []).join(",")}`;
  const pick = pickState?.k === key ? pickState.ids
    : new Set(initial?.length ? initial : shapes.filter((m) => !m.section_id).map((m) => m.id));
  const [modeState, setModeState] = useState<{ k: string; m: "each" | "one" | "into" } | null>(null);
  const mode = modeState?.k === key ? modeState.m : whole ? "one" : "each";
  const setMode = (m: "each" | "one" | "into") => setModeState({ k: key, m });
  const [name, setName] = useState("");
  const [work, setWork] = useState("");
  const [into, setInto] = useState("");
  const [sections, setSections] = useState<Array<{ id: string; name: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!p) return;
    let off = false;
    call(`/api/jobs/${jobId}/sections`, "GET").then((b) => { if (!off) setSections(b.sections ?? []); }).catch(() => {});
    return () => { off = true; };
  }, [jobId, p]);
  const secName = new Map(sections.map((x, i) => [x.id, x.name || `Section ${i + 1}`]));
  const toggle = (id: string) => { const n = new Set(pick); if (n.has(id)) n.delete(id); else n.add(id); setPick({ k: key, ids: n }); };
  const parts = p && data ? data.totals[p.id]?.parts ?? [] : [];
  const unit = p ? KIND_UNIT[p.kind] : "SF";
  const sum = [...pick].reduce((a, id) => { const q = parts.find((x) => x.id === id)?.qty; return a === null || q === null || q === undefined ? null : a + q; }, 0 as number | null);
  const send = async () => {
    if (!p || !pick.size) return;
    setBusy(true); setErr(null);
    try {
      await call(`/api/jobs/${jobId}/takeoff/send`, "POST", { measurement_ids: [...pick], mode, ...(mode === "one" && name.trim() ? { name: name.trim() } : {}),
        ...(mode === "into" ? { section_id: into } : {}), ...(work && mode !== "into" ? { work_type: work } : {}) });
      onSent(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const seg = (on: boolean): React.CSSProperties => ({ flex: 1, height: 32, borderRadius: 3, border: `1px solid ${on ? T.hiviz : T.hair}`, background: on ? T.hivizDim : T.card, color: on ? T.hivizText : T.ink, fontSize: F.xs, fontWeight: 600, cursor: "pointer" });
  return (
    <Drawer open={!!p} onClose={onClose} title={p ? `Send ${p.name} to the budget` : ""} sub="Each shape you tick becomes the size of a budget section — and follows it when you re-draw it here.">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span style={{ ...eyebrow, flex: 1 }}>Takeoffs · {shapes.length}</span>
          <button onClick={() => setPick({ k: key, ids: new Set(shapes.map((m) => m.id)) })} style={{ fontSize: F.xs, color: T.chalk, cursor: "pointer" }}>All</button>
          <button onClick={() => setPick({ k: key, ids: new Set() })} style={{ fontSize: F.xs, color: T.chalk, cursor: "pointer" }}>None</button>
        </div>
        {shapes.map((m, i) => {
          const q = parts.find((x) => x.id === m.id);
          const s = data?.sheets.find((x) => x.id === m.sheet_id);
          return (
            <label key={m.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
              <input type="checkbox" checked={pick.has(m.id)} onChange={() => toggle(m.id)} />
              <span style={{ width: 4, alignSelf: "stretch", background: p?.color, borderRadius: 2 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: F.sm, ...clip }}>{m.name ?? `${p?.name} ${i + 1}`}
                <span style={{ color: T.ink3, fontSize: F.xs }}> · {s ? sheetLabel(s) : "?"}{m.section_id ? ` · in ${secName.get(m.section_id) ?? "a section"}` : ""}</span></span>
              <span style={{ fontSize: F.sm, ...nums, color: q?.qty === null ? T.hivizText : T.ink }}>{q?.qty !== null && q?.qty !== undefined ? fmtQty(q.qty, unit) : "scale not set"}</span>
            </label>
          );
        })}
        {!shapes.length && <div style={{ fontSize: F.sm, color: T.ink3 }}>Nothing measured in this group yet.</div>}

        <div className="flex gap-1 mt-3">
          <button onClick={() => setMode("each")} style={seg(mode === "each")}>Each its own section</button>
          <button onClick={() => setMode("one")} style={seg(mode === "one")}>All in one section</button>
          <button onClick={() => setMode("into")} disabled={!sections.length} style={{ ...seg(mode === "into"), opacity: sections.length ? 1 : 0.45 }}>Into a section</button>
        </div>
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4, lineHeight: 1.4 }}>
          {mode === "each" ? `A section per shape, named for it, under ${p?.name ?? "this group"} on the budget.`
            : mode === "one" ? "One section whose size is all of them added up." : "Added to a section already on the budget; its size becomes its takeoffs' sum."}
          {[...pick].some((id) => shapes.find((m) => m.id === id)?.section_id) ? " A ticked shape already in a section moves." : ""}
        </div>
        {mode === "one" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder={p?.name ?? "Section name"} aria-label="Section name"
          className="w-full mt-2" style={{ height: 34, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 8px", background: T.card, color: T.ink, fontSize: F.sm }} />}
        {mode === "into" && (
          <select value={into} onChange={(e) => setInto(e.target.value)} aria-label="Into which section" className="w-full mt-2"
            style={{ height: 34, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 6px", background: T.card, color: T.ink, fontSize: F.sm }}>
            <option value="">Pick a section…</option>
            {sections.map((x, i) => <option key={x.id} value={x.id}>{x.name || `Section ${i + 1}`}</option>)}
          </select>
        )}
        {mode !== "into" && (
          <select value={work} onChange={(e) => setWork(e.target.value)} aria-label="Kind of area" className="w-full mt-2"
            style={{ height: 34, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 6px", background: T.card, color: T.ink, fontSize: F.sm }}>
            <option value="">Kind of area — guess it from the name</option>
            {["driveway", "patio", "sidewalk", "slab", "footing", "curb", "demo", "prep", "other"].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
          </select>
        )}
        {err && <div className="mt-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <button onClick={() => void send()} disabled={busy || !pick.size || (mode === "into" && !into)} className="w-full rounded mt-3"
          style={{ height: 40, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", opacity: busy || !pick.size || (mode === "into" && !into) ? 0.5 : 1 }}>
          {busy ? "Sending…" : `Send ${pick.size} to the budget${sum !== null && pick.size ? ` · ${fmtQty(sum, unit)}` : ""}`}
        </button>
        <div className="mt-2" style={{ fontFamily: light, fontWeight: 300, fontSize: F.xs, color: T.ink3 }}>Then add cost items to the sections on the budget.</div>
      </div>
    </Drawer>
  );
}
