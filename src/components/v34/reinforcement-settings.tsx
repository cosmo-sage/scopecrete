"use client";

/**
 * Reinforcement in cost settings — Coy's list of what he puts in a slab and
 * what it costs, each priced by the unit he buys it in (migration 042), and
 * the defaults: which one a new section gets for each kind of job and work
 * ("residential driveways are 6x6 10 gauge wire mesh").
 *
 * Fields save on blur, one at a time. Blank is blank: the engine names what a
 * type still needs before a section using it can be priced.
 */

import React, { useCallback, useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums } from "@/lib/v34/tokens";
import type { ReinforcementType } from "@/lib/engine";

type RType = ReinforcementType & { active: boolean };
type Default = { job_type: string; work_type: string; reinforcement_type_id: string };

const KIND_UNITS: Record<string, Array<[string, string]>> = {
  mesh: [["sheet", "by the sheet"], ["sqft", "by the sq ft"]],
  rebar: [["stick", "by the stick"], ["lf", "by the foot"]],
  fiber: [["lb", "by the lb"], ["bag", "by the bag"]],
  other: [["sqft", "by the sq ft"]],
};
const KIND_LABEL: Record<string, string> = { mesh: "Wire mesh", rebar: "Rebar grid", fiber: "Fiber", other: "Other" };
const JOB_TYPES: Array<[string, string]> = [["residential", "Residential"], ["commercial", "Commercial"], ["public", "Government"]];
const WORK_TYPES: Array<[string, string]> = [["driveway", "Driveway"], ["slab", "Slab"], ["patio", "Patio"], ["sidewalk", "Sidewalk"], ["footing", "Footing"], ["curb", "Curb"]];

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

/** The numbers each kind's quantity rule needs, with the unit shown beside the box. */
function fieldsFor(t: RType): Array<{ k: keyof ReinforcementType; label: string; unit: string; hint: string }> {
  const cost = { k: "unit_cost" as const, label: "Cost", unit: `$ / ${t.unit === "lf" ? "ft" : t.unit === "sqft" ? "sq ft" : t.unit}`, hint: "what you pay" };
  if (t.kind === "mesh" && t.unit === "sheet") return [cost, { k: "sheet_sqft", label: "One sheet covers", unit: "sq ft", hint: "after lap — a 5×10 sheet is about 45" }];
  if (t.kind === "rebar") return [cost,
    { k: "spacing_in", label: "Spacing", unit: "in o.c.", hint: "both ways" },
    ...(t.unit === "stick" ? [{ k: "stick_ft" as const, label: "Stick length", unit: "ft", hint: "usually 20" }] : []),
    { k: "lap_pct", label: "Lap & ends", unit: "%", hint: "blank = no allowance" }];
  if (t.kind === "fiber") return [cost, { k: "per_cy", label: "Per yard", unit: `${t.unit} / cu yd`, hint: "dose" }];
  return [cost];
}

