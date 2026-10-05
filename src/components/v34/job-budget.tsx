"use client";

/**
 * The job budget (migration 048) — Coy, 2026-09-29: "a spreadsheet style
 * budget (on desktop) that shows how the cost groups and sub-items organize
 * and how each line item is multiplied by the unit and price which creates the
 * extended price and then Markup and margin are added. Tax can be toggeled
 * on/off. This is how Jobtread budgets work." And: good / better / best.
 * Since 2026-09-30 (migration 057) a line is priced Coy's way:
 *   cost × (1 + the job's O.H.) ÷ (1 − margin) — the job's margin, or the line's own.
 * The footer holds the job's O.H. %, margin %, tax (from its parish) and its
 * minimum (day minimum × days).
 *
 * - Lines come from cost cards (copied onto the line) or are typed as a one-off.
 * - Quantities are counted from the scope by each line's rule (ƒ), or typed (✎,
 *   with ↺ back to the rule). Nothing is assumed: a missing input blocks the
 *   line and says what it needs.
 * - Desktop (wide): the grid — Item · Area · Vendor · Qty · Unit · Unit cost ·
 *   Ext cost · O.H. · Margin · Unit price · Ext price · Tax, grouped area ▸
 *   cost group ▸ line. Phone: v34's cost cards, one per group.
 * - One price per job; alternatives are optional add-ons on the proposal.
 *
 * The maths is the engine's budget() — the same function Dusty's context and
 * the proposal read — so there is one set of numbers.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { T, F, disp, eyebrow, nums, clip, money, money0, formatPhone } from "@/lib/v34/tokens";
import { Sheet, Drawer } from "@/components/v34/primitives";
import { PriceBook } from "@/components/v34/price-book";
import { budget as priceBudget, jobMinimum, quantities, type BudgetLine, type BudgetSettings, type SectionInput, type TakeoffTotal, type TierTotal } from "@/lib/engine";
import { COST_TYPES, COST_TYPE_LABEL, QTY_RULE_LABEL, type CostType } from "@/lib/cost-cards";
import { UnitPicker } from "@/components/v34/unit-picker";
import { ruleForUnit } from "@/lib/units";

/** How a line's quantity is worked out, said under its Unit type. */
const UNIT_RULE_SAYS: Record<string, string> = {
  per_sqft: "the area's size", per_lf_perimeter: "the area's edge (or its length, in LF)", per_cy: "the area's yards of concrete, with the card's waste",
  per_day: "the days on the job", per_job: "1, once for the job", per_sheet: "the sheets the area needs", per_stick: "the sticks the area needs", manual: "typed",
};
import { useWide } from "@/lib/v34/use-wide";
import { Cell } from "@/components/v34/cell";

interface Line extends BudgetLine {
  description: string | null; cost_item_id: string | null; vendor_contact_id: string | null;
  price_as_of: string | null; show_on_doc: boolean; sort_order: number; updated_at: string;
  assembly_id?: string | null; section_role?: "reinforcement" | null;
  source_id?: string | null; source_pinned?: boolean;
}
/** A vendor's price on an item (migration 051) — the line's vendor picker. */
interface Source { id: string; cost_item_id: string; unit_cost: number | null; vendor: { id: string; name: string | null; company_name: string | null; phone: string | null } | null }
interface Assembly { id: string; name: string; job_type: string | null; work_type: string | null }
interface Option { id: string; label: string; description: string | null; sort_order: number }
interface Group { id: string; name: string; cost_type: CostType }
interface Card {
  id: string; cost_group_id: string | null; name: string; cost_type: CostType; unit: string; unit_cost: number | null;
  qty_rule: string; vendor_contact_id: string | null; updated_at: string; price_as_of: string | null; default_source_id?: string | null;
}
interface Data {
  estimate: { id: string; tax_on: boolean; discount_amount: number; margin_pct?: number | null; overhead_pct?: number | null } | null;
  options: Option[]; lines: Line[]; groups: Group[]; cards: Card[]; assemblies?: Assembly[];
  vendors: Array<{ id: string; name: string | null; phone: string | null }>;
  sources?: Source[];
  settings: BudgetSettings;
  pricing: {
    tax: { rate: number | null; parish: string | null; source: "override" | "parish" | "lookup" | null; missing: string | null; lookup?: { rate_pct: number; parts: Array<{ name: string; level: string; rate_pct: number }>; as_of: string | null; resolution: string | null; address: string; at: string } | null };
    days: number | null; day_minimum: number | null; margin_from: "budget" | "default" | null; overhead_from: "budget" | "default" | null;
  } | null;
  /** Plan Room group totals (059), keyed by group id. */
  takeoff?: Record<string, TakeoffTotal>;
  /** The proposal draft's sub split — shown and set here too (the job page is the one place for money). */
  proposal?: { has_draft: boolean; split: string; addons?: string[] };
}
export interface BudgetSummary {
  has_lines: boolean;
  tiers: Array<TierTotal & { label: string | null }>;
  tax_on: boolean;
  /** The job minimum (day minimum × days), or what it needs. */
  minimum: { ok: true; minimum: number; day_minimum: number; days: number } | { ok: false; blocked: string[] };
  overhead_pct: number | null; margin_pct: number | null;
}

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}
const qtyFmt = (n: number | null) => n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;

type Area = SectionInput & { id: string; source_ref?: string | null };

/** How an area's size is said on the budget: square yards for a bid item counted in SY (or when Coy picked sq yd on it), else square feet. */
function areaUnit(s: Area): "sy" | "sf" {
  try { const v = localStorage.getItem(`sc:area-unit:${s.id}`); if (v === "sf" || v === "sy") return v; } catch { /* no storage */ }
  return /\bSY\b/.test(s.source_ref ?? "") ? "sy" : "sf";
}

