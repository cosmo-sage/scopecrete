"use client";

/**
 * The job budget (migration 048) — Coy, 2026-09-29: "a spreadsheet style
 * budget (on desktop) that shows how the cost groups and sub-items organize
 * and how each line item is multiplied by the unit and price which creates the
 * extended price and then Markup and margin are added. Tax can be toggeled
 * on/off. This is how Jobtread budgets work." And: good / better / best.
 *
 * - Lines come from cost cards (copied onto the line) or are typed as a one-off.
 * - Quantities are counted from the scope by each line's rule (ƒ), or typed (✎,
 *   with ↺ back to the rule). Nothing is assumed: a missing input blocks the
 *   line and says what it needs.
 * - Desktop (wide): the grid — Item · Area · Vendor · Qty · Unit · Unit cost ·
 *   Ext cost · Markup · Unit price · Ext price · Margin · Tax, grouped area ▸
 *   cost group ▸ line. Phone: v34's cost cards, one per group.
 * - Options: a line with no option is in every tier; each tier's total shows.
 *
 * The maths is the engine's budget() — the same function Dusty's context and
 * the proposal read — so there is one set of numbers.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, money, money0, formatPhone } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { budget as priceBudget, type BudgetLine, type BudgetSettings, type SectionInput, type TierTotal } from "@/lib/engine";
import { COST_TYPES, COST_TYPE_LABEL, QTY_RULE_LABEL, type CostType } from "@/lib/cost-cards";
import { useWide } from "@/lib/v34/use-wide";

interface Line extends BudgetLine {
  description: string | null; cost_item_id: string | null; vendor_contact_id: string | null;
  price_as_of: string | null; show_on_doc: boolean; sort_order: number; updated_at: string;
}
interface Option { id: string; label: string; description: string | null; sort_order: number }
interface Group { id: string; name: string; cost_type: CostType; default_markup_pct: number | null }
interface Card {
  id: string; cost_group_id: string | null; name: string; cost_type: CostType; unit: string; unit_cost: number | null;
  qty_rule: string; vendor_contact_id: string | null; updated_at: string; price_as_of: string | null;
}
interface Data {
  estimate: { id: string; tax_on: boolean; discount_amount: number } | null;
  options: Option[]; lines: Line[]; groups: Group[]; cards: Card[];
  vendors: Array<{ id: string; name: string | null; phone: string | null }>;
  settings: BudgetSettings;
}
export interface BudgetSummary {
  has_lines: boolean;
  tiers: Array<TierTotal & { label: string | null }>;
  tax_on: boolean;
}

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}
const qtyFmt = (n: number | null) => n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;

export function JobBudget({ jobId, sections, crewDays, onSummary }: {
  jobId: string; sections: Array<SectionInput & { id: string }>; crewDays: number | null;
  onSummary?: (s: BudgetSummary) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tier, setTier] = useState<string>("all");
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<Line | null>(null);
  const [measure, wide] = useWide<HTMLDivElement>(900);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/budget`, "GET")
      .then((b) => { if (!off) { setData(b as Data); setErr(null); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [jobId, tick]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { reload(); }
  }, [reload]);

  const res = useMemo(() => {
    if (!data) return null;
    const groupMarkup = Object.fromEntries(data.groups.map((g) => [g.id, g.default_markup_pct]));
    return priceBudget(data.lines, data.options.map((o) => o.id), data.settings, sections, crewDays,
      { tax_on: data.estimate?.tax_on ?? true, discount: data.estimate?.discount_amount ?? 0, groupMarkup });
  }, [data, sections, crewDays]);

  useEffect(() => {
    if (!onSummary || !data || !res) return;
    onSummary({
      has_lines: data.lines.length > 0, tax_on: data.estimate?.tax_on ?? true,
      tiers: res.tiers.map((t) => ({ ...t, label: data.options.find((o) => o.id === t.option_id)?.label ?? null })),
    });
  }, [data, res, onSummary]);

  if (!data || !res) {
    return (
      <section ref={measure} aria-label="Budget" className="rounded p-3" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        {err ? <div style={{ fontSize: F.sm, color: T.red }}>{err}</div> : <div className="rounded animate-pulse" style={{ height: 60, background: T.hairSoft }} />}
      </section>
    );
  }

  const opts = data.options;
  const visible = data.lines.filter((l) => tier === "all" || l.option_id === null || l.option_id === tier);
  const areaName = (id: string | null) => (id ? sections.find((s) => s.id === id)?.name || "Unnamed area" : "Whole job");
  const groupName = (l: Line) => (l.cost_group_id ? data.groups.find((g) => g.id === l.cost_group_id)?.name : null) ?? COST_TYPE_LABEL[l.cost_type as CostType] ?? "Other";
  const optLabel = (id: string | null) => (id ? opts.find((o) => o.id === id)?.label ?? "?" : null);
  const vendorName = (id: string | null) => { const v = id ? data.vendors.find((x) => x.id === id) : null; return v ? v.name || formatPhone(v.phone) : null; };
  const cardNewer = (l: Line) => { const c = l.cost_item_id ? data.cards.find((x) => x.id === l.cost_item_id) : null; return !!c && c.unit_cost !== l.unit_cost; };

  // area ▸ group ▸ lines, in the order the scope lists its areas.
  const areas = [...sections.map((s) => s.id), null].map((aid) => {
    const inArea = visible.filter((l) => (l.section_id ?? null) === aid || (aid === null && l.section_id && !sections.some((s) => s.id === l.section_id)));
    const groups = [...new Set(inArea.map(groupName))].map((g) => ({ name: g, lines: inArea.filter((l) => groupName(l) === g) }));
    return { id: aid, name: areaName(aid), lines: inArea, groups };
  }).filter((a) => a.lines.length);
  const sum = (ls: Line[], k: "ext_cost" | "ext_price") => ls.reduce((a, l) => a + (res.lines[l.id]?.[k] ?? 0), 0);

  const shownTiers = tier === "all" ? res.tiers : res.tiers.filter((t) => t.option_id === tier);
  const patchLine = (id: string, body: Record<string, unknown>) => run(() => call(`/api/jobs/${jobId}/budget/lines/${id}`, "PATCH", body));

  return (
    <section ref={measure} aria-label="Budget" className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
      {/* ---- header + options ---- */}
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${T.hair}` }}>
        <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700 }}>Budget</span>
        <span style={{ fontSize: F.xs, color: T.ink3 }}>qty × unit cost → markup → price</span>
        <span className="flex-1" />
        <button onClick={() => setPicker(true)} className="rounded px-2.5"
          style={{ height: 30, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
          + Add from cost cards
        </button>
      </div>
      <div className="px-3 py-2 flex items-center gap-1 flex-wrap" role="tablist" aria-label="Options">
        {opts.length > 0 && (
          <TierTab on={tier === "all"} onClick={() => setTier("all")} label="All options" />
        )}
        {opts.map((o) => {
          const t = res.tiers.find((x) => x.option_id === o.id);
          return <TierTab key={o.id} on={tier === o.id} onClick={() => setTier(o.id)} label={o.label}
            sub={t ? (t.priced ? money0(t.total) : "not priced") : undefined} />;
        })}
        <button onClick={() => void run(async () => { const b = await call(`/api/jobs/${jobId}/budget/options`, "POST", {}); setTier(b.option.id); })}
          className="rounded px-2" style={{ height: 30, border: `1px dashed ${T.chalk}`, color: T.chalk, background: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer" }}>
          {opts.length ? "+ Option" : "+ Good / better / best"}
        </button>
        {tier !== "all" && opts.length > 0 && (
          <button onClick={() => { const o = opts.find((x) => x.id === tier); const n = window.prompt("Name this option", o?.label ?? ""); if (n && n.trim()) void run(() => call(`/api/jobs/${jobId}/budget/options/${tier}`, "PATCH", { label: n })); }}
            style={{ ...eyebrow, color: T.ink3, cursor: "pointer", marginLeft: 4 }}>Rename</button>
        )}
        {tier !== "all" && opts.length > 0 && (
          <button onClick={() => { if (window.confirm("Delete this option and the lines only it has? Lines in every option stay.")) void run(async () => { await call(`/api/jobs/${jobId}/budget/options/${tier}`, "DELETE"); setTier("all"); }); }}
            style={{ ...eyebrow, color: T.red, cursor: "pointer", marginLeft: 4 }}>Delete option</button>
        )}
      </div>
      {opts.length > 0 && (
        <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>
          {tier === "all" ? "Showing every line. A line tagged with an option is only in that option; untagged lines are in all of them."
            : `Showing the lines in ${optLabel(tier)}: the shared ones and its own. New lines go into ${optLabel(tier)}.`}
        </div>
      )}

      {err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
      {data.lines.length === 0 && (
        <div className="px-3 pb-3" style={{ fontSize: F.sm, color: T.ink3 }}>
          {data.cards.length ? "No lines yet. Add cost cards to the areas above — quantities come from the scope." : "No cost cards yet. Make them in Cost settings → Cost cards, then add them here."}
        </div>
      )}

      {/* ---- the lines ---- */}
      {wide ? (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse", fontSize: F.sm, ...nums }}>
            <thead>
              <tr style={{ background: T.slab }}>
                {["Item", "Vendor", "Qty", "Unit", "Unit cost", "Ext cost", "Markup", "Unit price", "Ext price", "Margin", "Tax"].map((h, i) => (
                  <th key={h} style={{ ...eyebrow, textAlign: i < 2 || h === "Unit" ? "left" : "right", padding: "6px 8px", whiteSpace: "nowrap", borderBottom: `1px solid ${T.hair}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <React.Fragment key={a.id ?? "job"}>
                  <tr style={{ background: T.ink, color: "#fff" }}>
                    <td colSpan={5} style={{ padding: "5px 8px", fontFamily: disp, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{a.name}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{money0(sum(a.lines, "ext_cost"))}</td>
                    <td colSpan={2} />
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{money0(sum(a.lines, "ext_price"))}</td>
                    <td colSpan={2} />
                  </tr>
                  {a.groups.map((g) => (
                    <React.Fragment key={g.name}>
                      <tr style={{ background: T.hairSoft }}>
                        <td colSpan={5} style={{ padding: "4px 8px 4px 16px", fontWeight: 600 }}>{g.name}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{money0(sum(g.lines, "ext_cost"))}</td>
                        <td colSpan={2} />
                        <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{money0(sum(g.lines, "ext_price"))}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", color: T.ink3 }}>
                          {sum(g.lines, "ext_price") > 0 ? pct((sum(g.lines, "ext_price") - sum(g.lines, "ext_cost")) / sum(g.lines, "ext_price")) : ""}
                        </td>
                        <td />
                      </tr>
                      {g.lines.map((l) => {
                        const r = res.lines[l.id];
                        const blockedQty = r.qty === null;
                        return (
                          <tr key={l.id} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                            <td style={{ padding: "4px 8px 4px 24px", maxWidth: 260 }}>
                              <button onClick={() => setEditing(l)} className="text-left" style={{ cursor: "pointer", color: T.ink, fontWeight: 500, ...clip, display: "block", maxWidth: 240 }}>{l.name}</button>
                              <div style={{ fontSize: 9.5, color: T.ink3, ...clip }}>
                                {optLabel(l.option_id) ? <span style={{ color: T.chalk }}>{optLabel(l.option_id)} only · </span> : opts.length ? "every option · " : ""}
                                {QTY_RULE_LABEL[l.qty_rule as keyof typeof QTY_RULE_LABEL] ?? l.qty_rule}
                                {cardNewer(l) && <> · <button onClick={() => void patchLine(l.id, { refresh: true })} style={{ color: T.hiviz, cursor: "pointer" }}>card price changed — update</button></>}
                              </div>
                              {r.blocked.length > 0 && <div style={{ fontSize: 9.5, color: T.hiviz }}>needs {r.blocked.join(", ")}</div>}
                            </td>
                            <td style={{ padding: "4px 8px", color: T.ink2, maxWidth: 140, ...clip }}>{vendorName(l.vendor_contact_id) ?? "—"}</td>
                            <td style={{ padding: "2px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <Cell value={r.qty} placeholder={blockedQty ? "?" : ""} label={`Quantity of ${l.name}`} warn={blockedQty}
                                onSave={(v) => void patchLine(l.id, { quantity: v })} />
                              <span title={r.qty_basis === "set" ? "typed" : r.qty_note ?? "from the scope"} style={{ fontSize: 9.5, color: T.ink3, marginLeft: 2 }}>
                                {r.qty_basis === "set" ? "✎" : "ƒ"}
                              </span>
                              {r.qty_basis === "set" && l.qty_rule !== "manual" && (
                                <button onClick={() => void patchLine(l.id, { qty_source: "rule" })} title="Back to the rule" aria-label={`Put ${l.name} back to its rule`}
                                  style={{ fontSize: 10, color: T.chalk, marginLeft: 2, cursor: "pointer" }}>↺</button>
                              )}
                            </td>
                            <td style={{ padding: "4px 8px" }}>{l.unit}</td>
                            <td style={{ padding: "2px 4px", textAlign: "right" }}>
                              <Cell value={l.unit_cost} money label={`Unit cost of ${l.name}`} warn={l.unit_cost === null} onSave={(v) => void patchLine(l.id, { unit_cost: v })} />
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.ext_cost === null ? "—" : money(r.ext_cost)}</td>
                            <td style={{ padding: "2px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <Cell value={l.markup_pct} placeholder={r.markup === null ? "?" : `${r.markup}`} label={`Markup on ${l.name}`} suffix="%"
                                onSave={(v) => void patchLine(l.id, { markup_pct: v })} />
                              {l.markup_pct === null && r.markup !== null && <span style={{ fontSize: 9.5, color: T.ink3 }} title={`from the ${r.markup_from}`}> {r.markup_from}</span>}
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.unit_price === null ? "—" : money(r.unit_price)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{r.ext_price === null ? "—" : money(r.ext_price)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right", color: T.ink2 }}>{pct(r.margin)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>
                              <input type="checkbox" checked={l.taxable} aria-label={`Tax on ${l.name}`} onChange={(e) => void patchLine(l.id, { taxable: e.target.checked })}
                                style={{ width: 16, height: 16, accentColor: T.chalk }} />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 pb-2 flex flex-col gap-2">
          {areas.map((a) => (
            <div key={a.id ?? "job"}>
              <div className="flex items-baseline justify-between" style={{ ...eyebrow, color: T.ink, marginTop: 4 }}>
                <span>{a.name}</span><span style={{ ...nums }}>{money0(sum(a.lines, "ext_price"))}</span>
              </div>
              {a.groups.map((g) => <GroupCard key={g.name} name={g.name} lines={g.lines} res={res} optLabel={optLabel} onOpen={setEditing}
                cost={sum(g.lines, "ext_cost")} price={sum(g.lines, "ext_price")} />)}
            </div>
          ))}
        </div>
      )}

      {/* ---- totals ---- */}
      {data.lines.length > 0 && (
        <div className="px-3 py-2.5" style={{ borderTop: `1px solid ${T.hair}`, background: T.slab }}>
          <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: F.sm }}>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={data.estimate?.tax_on ?? true} aria-label="Sales tax on this budget"
                onChange={(e) => {
                  const on = e.target.checked;
                  // Flip at once; the reload after the save puts back whatever the server kept.
                  setData((d) => d && { ...d, estimate: { id: d.estimate?.id ?? "", discount_amount: d.estimate?.discount_amount ?? 0, tax_on: on } });
                  void run(() => call(`/api/jobs/${jobId}/budget`, "PATCH", { tax_on: on }));
                }}
                style={{ width: 16, height: 16, accentColor: T.chalk }} />
              Sales tax {data.settings.sales_tax_pct !== null ? `(${data.settings.sales_tax_pct}% on taxed lines, at cost)` : "(no rate recorded)"}
            </label>
            <label className="flex items-center gap-1.5">
              Discount $
              <Cell value={data.estimate?.discount_amount ? data.estimate.discount_amount : null} money label="Discount"
                onSave={(v) => void run(() => call(`/api/jobs/${jobId}/budget`, "PATCH", { discount_amount: v ?? 0 }))} />
              <span style={{ fontSize: 9.5, color: T.ink3 }}>price only</span>
            </label>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {shownTiers.map((t) => (
              <div key={t.option_id ?? "one"} className="flex items-baseline gap-3 flex-wrap" style={{ ...nums }}>
                <span style={{ fontFamily: disp, fontWeight: 700, textTransform: "uppercase", minWidth: 70 }}>{optLabel(t.option_id) ?? "Total"}</span>
                <span style={{ fontSize: F.xs, color: T.ink2 }}>cost {money0(t.cost)}</span>
                <span style={{ fontSize: F.xs, color: T.ink2 }}>price {money0(t.price)}</span>
                {t.tax > 0 && <span style={{ fontSize: F.xs, color: T.ink2 }}>tax {money0(t.tax)}</span>}
                {t.discount > 0 && <span style={{ fontSize: F.xs, color: T.ink2 }}>− {money0(t.discount)}</span>}
                <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: t.priced ? T.ink : T.ink3 }}>{t.priced ? money0(t.total) : "not priced"}</span>
                {t.priced && <span style={{ fontSize: F.xs, color: T.ink3 }}>margin {pct(t.margin)}</span>}
                {!t.priced && t.blocked.length > 0 && <span style={{ fontSize: F.xs, color: T.hiviz }}>needs {t.blocked.slice(0, 4).join(", ")}{t.blocked.length > 4 ? ` +${t.blocked.length - 4}` : ""}</span>}
              </div>
            ))}
          </div>
          {res.hints.map((h) => <div key={h} style={{ fontSize: F.xs, color: T.hiviz, marginTop: 4 }}>{h}</div>)}
        </div>
      )}

      <CardPicker open={picker} onClose={() => setPicker(false)} data={data} sections={sections} tier={tier === "all" ? null : tier}
        tierLabel={optLabel(tier === "all" ? null : tier)}
        onAdd={(body) => run(() => call(`/api/jobs/${jobId}/budget/lines`, "POST", body))} />
      <LineSheet line={editing} data={data} sections={sections} res={editing ? res.lines[editing.id] : null}
        onClose={() => setEditing(null)}
        onPatch={(body) => editing && run(() => call(`/api/jobs/${jobId}/budget/lines/${editing.id}`, "PATCH", body))}
        onDelete={() => { if (editing && window.confirm(`Take ${editing.name} off the budget?`)) { const id = editing.id; setEditing(null); void run(() => call(`/api/jobs/${jobId}/budget/lines/${id}`, "DELETE")); } }} />
    </section>
  );
}

function TierTab({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button role="tab" aria-selected={on} onClick={onClick} className="rounded px-2.5 text-left"
      style={{ minHeight: 30, background: on ? T.ink : T.card, color: on ? "#fff" : T.ink2, border: `1px solid ${on ? T.ink : T.hair}`, cursor: "pointer" }}>
      <span style={{ fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</span>
      {sub && <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.75, ...nums }}>{sub}</span>}
    </button>
  );
}

/** A number cell: shows the value, edits on focus, saves on blur or Enter. Blank saves as blank. */
function Cell({ value, onSave, label, money: isMoney, placeholder, warn, suffix }: {
  value: number | null; onSave: (v: number | null) => void; label: string; money?: boolean; placeholder?: string; warn?: boolean; suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : isMoney ? value.toFixed(2) : String(Math.round(value * 100) / 100));
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim() === "" ? null : Number(draft.replace(/[$,%\s]/g, ""));
    setDraft(null);
    if (v !== null && !Number.isFinite(v)) return;
    if (v !== value) onSave(v);
  };
  return (
    <input value={shown} placeholder={placeholder} aria-label={label} inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDraft(null); }}
      className="rounded text-right outline-none"
      style={{ width: suffix ? 52 : 76, height: 26, padding: "0 5px", border: `1px solid ${warn ? T.hiviz : "transparent"}`, background: warn ? T.hivizDim : "transparent", fontSize: F.sm, ...nums }}
      onFocus={(e) => { e.currentTarget.style.borderColor = T.chalk; e.currentTarget.style.background = "#fff"; }} />
  );
}

function GroupCard({ name, lines, res, optLabel, onOpen, cost, price }: {
  name: string; lines: Line[]; res: ReturnType<typeof priceBudget>; optLabel: (id: string | null) => string | null;
  onOpen: (l: Line) => void; cost: number; price: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded mt-1.5" style={{ border: `1px solid ${T.hair}`, background: "#fff" }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between px-2.5" style={{ height: 40, cursor: "pointer" }}>
        <span className="flex items-center gap-1.5">
          <span style={{ fontFamily: disp, fontSize: F.xs, color: T.ink3, width: 10 }}>{open ? "−" : "+"}</span>
          <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase" }}>{name}</span>
        </span>
        <span style={{ textAlign: "right", ...nums }}>
          <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600 }}>{money0(price)}</span>
          <span style={{ display: "block", fontSize: 9.5, color: T.ink3 }}>cost {money0(cost)}</span>
        </span>
      </button>
      {open && lines.map((l, i) => {
        const r = res.lines[l.id];
        return (
          <button key={l.id} onClick={() => onOpen(l)} className="w-full flex items-baseline justify-between gap-2 px-2.5 py-1.5 text-left"
            style={{ borderTop: `1px solid ${i ? T.hairSoft : T.hair}`, cursor: "pointer" }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: F.sm, color: T.ink, ...clip }}>{l.name}</span>
              <span style={{ display: "block", fontSize: 10, color: r.blocked.length ? T.hiviz : T.ink3, ...nums }}>
                {r.blocked.length ? `needs ${r.blocked.join(", ")}` : `${qtyFmt(r.qty)} ${l.unit} × ${l.unit_cost === null ? "—" : money(l.unit_cost)}${r.qty_basis === "set" ? " ✎" : " ƒ"}`}
                {optLabel(l.option_id) ? ` · ${optLabel(l.option_id)} only` : ""}
              </span>
            </span>
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>{r.ext_price === null ? "—" : money(r.ext_price)}</span>
          </button>
        );
      })}
    </div>
  );
}

