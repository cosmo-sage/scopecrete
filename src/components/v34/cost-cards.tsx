"use client";

/**
 * Cost cards (migration 047) — Coy's catalog of what he buys and charges for,
 * each tied to the vendor it comes from. Cards are what a job's budget is
 * built from (the next step); on a phone they read as cards because that is
 * easier to read on a tailgate.
 *
 * The whole catalog lives in the Price book (/dashboard/price-book,
 * price-book.tsx, migration 049), which reuses the sheets here. This list is
 * the per-vendor door: a vendor's page → Prices shows that vendor's cards,
 * and a new card there starts with them as the vendor.
 *
 * A blank unit cost stays blank and the card says what it still needs —
 * nothing is filled in for Coy (DECISIONS §3).
 */

import React, { useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, money, formatPhone } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import {
  COST_TYPES, COST_TYPE_LABEL, QTY_RULES, QTY_RULE_LABEL, RULE_UNIT, cardGaps, defaultTaxable,
  type CostType, type QtyRule,
} from "@/lib/cost-cards";

export interface Card {
  id: string; cost_group_id: string | null; name: string; description: string | null; cost_type: CostType;
  unit: string; unit_cost: number | null; taxable: boolean; markup_pct: number | null;
  vendor_contact_id: string | null; vendor_sku: string | null; price_as_of: string | null; price_source: string | null;
  qty_rule: QtyRule; rule_params: Record<string, number>; active: boolean; sort_order: number; updated_at: string;
  import_id?: string | null; price_import_id?: string | null; price_file_id?: string | null;
}
export interface Group { id: string; name: string; cost_type: CostType; default_markup_pct: number | null; sort_order: number }
export interface Vendor { id: string; name: string | null; phone: string | null; contact_subtype: string | null }

export async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}
export const numify = (c: Record<string, unknown>) => ({
  ...c, unit_cost: c.unit_cost === null ? null : Number(c.unit_cost), markup_pct: c.markup_pct === null ? null : Number(c.markup_pct),
}) as unknown as Card;
export const dateLabel = (d: string | null) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

const RULE_FIELDS: Partial<Record<QtyRule, Array<{ k: string; label: string; unit: string; hint: string }>>> = {
  per_sheet: [{ k: "sheet_sqft", label: "One sheet covers", unit: "sq ft", hint: "after lap — a 5×10 sheet is about 45" }],
  per_stick: [
    { k: "stick_ft", label: "Stick length", unit: "ft", hint: "usually 20" },
    { k: "spacing_in", label: "Spacing", unit: "in o.c.", hint: "both ways" },
    { k: "lap_pct", label: "Lap & ends", unit: "%", hint: "blank = none" },
  ],
  per_cy: [{ k: "per_cy", label: "Per yard", unit: "unit / cu yd", hint: "for fiber — blank for concrete itself" }],
};

