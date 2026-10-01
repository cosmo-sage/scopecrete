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
import { budget as priceBudget, takeoffUnit, type BudgetLine, type BudgetSettings, type TakeoffTotal } from "@/lib/engine";
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

export function BudgetStep({ jobId, data, b, onSend }: { jobId: string; data: PlansData; b: Budget | null; onSend: (p: Param) => void }) {
  const res = useMemo(() => b ? priceBudget(b.lines, b.options.map((o) => o.id), b.settings, [], null,
    { tax_on: b.estimate?.tax_on ?? true, discount: b.estimate?.discount_amount ?? 0, takeoff: b.takeoff }) : null, [b]);
  const linkedLines = (p: Param) => (b?.lines ?? []).filter((l) => l.takeoff_parameter_id === p.id);
  const sum = (unit: string) => data.params.filter((p) => KIND_UNIT[p.kind] === unit).reduce((a, p) => a + (data.totals[p.id]?.qty ?? 0), 0);
  const fromPlans = (b?.lines ?? []).filter((l) => l.takeoff_parameter_id).reduce((a, l) => a + (res?.lines[l.id]?.ext_price ?? 0), 0);
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
          <span>Budget line ← group</span><span>Sheet · method</span><span style={{ textAlign: "right" }}>Qty</span><span>Unit</span><span style={{ textAlign: "right" }}>Rate</span><span style={{ textAlign: "right" }}>Total</span>
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
                return (
                  <div key={l?.id ?? "none"} className="md:grid px-3 py-2 gap-2" style={{ gridTemplateColumns: "1.7fr 1.3fr 110px 80px 100px 120px", background: T.slab, fontWeight: 600, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: F.sm, ...clip }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: p.color, marginRight: 6 }} />{l ? `${l.name} ← ${p.name}` : p.name}</div>
                      <div style={{ fontSize: 11, color: l ? T.ink3 : T.hivizText, fontWeight: 400 }}>{KIND_LABEL[p.kind]} · {shapes.length} section{shapes.length === 1 ? "" : "s"}{l ? "" : " · no budget line"}</div>
                    </div>
                    <div style={{ fontSize: F.xs, color: T.ink3, fontWeight: 400 }}>{r?.blocked.length ? <span style={{ color: T.hivizText }}>{r.blocked[0]}</span> : ""}</div>
                    <div style={{ textAlign: "right", fontSize: F.sm, ...nums }}>{t?.qty !== null && t?.qty !== undefined ? (l && takeoffUnit(l.unit) === "CY" ? `${(r?.qty ?? 0).toFixed(2)}` : fmtQty(t.qty, t.unit).replace(/ \w+$/, "")) : "—"}</div>
                    <div style={{ fontSize: F.sm }}>{l ? l.unit : t?.unit}</div>
                    <div style={{ textAlign: "right", fontSize: F.sm, ...nums, color: l ? T.ink : T.hivizText }}>{l && l.unit_cost !== null ? `$${l.unit_cost}` : "no rate"}</div>
                    <div style={{ textAlign: "right", fontFamily: strong, fontSize: 13, ...nums }}>
                      {r?.ext_price !== null && r?.ext_price !== undefined ? money(r.ext_price) : l ? "—" : (
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
export function SendSheet({ jobId, p, total, b, onClose, onSent }: {
  jobId: string; p: Param | null; total: TakeoffTotal | undefined; b: Budget | null; onClose: () => void; onSent: () => void;
}) {
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const want = p ? KIND_UNIT[p.kind] : null;
  const groupName = new Map((b?.groups ?? []).map((g) => [g.id, g.name]));
  const fits = (c: Card) => { const u = takeoffUnit(c.unit); return u === want || (u === "CY" && p?.kind === "area"); };
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = (b?.cards ?? []).filter((c) => words.every((w) => `${c.name} ${groupName.get(c.cost_group_id ?? "") ?? ""}`.toLowerCase().includes(w)))
    .sort((a, z) => Number(fits(z)) - Number(fits(a))).slice(0, 40);
  const send = async (c: Card) => {
    if (!p) return;
    setBusy(true); setErr(null);
    try { await call(`/api/jobs/${jobId}/budget/lines`, "POST", { cost_item_id: c.id, takeoff_parameter_id: p.id }); onSent(); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={!!p} onClose={onClose} title={p ? `Send ${p.name} to the budget` : ""} sub={total?.qty !== null && total?.qty !== undefined ? `${fmtQty(total.qty, total.unit)} measured${total.cy !== null ? ` · ${total.cy.toFixed(1)} CY` : ""}` : total?.blocked ?? undefined}>
      <div className="p-3">
        <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45 }}>
          Pick the Price book card it is priced as. The line counts this group&apos;s total in the card&apos;s unit ({want}{p?.kind === "area" ? `, or CY with a depth` : ""}); re-measuring moves it.
        </div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a card — form & finish, 4000 psi…" aria-label="Find a card"
          className="w-full mt-2" style={{ height: 36, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 8px", background: T.card, color: T.ink, fontSize: F.sm }} />
        {err && <div className="mt-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <div className="mt-2 flex flex-col">
          {!b && <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading the Price book…</div>}
          {b && !list.length && <div style={{ fontSize: F.sm, color: T.ink3 }}>No card matches.</div>}
          {list.map((c) => {
            const ok = fits(c);
            return (
              <button key={c.id} disabled={busy} onClick={() => void send(c)} className="flex items-center gap-2 py-2 text-left" style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer", opacity: ok ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.ink3 }}>{groupName.get(c.cost_group_id ?? "") ?? "No group"}{ok ? "" : ` · counted in ${c.unit} — won't match ${want}`}</div>
                </div>
                <span style={{ fontSize: F.sm, ...nums }}>{c.unit_cost !== null ? `$${c.unit_cost}/${c.unit}` : <span style={{ color: T.hivizText }}>no price</span>}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3" style={{ fontFamily: light, fontWeight: 300, fontSize: F.xs, color: T.ink3 }}>New cards are made in the Price book.</div>
      </div>
    </Drawer>
  );
}
