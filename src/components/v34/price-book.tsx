"use client";

/**
 * The Price book (migration 049) — Coy's cost catalog on a page of its own.
 * Coy, 2026-09-29: a dedicated page, "Price book", with a spreadsheet on a
 * desktop, a view by vendor, price history, and imports from JobTread / other
 * CRMs and from vendor quotes.
 *
 * Cards are the ones from migration 047 (DECISIONS §3): each with its vendor,
 * group, type, unit, cost, markup, taxed, how it is counted on a job, and when
 * and how the price was confirmed. A job's budget copies a card onto its line,
 * so nothing here reprices a job — the line offers "card price changed".
 *
 * Wide (measured ≥ 900px): a spreadsheet, group ▸ card or vendor ▸ card, cost /
 * markup / taxed edited in the cell. Narrow: cards. Everything else in the
 * card sheet (cost-cards.tsx), which also shows the card's price history.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip, money, formatPhone } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { Cell } from "@/components/v34/cell";
import { COST_TYPE_LABEL, QTY_RULE_LABEL, cardGaps, defaultTaxable, type CostType } from "@/lib/cost-cards";
import { CardSheet, GroupSheet, call, numify, dateLabel, type Card, type Group, type Vendor } from "@/components/v34/cost-cards";
import { PriceImport } from "@/components/v34/price-import";

type View = "group" | "vendor";
interface Imp {
  id: string; kind: string; file_name: string | null; source: string | null; created_count: number; updated_count: number;
  unchanged_count: number; skipped_count: number; created_at: string; undone_at: string | null;
}
const STALE_DAYS = 90;
const VIEW_KEY = "sc:pricebook-view";
const SOURCE_SHORT: Record<string, string> = { quote: "quote", receipt: "receipt", invoice: "invoice", typed: "typed", import: "import" };

export function PriceBook() {
  const [items, setItems] = useState<Card[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [imports, setImports] = useState<Imp[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [view, setViewState] = useState<View>("group");
  const [q, setQ] = useState("");
  const [retired, setRetired] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Partial<Card> | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [measure, wide] = useWide<HTMLDivElement>(900);
  // "Now" as of the last load — for "old price" and recent imports — so render stays pure.
  const [now, setNow] = useState(0);
  const reload = () => setTick((n) => n + 1);

  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  useEffect(() => {
    let off = false;
    Promise.all([call("/api/cost-items?all=1", "GET"), call("/api/price-book/import", "GET").catch(() => ({ imports: [] }))])
      .then(([b, i]) => {
        if (off) return;
        setNow(Date.now());
        if (tick === 0) {
          try { const v = localStorage.getItem(VIEW_KEY); if (v === "vendor" || v === "group") setViewState(v); } catch { /* private mode */ }
        }
        setItems((b.items as Array<Record<string, unknown>>).map(numify)); setGroups(b.groups); setVendors(b.vendors); setImports(i.imports ?? []);
        setErr(null);
      })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);

  const vendorLabel = (id: string | null) => {
    if (!id) return null;
    const v = vendors.find((x) => x.id === id);
    return v ? v.name || formatPhone(v.phone) : "a vendor";
  };
  const groupLabel = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((c) => (retired || c.active) && (!s ||
      [c.name, c.description, c.vendor_sku, vendorLabel(c.vendor_contact_id), groupLabel(c.cost_group_id)].some((x) => (x ?? "").toLowerCase().includes(s))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, retired, vendors, groups]);

  const sections = useMemo(() => {
    const out: Array<{ key: string; title: string; sub: string; href?: string; groupId?: string; cards: Card[] }> = [];
    if (view === "group") {
      for (const g of groups) {
        const cards = visible.filter((c) => c.cost_group_id === g.id);
        if (cards.length || !q.trim()) out.push({ key: g.id, groupId: g.id, title: g.name, cards,
          sub: `${g.cost_type ? COST_TYPE_LABEL[g.cost_type] : ""}${g.default_markup_pct !== null ? ` · ${Number(g.default_markup_pct)}% markup` : ""}` });
      }
      const loose = visible.filter((c) => !c.cost_group_id || !groups.some((g) => g.id === c.cost_group_id));
      if (loose.length) out.push({ key: "none", title: "Not in a group", sub: "", cards: loose });
    } else {
      const ids = [...new Set(visible.map((c) => c.vendor_contact_id).filter((v): v is string => !!v))];
      ids.sort((a, b) => (vendorLabel(a) ?? "").localeCompare(vendorLabel(b) ?? ""));
      for (const id of ids) {
        const cards = visible.filter((c) => c.vendor_contact_id === id);
        const newest = cards.map((c) => c.price_as_of).filter((d): d is string => !!d).sort().at(-1) ?? null;
        out.push({ key: id, title: vendorLabel(id) ?? "Vendor", href: `/dashboard/messages/${id}`, cards,
          sub: `${cards.length} card${cards.length === 1 ? "" : "s"}${newest ? ` · newest price ${dateLabel(newest)}` : " · no price dates"}` });
      }
      const none = visible.filter((c) => !c.vendor_contact_id);
      if (none.length) out.push({ key: "none", title: "No vendor", sub: "your own, or not tied to a supplier yet", cards: none });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, groups, view, q, vendors]);

  const patch = async (c: Card, body: Record<string, unknown>) => {
    setErr(null);
    setItems((xs) => (xs ?? []).map((x) => (x.id === c.id ? { ...x, ...body } as Card : x)));
    try { await call(`/api/cost-items/${c.id}`, "PATCH", body); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { reload(); }
  };
  const newCard = (groupId?: string) => {
    const g = groups.find((x) => x.id === groupId);
    const t: CostType = g?.cost_type ?? "material";
    setEditing({ cost_group_id: groupId ?? null, cost_type: t, qty_rule: "manual", unit: "", taxable: defaultTaxable(t),
      vendor_contact_id: null, rule_params: {}, unit_cost: null, markup_pct: null });
  };
  const undo = async (i: Imp) => {
    if (!window.confirm(`Undo the import of ${i.file_name ?? "that file"}? Cards it added are taken out of the catalog; prices it changed go back, unless you've changed them since.`)) return;
    try {
      const b = await call(`/api/price-book/import/${i.id}/undo`, "POST");
      setNote(`Undone: ${b.retired} card${b.retired === 1 ? "" : "s"} taken out, ${b.restored} price${b.restored === 1 ? "" : "s"} put back${b.kept ? `, ${b.kept} kept because you changed them since` : ""}.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { reload(); }
  };

  const stale = (d: string | null) => !!d && now > 0 && now - new Date(`${d}T12:00:00`).getTime() > STALE_DAYS * 864e5;
  const active = (items ?? []).filter((c) => c.active);
  const recentImports = imports.filter((i) => now - new Date(i.created_at).getTime() < 30 * 864e5);
  const btn = (primary: boolean): React.CSSProperties => ({ height: 32, padding: "0 10px", borderRadius: 4, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase",
    letterSpacing: ".06em", background: primary ? T.ink : T.card, color: primary ? "#fff" : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer", whiteSpace: "nowrap" });

  return (
    <div ref={measure} className="px-3 py-3 lg:px-5">
      {/* ---- title + actions ---- */}
      <div className="flex items-end gap-2 flex-wrap">
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...eyebrow }}>Costs</div>
          <h1 style={{ fontFamily: disp, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>Price book</h1>
          <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>
            What you buy and charge for, each with its vendor. A job&apos;s budget copies a card when you add it, so changing a price here never changes a quote you&apos;ve sent.
          </div>
        </div>
        <button onClick={() => setAddingGroup(true)} style={btn(false)}>+ Group</button>
        <button onClick={() => newCard()} style={btn(false)}>+ Card</button>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} style={btn(true)}>Import ▾</button>
          {menu && (
            <div className="absolute right-0 z-20 mt-1 rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 8px 24px rgba(10,14,18,.14)", width: 250 }}>
              <button onClick={() => { setMenu(false); setImporting(true); }} className="w-full text-left px-3 py-2" style={{ fontSize: F.sm, cursor: "pointer" }}>
                A spreadsheet<span style={{ display: "block", fontSize: 10, color: T.ink3 }}>CSV or Excel from JobTread, another CRM, or your own</span>
              </button>
              <div className="w-full text-left px-3 py-2" style={{ fontSize: F.sm, color: T.ink3, borderTop: `1px solid ${T.hairSoft}` }}>
                A vendor&apos;s quote<span style={{ display: "block", fontSize: 10 }}>Dusty reads it — coming next</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- find, view ---- */}
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find: 3000, rebar, Angelle, item #…" aria-label="Find a card"
          className="rounded px-2 outline-none" style={{ height: 32, border: `1px solid ${T.hair}`, background: "#fff", fontSize: F.sm, flex: 1, minWidth: 180, maxWidth: 360 }} />
        <div className="flex rounded overflow-hidden" role="tablist" aria-label="View" style={{ border: `1px solid ${T.hair}` }}>
          {(["group", "vendor"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className="px-2.5"
              style={{ height: 30, background: view === v ? T.ink : T.card, color: view === v ? "#fff" : T.ink2, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>
              By {v}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5" style={{ fontSize: F.xs, color: T.ink2 }}>
          <input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} style={{ width: 15, height: 15, accentColor: T.chalk }} />
          Show retired
        </label>
        <span style={{ fontSize: F.xs, color: T.ink3 }}>{active.length} card{active.length === 1 ? "" : "s"} · {active.filter((c) => c.unit_cost === null).length} without a cost</span>
      </div>

      {note && <div className="mt-2 rounded px-3 py-2 flex items-center gap-2" style={{ fontSize: F.sm, background: T.greenDim, color: T.ink }}>
        <span className="flex-1">{note}</span><button onClick={() => setNote(null)} aria-label="Dismiss" style={{ color: T.ink3, cursor: "pointer" }}>×</button></div>}
      {err && <div className="mt-2" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}

      {recentImports.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {recentImports.slice(0, 3).map((i) => (
            <div key={i.id} className="flex items-center gap-2 flex-wrap" style={{ fontSize: F.xs, color: T.ink2 }}>
              <span style={{ ...eyebrow, color: T.ink3 }}>Import</span>
              <span style={{ ...clip, maxWidth: 240 }}>{i.file_name ?? i.kind}</span>
              <span style={{ color: T.ink3 }}>{new Date(i.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {i.created_count} new · {i.updated_count} changed</span>
              {i.undone_at ? <span style={{ color: T.ink3 }}>undone</span>
                : <button onClick={() => void undo(i)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Undo</button>}
            </div>
          ))}
        </div>
      )}

      {items === null && !err && <div className="rounded animate-pulse mt-3" style={{ height: 120, background: T.hairSoft }} />}
      {items !== null && items.length === 0 && (
        <div className="mt-4 rounded p-4" style={{ background: T.card, border: `1px solid ${T.hair}`, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
          Nothing in the Price book yet. Import your catalog from JobTread or a spreadsheet, or start with a group — Ready mix, Steel, Forming, Labor, Equipment — and add what&apos;s in it.
        </div>
      )}
      {items !== null && items.length > 0 && sections.length === 0 && (
        <div className="mt-3" style={{ fontSize: F.sm, color: T.ink3 }}>No card matches &ldquo;{q}&rdquo;.</div>
      )}

      {/* ---- the book ---- */}
      {wide ? (
        <div className="mt-3 rounded overflow-x-auto" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <table className="w-full" style={{ borderCollapse: "collapse", fontSize: F.sm, ...nums }}>
            <thead>
              <tr style={{ background: T.slab }}>
                {["Item", view === "group" ? "Vendor" : "Group", "Item #", "Type", "Unit", "Unit cost", "Markup", "Taxed", "Counted on a job", "Price date", "From"].map((h, i) => (
                  <th key={h} style={{ ...eyebrow, textAlign: h === "Unit cost" || h === "Markup" ? "right" : h === "Taxed" ? "center" : "left", padding: "6px 8px", whiteSpace: "nowrap", borderBottom: `1px solid ${T.hair}`, width: i === 0 ? "26%" : undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const shut = open[s.key] === false;
                return (
                  <React.Fragment key={s.key}>
                    <tr style={{ background: T.ink, color: "#fff" }}>
                      <td colSpan={11} style={{ padding: "5px 8px" }}>
                        <span className="flex items-center gap-2">
                          <button onClick={() => setOpen((o) => ({ ...o, [s.key]: shut }))} aria-expanded={!shut} style={{ color: "#fff", cursor: "pointer", fontFamily: disp, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
                            {shut ? "+" : "−"} {s.title}
                          </button>
                          <span style={{ fontSize: F.xs, color: "#AEB8C2" }}>{s.sub}</span>
                          {s.href && <Link href={s.href} style={{ fontSize: F.xs, color: "#AEB8C2" }}>their page →</Link>}
                          <span className="flex-1" />
                          {s.groupId && <button onClick={() => newCard(s.groupId)} style={{ ...eyebrow, color: "#fff", cursor: "pointer" }}>+ Card</button>}
                        </span>
                      </td>
                    </tr>
                    {!shut && s.cards.length === 0 && (
                      <tr><td colSpan={11} style={{ padding: "6px 24px", fontSize: F.xs, color: T.ink3 }}>No cards in this group yet.</td></tr>
                    )}
                    {!shut && s.cards.map((c) => {
                      const gaps = cardGaps(c);
                      const old = stale(c.price_as_of);
                      return (
                        <tr key={c.id} style={{ borderTop: `1px solid ${T.hairSoft}`, opacity: c.active ? 1 : 0.5 }}>
                          <td style={{ padding: "4px 8px 4px 16px", maxWidth: 320 }}>
                            <button onClick={() => setEditing(c)} className="text-left" style={{ cursor: "pointer", fontWeight: 500, color: T.ink, ...clip, display: "block", maxWidth: 300 }}>{c.name}</button>
                            {(gaps.length > 0 || !c.active) && (
                              <div style={{ fontSize: 9.5, color: c.active ? T.hiviz : T.ink3 }}>{c.active ? `needs ${gaps.join(", ")}` : "retired"}</div>
                            )}
                          </td>
                          <td style={{ padding: "4px 8px", color: T.ink2, maxWidth: 170, ...clip }}>
                            {view === "group" ? vendorLabel(c.vendor_contact_id) ?? "—" : groupLabel(c.cost_group_id) ?? "—"}
                          </td>
                          <td style={{ padding: "4px 8px", color: T.ink3, maxWidth: 100, ...clip }}>{c.vendor_sku ?? ""}</td>
                          <td style={{ padding: "4px 8px", color: T.ink2 }}>{COST_TYPE_LABEL[c.cost_type]}</td>
                          <td style={{ padding: "4px 8px" }}>{c.unit}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>
                            <Cell value={c.unit_cost} money label={`Unit cost of ${c.name}`} warn={c.unit_cost === null}
                              onSave={(v) => void patch(c, { unit_cost: v, price_as_of: v === null ? null : new Date().toISOString().slice(0, 10), price_source: v === null ? null : "typed" })} />
                          </td>
                          <td style={{ padding: "2px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <Cell value={c.markup_pct} label={`Markup on ${c.name}`} suffix="%" placeholder="default" onSave={(v) => void patch(c, { markup_pct: v })} />
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "center" }}>
                            <input type="checkbox" checked={c.taxable} aria-label={`Tax on ${c.name}`} onChange={(e) => void patch(c, { taxable: e.target.checked })}
                              style={{ width: 16, height: 16, accentColor: T.chalk }} />
                          </td>
                          <td style={{ padding: "4px 8px", color: T.ink2, fontSize: F.xs, whiteSpace: "nowrap" }}>{QTY_RULE_LABEL[c.qty_rule]}</td>
                          <td style={{ padding: "4px 8px", whiteSpace: "nowrap", color: old ? T.ink3 : T.ink2 }} title={old ? `Over ${STALE_DAYS} days old` : undefined}>
                            {dateLabel(c.price_as_of) ?? "—"}{old && <span style={{ fontSize: 9.5, color: T.hiviz }}> old</span>}
                          </td>
                          <td style={{ padding: "4px 8px", color: T.ink3, fontSize: F.xs }}>{c.price_source ? SOURCE_SHORT[c.price_source] ?? c.price_source : ""}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {sections.map((s) => {
            const shut = open[s.key] === false;
            return (
              <div key={s.key} className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
                <button onClick={() => setOpen((o) => ({ ...o, [s.key]: shut }))} aria-expanded={!shut} className="w-full flex items-center gap-2 px-2.5 text-left" style={{ height: 42, cursor: "pointer" }}>
                  <span style={{ fontFamily: disp, fontSize: F.xs, color: T.ink3, width: 10 }}>{shut ? "+" : "−"}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase", ...clip }}>{s.title}</span>
                    <span style={{ display: "block", fontSize: 10, color: T.ink3, ...clip }}>{s.sub}</span>
                  </span>
                  <span style={{ ...eyebrow, color: T.ink3 }}>{s.cards.length}</span>
                </button>
                {!shut && (
                  <div style={{ borderTop: `1px solid ${T.hair}` }}>
                    {s.cards.map((c, i) => {
                      const gaps = cardGaps(c);
                      const other = view === "group" ? vendorLabel(c.vendor_contact_id) : groupLabel(c.cost_group_id);
                      return (
                        <button key={c.id} onClick={() => setEditing(c)} className="w-full text-left flex items-start gap-2 px-2.5 py-2"
                          style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", cursor: "pointer", opacity: c.active ? 1 : 0.5 }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: F.sm, fontWeight: 600, color: T.ink, ...clip }}>{c.name}</span>
                            <span style={{ display: "block", fontSize: F.xs, color: T.ink3, ...clip }}>
                              {[other, c.vendor_sku ? `#${c.vendor_sku}` : null, c.price_as_of ? `price ${dateLabel(c.price_as_of)}${stale(c.price_as_of) ? " (old)" : ""}` : null].filter(Boolean).join(" · ")}
                            </span>
                            {c.active && gaps.length > 0 && <span style={{ display: "block", fontSize: F.xs, color: T.hiviz }}>needs {gaps.join(", ")}</span>}
                            {!c.active && <span style={{ display: "block", fontSize: F.xs, color: T.ink3 }}>retired</span>}
                          </span>
                          <span className="text-right shrink-0" style={{ ...nums }}>
                            <span style={{ display: "block", fontFamily: disp, fontSize: F.md, fontWeight: 600, color: c.unit_cost === null ? T.ink3 : T.ink }}>{c.unit_cost === null ? "—" : money(c.unit_cost)}</span>
                            <span style={{ display: "block", fontSize: 9.5, color: T.ink3 }}>per {c.unit}{c.taxable ? " · taxed" : ""}</span>
                          </span>
                        </button>
                      );
                    })}
                    {s.groupId && (
                      <button onClick={() => newCard(s.groupId)} className="w-full text-left px-2.5 py-1.5" style={{ ...eyebrow, color: T.chalk, borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                        + Card in {s.title}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CardSheet card={editing} groups={groups} vendors={vendors} lockVendor={null}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      <GroupSheet open={addingGroup} onClose={() => setAddingGroup(false)} onSaved={() => { setAddingGroup(false); reload(); }} />
      <PriceImport open={importing} onClose={() => setImporting(false)} cards={items ?? []} vendors={vendors}
        onDone={(m) => { setImporting(false); setNote(m); reload(); }} />
    </div>
  );
}