export function ReinforcementSettings() {
  const [types, setTypes] = useState<RType[] | null>(null);
  const [defaults, setDefaults] = useState<Default[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState({ name: "", kind: "mesh", unit: "sheet" });

  const [tick, setTick] = useState(0);
  const load = useCallback(async () => { setTick((n) => n + 1); }, []);
  useEffect(() => {
    let off = false;
    send("/api/settings/reinforcement", "GET")
      .then((b) => { if (!off) { setTypes(b.types as RType[]); setDefaults(b.defaults as Default[]); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);

  const patch = async (id: string, p: Record<string, unknown>) => {
    setErr(null);
    try { const b = await send(`/api/settings/reinforcement/${id}`, "PATCH", p); setTypes((ts) => ts && ts.map((t) => (t.id === id ? b.type : t))); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const add = async () => {
    if (!adding.name.trim()) return;
    setErr(null);
    try { await send("/api/settings/reinforcement", "POST", adding); setAdding({ name: "", kind: "mesh", unit: "sheet" }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const remove = async (id: string) => {
    setErr(null);
    try { await send(`/api/settings/reinforcement/${id}`, "DELETE"); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const setDefault = async (job_type: string, work_type: string, id: string) => {
    setErr(null);
    try {
      await send("/api/settings/reinforcement", "PUT", { job_type, work_type, reinforcement_type_id: id || null });
      setDefaults((ds) => [...ds.filter((d) => !(d.job_type === job_type && d.work_type === work_type)),
        ...(id ? [{ job_type, work_type, reinforcement_type_id: id }] : [])]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const input: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.sm, borderRadius: 4, padding: "0 8px" };

  return (
    <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
      <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>Reinforcement</div>
      <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4, marginBottom: 6 }}>
        Priced by the unit you buy it in, as a material — marked up and taxed with materials. A section with none chosen is listed as not in the price.
      </div>

      {types === null ? (
        <div className="rounded animate-pulse" style={{ height: 40, background: T.hairSoft }} />
      ) : (
        <div className="flex flex-col gap-2">
          {types.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3 }}>None yet. Add what you use below.</div>}
          {types.map((t) => (
            <div key={t.id} className="rounded px-2.5 py-2" style={{ border: `1px solid ${T.hair}`, background: "#fff" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <input defaultValue={t.name} aria-label="Name" onBlur={(e) => { if (e.target.value.trim() && e.target.value !== t.name) void patch(t.id, { name: e.target.value }); }}
                  style={{ ...input, flex: "1 1 160px", fontWeight: 600 }} />
                <span style={{ ...eyebrow, color: T.ink2 }}>{KIND_LABEL[t.kind] ?? t.kind}</span>
                <select value={t.unit} aria-label="Bought" onChange={(e) => void patch(t.id, { unit: e.target.value })} style={input}>
                  {(KIND_UNITS[t.kind] ?? KIND_UNITS.other).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button onClick={() => void remove(t.id)} style={{ fontSize: F.xs, color: T.red, cursor: "pointer" }}>Remove</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" style={{ marginTop: 6 }}>
                {fieldsFor(t).map((f) => {
                  const v = t[f.k] as number | null | undefined;
                  return (
                    <label key={String(f.k)} className="block" style={{ minWidth: 0 }}>
                      <span style={eyebrow}>{f.label}</span>
                      <div className="flex items-center rounded mt-0.5" style={{ border: `1px solid ${v === null || v === undefined ? T.hiviz : T.hair}`, height: 34, background: "#fff" }}>
                        <input type="number" inputMode="decimal" defaultValue={v ?? ""} aria-label={f.label}
                          onBlur={(e) => { const n = e.target.value === "" ? null : Number(e.target.value); if (n !== (v ?? null)) void patch(t.id, { [f.k]: n }); }}
                          className="w-full bg-transparent outline-none px-2" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums, minWidth: 0 }} />
                        <span className="pr-2 shrink-0" style={{ fontSize: 9.5, color: T.ink3 }}>{f.unit}</span>
                      </div>
                      <span style={{ fontSize: 9.5, color: T.ink3 }}>{v === null || v === undefined ? "not recorded" : "you set it"} · {f.hint}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 flex-wrap">
            <input value={adding.name} placeholder="e.g. 6x6 10 ga wire mesh" aria-label="New reinforcement name"
              onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} style={{ ...input, flex: "1 1 180px" }} />
            <select value={adding.kind} aria-label="Kind" style={input}
              onChange={(e) => setAdding((a) => ({ ...a, kind: e.target.value, unit: (KIND_UNITS[e.target.value] ?? KIND_UNITS.other)[0][0] }))}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={adding.unit} aria-label="Bought" style={input} onChange={(e) => setAdding((a) => ({ ...a, unit: e.target.value }))}>
              {(KIND_UNITS[adding.kind] ?? KIND_UNITS.other).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button onClick={() => void add()} disabled={!adding.name.trim()} className="rounded px-3"
              style={{ height: 34, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", opacity: adding.name.trim() ? 1 : 0.5 }}>
              + Add
            </button>
          </div>

          {types.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ ...eyebrow, color: T.ink }}>Defaults for new sections</div>
              <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 4 }}>A new section takes this, labelled as the default. You can change it on the section.</div>
              <div className="overflow-x-auto">
                <table style={{ borderCollapse: "collapse", fontSize: F.xs }}>
                  <thead>
                    <tr>
                      <th />
                      {JOB_TYPES.map(([k, l]) => <th key={k} style={{ ...eyebrow, textAlign: "left", padding: "2px 6px" }}>{l}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {WORK_TYPES.map(([wk, wl]) => (
                      <tr key={wk}>
                        <td style={{ padding: "2px 6px 2px 0", color: T.ink2, whiteSpace: "nowrap" }}>{wl}</td>
                        {JOB_TYPES.map(([jk]) => {
                          const cur = defaults.find((d) => d.job_type === jk && d.work_type === wk)?.reinforcement_type_id ?? "";
                          return (
                            <td key={jk} style={{ padding: 2 }}>
                              <select value={cur} aria-label={`Default for ${jk} ${wk}`} onChange={(e) => void setDefault(jk, wk, e.target.value)}
                                style={{ ...input, height: 30, fontSize: F.xs, maxWidth: 150, color: cur ? T.ink : T.ink3 }}>
                                <option value="">none</option>
                                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
