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

import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { refreshQuestion } from "@/lib/dusty/price-refresh";
import { T, F, disp, eyebrow, nums, clip, money, formatPhone } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { isHorizontal } from "@/lib/swipe";
import { Cell } from "@/components/v34/cell";
import { PageHeader, SearchBubble, SearchToggle } from "@/components/v34/primitives";
import { COST_TYPE_LABEL, QTY_RULE_LABEL, cardGaps, defaultTaxable, type CostType } from "@/lib/cost-cards";
import { CardSheet, GroupSheet, call, numify, dateLabel, type Card, type Group, type Vendor } from "@/components/v34/cost-cards";
import { Assemblies } from "@/components/v34/assemblies";
import { usePref } from "@/lib/v34/prefs";

type View = "group" | "vendor";
const STALE_DAYS = 90;
const VIEW_KEY = "sc:pricebook-view";
/** One vendor's price on an item (migration 051), as the "By vendor" view needs it. */
interface Src { id: string; cost_item_id: string; vendor_contact_id: string; unit_cost: number | null; vendor_sku: string | null; price_as_of: string | null; price_source: string | null }
const SOURCE_SHORT: Record<string, string> = { quote: "quote", receipt: "receipt", invoice: "invoice", typed: "typed", import: "import" };

/** The spreadsheet's columns (Coy, 2026-09-30: drag the dividers, and a Columns
 * button to show or hide them). Widths and hidden columns are saved to his
 * account (usePref "pricebook_cols", migration 053). Item always shows. */
const COLS: Array<{ k: string; label: string; w: number; align?: "right" | "center" }> = [
  { k: "item", label: "Item", w: 300 }, { k: "other", label: "Vendor", w: 170 }, { k: "sku", label: "Item #", w: 100 },
  { k: "type", label: "Type", w: 100 }, { k: "unit", label: "Unit", w: 70 }, { k: "cost", label: "Unit cost", w: 110, align: "right" },
  { k: "taxed", label: "Taxed", w: 64, align: "center" },
  { k: "rule", label: "Counted on a job", w: 150 }, { k: "date", label: "Price date", w: 110 }, { k: "from", label: "From", w: 80 },
];
interface ColPrefs { w: Record<string, number>; hidden: string[] }
const MIN_W = 48;

const ROW_CHUNK = 60;

/**
 * The Price book opened from a job's budget (Coy, 2026-10-02: "toggle back and
 * forth … to the cost book and pull items from there"). The same page — find,
 * by group / by vendor, columns — with + on every card, Add all on every group
 * and Load on every assembly. Adding is the caller's: it puts the card on the
 * area picked in `top`.
 */
export interface PricePick {
  title: string; sub?: string;
  /** Above the book: where the cards go (the area, the option). */
  top?: React.ReactNode;
  onCard: (c: Card) => Promise<void>;
  onGroup: (groupId: string, name: string) => Promise<void>;
  onAssembly?: (assemblyId: string, name: string) => Promise<void>;
}

