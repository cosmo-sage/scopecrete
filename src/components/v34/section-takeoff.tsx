"use client";
/**
 * A section's takeoffs on the job page (migration 069; Coy, 2026-10-03: "in
 * that section I can go in and select the measurement I want to pull into that
 * section which should update the quantities for the budget").
 *
 * The strip says which Plan Room shapes the section is counted from and what
 * they add up to, whether the section follows them (ƒ) or has a size typed by
 * hand (✎, with ↺ to follow again), and opens the picker: every shape on the
 * job by group, ticked when it is this section's, "in Patio" when it is
 * another's (ticking it moves it here). One kind per section.
 */
import React, { useState } from "react";
import Link from "next/link";
import { T, F, eyebrow, nums, clip, disp } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { KIND_UNIT, fmtQty, type TakeoffKind } from "@/lib/takeoff";
import type { PlansData } from "@/components/v34/plan-room/shared";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export interface SectionShapes {
  ids: string[]; kind: TakeoffKind | null; unit: string | null;
  total: number | null; blocked: string | null; groupIds: string[];
}

/** What a section's shapes are, from the Plan Room's data (the server writes the size; this is for showing). */
export function shapesOf(sectionId: string, plans: PlansData | null): SectionShapes {
  const none: SectionShapes = { ids: [], kind: null, unit: null, total: null, blocked: null, groupIds: [] };
  if (!plans) return none;
  const mine = plans.measurements.filter((m) => m.section_id === sectionId);
  if (!mine.length) return none;
  const params = new Map(plans.params.map((p) => [p.id, p]));
  const kind = params.get(mine[0].parameter_id)?.kind ?? null;
  let total = 0, blocked: string | null = null;
  for (const m of mine) {
    const p = params.get(m.parameter_id);
    if (!p || p.kind !== kind) continue;
    const part = plans.totals[p.id]?.parts.find((x) => x.id === m.id);
    if (!part || part.qty === null) blocked = blocked ?? part?.reason ?? "can't be counted";
    else total += part.qty;
  }
  return { ids: mine.map((m) => m.id), kind, unit: kind ? KIND_UNIT[kind] : null, total: blocked ? null : total, blocked,
    groupIds: [...new Set(mine.map((m) => m.parameter_id))] };
}

/** The takeoff group a section sits under on the budget page: the one group all its shapes are in. */
export function groupOf(sectionId: string, plans: PlansData | null): string | null {
  const g = shapesOf(sectionId, plans).groupIds;
  return g.length === 1 ? g[0] : null;
}