export function JobBudget({ jobId, sections, days, onSummary, refresh = 0, slots }: {
  jobId: string; sections: Area[]; days: number | null;
  /** Each section card's budget slot, by section id: its cost items are drawn there (Coy, 2026-10-04). */
  slots?: Record<string, HTMLElement>;
  onSummary?: (s: BudgetSummary) => void;
  /** Bumped by the scope page when a section change may have changed the budget on the server. */
  refresh?: number;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // The picker opens on an area (its own "+ Add") or on the whole job.
  const [picker, setPicker] = useState<{ area: string } | null>(null);
  // The Price book itself, opened over the job (Coy, 2026-10-02) — "+ Add" goes here.
  const [book, setBook] = useState<{ area: string } | null>(null);
  // A section card's "Add items" opens the book on that area.
  useEffect(() => {
    const on = (e: Event) => { const area = (e as CustomEvent<{ area?: string }>).detail?.area ?? ""; setBook({ area }); };
    window.addEventListener("sc:budget-add", on);
    return () => window.removeEventListener("sc:budget-add", on);
  }, []);
  // A Dusty plan Coy applied (src/lib/dusty/apply-plan.ts) changed the budget.
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("sc:budget-changed", bump);
    return () => window.removeEventListener("sc:budget-changed", bump);
  }, []);
  const [editing, setEditing] = useState<Line | null>(null);
  const [taxInfo, setTaxInfo] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [measureWide, roomy] = useWide<HTMLDivElement>(900);
  // The grid only when it fits: a table wider than its room hid its last columns
  // behind Dusty's docked panel (Coy, 2026-10-02). If it overflows at this width,
  // the cards are used until the budget is wider than where it overflowed.
  const [width, setWidth] = useState(0);
  const [tightAt, setTightAt] = useState<number | null>(null);
  const sizeObs = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    measureWide(el);
    sizeObs.current?.disconnect();
    if (!el || typeof ResizeObserver === "undefined") return;
    sizeObs.current = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    sizeObs.current.observe(el);
  }, [measureWide]);
  const wide = roomy && !(tightAt !== null && width <= tightAt);
  // One observer for every grid (each section card has its own, plus the whole-job one).
  const tableObs = useRef<ResizeObserver | null>(null);
  useEffect(() => () => tableObs.current?.disconnect(), []);
  const tableBox = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    if (!tableObs.current) tableObs.current = new ResizeObserver((entries) => {
      for (const e of entries) {
        const box = (e.target as HTMLElement).dataset.grid ? e.target as HTMLElement : (e.target.parentElement as HTMLElement | null);
        if (box && box.scrollWidth > box.clientWidth + 2) setTightAt(Math.round(box.getBoundingClientRect().width) + 2);
      }
    });
    el.dataset.grid = "1";
    tableObs.current.observe(el);
    if (el.firstElementChild) tableObs.current.observe(el.firstElementChild);
  }, []);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let off = false;
    call(`/api/jobs/${jobId}/budget`, "GET")
      .then((b) => { if (!off) { setData(b as Data); setErr(null); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [jobId, tick, refresh]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { reload(); }
  }, [reload]);

  const res = useMemo(() => {
    if (!data) return null;
    return priceBudget(data.lines, [], data.settings, sections, days,
      { tax_on: data.estimate?.tax_on ?? true, discount: data.estimate?.discount_amount ?? 0, takeoff: data.takeoff });
  }, [data, sections, days]);
  const minimum = useMemo(() => jobMinimum(data?.pricing?.day_minimum ?? null, days), [data, days]);

  useEffect(() => {
    if (!onSummary || !data || !res) return;
    onSummary({
      has_lines: data.lines.length > 0, tax_on: data.estimate?.tax_on ?? true,
      tiers: res.tiers.map((t) => ({ ...t, label: null })),
      minimum, overhead_pct: data.settings.overhead_pct, margin_pct: data.settings.margin_pct,
    });
  }, [data, res, onSummary, minimum]);

  if (!data || !res) {
    return (
      <section ref={measure} aria-label="Budget" className="rounded p-3" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        {err ? <div style={{ fontSize: F.sm, color: T.red }}>{err}</div> : <div className="rounded animate-pulse" style={{ height: 60, background: T.hairSoft }} />}
      </section>
    );
  }

  // One price per job (Coy, 2026-10-05: Good / Better / Best removed) — alternatives are optional
  // add-ons on the proposal. Option rows and tags left in the database are not read.
  const visible = data.lines;
  const areaName = (id: string | null) => (id ? sections.find((s) => s.id === id)?.name || "Unnamed area" : "Whole job");
  const groupName = (l: Line) => (l.cost_group_id ? data.groups.find((g) => g.id === l.cost_group_id)?.name : null) ?? COST_TYPE_LABEL[l.cost_type as CostType] ?? "Other";
  const optLabel = (id: string | null): string | null => { void id; return null; };
  const asmName = (id: string | null | undefined) => (id ? data.assemblies?.find((a) => a.id === id)?.name ?? null : null);
  const vendorName = (id: string | null): string | null => {
    if (!id) return null;
    const v = data.vendors.find((x) => x.id === id);
    if (v) return v.name || formatPhone(v.phone);
    const s = data.sources?.find((x) => x.vendor?.id === id)?.vendor;
    return s ? s.name || s.company_name || formatPhone(s.phone) : null;
  };
  // What changed since the line copied its price (migration 051): the vendor Coy picked for this
  // line re-priced; the card's default vendor is someone else now; or the card's price moved.
  const stale = (l: Line): string | null => {
    const c = l.cost_item_id ? data.cards.find((x) => x.id === l.cost_item_id) : null;
    if (!c) return null;
    if (l.source_pinned && l.source_id) {
      const s = data.sources?.find((x) => x.id === l.source_id);
      return s && s.unit_cost !== l.unit_cost ? "vendor's price changed — update" : null;
    }
    if ((c.default_source_id ?? null) !== (l.source_id ?? null)) return `default vendor is now ${vendorName(c.vendor_contact_id) ?? "none"} — update`;
    return c.unit_cost !== l.unit_cost ? "card price changed — update" : null;
  };

  // area ▸ group ▸ lines, in the order the scope lists its areas. Every area
  // shows, lines or not, so each one has its own "+ Add" (Coy, 2026-10-02: the
  // bid's three items had no way onto the budget).
  const areas = [...sections.map((s) => s.id), null].map((aid) => {
    const inArea = visible.filter((l) => (l.section_id ?? null) === aid || (aid === null && l.section_id && !sections.some((s) => s.id === l.section_id)));
    const groups = [...new Set(inArea.map(groupName))].map((g) => ({ name: g, lines: inArea.filter((l) => groupName(l) === g) }));
    return { id: aid, name: areaName(aid), lines: inArea, groups };
  });
  // An area's size, and its price per unit of it — how a unit-price bid reads ("$/SY").
  const areaSize = (aid: string | null): { text: string; per: (price: number) => string } | null => {
    const s = aid ? sections.find((x) => x.id === aid) : null;
    if (!s) return null;
    const q = quantities(s);
    if (q.count !== null) return { text: `${qtyFmt(q.count)} ${q.count_unit}`, per: (price) => `${money(price / (q.count as number))}/${q.count_unit}` };
    if (q.sqft === null || q.sqft <= 0) return null;
    const sy = areaUnit(s) === "sy";
    const n = sy ? q.sqft / 9 : q.sqft;
    const u = sy ? "sq yd" : "sq ft";
    return { text: `${qtyFmt(Math.round(n * 100) / 100)} ${u}`, per: (price) => `${money(price / n)}/${sy ? "SY" : "SF"}` };
  };
  const areaPriced = (ls: Line[]) => ls.length > 0 && ls.every((l) => res.lines[l.id]?.ext_price !== null);
  const sum = (ls: Line[], k: "ext_cost" | "ext_price" | "overhead") => ls.reduce((a, l) => a + (res.lines[l.id]?.[k] ?? 0), 0);
  // What is left after cost and O.H. — the same margin the lines and totals show.
  const marginOf = (ls: Line[]) => { const p = sum(ls, "ext_price"); return p > 0 ? pct((p - sum(ls, "ext_cost") - sum(ls, "overhead")) / p) : ""; };

  const shownTiers = res.tiers;
  const patchLine = (id: string, body: Record<string, unknown>) => run(() => call(`/api/jobs/${jobId}/budget/lines/${id}`, "PATCH", body));
  // A line offered as an optional add-on on the proposal (priced, not in its total) — marked here
  // too, and switched off here, so it never vanishes from sight (Coy, 2026-10-02).
  const addons = new Set(data.proposal?.addons ?? []);
  const setAddon = (id: string, on: boolean) => run(() => call(`/api/jobs/${jobId}/proposal`, "PATCH", { addon: { line_id: id, on } }));

  // One line of the grid.
  const lineRow = (l: Line) => {
                        const r = res.lines[l.id];
                        const blockedQty = r.qty === null;
                        return (
                          <tr key={l.id} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                            <td style={{ padding: "4px 8px 4px 24px", maxWidth: 260 }}>
                              <button onClick={() => setEditing(l)} className="text-left" style={{ cursor: "pointer", color: T.ink, fontWeight: 500, ...clip, display: "block", maxWidth: 240 }}>{l.name}</button>
                              {/* Coy, 2026-10-05: "This line needs to be removed. And I should be able to add/edit the notes under this
                                  and any cost item." Only what changes the price stays as a tag; the note is edited in place. */}
                              {(optLabel(l.option_id) || addons.has(l.id)) && (
                                <div style={{ fontSize: 9.5, color: T.chalk, ...clip }}>
                                  {optLabel(l.option_id) ? `${optLabel(l.option_id)} only` : ""}
                                  {optLabel(l.option_id) && addons.has(l.id) ? " · " : ""}
                                  {addons.has(l.id) && <button onClick={() => void setAddon(l.id, false)} title="Optional add-on on the proposal — tap to put it back in the price"
                                    style={{ color: T.chalk, cursor: "pointer", textDecoration: "underline dotted" }}>optional on the proposal ×</button>}
                                </div>
                              )}
                              <LineNote key={l.id + (l.description ?? "")} value={l.description} name={l.name} onSave={(v) => void patchLine(l.id, { description: v })} />
                              {r.blocked.length > 0 && <div style={{ fontSize: 9.5, color: T.hiviz, whiteSpace: "normal", overflowWrap: "anywhere" }}>needs {r.blocked.join(", ")}</div>}
                            </td>
                            <td style={{ padding: "2px 4px", color: T.ink2, maxWidth: 170, ...clip }}>
                              <VendorPick line={l} sources={data.sources ?? []} name={vendorName} onPick={(id) => void patchLine(l.id, { source_id: id })} />
                            </td>
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
                              {stale(l) && (
                                <button onClick={() => void patchLine(l.id, { refresh: true })} title={`${stale(l)} — tap to use the new price`} aria-label={`${stale(l)} for ${l.name}`}
                                  style={{ fontSize: 11, color: T.hiviz, marginLeft: 2, cursor: "pointer" }}>↻</button>
                              )}
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.ext_cost === null ? "—" : money(r.ext_cost)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right", color: T.ink2 }}>
                              {r.overhead === null ? "—" : money(r.overhead)}
                            </td>
                            <td style={{ padding: "2px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <Cell value={l.margin_pct ?? null} placeholder={r.margin_pct === null ? "?" : `${r.margin_pct}`} label={`Margin on ${l.name}`} suffix="%"
                                onSave={(v) => void patchLine(l.id, { margin_pct: v })} />
                              {(l.margin_pct ?? null) === null && r.margin_pct !== null && <span style={{ fontSize: 9.5, color: T.ink3 }} title="the job's margin"> job</span>}
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.unit_price === null ? "—" : money(r.unit_price)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{r.ext_price === null ? "—" : money(r.ext_price)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>
                              <input type="checkbox" checked={l.taxable} aria-label={`Tax on ${l.name}`} onChange={(e) => void patchLine(l.id, { taxable: e.target.checked })}
                                style={{ width: 16, height: 16, accentColor: T.chalk }} />
                            </td>
                          </tr>
                        );
  };
  const head = (
    <thead>
      <tr style={{ background: T.slab }}>
        {["Item", "Vendor", "Qty", "Unit", "Unit cost", "Ext cost", "O.H.", "Margin", "Unit price", "Ext price", "Tax"].map((h, i) => (
          <th key={h} style={{ ...eyebrow, textAlign: i < 2 || h === "Unit" ? "left" : "right", padding: "6px 8px", whiteSpace: "nowrap", borderBottom: `1px solid ${T.hair}` }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
  type AreaRows = (typeof areas)[number];
  // An area's lines: sub-groups (its Price book groups) ▸ cost items. Inside a
  // section's card the section is the top group, so it has no dark header row
  // and its total sits at the bottom; whole-job costs keep the header row.
  const areaBody = (a: AreaRows, inSection: boolean) => wide ? (
    <div ref={tableBox} className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: F.sm, ...nums }}>
        {head}
        <tbody>
          {!inSection && (
            <tr style={{ background: T.ink, color: T.card }}>
              <td colSpan={5} style={{ padding: "5px 8px" }}>
                <span style={{ fontFamily: disp, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{a.id ? a.name : "Additional costs · whole job"}</span>
                {areaSize(a.id) && <span style={{ fontSize: F.xs, opacity: 0.75, marginLeft: 8 }}>{areaSize(a.id)!.text}</span>}
                <button onClick={() => setBook({ area: a.id ?? "" })} style={{ ...eyebrow, color: T.card, opacity: 0.85, marginLeft: 10, cursor: "pointer", textDecoration: "underline" }}>+ Add</button>
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{a.lines.length ? money0(sum(a.lines, "ext_cost")) : ""}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{a.lines.length ? money0(sum(a.lines, "overhead")) : ""}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{marginOf(a.lines)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{areaPriced(a.lines) && areaSize(a.id) ? areaSize(a.id)!.per(sum(a.lines, "ext_price")) : ""}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{a.lines.length ? money0(sum(a.lines, "ext_price")) : ""}</td>
              <td />
            </tr>
          )}
          {!inSection && a.lines.length === 0 && (
            <tr><td colSpan={11} style={{ padding: "6px 8px 6px 16px", fontSize: F.xs, color: T.ink3 }}>
              {a.id ? "No cost items on this section yet — " : "Costs for the whole job, not one section (mobilization, a permit, a pump day) — "}
              <button onClick={() => setBook({ area: a.id ?? "" })} style={{ color: T.chalk, cursor: "pointer" }}>add them from the Price book</button>.
            </td></tr>
          )}
          {a.groups.map((g) => (
            <React.Fragment key={g.name}>
              <tr style={{ background: T.hairSoft }}>
                <td colSpan={5} style={{ padding: "4px 8px 4px 16px", fontWeight: 600 }}>{g.name}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{money0(sum(g.lines, "ext_cost"))}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: T.ink2 }}>{money0(sum(g.lines, "overhead"))}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: T.ink3 }}>{marginOf(g.lines)}</td>
                <td />
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{money0(sum(g.lines, "ext_price"))}</td>
                <td />
              </tr>
              {g.lines.map(lineRow)}
            </React.Fragment>
          ))}
          {inSection && a.lines.length > 0 && (
            <tr style={{ borderTop: `1px solid ${T.hair}`, background: T.slab }}>
              <td colSpan={5} style={{ padding: "5px 8px", fontFamily: disp, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
                {a.name} total{areaSize(a.id) && <span style={{ fontFamily: "inherit", fontWeight: 400, textTransform: "none", fontSize: F.xs, color: T.ink3, marginLeft: 8 }}>{areaSize(a.id)!.text}</span>}
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{money0(sum(a.lines, "ext_cost"))}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: T.ink2 }}>{money0(sum(a.lines, "overhead"))}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: T.ink3 }}>{marginOf(a.lines)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", color: T.ink2 }}>{areaPriced(a.lines) && areaSize(a.id) ? areaSize(a.id)!.per(sum(a.lines, "ext_price")) : ""}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{money0(sum(a.lines, "ext_price"))}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  ) : (
    <div>
      {!inSection && (
        <div className="flex items-baseline gap-2" style={{ ...eyebrow, color: T.ink, marginTop: 4 }}>
          <span style={{ minWidth: 0, ...clip }}>{a.id ? a.name : "Additional costs · whole job"}</span>
          {areaSize(a.id) && <span style={{ color: T.ink3, textTransform: "none", letterSpacing: 0, whiteSpace: "nowrap" }}>{areaSize(a.id)!.text}</span>}
          <span className="flex-1" />
          {a.lines.length > 0 && <span style={{ ...nums }}>{money0(sum(a.lines, "ext_price"))}</span>}
          <button onClick={() => setBook({ area: a.id ?? "" })} style={{ color: T.chalk, cursor: "pointer" }}>+ Add</button>
        </div>
      )}
      {!inSection && a.lines.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3 }}>{a.id ? "No cost items yet." : "Costs for the whole job, not one section — mobilization, a permit, a pump day."}</div>}
      {a.groups.map((g) => <GroupCard key={g.name} name={g.name} lines={g.lines} res={res} optLabel={optLabel} asmName={asmName} addons={addons} onOpen={setEditing}
                cost={sum(g.lines, "ext_cost")} price={sum(g.lines, "ext_price")} />)}
    </div>
  );

  return (
    <section ref={measure} aria-label="Budget" className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
      {/* ---- header ---- */}
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${T.hair}` }}>
        <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700 }}>Job totals</span>
        <span style={{ fontSize: F.xs, color: T.ink3 }}>each section&apos;s cost items are in its card above · qty × unit cost → + O.H. → ÷ (1 − margin) → price</span>
        <span className="flex-1" />
        <button onClick={() => setBook({ area: "" })} className="rounded px-2.5"
          style={{ height: 30, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
          + Whole-job cost
        </button>
      </div>
      {err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
      {data.lines.length === 0 && (
        <div className="px-3 pb-3" style={{ fontSize: F.sm, color: T.ink3 }}>
          {data.cards.length ? "No cost items yet. Add them inside each section above (+ Add items from the Price book), or load an assembly — quantities come from the section." : "No cost cards yet. Make or import them in the Price book, then add them here — or set up an assembly so new areas fill themselves."}
        </div>
      )}

      {/* ---- whole-job costs, and any section whose card isn't on screen ---- */}
      {areas.filter((a) => !(a.id && slots?.[a.id])).map((a) => (
        <div key={a.id ?? "job"} className={wide ? "" : "px-3 pb-2"}>{areaBody(a, false)}</div>
      ))}
      {/* ---- each section's own cost items, drawn inside its card (Coy, 2026-10-04) ---- */}
      {areas.filter((a) => a.id && slots?.[a.id]).map((a) => createPortal(
        <div style={{ borderTop: `1px solid ${T.hairSoft}` }}>
          <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap">
            <span style={{ ...eyebrow }}>Budget</span>
            {a.lines.length > 0 && (
              <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>
                {a.lines.length} item{a.lines.length === 1 ? "" : "s"} · cost {money0(sum(a.lines, "ext_cost"))} · price {money0(sum(a.lines, "ext_price"))}
                {areaPriced(a.lines) && areaSize(a.id) ? ` · ${areaSize(a.id)!.per(sum(a.lines, "ext_price"))}` : ""}
              </span>
            )}
            <span className="flex-1" />
            <button onClick={() => setBook({ area: a.id ?? "" })}
              className="rounded px-2.5" style={{ height: 28, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>
              + Add items from the Price book
            </button>
          </div>
          {err && <div className="px-3 pb-1" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
          {a.lines.length === 0
            ? <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>No cost items yet. Add them from the Price book — quantities come from this section.</div>
            : <div className={wide ? "" : "px-3 pb-2"}>{areaBody(a, true)}</div>}
        </div>,
        slots![a.id as string],
        a.id as string,
      ))}

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
              Sales tax {data.pricing?.tax.rate !== null && data.pricing?.tax.rate !== undefined
                ? `${data.pricing.tax.rate}%`
                : <span style={{ color: T.hiviz }}>— {data.pricing?.tax.missing ?? "no rate"}</span>}
            </label>
            {/* Coy, 2026-10-05: "This can be reduced to an 'i' button … Less words means less clutter." */}
            {data.pricing?.tax.rate !== null && data.pricing?.tax.rate !== undefined && (
              <button onClick={() => setTaxInfo((x) => !x)} aria-expanded={taxInfo} aria-label="About the sales tax" title="About the sales tax"
                className="rounded-full flex items-center justify-center" style={{ width: 18, height: 18, border: `1px solid ${T.hairStrong}`, color: T.ink2, fontSize: 11, fontStyle: "italic", fontFamily: "Georgia, serif", cursor: "pointer", marginLeft: -6 }}>i</button>
            )}
            <button onClick={() => setTaxOpen(true)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Change</button>
            {taxInfo && data.pricing?.tax.rate !== null && data.pricing?.tax.rate !== undefined && (
              <span className="basis-full" style={{ fontSize: F.xs, color: T.ink3 }}>
                {data.pricing.tax.source === "override" ? "Typed for this job" : data.pricing.tax.source === "lookup" ? "For the job's address (TaxLocus)" : `${data.pricing.tax.parish} parish`} · charged on taxed lines, at cost — a pass-through, no O.H. or margin on it.
              </span>
            )}
            <label className="flex items-center gap-1.5">
              O.H.
              <Cell value={data.estimate?.overhead_pct ?? null} placeholder={data.settings.overhead_pct !== null ? `${data.settings.overhead_pct}` : "?"} suffix="%" label="O.H. on this job"
                warn={data.settings.overhead_pct === null}
                onSave={(v) => void run(() => call(`/api/jobs/${jobId}/budget`, "PATCH", { overhead_pct: v }))} />
              {data.pricing?.overhead_from === "default" && <span style={{ fontSize: 9.5, color: T.ink3 }}>default</span>}
            </label>
            <label className="flex items-center gap-1.5">
              Margin
              <Cell value={data.estimate?.margin_pct ?? null} placeholder={data.settings.margin_pct !== null ? `${data.settings.margin_pct}` : "?"} suffix="%" label="Margin on this job"
                warn={data.settings.margin_pct === null}
                onSave={(v) => void run(() => call(`/api/jobs/${jobId}/budget`, "PATCH", { margin_pct: v }))} />
              {data.pricing?.margin_from === "default" && <span style={{ fontSize: 9.5, color: T.ink3 }}>default</span>}
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
                {t.priced && <span style={{ fontSize: F.xs, color: T.ink3 }}>O.H. {money0(t.overhead)} · profit {money0(t.profit)} · margin {pct(t.margin)}</span>}
                {t.priced && minimum.ok && t.total < minimum.minimum && <span style={{ fontSize: F.xs, color: T.red }}>under the job minimum {money0(minimum.minimum)}</span>}
                {!t.priced && t.blocked.length > 0 && <span style={{ fontSize: F.xs, color: T.hiviz, whiteSpace: "normal", overflowWrap: "anywhere", minWidth: 0 }}>needs {t.blocked.slice(0, 4).join(", ")}{t.blocked.length > 4 ? ` +${t.blocked.length - 4}` : ""}</span>}
              </div>
            ))}
          </div>
          {(() => {
                        const t = shownTiers[0];
            if (!t) return null;
            const ids = new Set(t.line_ids);
            return <Rollup lines={data.lines.filter((l) => ids.has(l.id))} res={res} tier={t} tierLabel={null}
              sections={sections} wide={wide} overheadPct={data.settings.overhead_pct} marginPct={data.settings.margin_pct} />;
          })()}
          <PriceSummary jobId={jobId} lines={visible} res={res} tiers={shownTiers} proposal={data.proposal} onChanged={reload} />
          <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>
            Job minimum: {minimum.ok ? `${money0(minimum.minimum)} (${minimum.days} days × ${money0(minimum.day_minimum)} a day)` : `needs ${minimum.blocked.join(" and ")}`}
          </div>
        </div>
      )}

      <TaxSheet open={taxOpen} onClose={() => setTaxOpen(false)} tax={data.pricing?.tax ?? null}
        onSave={(body) => run(() => call(`/api/jobs/${jobId}`, "PATCH", body)).then(() => setTaxOpen(false))}
        onLookup={async () => {
          const r = await fetch(`/api/jobs/${jobId}/tax`, { method: "POST" });
          const b = await r.json().catch(() => ({}));
          if (!r.ok || !b.ok) return b?.error ?? `HTTP ${r.status}`;
          reload(); return null;
        }} />
      {book && (
        <Drawer open wide onClose={() => { setBook(null); reload(); }} title="Add from the Price book"
          sub={areaName(book.area || null)}>
          <PriceBook pick={{
            // Coy, 2026-10-03: "Full Drive Replacement - Add Cost Items".
            title: `${areaName(book.area || null).replace(/\b\w/g, (c) => c.toUpperCase())} - Add Cost Items`,
            sub: "Tap + to put an item on this area of the budget, Add all for a whole group, Load for an assembly. Quantities come from the area by each item's rule.",
            top: (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5" style={{ fontSize: F.sm }}>
                  <span style={eyebrow}>Area</span>
                  <select value={book.area} onChange={(e) => setBook({ area: e.target.value })} aria-label="Area"
                    style={{ height: 32, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 6px", maxWidth: 260 }}>
                    <option value="">Whole job</option>
                    {sections.map((x) => <option key={x.id} value={x.id}>{x.name || "Unnamed area"}</option>)}
                  </select>
                </label>
                <button onClick={() => { const a = book.area; setBook(null); setPicker({ area: a }); }} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
                  Not in the Price book? Make it here
                </button>
              </div>
            ),
            onCard: (c) => call(`/api/jobs/${jobId}/budget/lines`, "POST", { section_id: book.area || null, cost_item_id: c.id }).then(() => undefined),
            onGroup: (g) => call(`/api/jobs/${jobId}/budget/lines`, "POST", { section_id: book.area || null, cost_group_id: g }).then(() => undefined),
            onAssembly: (id) => {
              if (!book.area) return Promise.reject(new Error("Pick an area first — an assembly fills one area."));
              return call(`/api/jobs/${jobId}/budget/assembly`, "POST", { assembly_id: id, section_id: book.area }).then(() => undefined);
            },
          }} />
        </Drawer>
      )}
      <CardPicker key={picker ? `p-${picker.area}` : "closed"} open={!!picker} initialArea={picker?.area ?? ""} onClose={() => setPicker(null)} data={data} sections={sections} tier={null}
        tierLabel={null}
        onAdd={(body) => run(() => call(`/api/jobs/${jobId}/budget/lines`, "POST", body))}
        onNewCard={async (card, line) => {
          // A new Price book card, then onto this budget — one connection, not a one-off.
          const b = await call("/api/cost-items", "POST", card);
          await run(() => call(`/api/jobs/${jobId}/budget/lines`, "POST", { ...line, cost_item_id: b.item.id }));
        }}
        onLoadAssembly={(assemblyId, sectionId) => run(() => call(`/api/jobs/${jobId}/budget/assembly`, "POST", { assembly_id: assemblyId, section_id: sectionId }))} />
      <LineSheet line={editing} data={data} sections={sections} res={editing ? res.lines[editing.id] : null}
        addon={editing ? addons.has(editing.id) : false} onAddon={(on) => editing && void setAddon(editing.id, on)}
        onClose={() => setEditing(null)}
        onPatch={(body) => editing && run(() => call(`/api/jobs/${jobId}/budget/lines/${editing.id}`, "PATCH", body))}
        onDelete={() => { if (editing && window.confirm(`Take ${editing.name} off the budget?`)) { const id = editing.id; setEditing(null); void run(() => call(`/api/jobs/${jobId}/budget/lines/${id}`, "DELETE")); } }} />
    </section>
  );
}


/** A cost item's note, edited where it sits (it is the line's description — it shows on the proposal). */
function LineNote({ value, name, onSave }: { value: string | null; name: string; onSave: (v: string | null) => void }) {
  const [v, setV] = useState(value ?? "");
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} maxLength={500} placeholder="+ note" aria-label={`Note on ${name}`}
      onBlur={() => { const t = v.trim() || null; if (t !== (value ?? null)) onSave(t); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(value ?? ""); (e.target as HTMLInputElement).blur(); } }}
      title={v || "Add a note — it shows on the proposal"}
      className="w-full outline-none rounded border border-transparent bg-transparent focus:[border-color:var(--sc-hair)] focus:[background:var(--sc-card)]"
      style={{ display: "block", fontSize: 10.5, color: v ? T.ink2 : T.ink3, padding: "1px 2px", marginLeft: -2, maxWidth: 240 }} />
  );
}

function GroupCard({ name, lines, res, optLabel, asmName, addons, onOpen, cost, price }: {
  name: string; lines: Line[]; res: ReturnType<typeof priceBudget>; optLabel: (id: string | null) => string | null;
  asmName: (id: string | null | undefined) => string | null; addons: Set<string>;
  onOpen: (l: Line) => void; cost: number; price: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded mt-1.5" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
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
              {l.description && <span style={{ display: "block", fontSize: 10.5, color: T.ink2, ...clip }}>{l.description}</span>}
              {/* A "needs …" note can be long (the tax one names the parish and where to fix it) — it wraps, never widens the page. */}
              <span style={{ display: "block", fontSize: 10, color: r.blocked.length ? T.hiviz : T.ink3, ...nums, ...(r.blocked.length ? { whiteSpace: "normal", overflowWrap: "anywhere" } : {}) }}>
                {r.blocked.length ? `needs ${r.blocked.join(", ")}` : `${qtyFmt(r.qty)} ${l.unit} × ${l.unit_cost === null ? "—" : money(l.unit_cost)}${r.qty_basis === "set" ? " ✎" : " ƒ"}`}
                {optLabel(l.option_id) ? ` · ${optLabel(l.option_id)} only` : ""}
                {addons.has(l.id) ? " · optional on the proposal" : ""}
                {l.section_role === "reinforcement" ? " · reinforcement" : ""}
                {asmName(l.assembly_id) ? ` · from ${asmName(l.assembly_id)}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...nums }}>{r.ext_price === null ? "—" : money(r.ext_price)}</span>
          </button>
        );
      })}
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = { material: "#1E5AA8", labor: "#D97757", equipment: "#6A55B0", subcontract: "#2F8A5B", other: "#8C8578" };