export function PriceBook({ pick }: { pick?: PricePick } = {}) {
  const [items, setItems] = useState<Card[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [view, setViewState] = useState<View>("group");
  const [tab, setTab] = useState<"cards" | "assemblies">("cards");
  const [finding, setFinding] = useState(false);
  const [q, setQ] = useState("");
  // "Show retired" is gone (Coy, 2026-10-10); retired cards stay out of the list.
  const retired = false;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Partial<Card> | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [sources, setSources] = useState<Src[]>([]);
  const [measure, wide] = useWide<HTMLDivElement>(900);
  const [colPrefs, setColPrefs] = usePref<ColPrefs>("pricebook_cols", { w: {}, hidden: [] });
  const [liveW, setLiveW] = useState<Record<string, number> | null>(null);
  const [colMenu, setColMenu] = useState(false);
  // "Now" as of the last load — for "old price" and recent imports — so render stays pure.
  const [now, setNow] = useState(0);
  const reload = () => setTick((n) => n + 1);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // What was added while the book is open: the + turns into a green ✓ (with a count when added twice),
  // and a toast at the bottom says what went on (Coy, 2026-10-02: "something that signifies that it was added").
  const [added, setAdded] = useState<Record<string, number>>({});
  const took = async (key: string, what: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null);
    try {
      await fn();
      setAdded((m) => ({ ...m, [key]: (m[key] ?? 0) + 1 }));
      setFlash(`Added ${what} to the budget`); setTimeout(() => setFlash((f) => (f === `Added ${what} to the budget` ? null : f)), 2600);
    }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const plus = (c: Card) => {
    if (!pick || !c.active) return null;
    const n = added[c.id] ?? 0;
    return (
      <button onClick={(e) => { e.stopPropagation(); void took(c.id, c.name, () => pick.onCard(c)); }} disabled={busy === c.id}
        aria-label={n ? `Added ${c.name} — add it again` : `Add ${c.name} to the budget`} title={n ? "Added — tap to add again" : "Add to the budget"} className="rounded shrink-0"
        style={{ minWidth: 30, height: 28, padding: "0 4px", background: n ? T.green : T.ink, color: n ? "#fff" : T.card, fontFamily: disp, fontSize: n ? 13 : 16,
          fontWeight: 700, lineHeight: "28px", cursor: "pointer", opacity: busy === c.id ? 0.5 : 1, transition: "background .15s" }}>
        {busy === c.id ? "…" : n ? `✓${n > 1 ? n : ""}` : "+"}
      </button>
    );
  };

  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  useEffect(() => {
    let off = false;
    call("/api/cost-items?all=1&sources=1", "GET")
      .then((b) => {
        if (off) return;
        setNow(Date.now());
        if (tick === 0) {
          try { const v = localStorage.getItem(VIEW_KEY); if (v === "vendor" || v === "group") setViewState(v); } catch { /* private mode */ }
          // The scope page's "Assemblies" button opens this tab.
          const want = new URLSearchParams(window.location.search).get("tab");
          if (want === "assemblies") setTab(want);
          // Defaults moved to Settings → Cost book (Coy, 2026-10-11).
          if (want === "defaults") window.location.replace("/dashboard/settings/cost-book");
        }
        // Hundreds of rows: draw them as a transition, which React breaks into
        // slices and pauses for a tap, so the page never locks up while it fills.
        startTransition(() => {
          setItems((b.items as Array<Record<string, unknown>>).map(numify)); setGroups(b.groups); setVendors(b.vendors); setSources((b.sources ?? []) as Src[]);
          setErr(null);
        });
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
          sub: `${g.cost_type ? COST_TYPE_LABEL[g.cost_type] : ""}` });
      }
      const loose = visible.filter((c) => !c.cost_group_id || !groups.some((g) => g.id === c.cost_group_id));
      if (loose.length) out.push({ key: "none", title: "Not in a group", sub: "", cards: loose });
    } else {
      // Every vendor who prices something (migration 051): an item is listed under
      // each of them, at THEIR price, ★ where theirs is the one budgets use.
      const byVendor = new Map<string, Src[]>();
      for (const x of sources) byVendor.set(x.vendor_contact_id, [...(byVendor.get(x.vendor_contact_id) ?? []), x]);
      const ids = [...new Set([...byVendor.keys(), ...visible.map((c) => c.vendor_contact_id).filter((v): v is string => !!v)])];
      ids.sort((a, b) => (vendorLabel(a) ?? "").localeCompare(vendorLabel(b) ?? ""));
      for (const id of ids) {
        const theirs = new Map((byVendor.get(id) ?? []).map((x) => [x.cost_item_id, x]));
        const cards: Card[] = visible.filter((c) => theirs.has(c.id) || (!c.default_source_id && c.vendor_contact_id === id)).map((c) => {
          const x = theirs.get(c.id);
          return x ? { ...c, unit_cost: x.unit_cost, price_as_of: x.price_as_of, price_source: x.price_source, vendor_sku: x.vendor_sku ?? c.vendor_sku, _src: x.id, _star: c.default_source_id === x.id } as Card : c;
        });
        if (!cards.length) continue;
        const newest = cards.map((c) => c.price_as_of).filter((d): d is string => !!d).sort().at(-1) ?? null;
        out.push({ key: id, title: vendorLabel(id) ?? "Vendor", href: `/dashboard/vendors/${id}`, cards,
          sub: `${cards.length} item${cards.length === 1 ? "" : "s"}${newest ? ` · newest price ${dateLabel(newest)}` : " · no price dates"}` });
      }
      const none = visible.filter((c) => !c.vendor_contact_id && !sources.some((x) => x.cost_item_id === c.id));
      if (none.length) out.push({ key: "none", title: "No vendor", sub: "your own, or not tied to a supplier yet", cards: none });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, groups, view, q, vendors, sources]);

  /** Swipe a card left on a phone to retire it (Coy, 2026-10-09) — the sheet's
   *  "take it out of the catalog", with Undo. Budgets that used it keep it. */
  const [undoRetire, setUndoRetire] = useState<Card | null>(null);
  const retireCard = async (c: Card) => {
    setErr(null);
    setItems((xs) => (xs ?? []).map((x) => (x.id === c.id ? { ...x, active: false } as Card : x)));
    try {
      await call(`/api/cost-items/${c.id}`, "DELETE");
      setUndoRetire(c); setTimeout(() => setUndoRetire((u) => (u?.id === c.id ? null : u)), 6000);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { reload(); }
  };
  const unretireCard = async (c: Card) => {
    setUndoRetire(null);
    try { await call(`/api/cost-items/${c.id}`, "PATCH", { active: true }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { reload(); }
  };

  /** Several at once (Coy, 2026-10-10: "select multiple cost items to delete at the same time or
   *  select an entire cost group to edit/delete"): ticks on the desktop grid, a group's tick takes
   *  all its cards; Retire N and Move to a group; a group's ✎ edits or deletes it. Undo puts back
   *  what was retired — and a deleted group, made again with its cards. */
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [bulkUndo, setBulkUndo] = useState<{ ids: string[]; label: string; group?: { name: string; cost_type: CostType } } | null>(null);
  const toggleSel = (ids: string[], on: boolean) => setSel((cur) => { const n = new Set(cur); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });
  const eachOf = async (ids: string[], fn: (id: string) => Promise<unknown>) => {
    for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map(fn));
  };
  /** Ask Dusty for today's prices of the picked items from their vendors (Coy, 2026-10-10). */
  const askPrices = (ids: string[]) => {
    const picked = (items ?? []).filter((c) => ids.includes(c.id));
    const q = refreshQuestion(picked.map((c) => ({
      name: c.name ?? "", unit: c.unit,
      vendors: [...new Set([c.vendor_contact_id, ...sources.filter((x) => x.cost_item_id === c.id).map((x) => x.vendor_contact_id)]
        .filter((v): v is string => !!v).map((v) => vendorLabel(v)).filter((v): v is string => !!v))],
    })));
    window.dispatchEvent(new Event("sc:dusty-open"));
    setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: q, send: true } })), 250);
  };
  const retireMany = async (ids: string[], label: string, group?: Group) => {
    setErr(null); setBusy("bulk");
    try {
      await eachOf(ids, (id) => call(`/api/cost-items/${id}`, "DELETE"));
      let gone = false;
      if (group) {
        try { await call(`/api/cost-groups/${group.id}`, "DELETE"); gone = true; }
        catch { setNote(`${group.name} stays — budget lines are filed under it. Its cards are retired.`); }
      }
      setSel(new Set());
      const u = { ids, label, group: gone && group ? { name: group.name, cost_type: group.cost_type } : undefined };
      setBulkUndo(u); setTimeout(() => setBulkUndo((x) => (x === u ? null : x)), 10000);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); reload(); }
  };
  const undoBulk = async () => {
    const u = bulkUndo; if (!u) return;
    setBulkUndo(null); setBusy("bulk");
    try {
      let gid: string | null = null;
      if (u.group) gid = ((await call("/api/cost-groups", "POST", u.group)) as { group?: { id: string } }).group?.id ?? null;
      await eachOf(u.ids, (id) => call(`/api/cost-items/${id}`, "PATCH", gid ? { active: true, cost_group_id: gid } : { active: true }));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); reload(); }
  };
  const moveMany = async (ids: string[], groupId: string) => {
    setErr(null); setBusy("bulk");
    try { await eachOf(ids, (id) => call(`/api/cost-items/${id}`, "PATCH", { cost_group_id: groupId })); setSel(new Set()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); reload(); }
  };

  const patch = async (c: Card, body: Record<string, unknown>) => {
    setErr(null);
    setItems((xs) => (xs ?? []).map((x) => (x.id === c.id ? { ...x, ...body } as Card : x)));
    try { await call(`/api/cost-items/${c.id}`, "PATCH", body); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { reload(); }
  };
  const patchSource = async (c: Card, v: number | null) => {
    setErr(null);
    try { await call(`/api/cost-items/${c.id}/sources/${c._src}`, "PATCH", { unit_cost: v }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { reload(); }
  };
  const newCard = (groupId?: string) => {
    const g = groups.find((x) => x.id === groupId);
    const t: CostType = g?.cost_type ?? "material";
    setEditing({ cost_group_id: groupId ?? null, cost_type: t, qty_rule: "manual", unit: "", taxable: defaultTaxable(t),
      vendor_contact_id: null, rule_params: {}, unit_cost: null, markup_pct: null });
  };

  // Dusty's quick selects (New group · New card) open the forms here: ?new= on
  // arriving, sc:create when already on the page.
  const newCardRef = useRef(newCard);
  useEffect(() => { newCardRef.current = newCard; });
  useEffect(() => {
    if (pick) return;
    const go = (what: unknown) => { if (what === "group") setAddingGroup(true); else if (what === "card") newCardRef.current(); };
    const want = new URLSearchParams(window.location.search).get("new");
    if (want) void Promise.resolve().then(() => go(want));
    const on = (e: Event) => go((e as CustomEvent<string>).detail);
    window.addEventListener("sc:create", on);
    return () => window.removeEventListener("sc:create", on);
  }, [pick]);


  const stale = (d: string | null) => !!d && now > 0 && now - new Date(`${d}T12:00:00`).getTime() > STALE_DAYS * 864e5;
  const active = (items ?? []).filter((c) => c.active);

  // Spreadsheet columns: saved widths, a live width while a divider is dragged.
  const cp: ColPrefs = { w: colPrefs?.w && typeof colPrefs.w === "object" ? colPrefs.w : {}, hidden: Array.isArray(colPrefs?.hidden) ? colPrefs.hidden : [] };
  const hiddenCols = cp.hidden.filter((k) => k !== "item" && COLS.some((c) => c.k === k));
  const shownCols = COLS.filter((c) => !hiddenCols.includes(c.k));
  const widthOf = (k: string) => Math.max(MIN_W, liveW?.[k] ?? cp.w[k] ?? COLS.find((c) => c.k === k)?.w ?? 100);
  const tableW = shownCols.reduce((a, c) => a + widthOf(c.k), 0);
  const startResize = (e: React.PointerEvent, k: string) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = widthOf(k);
    let last = w0;
    const move = (ev: PointerEvent) => { last = Math.max(MIN_W, Math.round(w0 + ev.clientX - x0)); setLiveW({ [k]: last }); };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setLiveW(null);
      if (last !== w0) setColPrefs({ ...cp, w: { ...cp.w, [k]: last } });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  // A long book is drawn in slices of ROW_CHUNK rows, one slice per task
  // (interaction timing, 2026-09-30): 427 rows at once was one ~190 ms task of
  // style and layout that a tap had to wait behind.
  const totalRows = sections.reduce((n, s) => n + (open[s.key] === false ? 0 : s.cards.length), 0);
  const [rowBudget, setRowBudget] = useState(ROW_CHUNK);
  useEffect(() => {
    if (rowBudget >= totalRows) return;
    const t = setTimeout(() => setRowBudget((b) => b + ROW_CHUNK), 0);
    return () => clearTimeout(t);
  }, [rowBudget, totalRows]);
  const caps = (() => {
    let left = rowBudget;
    return sections.map((s) => { if (open[s.key] === false) return 0; const n = Math.min(left, s.cards.length); left -= n; return n; });
  })();

  return (
    <>
    {!pick && <PageHeader title="Price book" count={items ? active.length : null}
      sub="What you buy and charge for, with each vendor's price. A job's budget takes its prices from here."
      actions={<SearchToggle open={finding || !!q} onToggle={() => { if (finding || q) { setQ(""); setFinding(false); } else { setFinding(true); setTab("cards"); } }} label="Find in the Price book" />}>
      {(finding || q) && <div className="mt-2"><SearchBubble value={q} onChange={setQ} onClose={() => setFinding(false)} placeholder="Find: 3000, rebar, Angelle, item #…" /></div>}
    </PageHeader>}
    <div ref={measure} className={pick ? "px-3 py-3 lg:px-5" : "px-3 pb-3 lg:px-5"}>
      {/* ---- title + actions, while picking for a budget ---- */}
      {/* Picking for a budget: "Add Cost Items →" and the area on one small line; no + Group / + Card,
          those are made with Dusty (Coy, 2026-10-11). */}
      {pick && <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{pick.title}</span>
          {pick.top}
      </div>}
      {undoRetire && (
        <div role="status" aria-live="polite" className="fixed left-3 right-3 rounded px-3 py-2 flex items-center gap-3"
          style={{ bottom: "calc(var(--sc-foot, 58px) + 12px)", zIndex: 60, background: T.ink, color: T.card, fontSize: F.sm, boxShadow: "0 6px 18px rgba(0,0,0,.25)" }}>
          <span style={{ flex: 1, minWidth: 0, ...clip }}>Retired {undoRetire.name}</span>
          <button onClick={() => void unretireCard(undoRetire)} style={{ ...eyebrow, color: T.hiviz, cursor: "pointer" }}>Undo</button>
        </div>
      )}
      {flash && (
        <div role="status" aria-live="polite" className={pick ? "sticky z-20 rounded px-3 py-2 flex items-center gap-2" : "mt-2 rounded px-3 py-1.5"}
          style={pick ? { top: 4, fontSize: F.sm, background: T.green, color: "#fff", fontWeight: 600, boxShadow: "0 6px 18px rgba(0,0,0,.25)", marginTop: 8 } : { fontSize: F.sm, background: T.greenDim, color: T.ink }}>
          ✓ {flash}
          {pick && Object.keys(added).length > 0 && <span style={{ fontWeight: 400, opacity: 0.9 }}>· {Object.values(added).reduce((a, b) => a + b, 0)} added so far</span>}
        </div>
      )}

      {/* The tabs and, on Cards, the find / view / columns row beside them
          (Coy, 2026-10-06: "put this whole row up on the same row"). */}
      <div className="flex items-center gap-2 flex-wrap mt-3">
      <div className="flex gap-1" role="tablist" aria-label="Price book">
        {(["cards", "assemblies"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="rounded px-3"
            style={{ height: 32, background: tab === k ? T.ink : T.card, color: tab === k ? T.card : T.ink2, border: `1px solid ${tab === k ? T.ink : T.hair}`,
              fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer" }}>
            {k === "cards" ? `Cards${items ? ` · ${active.length}` : ""}` : "Assemblies"}
          </button>
        ))}
      </div>
      {tab === "cards" && <>
        {/* The search is the header's magnifier on the page; picking for a budget keeps it here. */}
        {pick && <div style={{ flex: 1, minWidth: 180, maxWidth: 360 }}><SearchBubble value={q} onChange={setQ} autoFocus={false} placeholder="Find: 3000, rebar, Angelle, item #…" /></div>}
        {wide && <span style={{ fontSize: F.xs, color: T.ink3 }}>{active.length} card{active.length === 1 ? "" : "s"} · {active.filter((c) => c.unit_cost === null).length} without a cost</span>}
        {/* By group / By vendor on the tabs' row, at its right (Coy, 2026-10-08;
            on a phone too, 2026-10-11). */}
        <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
        <div className="flex rounded overflow-hidden" role="tablist" aria-label="View" style={{ border: `1px solid ${T.hair}` }}>
          {(["group", "vendor"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className="px-2.5"
              style={{ height: 30, background: view === v ? T.ink : T.card, color: view === v ? T.card : T.ink2, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>
              By {v}
            </button>
          ))}
        </div>
        {wide && (
          <div className="relative">
            <button onClick={() => setColMenu((m) => !m)} aria-expanded={colMenu} className="rounded px-2.5"
              style={{ height: 30, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>
              Columns{hiddenCols.length ? ` · ${hiddenCols.length} hidden` : ""} ▾
            </button>
            {colMenu && (
              <div className="absolute right-0 z-20 mt-1 rounded py-1" style={{ background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 8px 24px rgba(10,14,18,.14)", width: 220 }}>
                {COLS.map((col) => (
                  <label key={col.k} className="flex items-center gap-2 px-3 py-1" style={{ fontSize: F.sm, color: col.k === "item" ? T.ink3 : T.ink }}>
                    <input type="checkbox" checked={!hiddenCols.includes(col.k)} disabled={col.k === "item"}
                      onChange={() => setColPrefs({ ...cp, hidden: hiddenCols.includes(col.k) ? hiddenCols.filter((x) => x !== col.k) : [...hiddenCols, col.k] })}
                      style={{ width: 15, height: 15, accentColor: T.chalk }} />
                    {col.k === "other" ? (view === "group" ? "Vendor" : "Group") : col.label}
                  </label>
                ))}
                <button onClick={() => { setColPrefs({ w: {}, hidden: [] }); setColMenu(false); }} className="w-full text-left px-3 py-1.5"
                  style={{ ...eyebrow, color: T.chalk, borderTop: `1px solid ${T.hairSoft}`, marginTop: 4, cursor: "pointer" }}>Reset widths and columns</button>
              </div>
            )}
          </div>
        )}
        </div>
      </>}
      </div>

      {tab === "assemblies" ? <Assemblies cards={items ?? []}
          onPick={pick?.onAssembly ? (id, name) => void took(id, name, () => pick.onAssembly!(id, name)) : undefined} /> : (<>

      {note && <div className="mt-2 rounded px-3 py-2 flex items-center gap-2" style={{ fontSize: F.sm, background: T.greenDim, color: T.ink }}>
        <span className="flex-1">{note}</span><button onClick={() => setNote(null)} aria-label="Dismiss" style={{ color: T.ink3, cursor: "pointer" }}>×</button></div>}
      {err && <div className="mt-2" style={{ fontSize: F.sm, color: T.red }}>{err}</div>}


      {items === null && !err && <div className="rounded animate-pulse mt-3" style={{ height: 120, background: T.hairSoft }} />}
      {items !== null && items.length === 0 && (
        <div className="mt-4 rounded p-4" style={{ background: T.card, border: `1px solid ${T.hair}`, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
          Nothing in the Price book yet. Import your catalog from JobTread or a spreadsheet in <Link href="/dashboard/settings/cost-book" style={{ color: T.chalk }}>Settings → Cost book</Link>, or start with a group — Ready mix, Steel, Forming, Labor, Equipment — and add what&apos;s in it.
        </div>
      )}
      {items !== null && items.length > 0 && sections.length === 0 && (
        <div className="mt-3" style={{ fontSize: F.sm, color: T.ink3 }}>No card matches &ldquo;{q}&rdquo;.</div>
      )}

      {/* ---- the book ---- */}
      {wide && !pick && sel.size > 0 && (
        <div className="mt-3 sticky z-20 rounded px-3 flex items-center gap-3 flex-wrap" style={{ top: "calc(var(--sc-head) + var(--sc-subhead, 0px) + 4px)", minHeight: 44, background: T.ink, color: T.card, fontSize: F.sm }}>
          <span style={{ fontWeight: 600 }}>{sel.size} picked</span>
          <select value="" onChange={(e) => { if (e.target.value) void moveMany([...sel], e.target.value); }} disabled={busy === "bulk"} aria-label="Move to a group"
            style={{ height: 30, borderRadius: 4, background: T.card, color: T.ink, fontSize: F.sm, padding: "0 6px" }}>
            <option value="">Move to a group…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => void retireMany([...sel], `${sel.size} card${sel.size === 1 ? "" : "s"}`)} disabled={busy === "bulk"} className="rounded px-3"
            style={{ height: 30, background: T.red, color: "#fff", fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".04em", cursor: "pointer" }}>
            {busy === "bulk" ? "…" : `Retire ${sel.size}`}
          </button>
          <button onClick={() => askPrices([...sel])} className="rounded px-3" title="Dusty looks up today's prices from their vendors"
            style={{ height: 30, background: T.card, color: T.ink, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".04em", cursor: "pointer" }}>
            ↻ Today&apos;s prices
          </button>
          <span className="flex-1" />
          <button onClick={() => setSel(new Set())} style={{ ...eyebrow, color: T.card, cursor: "pointer" }}>Clear</button>
        </div>
      )}
      {bulkUndo && (
        <div role="status" aria-live="polite" className="fixed left-3 right-3 lg:left-auto lg:w-[420px] rounded px-3 py-2 flex items-center gap-3"
          style={{ bottom: "calc(var(--sc-foot, 58px) + 12px)", right: 16, zIndex: 60, background: T.ink, color: T.card, fontSize: F.sm, boxShadow: "0 6px 18px rgba(0,0,0,.25)" }}>
          <span style={{ flex: 1, minWidth: 0, ...clip }}>Retired {bulkUndo.label}{bulkUndo.group ? ` and deleted ${bulkUndo.group.name}` : ""}</span>
          <button onClick={() => void undoBulk()} style={{ ...eyebrow, color: T.hiviz, cursor: "pointer" }}>Undo</button>
        </div>
      )}
      {wide ? (
        <div className="mt-3 rounded overflow-x-auto" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <table style={{ borderCollapse: "collapse", fontSize: F.sm, tableLayout: "fixed", width: tableW, minWidth: "100%", ...nums }}>
            <colgroup>{pick ? <col style={{ width: 44 }} /> : <col style={{ width: 32 }} />}{shownCols.map((col) => <col key={col.k} style={{ width: widthOf(col.k) }} />)}</colgroup>
            <thead>
              <tr style={{ background: T.slab }}>
                {pick ? <th style={{ borderBottom: `1px solid ${T.hair}` }} /> : (
                  <th style={{ borderBottom: `1px solid ${T.hair}`, textAlign: "center" }}>
                    <input type="checkbox" aria-label="Tick every card" checked={sections.length > 0 && sections.every((x) => x.cards.every((c) => sel.has(c.id)))}
                      onChange={(e) => toggleSel(sections.flatMap((x) => x.cards.map((c) => c.id)), e.target.checked)} style={{ width: 15, height: 15, accentColor: T.ink }} />
                  </th>
                )}
                {shownCols.map((col) => (
                  <th key={col.k} style={{ ...eyebrow, textAlign: col.align ?? "left", padding: "6px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderBottom: `1px solid ${T.hair}`, position: "relative" }}>
                    {col.k === "other" ? (view === "group" ? "Vendor" : "Group") : col.label}
                    <span role="separator" aria-orientation="vertical" aria-label={`Resize ${col.label}`} title="Drag to resize · double-click to reset"
                      onPointerDown={(e) => startResize(e, col.k)} onDoubleClick={() => { const w = { ...cp.w }; delete w[col.k]; setColPrefs({ ...cp, w }); }}
                      className="sc-col-grip" style={{ position: "absolute", top: 0, right: -3, width: 7, height: "100%", cursor: "col-resize", zIndex: 1, touchAction: "none" }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((s, si) => {
                const shut = open[s.key] === false;
                return (
                  <React.Fragment key={s.key}>
                    <tr style={{ background: T.ink, color: T.card }}>
                      <td colSpan={shownCols.length + 1} style={{ padding: "5px 8px" }}>
                        <span className="flex items-center gap-2">
                          {!pick && s.cards.length > 0 && (
                            <input type="checkbox" aria-label={`Tick every card in ${s.title}`} checked={s.cards.every((c) => sel.has(c.id))}
                              onChange={(e) => toggleSel(s.cards.map((c) => c.id), e.target.checked)} style={{ width: 15, height: 15, accentColor: T.hiviz, marginLeft: 1 }} />
                          )}
                          <button onClick={() => setOpen((o) => ({ ...o, [s.key]: shut }))} aria-expanded={!shut} style={{ color: T.card, cursor: "pointer", fontFamily: disp, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
                            {shut ? "+" : "−"} {s.title}
                          </button>
                          <span style={{ fontSize: F.xs, color: "#AEB8C2" }}>{s.sub}</span>
                          {s.href && <Link href={s.href} style={{ fontSize: F.xs, color: "#AEB8C2" }}>their page →</Link>}
                          <span className="flex-1" />
                          {pick && s.groupId && s.cards.length > 0 && (
                            <button onClick={() => void took(s.key, `all of ${s.title}`, () => pick.onGroup(s.groupId!, s.title))} disabled={busy === s.key}
                              style={{ ...eyebrow, color: T.card, cursor: "pointer", border: `1px solid ${T.card}`, borderRadius: 3, padding: "1px 6px" }}>Add all {s.cards.length}</button>
                          )}
                          {s.groupId && !pick && (
                            <button onClick={() => setEditGroup(groups.find((g) => g.id === s.groupId) ?? null)} title="Rename or delete this group" style={{ ...eyebrow, color: T.card, cursor: "pointer" }}>✎ Group</button>
                          )}
                          {s.groupId && <button onClick={() => newCard(s.groupId)} style={{ ...eyebrow, color: T.card, cursor: "pointer" }}>+ Card</button>}
                        </span>
                      </td>
                    </tr>
                    {!shut && s.cards.length === 0 && (
                      <tr><td colSpan={shownCols.length + 1} style={{ padding: "6px 24px", fontSize: F.xs, color: T.ink3 }}>No cards in this group yet.</td></tr>
                    )}
                    {!shut && s.cards.slice(0, caps[si]).map((c) => {
                      const gaps = cardGaps(c);
                      const old = stale(c.price_as_of);
                      const cell: Record<string, React.ReactNode> = {
                        item: (
                          <td key="item" style={{ padding: "4px 8px 4px 16px", overflow: "hidden" }}>
                            <button onClick={() => setEditing(c)} className="text-left" style={{ cursor: "pointer", fontWeight: 500, color: T.ink, ...clip, display: "block", maxWidth: "100%" }}>{c.name}</button>
                            {(gaps.length > 0 || !c.active) && (
                              <div style={{ fontSize: 9.5, color: c.active ? T.hiviz : T.ink3, ...clip }}>{c.active ? `needs ${gaps.join(", ")}` : "retired"}</div>
                            )}
                          </td>
                        ),
                        other: (
                          <td key="other" style={{ padding: "4px 8px", color: T.ink2, ...clip }}>
                            {view === "group"
                              ? <>{vendorLabel(c.vendor_contact_id) ?? "—"}{(c.vendors ?? 0) > (c.vendor_contact_id ? 1 : 0) && <span style={{ fontSize: 10, color: T.chalk }}> +{(c.vendors ?? 0) - (c.vendor_contact_id ? 1 : 0)}</span>}</>
                              : <>{c._star && <span title="Their price is the one budgets use" style={{ color: T.hiviz }}>★ </span>}{groupLabel(c.cost_group_id) ?? "—"}</>}
                          </td>
                        ),
                        sku: <td key="sku" style={{ padding: "4px 8px", color: T.ink3, ...clip }}>{c.vendor_sku ?? ""}</td>,
                        type: <td key="type" style={{ padding: "4px 8px", color: T.ink2, ...clip }}>{COST_TYPE_LABEL[c.cost_type]}</td>,
                        unit: <td key="unit" style={{ padding: "4px 8px", ...clip }}>{c.unit}</td>,
                        cost: (
                          <td key="cost" style={{ padding: "2px 4px", textAlign: "right" }}>
                            <Cell value={c.unit_cost} money label={`Unit cost of ${c.name}`} warn={c.unit_cost === null}
                              onSave={(v) => void (c._src ? patchSource(c, v) : patch(c, { unit_cost: v, price_as_of: v === null ? null : new Date().toISOString().slice(0, 10), price_source: v === null ? null : "typed" }))} />
                          </td>
                        ),
                        taxed: (
                          <td key="taxed" style={{ padding: "4px 8px", textAlign: "center" }}>
                            <input type="checkbox" checked={c.taxable} aria-label={`Tax on ${c.name}`} onChange={(e) => void patch(c, { taxable: e.target.checked })}
                              style={{ width: 16, height: 16, accentColor: T.chalk }} />
                          </td>
                        ),
                        rule: <td key="rule" style={{ padding: "4px 8px", color: T.ink2, fontSize: F.xs, ...clip }}>{QTY_RULE_LABEL[c.qty_rule]}</td>,
                        date: (
                          <td key="date" style={{ padding: "4px 8px", color: old ? T.ink3 : T.ink2, ...clip }} title={old ? `Over ${STALE_DAYS} days old` : undefined}>
                            {dateLabel(c.price_as_of) ?? "—"}{old && <span style={{ fontSize: 9.5, color: T.hiviz }}> old</span>}
                          </td>
                        ),
                        from: <td key="from" style={{ padding: "4px 8px", color: T.ink3, fontSize: F.xs, ...clip }}>{c.price_source ? SOURCE_SHORT[c.price_source] ?? c.price_source : ""}</td>,
                      };
                      return (
                        <tr key={c.id} style={{ borderTop: `1px solid ${T.hairSoft}`, opacity: c.active ? 1 : 0.5 }}>
                          {pick ? <td style={{ padding: "2px 4px 2px 8px" }}>{plus(c)}</td> : (
                            <td style={{ textAlign: "center" }}>
                              <input type="checkbox" aria-label={`Tick ${c.name}`} checked={sel.has(c.id)} onChange={(e) => toggleSel([c.id], e.target.checked)} style={{ width: 15, height: 15, accentColor: T.ink }} />
                            </td>
                          )}
                          {shownCols.map((col) => cell[col.k])}
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
                {pick && s.groupId && s.cards.length > 0 && !shut && (
                  <button onClick={() => void took(s.key, `all of ${s.title}`, () => pick.onGroup(s.groupId!, s.title))} disabled={busy === s.key}
                    className="w-full text-left px-2.5 py-1.5" style={{ ...eyebrow, color: T.chalk, borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                    + Add all {s.cards.length} in {s.title}
                  </button>
                )}
                {!shut && (
                  <div style={{ borderTop: `1px solid ${T.hair}` }}>
                    {s.cards.map((c, i) => {
                      const gaps = cardGaps(c);
                      const more = (c.vendors ?? 0) - (c.vendor_contact_id ? 1 : 0);
                      const other = view === "group" ? `${vendorLabel(c.vendor_contact_id) ?? ""}${more > 0 ? ` +${more}` : ""}` || null : `${c._star ? "★ " : ""}${groupLabel(c.cost_group_id) ?? ""}` || null;
                      return (
                        <SwipeRetire key={c.id} on={!pick && !!c.active && !!c.id} name={c.name ?? "this card"} onRetire={() => void retireCard(c)}>
                        <div role="button" tabIndex={0} onClick={() => setEditing(c)} onKeyDown={(e) => { if (e.key === "Enter") setEditing(c); }}
                          className="w-full text-left flex items-start gap-2 px-2.5 py-2"
                          style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", cursor: "pointer", opacity: c.active ? 1 : 0.5 }}>
                          {plus(c)}
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
                        </div>
                        </SwipeRetire>
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

      </>)}

      <CardSheet card={editing ? (items ?? []).find((x) => x.id === editing.id) ?? editing : null} groups={groups} vendors={vendors} lockVendor={null} items={items ?? []}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      <GroupSheet open={addingGroup} onClose={() => setAddingGroup(false)} onSaved={() => { setAddingGroup(false); reload(); }} />
      {editGroup && (
        <GroupSheet key={editGroup.id} open group={editGroup} onClose={() => setEditGroup(null)} onSaved={() => { setEditGroup(null); reload(); }}
          cards={(items ?? []).filter((c) => c.active && c.cost_group_id === editGroup.id).length}
          onDelete={() => { const g = editGroup; setEditGroup(null);
            void retireMany((items ?? []).filter((c) => c.active && c.cost_group_id === g.id).map((c) => c.id), `${g.name}'s cards`, g); }} />
      )}
    </div>
    </>
  );
}

/**
 * A card row that slides left to show Retire (Coy, 2026-10-09: "swipe left to
 * archive a cost item"). Touch only; a tap on the slid row closes it.
 */
function SwipeRetire({ on, name, onRetire, children }: { on: boolean; name: string; onRetire: () => void; children: React.ReactNode }) {
  const W = 88;
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const at = useRef<{ x: number; y: number; dx: number; h: boolean | null } | null>(null);
  if (!on) return <>{children}</>;
  return (
    <div className="relative overflow-hidden">
      <button type="button" onClick={() => { setDx(0); onRetire(); }} tabIndex={dx ? 0 : -1} aria-hidden={dx ? undefined : true}
        aria-label={`Retire ${name}`} className="absolute top-0 bottom-0 right-0 flex items-center justify-center"
        style={{ width: W, background: T.red, color: "#fff", ...eyebrow, cursor: "pointer" }}>Retire</button>
      <div
        onTouchStart={(e) => { const t = e.touches[0]; at.current = { x: t.clientX, y: t.clientY, dx, h: null }; }}
        onTouchMove={(e) => {
          const a = at.current; if (!a) return;
          const t = e.touches[0]; const mx = t.clientX - a.x, my = t.clientY - a.y;
          if (a.h === null) { if (Math.abs(mx) < 6 && Math.abs(my) < 6) return; a.h = isHorizontal(mx, my); if (a.h) setDrag(true); }
          if (a.h) setDx(Math.max(-W, Math.min(0, a.dx + mx)));
        }}
        onTouchEnd={() => { const a = at.current; at.current = null; if (a?.h) setDx((d) => (d < -W / 2 ? -W : 0)); setDrag(false); }}
        onClickCapture={(e) => { if (dx) { e.stopPropagation(); e.preventDefault(); setDx(0); } }}
        style={{ position: "relative", background: T.card, transform: `translateX(${dx}px)`, transition: drag ? "none" : "transform .18s ease" }}>
        {children}
      </div>
    </div>
  );
}