export function CostCards({ vendorId, vendorName }: { vendorId?: string; vendorName?: string | null }) {
  const [items, setItems] = useState<Card[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Card> | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    call(`/api/cost-items${vendorId ? `?vendor=${vendorId}` : ""}`, "GET")
      .then((b) => { if (!off) { setItems((b.items as Array<Record<string, unknown>>).map(numify)); setGroups(b.groups); setVendors(b.vendors); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [vendorId, tick]);

  const vendorLabel = (id: string | null) => {
    if (!id) return null;
    if (id === vendorId) return vendorName ?? "this vendor";
    const v = vendors.find((x) => x.id === id);
    return v ? (v.name || formatPhone(v.phone)) : "a vendor";
  };

  const sections = useMemo(() => {
    const list = items ?? [];
    const out: Array<{ key: string; title: string; sub: string; cards: Card[] }> = groups
      .map((g) => ({ key: g.id, title: g.name, sub: `${COST_TYPE_LABEL[g.cost_type]}${g.default_markup_pct !== null ? ` · ${Number(g.default_markup_pct)}% markup` : ""}`,
        cards: list.filter((c) => c.cost_group_id === g.id) }))
      .filter((s) => !vendorId || s.cards.length);
    const loose = list.filter((c) => !c.cost_group_id || !groups.some((g) => g.id === c.cost_group_id));
    if (loose.length) out.push({ key: "none", title: "Not in a group", sub: "", cards: loose });
    return out;
  }, [items, groups, vendorId]);

  const newCard = (groupId?: string) => {
    const g = groups.find((x) => x.id === groupId);
    const t: CostType = g?.cost_type ?? "material";
    setEditing({ cost_group_id: groupId ?? null, cost_type: t, qty_rule: "manual", unit: "", taxable: defaultTaxable(t),
      vendor_contact_id: vendorId ?? null, rule_params: {}, unit_cost: null, markup_pct: null });
  };

  return (
    <section aria-label={vendorId ? "Price list" : "Cost cards"} className="px-3 py-2.5" style={{ borderBottom: vendorId ? undefined : `1px solid ${T.hairSoft}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>{vendorId ? "Price list" : "Cost cards"}</div>
          <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4 }}>
            {vendorId
              ? `What you buy from ${vendorName ?? "them"}, and when each price was last confirmed.`
              : "What you buy and charge for, each with its vendor. A job's budget is built from these."}
          </div>
        </div>
        {!vendorId && (
          <button onClick={() => setAddingGroup(true)} className="rounded px-2.5"
            style={{ height: 30, border: `1px solid ${T.hair}`, background: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>+ Group</button>
        )}
        <button onClick={() => newCard()} className="rounded px-2.5"
          style={{ height: 30, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>+ Card</button>
      </div>

      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{err}</div>}
      {items === null && <div className="rounded animate-pulse mt-2" style={{ height: 48, background: T.hairSoft }} />}
      {items !== null && items.length === 0 && (
        <div className="mt-2" style={{ fontSize: F.sm, color: T.ink3 }}>
          {vendorId ? "No cards from this vendor yet." : "None yet. Start with a group — Ready mix, Steel, Forming, Labor, Equipment — then add what's in it."}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-2">
        {sections.map((s) => {
          const shut = open[s.key] === false;
          return (
            <div key={s.key} className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
              <button onClick={() => setOpen((o) => ({ ...o, [s.key]: shut }))} className="w-full flex items-center gap-2 px-2.5 text-left" style={{ height: 40, cursor: "pointer" }}
                aria-expanded={!shut}>
                <span style={{ fontFamily: disp, fontSize: F.xs, color: T.ink3, width: 10 }}>{shut ? "+" : "−"}</span>
                <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase", ...clip }}>{s.title}</span>
                <span style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{s.sub}</span>
                <span className="flex-1" />
                <span style={{ ...eyebrow, color: T.ink3 }}>{s.cards.length}</span>
              </button>
              {!shut && (
                <div style={{ borderTop: `1px solid ${T.hair}` }}>
                  {s.cards.map((c, i) => {
                    const gaps = cardGaps(c);
                    return (
                      <button key={c.id} onClick={() => setEditing(c)} className="w-full text-left flex items-start gap-2 px-2.5 py-2"
                        style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", cursor: "pointer" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, ...clip }}>{c.name}</div>
                          <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
                            {[vendorLabel(c.vendor_contact_id), QTY_RULE_LABEL[c.qty_rule], c.price_as_of ? `price ${dateLabel(c.price_as_of)}${c.price_source ? ` (${c.price_source})` : ""}` : null]
                              .filter(Boolean).join(" · ")}
                          </div>
                          {gaps.length > 0 && <div style={{ fontSize: F.xs, color: T.hiviz }}>needs {gaps.join(", ")}</div>}
                        </div>
                        <div className="text-right shrink-0" style={{ ...nums }}>
                          <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: c.unit_cost === null ? T.ink3 : T.ink }}>
                            {c.unit_cost === null ? "—" : money(c.unit_cost)}
                          </div>
                          <div style={{ fontSize: 9.5, color: T.ink3 }}>per {c.unit}{c.taxable ? " · taxed" : ""}</div>
                        </div>
                      </button>
                    );
                  })}
                  {!vendorId && s.key !== "none" && (
                    <button onClick={() => newCard(s.key)} className="w-full text-left px-2.5 py-1.5" style={{ ...eyebrow, color: T.chalk, borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                      + Card in {s.title}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CardSheet card={editing} groups={groups} vendors={vendors} lockVendor={vendorId ? { id: vendorId, name: vendorName ?? null } : null}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setTick((n) => n + 1); }} />
      <GroupSheet open={addingGroup} onClose={() => setAddingGroup(false)} onSaved={() => { setAddingGroup(false); setTick((n) => n + 1); }} />
    </section>
  );
}

export function GroupSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CostType>("material");
  const [markup, setMarkup] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    try { await call("/api/cost-groups", "POST", { name, cost_type: type, default_markup_pct: markup === "" ? null : markup }); setName(""); setMarkup(""); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const field: React.CSSProperties = { height: 36, border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.sm, borderRadius: 4, padding: "0 8px", width: "100%" };
  return (
    <Sheet open={open} onClose={onClose} title="New group" sub="How cards are organised on the budget and the proposal">
      <div className="px-4 py-3 flex flex-col gap-3">
        <label className="block"><span style={eyebrow}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ready mix — Angelle Materials" style={field} /></label>
        <label className="block"><span style={eyebrow}>Cost type</span>
          <select value={type} onChange={(e) => setType(e.target.value as CostType)} style={field}>
            {COST_TYPES.map((t) => <option key={t} value={t}>{COST_TYPE_LABEL[t]}</option>)}
          </select></label>
        <label className="block" style={{ maxWidth: 200 }}><span style={eyebrow}>Markup (optional)</span>
          <input type="number" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="blank = the type's markup" style={field} /></label>
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <button onClick={() => void save()} disabled={!name.trim()} className="rounded" style={{ height: 40, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", opacity: name.trim() ? 1 : 0.5 }}>Add group</button>
      </div>
    </Sheet>
  );
}

export function CardSheet({ card, groups, vendors, lockVendor, onClose, onSaved }: {
  card: Partial<Card> | null; groups: Group[]; vendors: Vendor[]; lockVendor: { id: string; name: string | null } | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Card>>({});
  const [params, setParams] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState<Partial<Card> | null>(null);
  if (card !== seed) {
    setSeed(card);
    setF(card ?? {});
    setParams(Object.fromEntries(Object.entries(card?.rule_params ?? {}).map(([k, v]) => [k, String(v)])));
    setErr(null);
  }
  if (!card) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = (p: Partial<Card>) => setF((x) => ({ ...x, ...p }));
  const rule = (f.qty_rule ?? "manual") as QtyRule;
  const field: React.CSSProperties = { height: 36, border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.sm, borderRadius: 4, padding: "0 8px", width: "100%", minWidth: 0 };
  const numField = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

  const save = async () => {
    setBusy(true); setErr(null);
    const body = {
      name: f.name ?? "", description: f.description ?? null, cost_type: f.cost_type, unit: f.unit ?? "",
      unit_cost: f.unit_cost ?? null, taxable: !!f.taxable, markup_pct: f.markup_pct ?? null,
      cost_group_id: f.cost_group_id ?? null, vendor_contact_id: lockVendor ? lockVendor.id : f.vendor_contact_id ?? null,
      vendor_sku: f.vendor_sku ?? null, price_as_of: f.price_as_of ?? null, price_source: f.price_source ?? null,
      qty_rule: rule, rule_params: params,
    };
    try {
      if (card.id) await call(`/api/cost-items/${card.id}`, "PATCH", body);
      else await call("/api/cost-items", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const retire = async () => {
    if (!card.id || !window.confirm(`Take ${card.name} out of the catalog? Budgets that used it keep it.`)) return;
    setBusy(true);
    try { await call(`/api/cost-items/${card.id}`, "DELETE"); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const unretire = async () => {
    if (!card.id) return;
    setBusy(true);
    try { await call(`/api/cost-items/${card.id}`, "PATCH", { active: true }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={card.id ? card.name ?? "Card" : "New cost card"} sub={lockVendor ? `From ${lockVendor.name ?? "this vendor"}` : "Something you buy or charge for"}>
      <div className="px-4 py-3 flex flex-col gap-3">
        <label className="block"><span style={eyebrow}>Name</span>
          <input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="3000 psi ready mix" style={field} /></label>
        <label className="block"><span style={eyebrow}>Group</span>
          <select value={f.cost_group_id ?? ""} style={field}
            onChange={(e) => { const g = groups.find((x) => x.id === e.target.value); set({ cost_group_id: e.target.value || null, ...(g && !card.id ? { cost_type: g.cost_type, taxable: defaultTaxable(g.cost_type) } : {}) }); }}>
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label>
        <label className="block"><span style={eyebrow}>Cost type</span>
          <select value={f.cost_type ?? "material"} style={field}
            onChange={(e) => { const v = e.target.value as CostType; set({ cost_type: v, ...(!card.id ? { taxable: defaultTaxable(v) } : {}) }); }}>
            {COST_TYPES.map((t) => <option key={t} value={t}>{COST_TYPE_LABEL[t]}</option>)}
          </select></label>
        <label className="block"><span style={eyebrow}>How it&apos;s counted on a job</span>
          <select value={rule} style={field} onChange={(e) => { const r = e.target.value as QtyRule; set({ qty_rule: r, unit: f.unit || RULE_UNIT[r] }); setParams({}); }}>
            {QTY_RULES.map((r) => <option key={r} value={r}>{QTY_RULE_LABEL[r]}</option>)}
          </select></label>
        {(RULE_FIELDS[rule] ?? []).length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {(RULE_FIELDS[rule] ?? []).map((x) => (
              <label key={x.k} className="block"><span style={eyebrow}>{x.label}</span>
                <div className="flex items-center rounded" style={{ ...field, padding: 0 }}>
                  <input type="number" inputMode="decimal" value={params[x.k] ?? ""} onChange={(e) => setParams((p) => ({ ...p, [x.k]: e.target.value }))}
                    className="w-full bg-transparent outline-none px-2" style={{ fontSize: F.sm, minWidth: 0 }} aria-label={x.label} />
                  <span className="pr-2 shrink-0" style={{ fontSize: 9.5, color: T.ink3 }}>{x.unit}</span>
                </div>
                <span style={{ fontSize: 9.5, color: T.ink3 }}>{x.hint}</span></label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span style={eyebrow}>Unit cost</span>
            <input type="number" inputMode="decimal" value={numField(f.unit_cost)} placeholder="not recorded"
              onChange={(e) => set({ unit_cost: e.target.value === "" ? null : Number(e.target.value) })}
              style={{ ...field, borderColor: f.unit_cost === null || f.unit_cost === undefined ? T.hiviz : T.hair }} /></label>
          <label className="block"><span style={eyebrow}>Per</span>
            <input value={f.unit ?? ""} onChange={(e) => set({ unit: e.target.value })} placeholder={RULE_UNIT[rule]} style={field} /></label>
          <label className="block"><span style={eyebrow}>Markup %</span>
            <input type="number" inputMode="decimal" value={numField(f.markup_pct)} placeholder="group / type default"
              onChange={(e) => set({ markup_pct: e.target.value === "" ? null : Number(e.target.value) })} style={field} /></label>
          <label className="flex items-center gap-2 mt-4" style={{ fontSize: F.sm }}>
            <input type="checkbox" checked={!!f.taxable} onChange={(e) => set({ taxable: e.target.checked })} style={{ width: 18, height: 18, accentColor: T.chalk }} />
            Sales tax applies</label>
        </div>
        {!lockVendor && (
          <label className="block"><span style={eyebrow}>Vendor</span>
            <select value={f.vendor_contact_id ?? ""} onChange={(e) => set({ vendor_contact_id: e.target.value || null })} style={field}>
              <option value="">None — my own</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name || formatPhone(v.phone)}{v.contact_subtype ? ` (${v.contact_subtype.replace(/_/g, " ")})` : ""}</option>)}
            </select>
            {vendors.length === 0 && <span style={{ fontSize: 9.5, color: T.ink3 }}>File someone as a vendor on Threads to pick them here.</span>}</label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span style={eyebrow}>Price as of</span>
            <input type="date" value={f.price_as_of ?? ""} onChange={(e) => set({ price_as_of: e.target.value || null })} style={field} /></label>
          <label className="block"><span style={eyebrow}>From</span>
            <select value={f.price_source ?? ""} onChange={(e) => set({ price_source: e.target.value || null })} style={field}>
              <option value="">—</option><option value="quote">Their quote</option><option value="receipt">A receipt</option>
              <option value="invoice">An invoice</option><option value="typed">I typed it</option><option value="import">An import</option>
            </select></label>
        </div>
        <label className="block"><span style={eyebrow}>Their item # (optional)</span>
          <input value={f.vendor_sku ?? ""} onChange={(e) => set({ vendor_sku: e.target.value })} style={field} /></label>
        <label className="block"><span style={eyebrow}>Description (shows on the proposal)</span>
          <textarea value={f.description ?? ""} onChange={(e) => set({ description: e.target.value })} rows={2} maxLength={500}
            placeholder="5' × 150' roll" style={{ ...field, height: "auto", padding: "6px 8px", resize: "none" }} /></label>
        {cardGaps({ unit_cost: f.unit_cost ?? null, qty_rule: rule, rule_params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) }).length > 0 && (
          <div style={{ fontSize: F.xs, color: T.hiviz }}>
            Still needs {cardGaps({ unit_cost: f.unit_cost ?? null, qty_rule: rule, rule_params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) }).join(", ")} — it can be saved, but a price that uses it will say so.
          </div>
        )}
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <button onClick={() => void save()} disabled={busy || !(f.name ?? "").trim()} className="rounded"
          style={{ height: 42, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".06em", opacity: busy || !(f.name ?? "").trim() ? 0.5 : 1 }}>
          {card.id ? "Save card" : "Add card"}
        </button>
        {card.id && card.active !== false && <button onClick={() => void retire()} disabled={busy} className="self-start" style={{ ...eyebrow, color: T.red, cursor: "pointer" }}>Take out of the catalog</button>}
        {card.id && card.active === false && (
          <button onClick={() => void unretire()} disabled={busy} className="self-start" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Put back in the catalog</button>
        )}
        {card.id && <PriceHistory cardId={card.id} unit={card.unit ?? ""} key={`${card.id}${card.updated_at ?? ""}`} />}
      </div>
    </Sheet>
  );
}

const SOURCE_WORD: Record<string, string> = { quote: "their quote", receipt: "a receipt", invoice: "an invoice", typed: "typed", import: "import" };

/**
 * Every price this card has had (migration 049), newest first, with the move
 * from the one before. Written by the database whenever the price changes.
 */
function PriceHistory({ cardId, unit }: { cardId: string; unit: string }) {
  const [rows, setRows] = useState<Array<{ id: string; unit_cost: number | null; price_as_of: string | null; price_source: string | null;
    recorded_at: string; import_name: string | null; file_name: string | null }> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    call(`/api/cost-items/${cardId}/history`, "GET")
      .then((b) => { if (!off) setRows(b.history); })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [cardId]);
  return (
    <div className="mt-1" style={{ borderTop: `1px solid ${T.hairSoft}`, paddingTop: 8 }}>
      <div style={{ ...eyebrow, color: T.ink }}>Price history</div>
      {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
      {rows === null && !err && <div className="rounded animate-pulse mt-1" style={{ height: 28, background: T.hairSoft }} />}
      {rows !== null && rows.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3 }}>No price recorded yet.</div>}
      {rows !== null && rows.map((r, i) => {
        const prev = rows[i + 1]?.unit_cost ?? null;
        const d = r.unit_cost !== null && prev !== null && prev > 0 ? (r.unit_cost - prev) / prev : null;
        const when = dateLabel(r.price_as_of) ?? new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return (
          <div key={r.id} className="flex items-baseline gap-2 py-1" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", fontSize: F.xs, ...nums }}>
            <span style={{ width: 86, color: T.ink2 }}>{when}</span>
            <span style={{ fontWeight: 600, color: T.ink, minWidth: 70 }}>{r.unit_cost === null ? "cleared" : `${money(r.unit_cost)}/${unit}`}</span>
            {d !== null && Math.abs(d) >= 0.0005 && <span style={{ color: d > 0 ? T.red : T.green }}>{d > 0 ? "▲" : "▼"} {(Math.abs(d) * 100).toFixed(1)}%</span>}
            <span className="flex-1" style={{ color: T.ink3, ...clip }}>
              {[r.price_source ? SOURCE_WORD[r.price_source] ?? r.price_source : null, r.import_name, r.file_name].filter(Boolean).join(" · ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