export function SectionTakeoffStrip({ jobId, sectionId, sectionName, following, plans, sectionNames, onChanged }: {
  jobId: string; sectionId: string; sectionName: string | null; following: boolean; plans: PlansData | null;
  sectionNames: Map<string, string>; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!plans) return null;
  const none = !plans.measurements.length;
  const s = shapesOf(sectionId, plans);
  const follow = async () => {
    setErr(null);
    try { await call(`/api/jobs/${jobId}/sections/${sectionId}`, "PATCH", { takeoff_sync: true }); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="px-3 py-1.5 flex items-center gap-x-2 gap-y-1 flex-wrap" style={{ fontSize: F.xs }}>
      <span style={{ ...eyebrow }}>Measurements</span>
      {s.ids.length ? (
        <>
          <span style={{ color: T.ink2 }}>
            {s.ids.length} shape{s.ids.length === 1 ? "" : "s"} ·{" "}
            <b style={{ color: s.blocked ? T.hivizText : T.ink, ...nums }}>{s.total !== null && s.unit ? fmtQty(s.total, s.unit) : `no total — ${s.blocked}`}</b>
          </span>
          {following
            ? <span title="The size follows Takeoffs: re-draw a shape and it moves" style={{ color: T.green }}>ƒ follows Takeoffs</span>
            : <span style={{ color: T.hivizText }}>✎ size typed here · <button onClick={() => void follow()} style={{ color: T.chalk, fontWeight: 600, cursor: "pointer" }}>↺ follow the takeoff</button></span>}
        </>
      ) : <span style={{ color: T.ink3 }}>{none ? "nothing measured in Takeoffs yet" : "not counted from the plans"}</span>}
      <span className="flex-1" />
      {/* A real button (Coy, 2026-10-03: "i'm not seeing anywhere in the section to pull measurements from the planroom"). */}
      {none
        ? <Link href={`/dashboard/scope/${jobId}/plans?step=takeoff`} className="rounded px-2.5 inline-flex items-center"
            style={{ height: 28, border: `1px solid ${T.hairStrong}`, color: T.ink, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em" }}>Measure in Takeoffs ›</Link>
        : <button onClick={() => setOpen(true)} className="rounded px-2.5"
            style={{ height: 28, border: `1px solid ${T.ink}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>
            {s.ids.length ? "Change measurements" : "+ Pull measurements from Takeoffs"}
          </button>}
      {err && <span style={{ color: T.red }}>{err}</span>}
      {open && <Picker jobId={jobId} sectionId={sectionId} sectionName={sectionName} plans={plans} chosen={s.ids} sectionNames={sectionNames}
        onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onChanged(); }} />}
    </div>
  );
}

function Picker({ jobId, sectionId, sectionName, plans, chosen, sectionNames, onClose, onSaved }: {
  jobId: string; sectionId: string; sectionName: string | null; plans: PlansData; chosen: string[]; sectionNames: Map<string, string>;
  onClose: () => void; onSaved: () => void;
}) {
  const [pick, setPick] = useState<Set<string>>(new Set(chosen));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const params = new Map(plans.params.map((p) => [p.id, p]));
  const kind = [...pick].map((id) => params.get(plans.measurements.find((m) => m.id === id)?.parameter_id ?? "")?.kind).find(Boolean) ?? null;
  const sheets = new Map(plans.sheets.map((x) => [x.id, x]));
  const toggle = (id: string) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = async () => {
    setBusy(true); setErr(null);
    try { await call(`/api/jobs/${jobId}/sections/${sectionId}/takeoff`, "PUT", { measurement_ids: [...pick] }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  let total = 0, blocked = false;
  for (const id of pick) {
    const m = plans.measurements.find((x) => x.id === id);
    const part = m ? plans.totals[m.parameter_id]?.parts.find((x) => x.id === id) : null;
    if (!part || part.qty === null) blocked = true; else total += part.qty;
  }
  return (
    <Sheet open onClose={onClose} title={`Takeoffs for ${sectionName || "this section"}`} sub="Tick the shapes this section is counted from. Its size is their sum and follows Takeoffs.">
      <div className="px-3 pb-3">
        {plans.params.map((p) => {
          const shapes = plans.measurements.filter((m) => m.parameter_id === p.id);
          if (!shapes.length) return null;
          const off = kind !== null && p.kind !== kind;
          return (
            <div key={p.id} className="mt-2">
              <div className="flex items-center gap-2" style={{ fontSize: F.sm, fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                <span style={{ flex: 1, ...clip }}>{p.name}</span>
                <span style={{ fontSize: F.xs, color: T.ink3 }}>{KIND_UNIT[p.kind]}{off ? " · another kind than what's ticked" : ""}</span>
              </div>
              {shapes.map((m, i) => {
                const part = plans.totals[p.id]?.parts.find((x) => x.id === m.id);
                const elsewhere = m.section_id && m.section_id !== sectionId ? sectionNames.get(m.section_id) ?? "another section" : null;
                const sh = sheets.get(m.sheet_id);
                return (
                  <label key={m.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, opacity: off ? 0.45 : 1, cursor: off ? "not-allowed" : "pointer" }}>
                    <input type="checkbox" checked={pick.has(m.id)} disabled={off} onChange={() => toggle(m.id)} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: F.sm, ...clip }}>{m.name ?? `${p.name} ${i + 1}`}
                      <span style={{ color: T.ink3, fontSize: F.xs }}> · {sh?.number ?? `p.${sh?.page ?? "?"}`}{elsewhere ? ` · in ${elsewhere}` : ""}</span></span>
                    <span style={{ fontSize: F.sm, ...nums, color: part?.qty === null ? T.hivizText : T.ink }}>{part?.qty !== null && part?.qty !== undefined ? fmtQty(part.qty, KIND_UNIT[p.kind]) : "scale not set"}</span>
                  </label>
                );
              })}
            </div>
          );
        })}
        <div className="flex items-center gap-2 mt-3">
          <span style={{ flex: 1, fontSize: F.sm, ...nums }}>{pick.size ? (blocked ? "Some ticked shapes can't be counted yet" : `${fmtQty(total, kind ? KIND_UNIT[kind] : "SF")} from ${pick.size}`) : chosen.length ? "None ticked — the size from the takeoff comes off (cost items stay)" : "Tick the shapes to count"}</span>
          <button onClick={() => void save()} disabled={busy} className="rounded px-3"
            style={{ height: 34, background: T.hiviz, color: T.onHiviz, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Use these"}</button>
        </div>
        {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>{err}</div>}
      </div>
    </Sheet>
  );
}