function CardPicker({ open, onClose, data, sections, tier, tierLabel, onAdd }: {
  open: boolean; onClose: () => void; data: Data; sections: Array<SectionInput & { id: string }>;
  tier: string | null; tierLabel: string | null; onAdd: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [area, setArea] = useState<string>("");
  const [custom, setCustom] = useState({ name: "", cost_type: "material" as CostType, unit: "each", unit_cost: "" });
  const [added, setAdded] = useState<string | null>(null);
  const match = (c: Card) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase());
  const groups = [...data.groups.map((g) => ({ id: g.id, name: g.name, cards: data.cards.filter((c) => c.cost_group_id === g.id && match(c)) })),
    { id: null, name: "Not in a group", cards: data.cards.filter((c) => (!c.cost_group_id || !data.groups.some((g) => g.id === c.cost_group_id)) && match(c)) }]
    .filter((g) => g.cards.length);
  const base = { section_id: area || null, option_id: tier };
  const add = async (body: Record<string, unknown>, what: string) => { await onAdd({ ...base, ...body }); setAdded(what); setTimeout(() => setAdded(null), 1600); };
  const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.sm, borderRadius: 4, padding: "0 8px", width: "100%", minWidth: 0 };
  return (
    <Sheet open={open} onClose={onClose} title="Add to the budget" sub={tierLabel ? `Into ${tierLabel}` : "Into every option"}>
      <div className="px-4 py-3 flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span style={eyebrow}>Area</span>
            <select value={area} onChange={(e) => setArea(e.target.value)} style={field} aria-label="Area">
              <option value="">Whole job</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name || "Unnamed area"}</option>)}
            </select></label>
          <label className="block"><span style={eyebrow}>Find</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="rebar, pump, 3000…" style={field} /></label>
        </div>
        {added && <div style={{ fontSize: F.xs, color: T.green }}>Added {added}</div>}
        {groups.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3 }}>{data.cards.length ? "No card matches." : "No cost cards yet — make them in Cost settings → Cost cards."}</div>}
        {groups.map((g) => (
          <div key={g.id ?? "none"} className="rounded" style={{ border: `1px solid ${T.hair}` }}>
            <div className="flex items-center px-2.5 py-1.5" style={{ background: T.slab }}>
              <span style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", flex: 1 }}>{g.name}</span>
              {g.id && <button onClick={() => void add({ cost_group_id: g.id }, g.name)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Add all</button>}
            </div>
            {g.cards.map((c) => (
              <button key={c.id} onClick={() => void add({ cost_item_id: c.id }, c.name)} className="w-full flex items-baseline justify-between gap-2 px-2.5 py-1.5 text-left"
                style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: F.sm, ...clip }}>{c.name}</span>
                  <span style={{ display: "block", fontSize: 10, color: T.ink3 }}>{QTY_RULE_LABEL[c.qty_rule as keyof typeof QTY_RULE_LABEL] ?? c.qty_rule}</span>
                </span>
                <span style={{ fontSize: F.sm, ...nums, color: c.unit_cost === null ? T.hiviz : T.ink }}>{c.unit_cost === null ? "no cost" : `${money(c.unit_cost)}/${c.unit}`}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="rounded p-2.5" style={{ border: `1px dashed ${T.hair}` }}>
          <div style={{ ...eyebrow, color: T.ink }}>A one-off line</div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <input value={custom.name} onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))} placeholder="Name" aria-label="One-off name" style={{ ...field, gridColumn: "1 / -1" }} />
            <select value={custom.cost_type} onChange={(e) => setCustom((c) => ({ ...c, cost_type: e.target.value as CostType }))} style={field} aria-label="One-off type">
              {COST_TYPES.map((t) => <option key={t} value={t}>{COST_TYPE_LABEL[t]}</option>)}
            </select>
            <input value={custom.unit} onChange={(e) => setCustom((c) => ({ ...c, unit: e.target.value }))} placeholder="unit" aria-label="One-off unit" style={field} />
            <input value={custom.unit_cost} onChange={(e) => setCustom((c) => ({ ...c, unit_cost: e.target.value }))} placeholder="unit cost" inputMode="decimal" aria-label="One-off unit cost" style={field} />
            <button disabled={!custom.name.trim()} onClick={() => void add({ ...custom, qty_rule: "manual", unit_cost: custom.unit_cost === "" ? null : custom.unit_cost }, custom.name).then(() => setCustom({ name: "", cost_type: "material", unit: "each", unit_cost: "" }))}
              className="rounded" style={{ height: 34, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", opacity: custom.name.trim() ? 1 : 0.5 }}>Add line</button>
          </div>
          <div style={{ fontSize: 9.5, color: T.ink3, marginTop: 3 }}>Type its quantity on the budget.</div>
        </div>
      </div>
    </Sheet>
  );
}

function LineSheet({ line, data, sections, res, onClose, onPatch, onDelete }: {
  line: Line | null; data: Data; sections: Array<SectionInput & { id: string }>; res: ReturnType<typeof priceBudget>["lines"][string] | null;
  onClose: () => void; onPatch: (body: Record<string, unknown>) => void; onDelete: () => void;
}) {
  if (!line || !res) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const field: React.CSSProperties = { height: 36, border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.sm, borderRadius: 4, padding: "0 8px", width: "100%", minWidth: 0 };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <Sheet open onClose={onClose} title={line.name} sub={`${QTY_RULE_LABEL[line.qty_rule as keyof typeof QTY_RULE_LABEL] ?? line.qty_rule}`}>
      <div className="px-4 py-3 flex flex-col gap-3" key={line.id + line.updated_at}>
        <div className="rounded px-3 py-2" style={{ background: T.slab, ...nums, fontSize: F.sm }}>
          {res.blocked.length ? <span style={{ color: T.hiviz }}>Needs {res.blocked.join(", ")}</span> : (
            <>{qtyFmt(res.qty)} {line.unit} × {money(line.unit_cost ?? 0)} = <b>{money(res.ext_cost ?? 0)}</b> cost · +{res.markup}% → <b>{money(res.ext_price ?? 0)}</b> · margin {pct(res.margin)}</>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span style={eyebrow}>Quantity {res.qty_basis === "set" ? "(typed)" : `(from the scope${res.qty_note ? ` — ${res.qty_note}` : ""})`}</span>
            <input defaultValue={res.qty ?? ""} inputMode="decimal" style={field} aria-label="Quantity"
              onBlur={(e) => { const v = num(e.target.value); if (v !== res.qty) onPatch({ quantity: v }); }} />
            {res.qty_basis === "set" && line.qty_rule !== "manual" && (
              <button onClick={() => onPatch({ qty_source: "rule" })} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>↺ back to the rule</button>
            )}</label>
          <label className="block"><span style={eyebrow}>Unit cost / {line.unit}</span>
            <input defaultValue={line.unit_cost ?? ""} inputMode="decimal" placeholder="not recorded" style={{ ...field, borderColor: line.unit_cost === null ? T.hiviz : T.hair }} aria-label="Unit cost"
              onBlur={(e) => { const v = num(e.target.value); if (v !== line.unit_cost) onPatch({ unit_cost: v }); }} /></label>
          <label className="block"><span style={eyebrow}>Markup %</span>
            <input defaultValue={line.markup_pct ?? ""} inputMode="decimal" placeholder={res.markup !== null ? `${res.markup} (${res.markup_from})` : "not recorded"} style={field} aria-label="Markup"
              onBlur={(e) => { const v = num(e.target.value); if (v !== line.markup_pct) onPatch({ markup_pct: v }); }} /></label>
          <label className="flex items-center gap-2 mt-5" style={{ fontSize: F.sm }}>
            <input type="checkbox" checked={line.taxable} onChange={(e) => onPatch({ taxable: e.target.checked })} style={{ width: 18, height: 18, accentColor: T.chalk }} /> Sales tax applies</label>
        </div>
        <label className="block"><span style={eyebrow}>Area</span>
          <select value={line.section_id ?? ""} onChange={(e) => onPatch({ section_id: e.target.value || null })} style={field}>
            <option value="">Whole job</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name || "Unnamed area"}</option>)}
          </select></label>
        {data.options.length > 0 && (
          <label className="block"><span style={eyebrow}>Option</span>
            <select value={line.option_id ?? ""} onChange={(e) => onPatch({ option_id: e.target.value || null })} style={field}>
              <option value="">Every option</option>
              {data.options.map((o) => <option key={o.id} value={o.id}>{o.label} only</option>)}
            </select></label>
        )}
        <label className="block"><span style={eyebrow}>Description (shows on the proposal)</span>
          <textarea defaultValue={line.description ?? ""} rows={2} maxLength={500} style={{ ...field, height: "auto", padding: "6px 8px", resize: "none" }}
            onBlur={(e) => { if ((e.target.value.trim() || null) !== (line.description ?? null)) onPatch({ description: e.target.value }); }} /></label>
        <label className="flex items-center gap-2" style={{ fontSize: F.sm }}>
          <input type="checkbox" checked={line.show_on_doc} onChange={(e) => onPatch({ show_on_doc: e.target.checked })} style={{ width: 18, height: 18, accentColor: T.chalk }} /> Show on the proposal</label>
        <button onClick={onDelete} className="self-start" style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Take off the budget</button>
      </div>
    </Sheet>
  );
}