/**
 * What used to be the proposal's job panel (Coy, 2026-10-02: "integrated into
 * the main job budget page"): cost by type as one bar, and the profit split
 * with a sub — yours only, never on the proposal, never changes the price.
 * The split is saved on the proposal draft.
 */
function PriceSummary({ jobId, lines, res, tiers, proposal, onChanged }: {
  jobId: string; lines: Line[]; res: ReturnType<typeof priceBudget>; tiers: TierTotal[];
  proposal?: { has_draft: boolean; split: string }; onChanged: () => void;
}) {
  const [split, setSplit] = useState(proposal?.split ?? "none");
  const [err, setErr] = useState<string | null>(null);
  const t = tiers.length === 1 ? tiers[0] : null;
  const byType: Record<string, number> = {};
  for (const l of lines) {
    if (t && !t.line_ids.includes(l.id)) continue;
    const c = res.lines[l.id]?.ext_cost;
    if (c) byType[String(l.cost_type)] = (byType[String(l.cost_type)] ?? 0) + c;
  }
  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  const parts = split === "20_80" ? [20, 80] : split === "30_70" ? [30, 70] : null;
  const pick = async (k: string) => {
    setSplit(k); setErr(null);
    try { await call(`/api/jobs/${jobId}/proposal`, "PATCH", { split: k }); onChanged(); }
    catch (e) { setErr(e instanceof Error && /no draft/i.test(e.message) ? "Open the Proposal once to start its draft, then set the split." : e instanceof Error ? e.message : String(e)); }
  };
  if (!total) return null;
  return (
    <div className="mt-2.5 pt-2" style={{ borderTop: `1px solid ${T.hair}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ ...eyebrow }}>Profit split with a sub</span>
        <span className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${T.hair}` }}>
          {([["none", "No sub"], ["20_80", "20 / 80"], ["30_70", "30 / 70"]] as const).map(([k, l], i) => (
            <button key={k} onClick={() => void pick(k)} aria-pressed={split === k}
              style={{ height: 24, padding: "0 8px", fontSize: 11, background: split === k ? T.ink : T.card, color: split === k ? T.card : T.ink2, borderLeft: i ? `1px solid ${T.hair}` : "none", cursor: "pointer" }}>{l}</button>
          ))}
        </span>
        {parts && t?.priced && (
          <span style={{ fontSize: F.xs, color: T.ink2, ...nums }}>you keep {money0(t.profit * parts[0] / 100)} · sub {money0(t.profit * parts[1] / 100)}</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>Yours only — never on the proposal, never changes the price.</div>
      {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
    </div>
  );
}

/**
 * The roll-up (Coy, 2026-10-04: "shows a spreadsheet of how the labor,
 * equipment and materials add up for all the sections and how the Over Head
 * and profit all math out"). Rows are cost types; columns each section's cost,
 * then the job's cost, O.H., profit and price for that type; then the math from
 * cost to the total. Every number is the engine's own line result, summed.
 */
function Rollup({ lines, res, tier, tierLabel, sections, wide, overheadPct, marginPct }: {
  lines: Line[]; res: ReturnType<typeof priceBudget>; tier: TierTotal; tierLabel: string | null;
  sections: Area[]; wide: boolean; overheadPct: number | null; marginPct: number | null;
}) {
  if (!lines.length) return null;
  const known = new Set(sections.map((s) => s.id));
  const areaOf = (l: Line) => (l.section_id && known.has(l.section_id) ? l.section_id : "");
  const cols = [...sections.filter((s) => lines.some((l) => areaOf(l) === s.id)).map((s) => ({ id: s.id, name: s.name || "Unnamed area" })),
    ...(lines.some((l) => areaOf(l) === "") ? [{ id: "", name: "Whole job" }] : [])];
  const typeOf = (l: Line): CostType => ((COST_TYPES as readonly string[]).includes(String(l.cost_type)) ? l.cost_type as CostType : "other");
  const types = COST_TYPES.filter((k) => lines.some((l) => typeOf(l) === k));
  const of = (ls: Line[], k: "ext_cost" | "overhead" | "ext_price") => ls.reduce((a, l) => a + (res.lines[l.id]?.[k] ?? 0), 0);
  const rows = types.map((k) => {
    const ls = lines.filter((l) => typeOf(l) === k);
    const cost = of(ls, "ext_cost"), oh = of(ls, "overhead"), price = of(ls, "ext_price");
    return { k, label: COST_TYPE_LABEL[k], ls, cost, oh, price, profit: price - cost - oh };
  });
  const cell: React.CSSProperties = { padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" };
  const th: React.CSSProperties = { ...eyebrow, padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", borderBottom: `1px solid ${T.hair}` };
  const cost = rows.reduce((a, r) => a + r.cost, 0), oh = rows.reduce((a, r) => a + r.oh, 0), price = rows.reduce((a, r) => a + r.price, 0);
  const steps: Array<[string, string, number | null, boolean?]> = [
    ["Cost", "every section's labor, materials, equipment …", cost],
    [`+ O.H.`, overheadPct !== null ? `${overheadPct}% of cost` : "the job's O.H.", oh],
    ["= Cost + O.H.", "", cost + oh, true],
    ["+ Profit", marginPct !== null ? `${marginPct}% margin: (cost + O.H.) ÷ (1 − ${marginPct}%), less cost + O.H.` : "the margin", price - cost - oh],
    ["= Price", "before tax", price, true],
    ...(tier.tax > 0 ? [["+ Sales tax", "at cost, on taxed lines", tier.tax] as [string, string, number]] : []),
    ...(tier.discount > 0 ? [["− Discount", "price only", -tier.discount] as [string, string, number]] : []),
    ["= Total", tier.priced ? `profit ${money0(tier.profit)} · margin ${pct(tier.margin)}` : "not priced yet — see what each line needs", tier.priced ? tier.total : null, true],
  ];
  return (
    <div className="mt-2.5 pt-2" style={{ borderTop: `1px solid ${T.hair}` }}>
      <div style={{ ...eyebrow }}>How it adds up{tierLabel ? ` · ${tierLabel}` : ""}</div>
      <div className="overflow-x-auto mt-1">
        <table style={{ borderCollapse: "collapse", fontSize: F.sm, minWidth: "100%", ...nums }}>
          <thead>
            <tr style={{ background: T.card }}>
              <th style={{ ...th, textAlign: "left" }}>Type</th>
              {wide && cols.map((c) => <th key={c.id || "job"} style={{ ...th, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }} title={c.name}>{c.name}</th>)}
              <th style={th}>Cost</th><th style={th}>O.H.</th><th style={th}>Profit</th><th style={th}>Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                <td style={{ ...cell, textAlign: "left" }}>
                  <span className="inline-flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLORS[r.k] ?? TYPE_COLORS.other }} />{r.label}</span>
                </td>
                {wide && cols.map((c) => { const v = of(r.ls.filter((l) => areaOf(l) === c.id), "ext_cost"); return <td key={c.id || "job"} style={{ ...cell, color: v ? T.ink2 : T.ink3 }}>{v ? money0(v) : "—"}</td>; })}
                <td style={{ ...cell, fontWeight: 600 }}>{money0(r.cost)}</td>
                <td style={{ ...cell, color: T.ink2 }}>{money0(r.oh)}</td>
                <td style={{ ...cell, color: T.ink2 }}>{money0(r.profit)}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{money0(r.price)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `1px solid ${T.hair}`, background: T.card }}>
              <td style={{ ...cell, textAlign: "left", fontFamily: disp, fontWeight: 700, textTransform: "uppercase" }}>All</td>
              {wide && cols.map((c) => <td key={c.id || "job"} style={{ ...cell, fontWeight: 600 }}>{money0(of(lines.filter((l) => areaOf(l) === c.id), "ext_cost"))}</td>)}
              <td style={{ ...cell, fontWeight: 700 }}>{money0(cost)}</td>
              <td style={{ ...cell, fontWeight: 600 }}>{money0(oh)}</td>
              <td style={{ ...cell, fontWeight: 600 }}>{money0(price - cost - oh)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{money0(price)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 rounded" style={{ border: `1px solid ${T.hair}`, background: T.card, maxWidth: 560 }}>
        {steps.map(([label, note, v, strong], i) => (
          <div key={label} className="flex items-baseline gap-2 px-2.5 py-1" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", ...nums }}>
            <span style={{ fontFamily: disp, fontWeight: strong ? 700 : 500, textTransform: "uppercase", letterSpacing: ".03em", minWidth: 118, fontSize: F.sm }}>{label}</span>
            <span style={{ fontSize: F.xs, color: T.ink3, flex: 1, minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}>{note}</span>
            <span style={{ fontWeight: strong ? 700 : 500, fontSize: strong ? F.md : F.sm, whiteSpace: "nowrap" }}>{v === null ? "—" : money0(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardPicker({ open, initialArea, onClose, data, sections, tier, tierLabel, onAdd, onNewCard, onLoadAssembly }: {
  open: boolean; initialArea: string; onClose: () => void; data: Data; sections: Area[];
  tier: string | null; tierLabel: string | null; onAdd: (body: Record<string, unknown>) => Promise<void>;
  onNewCard: (card: Record<string, unknown>, line: Record<string, unknown>) => Promise<void>;
  onLoadAssembly: (assemblyId: string, sectionId: string) => Promise<void>;
}) {
  const [openG, setOpenG] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [area, setArea] = useState<string>(initialArea);
  const areaSec = sections.find((x) => x.id === area);
  const firstUnit = areaSec && quantities(areaSec).count !== null ? (areaSec.count_unit || "EA") : areaSec && areaUnit(areaSec) === "sy" ? "SqYd" : "Each";
  const [custom, setCustom] = useState({ name: "", cost_type: "material" as CostType, unit: firstUnit, unit_cost: "", qty_rule: ruleForUnit(firstUnit), save: true });
  const [saving, setSaving] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const match = (c: Card) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase());
  const groups = [...data.groups.map((g) => ({ id: g.id, name: g.name, cards: data.cards.filter((c) => c.cost_group_id === g.id && match(c)) })),
    { id: null, name: "Not in a group", cards: data.cards.filter((c) => (!c.cost_group_id || !data.groups.some((g) => g.id === c.cost_group_id)) && match(c)) }]
    .filter((g) => g.cards.length);
  const base = { section_id: area || null, option_id: tier };
  const add = async (body: Record<string, unknown>, what: string) => { await onAdd({ ...base, ...body }); setAdded(what); setTimeout(() => setAdded(null), 1600); };
  const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 8px", width: "100%", minWidth: 0 };
  return (
    <Sheet open={open} onClose={onClose} title="Add to the budget" sub={tierLabel ? `Into ${tierLabel}` : undefined}>
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
        {(data.assemblies?.length ?? 0) > 0 && (
          <div className="rounded p-2.5" style={{ border: `1px solid ${T.hair}` }}>
            <div style={{ ...eyebrow, color: T.ink }}>Load an assembly</div>
            {!area && <div style={{ fontSize: 10, color: T.ink3 }}>Pick the area first — an assembly fills one area.</div>}
            <div className="flex flex-wrap gap-1.5 mt-1">
              {data.assemblies!.map((a) => (
                <button key={a.id} disabled={!area} onClick={() => void onLoadAssembly(a.id, area).then(() => { setAdded(a.name); setTimeout(() => setAdded(null), 1600); })}
                  className="rounded px-2" style={{ height: 30, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.xs, opacity: area ? 1 : 0.5, cursor: area ? "pointer" : "default" }}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {groups.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3 }}>{data.cards.length ? "No card matches." : "No cost cards yet — make them in the Price book."}</div>}
        {groups.map((g) => (
          <div key={g.id ?? "none"} className="rounded" style={{ border: `1px solid ${T.hair}` }}>
            <div className="flex items-center px-2.5 py-1.5" style={{ background: T.slab }}>
              <button onClick={() => setOpenG((o) => ({ ...o, [g.id ?? "none"]: !o[g.id ?? "none"] }))} aria-expanded={!!q.trim() || !!openG[g.id ?? "none"]}
                className="text-left" style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", flex: 1, cursor: "pointer" }}>
                {q.trim() || openG[g.id ?? "none"] ? "−" : "+"} {g.name} <span style={{ fontSize: 10, color: T.ink3, fontWeight: 400 }}>{g.cards.length}</span>
              </button>
              {g.id && <button onClick={() => void add({ cost_group_id: g.id }, g.name)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Add all</button>}
            </div>
            {(q.trim() || openG[g.id ?? "none"]) && g.cards.map((c) => (
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
          <div style={{ ...eyebrow, color: T.ink }}>Not in the Price book? Make it here</div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <input value={custom.name} onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))} placeholder="Name (e.g. Concrete walk 4in — labor)" aria-label="New item name" style={{ ...field, gridColumn: "1 / -1" }} />
            <select value={custom.cost_type} onChange={(e) => setCustom((c) => ({ ...c, cost_type: e.target.value as CostType }))} style={field} aria-label="New item type">
              {COST_TYPES.map((t) => <option key={t} value={t}>{COST_TYPE_LABEL[t]}</option>)}
            </select>
            <UnitPicker value={custom.unit || null} style={field} ariaLabel="New item unit type"
              onChange={(u) => setCustom((c) => ({ ...c, unit: u, qty_rule: ruleForUnit(u, c.qty_rule) }))} />
            <input value={custom.unit_cost} onChange={(e) => setCustom((c) => ({ ...c, unit_cost: e.target.value }))} placeholder="unit cost" inputMode="decimal" aria-label="New item unit cost" style={field} />
            <label className="flex items-center gap-1.5" style={{ fontSize: F.xs, gridColumn: "1 / -1" }}>
              <input type="checkbox" checked={custom.save} onChange={(e) => setCustom((c) => ({ ...c, save: e.target.checked }))} style={{ width: 16, height: 16, accentColor: T.chalk }} />
              Save it to the Price book too (so the next job can use it)
            </label>
            <button disabled={!custom.name.trim() || !!saving} style={{ height: 34, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", opacity: custom.name.trim() ? 1 : 0.5, gridColumn: "1 / -1", borderRadius: 4 }}
              onClick={() => {
                const name = custom.name.trim();
                const unit_cost = custom.unit_cost.trim() === "" ? null : custom.unit_cost;
                setSaving(name);
                const done = custom.save
                  ? onNewCard({ name, cost_type: custom.cost_type, unit: custom.unit, unit_cost, qty_rule: custom.qty_rule, rule_params: {} }, base)
                  : onAdd({ ...base, name, cost_type: custom.cost_type, unit: custom.unit, qty_rule: custom.qty_rule, unit_cost });
                void done.then(() => { setAdded(name); setTimeout(() => setAdded(null), 1600); setCustom((c) => ({ ...c, name: "", unit_cost: "" })); })
                  .finally(() => setSaving(null));
              }}>
              {saving ? "Adding…" : custom.save ? "Add to the Price book and this budget" : "Add to this budget only"}
            </button>
          </div>
          <div style={{ fontSize: 9.5, color: T.ink3, marginTop: 3 }}>
            Quantity: {UNIT_RULE_SAYS[custom.qty_rule] ?? "typed"}{custom.qty_rule === "manual" ? " on the budget" : ""}.
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function LineSheet({ line, data, sections, res, addon, onAddon, onClose, onPatch, onDelete }: {
  line: Line | null; data: Data; sections: Array<SectionInput & { id: string }>; res: ReturnType<typeof priceBudget>["lines"][string] | null;
  addon: boolean; onAddon: (on: boolean) => void;
  onClose: () => void; onPatch: (body: Record<string, unknown>) => void; onDelete: () => void;
}) {
  if (!line || !res) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const field: React.CSSProperties = { height: 36, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 8px", width: "100%", minWidth: 0 };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <Sheet open onClose={onClose} title={line.name} sub={line.qty_rule === "from_takeoff" ? "Measured in the Plan Room" : line.cost_item_id ? "From the Price book" : "This budget only"}>
      <div className="px-4 py-3 flex flex-col gap-3" key={line.id + line.updated_at}>
        {/* The worked-out line ("2 days × $250 = … → $821.43") is gone (Coy, 2026-10-05); only what blocks it shows. */}
        {res.blocked.length > 0 && (
          <div className="rounded px-3 py-2" style={{ background: T.slab, fontSize: F.sm, color: T.hiviz }}>Needs {res.blocked.join(", ")}</div>
        )}
        {/* Unit type (Coy, 2026-10-05: "if it's just the unit type then it needs to be renamed 'unit type'").
            One picker; the unit decides how the quantity is worked out (ruleForUnit). This line only. */}
        <div>
          <label className="block"><span style={eyebrow}>Unit type</span>
            <UnitPicker value={line.unit} style={field}
              onChange={(u) => { const r = ruleForUnit(u, line.qty_rule); onPatch(r !== line.qty_rule ? { unit: u, qty_rule: r } : { unit: u }); }} /></label>
          <div style={{ fontSize: 9.5, color: T.ink3, marginTop: 3 }}>
            {(() => {
              const want = ruleForUnit(line.unit, line.qty_rule);
              if (line.qty_rule === "from_takeoff") return "Quantity: measured in the Plan Room.";
              if (want !== line.qty_rule && line.qty_rule === "manual") return (
                <>Quantity typed. <button onClick={() => onPatch({ qty_rule: want })} style={{ color: T.chalk, cursor: "pointer", fontSize: 9.5 }}>↺ Count it from the area</button></>
              );
              return `Quantity: ${UNIT_RULE_SAYS[line.qty_rule] ?? "typed"}.`;
            })()}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span style={eyebrow}>Quantity {res.qty_basis === "set" ? "(typed)" : `(from the scope${res.qty_note ? ` — ${res.qty_note}` : ""})`}</span>
            <input defaultValue={res.qty ?? ""} inputMode="decimal" style={field} aria-label="Quantity"
              onBlur={(e) => { const v = num(e.target.value); if (v !== res.qty) onPatch({ quantity: v }); }} />
            {res.qty_basis === "set" && line.qty_rule !== "manual" && (
              <button onClick={() => onPatch({ qty_source: "rule" })} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>↺ back to the rule</button>
            )}</label>
          <label className="block"><span style={eyebrow}>Unit cost / {line.unit || "unit"}</span>
            <input defaultValue={line.unit_cost ?? ""} inputMode="decimal" placeholder="not recorded" style={{ ...field, borderColor: line.unit_cost === null ? T.hiviz : T.hair }} aria-label="Unit cost"
              onBlur={(e) => { const v = num(e.target.value); if (v !== line.unit_cost) onPatch({ unit_cost: v }); }} /></label>
          <label className="block"><span style={eyebrow}>Margin % · this line only</span>
            <input defaultValue={line.margin_pct ?? ""} inputMode="decimal" placeholder={res.margin_pct !== null ? `${res.margin_pct} (the job's)` : "not recorded"} style={field} aria-label="Margin"
              onBlur={(e) => { const v = num(e.target.value); if (v !== (line.margin_pct ?? null)) onPatch({ margin_pct: v }); }} /></label>
          <label className="flex items-center gap-2 mt-5" style={{ fontSize: F.sm }}>
            <input type="checkbox" checked={line.taxable} onChange={(e) => onPatch({ taxable: e.target.checked })} style={{ width: 18, height: 18, accentColor: T.chalk }} /> Sales tax applies</label>
        </div>
        {(data.sources ?? []).some((x) => x.cost_item_id === line.cost_item_id) && (
          <label className="block"><span style={eyebrow}>Vendor · whose price this line uses</span>
            <VendorPick line={line} sources={data.sources ?? []} full
              name={(id) => { const v = data.sources?.find((x) => x.vendor?.id === id)?.vendor; return v ? v.name || v.company_name || formatPhone(v.phone) : null; }}
              onPick={(id) => onPatch({ source_id: id })} /></label>
        )}
        {/* Its group (Coy, 2026-10-04: "I have an uncategorized cost item and I can't change it inside the
            budget"). From a Price book item this moves the item there too, so the book and every budget agree. */}
        <label className="block"><span style={eyebrow}>Group{line.cost_item_id ? " · moves it in the Price book too" : ""}</span>
          <select value={line.cost_group_id ?? ""} onChange={(e) => onPatch({ cost_group_id: e.target.value || null })} style={field} aria-label="Group">
            <option value="">Not in a group</option>
            {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label>
        <label className="block"><span style={eyebrow}>Area</span>
          <select value={line.section_id ?? ""} onChange={(e) => onPatch({ section_id: e.target.value || null })} style={field}>
            <option value="">Whole job</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name || "Unnamed area"}</option>)}
          </select></label>
        <label className="block"><span style={eyebrow}>Description (shows on the proposal)</span>
          <textarea defaultValue={line.description ?? ""} rows={2} maxLength={500} style={{ ...field, height: "auto", padding: "6px 8px", resize: "none" }}
            onBlur={(e) => { if ((e.target.value.trim() || null) !== (line.description ?? null)) onPatch({ description: e.target.value }); }} /></label>
        <label className="flex items-center gap-2" style={{ fontSize: F.sm }}>
          <input type="checkbox" checked={line.show_on_doc} onChange={(e) => onPatch({ show_on_doc: e.target.checked })} style={{ width: 18, height: 18, accentColor: T.chalk }} /> Show on the proposal</label>
        {data.proposal?.has_draft && (
          <label className="flex items-center gap-2" style={{ fontSize: F.sm }}>
            <input type="checkbox" checked={addon} onChange={(e) => onAddon(e.target.checked)} style={{ width: 18, height: 18, accentColor: T.chalk }} />
            Optional add-on on the proposal <span style={{ color: T.ink3, fontSize: F.xs }}>(priced, not in the total)</span></label>
        )}
        <button onClick={onDelete} className="self-start" style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Take off the budget</button>
      </div>
    </Sheet>
  );
}

/**
 * Whose price a line uses (migration 051). "Default" follows the card's
 * default vendor; picking one vendor pins this line to their price only.
 * Shown as plain text when only one vendor prices the item.
 */
function VendorPick({ line, sources, name, onPick, full }: {
  line: Line; sources: Source[]; name: (id: string | null) => string | null; onPick: (sourceId: string | null) => void; full?: boolean;
}) {
  const mine = sources.filter((x) => x.cost_item_id === line.cost_item_id);
  if (mine.length < 2 && !full) return <span style={{ padding: "0 4px" }}>{name(line.vendor_contact_id) ?? "—"}</span>;
  const label = (x: Source) => `${x.unit_cost === null ? "no price" : money(x.unit_cost)} · ${x.vendor?.name || x.vendor?.company_name || formatPhone(x.vendor?.phone ?? null)}`;
  return (
    <select value={line.source_pinned && line.source_id ? line.source_id : ""} aria-label={`Vendor for ${line.name}`}
      onChange={(e) => onPick(e.target.value || null)}
      style={{ height: full ? 36 : 28, width: "100%", maxWidth: full ? undefined : 166, border: `1px solid ${T.hair}`, background: T.card, fontSize: full ? F.sm : F.xs, borderRadius: 4, padding: "0 4px" }}>
      <option value="">Default{line.source_pinned ? "" : ` (${name(line.vendor_contact_id) ?? "none"})`}</option>
      {mine.map((x) => <option key={x.id} value={x.id}>{label(x)}{line.source_pinned && line.source_id === x.id ? " ✎" : ""}</option>)}
    </select>
  );
}

/** The job's sales tax (migration 057): its parish's rate, or one typed for this job. */
function TaxSheet({ open, onClose, tax, onSave, onLookup }: {
  open: boolean; onClose: () => void;
  tax: { rate: number | null; parish: string | null; source: "override" | "parish" | "lookup" | null; missing: string | null; lookup?: { rate_pct: number; parts: Array<{ name: string; level: string; rate_pct: number }>; as_of: string | null; resolution: string | null; address: string; at: string } | null } | null;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onLookup: () => Promise<string | null>;
}) {
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState<string | null>(null);
  const [parishes, setParishes] = useState<Array<{ parish: string; rate_pct: number }> | null>(null);
  const [rate, setRate] = useState("");
  useEffect(() => {
    if (!open) return;
    let off = false;
    call("/api/tax-parishes", "GET").then((b) => { if (!off) setParishes(b.parishes); }).catch(() => { if (!off) setParishes([]); });
    return () => { off = true; };
  }, [open]);
  const row: React.CSSProperties = { borderTop: `1px solid ${T.hairSoft}`, minHeight: 44, cursor: "pointer" };
  return (
    <Sheet open={open} onClose={onClose} title="Sales tax on this job"
      sub={tax?.rate != null ? `${tax.rate}% — ${tax.source === "override" ? "typed for this job" : tax.source === "lookup" ? "for the job's address" : `${tax.parish} parish`}` : tax?.missing ?? ""}>
      <div className="px-4 py-3">
        {/* By the address (TaxLocus, Coy 2026-10-04): the exact rate where the job is, city and district included. */}
        <div style={{ ...eyebrow, marginBottom: 4 }}>By the job&apos;s address</div>
        {tax?.lookup ? (
          <div className="rounded mb-2" style={{ background: tax.source === "lookup" ? T.hivizDim : T.slab, padding: "8px 10px", fontSize: F.sm }}>
            <div><b style={nums}>{tax.lookup.rate_pct}%</b> at {tax.lookup.address}{tax.source !== "lookup" ? <span style={{ color: T.ink3 }}> — not in use (a rate or parish is set)</span> : null}</div>
            <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>
              {tax.lookup.parts.map((p) => `${p.name} ${p.rate_pct}%`).join(" + ")}
              {` · TaxLocus${tax.lookup.as_of ? `, rates as of ${tax.lookup.as_of}` : ""}${tax.lookup.resolution ? `, placed by ${tax.lookup.resolution}` : ""}`}
            </div>
          </div>
        ) : <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 6 }}>Not looked up yet.</div>}
        <button disabled={looking} onClick={() => { setLooking(true); setLookErr(null); void onLookup().then((e) => { setLookErr(e); setLooking(false); }); }}
          className="rounded px-3 mb-3" style={{ height: 34, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer", opacity: looking ? 0.5 : 1 }}>
          {looking ? "Looking up…" : tax?.lookup ? "Look up again — use the address's rate" : "Look up by address"}
        </button>
        {lookErr && <div style={{ fontSize: F.xs, color: T.red, marginTop: -6, marginBottom: 8 }}>{lookErr}</div>}
        <div style={{ ...eyebrow, marginBottom: 4 }}>The job is in</div>
        {parishes === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div> : parishes.length === 0 ? (
          <div style={{ fontSize: F.sm, color: T.ink3 }}>No parish rates yet — add them in Price book → Defaults.</div>
        ) : parishes.map((p) => (
          <button key={p.parish} onClick={() => void onSave({ tax_parish: p.parish })} className="w-full flex items-center px-1 text-left" style={row}>
            <span className="flex-1" style={{ fontSize: F.sm, fontWeight: tax?.parish === p.parish && tax.source === "parish" ? 700 : 400 }}>{p.parish}</span>
            <span style={{ ...nums, fontSize: F.sm }}>{p.rate_pct}%</span>
          </button>
        ))}
        <button onClick={() => void onSave({ tax_reset: true })} className="w-full flex items-center px-1 text-left" style={row}>
          <span style={{ fontSize: F.sm, color: T.chalk }}>From the address</span>
        </button>
        <div style={{ ...eyebrow, margin: "12px 0 4px" }}>Or type this job&apos;s rate</div>
        <div className="flex gap-2" style={{ maxWidth: 240 }}>
          <input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Tax rate %"
            className="rounded px-2 outline-none flex-1" style={{ height: 36, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, ...nums }} />
          <button disabled={rate === ""} onClick={() => void onSave({ tax_rate_pct: Number(rate) })} className="rounded px-3"
            style={{ height: 36, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", opacity: rate === "" ? 0.5 : 1 }}>Use</button>
        </div>
      </div>
    </Sheet>
  );
}
