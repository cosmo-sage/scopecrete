"use client";

/**
 * Assemblies — the Price book's second tab (step 3b, migration 050). Coy's
 * default set of cost cards for a kind of area: "residential driveways get
 * 3000 psi by the yard, form & finish by the foot, 6x6 mesh". When an area of
 * that kind is added to a job, an auto-loading assembly fills its budget —
 * labelled "from Residential driveway", because it is his own setting, not a
 * guess. Any assembly can also be loaded by hand from the budget.
 *
 * One auto-loading assembly per job type × kind of area (the database
 * enforces it); the exact job type wins over "any job".
 */

import React, { useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, money } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { QTY_RULE_LABEL, isReinforcementCard, type QtyRule } from "@/lib/cost-cards";
import { JOB_TYPES, JOB_TYPE_LABEL, WORK_TYPES, WORK_TYPE_LABEL, appliesTo } from "@/lib/assemblies";
import { call, type Card } from "@/components/v34/cost-cards";

interface Item { id: string; cost_item_id: string; quantity: number | null; sort_order: number }
interface Assembly {
  id: string; name: string; job_type: string | null; work_type: string | null; auto_load: boolean;
  reinforcement_item_id: string | null; sort_order: number; items: Item[];
}

export function Assemblies({ cards }: { cards: Card[] }) {
  const [list, setList] = useState<Assembly[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const reload = () => setTick((n) => n + 1);

  useEffect(() => {
    let off = false;
    call("/api/assemblies", "GET")
      .then((b) => { if (!off) { setList(b.assemblies as Assembly[]); setErr(null); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const add = async () => {
    setErr(null);
    try {
      const b = await call("/api/assemblies", "POST", { name: "New assembly", auto_load: false });
      setList((l) => [...(l ?? []), b.assembly as Assembly]);
      setOpen((b.assembly as Assembly).id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const editing = list?.find((a) => a.id === open) ?? null;

  return (
    <div className="mt-3">
      <div className="flex items-start gap-2 flex-wrap">
        <div style={{ flex: 1, minWidth: 220, fontSize: F.xs, color: T.ink3, lineHeight: 1.45 }}>
          The cards a kind of area always needs. Add a driveway to a residential job and its assembly fills the budget for that area — you still see and change every line.
        </div>
        <button onClick={() => void add()} className="rounded px-2.5"
          style={{ height: 32, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
          + Assembly
        </button>
      </div>
      {err && <div className="mt-2" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
      {list === null && !err && <div className="rounded animate-pulse mt-3" style={{ height: 80, background: T.hairSoft }} />}
      {list !== null && list.length === 0 && (
        <div className="mt-3 rounded p-4" style={{ background: T.card, border: `1px solid ${T.hair}`, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
          No assemblies yet. Start with the job you price most — say a residential driveway: ready mix by the yard, form &amp; finish by the square foot, and your mesh.
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {(list ?? []).map((a) => {
          const r = a.reinforcement_item_id ? cardById.get(a.reinforcement_item_id) : null;
          return (
            <button key={a.id} onClick={() => setOpen(a.id)} className="w-full text-left rounded px-3 py-2.5 flex items-center gap-3"
              style={{ background: T.card, border: `1px solid ${T.hair}`, cursor: "pointer" }}>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{a.name}</span>
                <span style={{ display: "block", fontSize: F.xs, color: T.ink3, ...clip }}>
                  {appliesTo(a)} · {a.items.length} card{a.items.length === 1 ? "" : "s"}{r ? ` · ${r.name}` : ""}
                </span>
              </span>
              {a.auto_load && a.work_type && <span className="rounded px-1.5" style={{ ...eyebrow, color: T.green, border: `1px solid ${T.green}` }}>Auto</span>}
            </button>
          );
        })}
      </div>
      {editing && <AssemblySheet a={editing} cards={cards} cardById={cardById} onClose={() => setOpen(null)} onChanged={reload}
        onLocal={(p) => setList((l) => (l ?? []).map((x) => (x.id === editing.id ? { ...x, ...p } : x)))}
        onDeleted={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function AssemblySheet({ a, cards, cardById, onClose, onChanged, onLocal, onDeleted }: {
  a: Assembly; cards: Card[]; cardById: Map<string, Card>; onClose: () => void; onChanged: () => void; onDeleted: () => void;
  /** Show a change at once; the reload after the save puts back whatever the server kept. */
  onLocal: (p: Partial<Assembly>) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const field: React.CSSProperties = { height: 36, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 8px", width: "100%", minWidth: 0 };
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { onChanged(); }
  };
  const patch = (body: Record<string, unknown>) => { onLocal(body as Partial<Assembly>); return run(() => call(`/api/assemblies/${a.id}`, "PATCH", body)); };
  const rcards = cards.filter((c) => c.active && isReinforcementCard(c));
  const inIt = new Set(a.items.map((i) => i.cost_item_id));
  const found = q.trim()
    ? cards.filter((c) => c.active && !inIt.has(c.id) && c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30)
    : [];

  return (
    <Sheet open onClose={onClose} title={a.name} sub={appliesTo(a)}>
      <div className="px-4 py-3 flex flex-col gap-3" key={a.id}>
        <label className="block"><span style={eyebrow}>Name</span>
          <input defaultValue={a.name} style={field} aria-label="Assembly name"
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== a.name) void patch({ name: v }); }} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span style={eyebrow}>Job type</span>
            <select value={a.job_type ?? ""} style={field} aria-label="Job type" onChange={(e) => void patch({ job_type: e.target.value || null })}>
              <option value="">Any job</option>
              {JOB_TYPES.map((t) => <option key={t} value={t}>{JOB_TYPE_LABEL[t]}</option>)}
            </select></label>
          <label className="block"><span style={eyebrow}>Kind of area</span>
            <select value={a.work_type ?? ""} style={field} aria-label="Kind of area" onChange={(e) => void patch({ work_type: e.target.value || null })}>
              <option value="">Any — load by hand</option>
              {WORK_TYPES.map((t) => <option key={t} value={t}>{WORK_TYPE_LABEL[t]}</option>)}
            </select></label>
        </div>
        <label className="flex items-start gap-2" style={{ fontSize: F.sm, opacity: a.work_type ? 1 : 0.5 }}>
          <input type="checkbox" checked={a.auto_load && !!a.work_type} disabled={!a.work_type} aria-label="Fill new areas on its own"
            onChange={(e) => void patch({ auto_load: e.target.checked })} style={{ width: 18, height: 18, marginTop: 1, accentColor: T.chalk }} />
          <span>Fill new areas on its own
            <span style={{ display: "block", fontSize: 10, color: T.ink3 }}>
              {a.work_type ? `When a ${WORK_TYPE_LABEL[a.work_type].toLowerCase()} is added to ${a.job_type ? `a ${JOB_TYPE_LABEL[a.job_type].toLowerCase()}` : "any"} job and its budget area is empty.` : "Pick a kind of area first."}
            </span>
          </span>
        </label>
        <label className="block"><span style={eyebrow}>Reinforcement</span>
          <select value={a.reinforcement_item_id ?? ""} style={field} aria-label="Reinforcement"
            onChange={(e) => void patch({ reinforcement_item_id: e.target.value || null })}>
            <option value="">None</option>
            {rcards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span style={{ fontSize: 9.5, color: T.ink3 }}>
            {rcards.length ? "Becomes the area's reinforcement — marked as the default, never over one you picked." : "No mesh or rebar cards yet — a card counted by the sheet or the stick shows here."}
          </span></label>

        <div>
          <div style={{ ...eyebrow, color: T.ink }}>Cards · {a.items.length}</div>
          {a.items.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3 }}>None yet — find them below.</div>}
          {a.items.map((i) => {
            const c = cardById.get(i.cost_item_id);
            const manual = !c || c.qty_rule === "manual";
            return (
              <div key={i.id} className="flex items-center gap-2 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: F.sm, ...clip, color: c?.active === false ? T.ink3 : T.ink }}>{c?.name ?? "(card deleted)"}{c?.active === false ? " · retired" : ""}</span>
                  <span style={{ display: "block", fontSize: 10, color: T.ink3, ...nums }}>
                    {c ? `${QTY_RULE_LABEL[c.qty_rule as QtyRule] ?? c.qty_rule} · ${c.unit_cost === null ? "no cost" : `${money(c.unit_cost)}/${c.unit}`}` : ""}
                  </span>
                </span>
                {manual && (
                  <input defaultValue={i.quantity ?? ""} inputMode="decimal" placeholder="qty?" aria-label={`Quantity of ${c?.name ?? "card"}`}
                    onBlur={(e) => { const v = e.target.value.trim(); const n = v === "" ? null : Number(v); if (n !== i.quantity) void run(() => call(`/api/assemblies/${a.id}/items/${i.id}`, "PATCH", { quantity: n })); }}
                    className="rounded px-1.5 text-right outline-none" style={{ width: 64, height: 28, border: `1px solid ${T.hair}`, fontSize: F.sm, ...nums }} />
                )}
                <button onClick={() => void run(() => call(`/api/assemblies/${a.id}/items/${i.id}`, "DELETE"))} aria-label={`Take ${c?.name ?? "card"} out`}
                  style={{ color: T.ink3, cursor: "pointer", fontSize: F.md, padding: "0 4px" }}>×</button>
              </div>
            );
          })}
          <div className="mt-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ Add cards: 3000, form, mesh…" aria-label="Find a card to add" style={field} />
            {found.map((c) => (
              <button key={c.id} onClick={() => void run(() => call(`/api/assemblies/${a.id}/items`, "POST", { cost_item_ids: [c.id] }))}
                className="w-full text-left flex items-baseline gap-2 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: F.sm, ...clip }}>{c.name}</span>
                <span style={{ fontSize: 10, color: T.ink3 }}>{QTY_RULE_LABEL[c.qty_rule as QtyRule] ?? c.qty_rule}</span>
                <span style={{ ...eyebrow, color: T.chalk }}>Add</span>
              </button>
            ))}
            {q.trim() && found.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>No card matches.</div>}
          </div>
        </div>

        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <button onClick={() => { if (window.confirm(`Delete ${a.name}? Its cards stay in the Price book, and budgets it already filled keep their lines.`)) void call(`/api/assemblies/${a.id}`, "DELETE").then(onDeleted).catch((e) => setErr(String(e?.message ?? e))); }}
          className="self-start" style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Delete assembly</button>
      </div>
    </Sheet>
  );
}
