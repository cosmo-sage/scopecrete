"use client";

/**
 * Vendors (migration 051) — Coy, 2026-09-29: "that needs to build out a
 * vendor's page, which needs to be a dedicated page. Separate from cost book
 * on the menu panel."
 *
 * VendorList: everyone filed as vendor — suppliers, subs, rentals — with what
 * they price, their receipts and where they deliver. "+ Add a receipt or
 * quote" is the main button (Dusty reads who it's from and the prices).
 * VendorPage: one vendor, in the customer page's layout (record-page.tsx) —
 * Overview, their prices with a Default star (the price budgets use; tap to
 * make them the default), receipts and quotes, next steps, jobs they're on,
 * the threads they're in, the conversation and their files.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, money, formatPhone } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { PageHeader, SearchBubble, SearchToggle } from "@/components/v34/primitives";
import { call, dateLabel, CostCards } from "@/components/v34/cost-cards";
import { PersonScreen, type Person, type RecordExtras } from "@/components/v34/person-view";
import { Empty, panelTitle } from "@/components/v34/record-page";
import { ReceiptImport } from "@/components/v34/receipt-import";
import { sendBytes } from "@/components/v34/files-panel";
import { draftKey } from "@/lib/v34/send-proposal";
import { PENDING_VENDOR_KEY } from "@/components/v34/org-settings";
import { InitialsBox } from "@/components/v34/thread-list";
import { ContactPicker } from "@/components/v34/contacts";
import { BidComposer } from "@/components/v34/bids/bid-composer";
import { BulkBar, send, type BulkEdit } from "@/components/v34/bulk-bar";
import { withTrade } from "@/lib/bulk";
import { websiteLabel } from "@/lib/vendor-website";
import { bidStats, cleanTrades, hasTrade, hoursLabel, type PriceLine, type ShownScope } from "@/lib/bids";
import { groupTrades, withVendorTrades, type Kind } from "@/lib/vendor-taxonomy";
import { kindLabel, useVendorTaxonomy } from "@/lib/v34/use-vendor-taxonomy";
import { clearVendorFilter, setVendorFilter, useVendorFilter } from "@/lib/v34/vendor-filter";

interface VRow {
  id: string; name: string | null; company_name: string | null; subtype: string | null; phone: string | null; email: string | null;
  address: string | null; service_area: string | null; auto: boolean; items: number; defaults: number; newest_price: string | null; files: number;
  trades?: string[]; crew_size?: number | null; website?: string | null;
  bids?: { sent: number; answered: number; median_hours: number | null; label: string; speed: string | null };
}
/** The vendor kinds as Kind picker options (Settings → Vendors), with the vendor's own if it was switched off since. */
const kindOptions = (kinds: Kind[], current?: string | null) =>
  [...kinds, ...(current && !kinds.some((k) => k.slug === current) ? [{ slug: current, label: kindLabel(kinds, current) ?? current }] : [])];
const label = (v: { name: string | null; company_name?: string | null; phone: string | null }) => v.name || v.company_name || formatPhone(v.phone);
const SORTS: Array<[string, string]> = [["name", "Name"], ["fastest", "Answers fastest"], ["prices", "Most prices"]];
const daysAgo = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000)) : null);

const btn = (primary: boolean): React.CSSProperties => ({ height: 36, padding: "0 12px", borderRadius: 4, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
  letterSpacing: ".06em", background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer", whiteSpace: "nowrap" });
const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 8px", minWidth: 0, width: "100%" };

function Tick({ on, onClick, label: l }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }} role="checkbox" aria-checked={on} aria-label={l} className="shrink-0 flex items-center justify-center"
      style={{ width: 18, height: 18, borderRadius: 3, border: `1.5px solid ${on ? T.green : T.hairStrong}`, background: on ? T.green : "transparent", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer" }}>
      {on ? "✓" : ""}
    </button>
  );
}
const tag: React.CSSProperties = { fontSize: 10.5, padding: "1px 6px", borderRadius: 3, background: T.sunk, color: T.ink2, whiteSpace: "nowrap" };

/**
 * Vendors v2 (Claude Design, 2026-10-08): find subs by trade, pick several,
 * one bid request goes to all of them. Trade is a column on the left (chips
 * that scroll sideways on a phone); each row says how to reach them and how
 * they answer bids; ticking rows brings up the black bar — Send a bid request.
 */
export function VendorList() {
  const router = useRouter();
  const [rows, setRows] = useState<VRow[] | null>(null);
  const [ready, setReady] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [finding, setFinding] = useState(false);
  // The trade and kind live in a small store the Spaces drawer reads too (Coy, 2026-10-19).
  const filter = useVendorFilter();
  const sub = filter.sub, trade = filter.trade;
  const setSub = (v: string) => setVendorFilter({ sub: v });
  const setTrade = (v: string) => setVendorFilter({ trade: v });
  const [sort, setSort] = useState("name");
  const [sel, setSel] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const [adding, setAdding] = useState(false);
  // The receipt sheet, open on a kind: Dusty's Receipt · Quote · Bill (a vendor's bill is an invoice; Coy, 2026-10-10).
  const [receipt, setReceiptKind] = useState<false | "receipt" | "quote" | "invoice">(false);
  const setReceipt = (on: boolean | "receipt" | "quote" | "invoice") => setReceiptKind(on === true ? "receipt" : on);
  const [tick, setTick] = useState(0);
  const [measure, wide] = useWide<HTMLDivElement>(900);
  // ?receipt=1 — Dusty's + menu → Add a receipt.
  useEffect(() => {
    let off = false;
    const kindOf = (w: string | null) => w === "1" || w === "receipt" ? "receipt" : w === "quote" ? "quote" : w === "bill" ? "invoice" : null;
    Promise.resolve().then(() => {
      if (off) return;
      const qs = new URLSearchParams(window.location.search);
      const k = kindOf(qs.get("receipt"));
      if (k) setReceiptKind(k);
      if (qs.get("new") === "1") setAdding(true);
    });
    // Already on this page: the menu says so with an event.
    const on = (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      if (d === "vendor") { setAdding(true); return; }
      const k = kindOf(d);
      if (k) setReceiptKind(k);
    };
    window.addEventListener("sc:create", on);
    return () => { off = true; window.removeEventListener("sc:create", on); };
  }, []);

  useEffect(() => {
    let off = false;
    call("/api/vendors", "GET").then((b) => { if (!off) { setRows(b.vendors as VRow[]); setReady(b.bids_ready !== false); setErr(null); } })
      .catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    return () => { off = true; };
  }, [tick]);

  // Kinds and trades are the org's own (Settings → Vendors; Coy, 2026-10-24: "buckets inside of buckets").
  const tax = useVendorTaxonomy();
  const SUBS: Array<[string, string]> = useMemo(() => [["all", "All"], ...tax.kinds.map((k) => [k.slug, k.label] as [string, string])], [tax.kinds]);
  const allTrades = useMemo(() => withVendorTrades(tax.trades, rows ?? []), [tax.trades, rows]);
  const trades = useMemo(() => allTrades.filter((t) => (t.n ?? 0) > 0).map((t) => ({ trade: t.name, n: t.n ?? 0 })), [allTrades]);
  // Each kind with the trades under it, only those with vendors (a kind shows if it has vendors or trades with some).
  const groups = useMemo(() => groupTrades(tax.kinds, allTrades.filter((t) => (t.n ?? 0) > 0)).map((g) => ({
    k: g.kind?.slug ?? null, label: g.kind?.label ?? "Other trades",
    n: g.kind ? (rows ?? []).filter((v) => v.subtype === g.kind!.slug).length : 0,
    trades: g.trades.map((t) => ({ trade: t.name, n: t.n ?? 0 })),
  })).filter((g) => g.n > 0 || g.trades.length > 0), [tax.kinds, allTrades, rows]);
  useEffect(() => {
    if (!rows) return;
    setVendorFilter({
      trades: [{ trade: "All", n: rows.length }, ...trades],
      kinds: SUBS.map(([k, l]) => ({ k, label: l, n: k === "all" ? rows.length : rows.filter((v) => v.subtype === k).length })),
      groups,
    });
  }, [rows, trades, SUBS, groups]);
  useEffect(() => () => clearVendorFilter(), []);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (rows ?? []).filter((v) => (sub === "all" || v.subtype === sub) && (trade === "All" || hasTrade(v, trade)) &&
      (!s || [v.name, v.company_name, v.service_area, v.address, v.email, v.phone, ...(v.trades ?? [])].some((x) => (x ?? "").toLowerCase().includes(s))));
    const speed = (v: VRow) => v.bids?.median_hours ?? Infinity;
    return [...list].sort((a, b) => sort === "fastest" ? speed(a) - speed(b) || (b.bids?.answered ?? 0) - (a.bids?.answered ?? 0)
      : sort === "prices" ? b.items - a.items : (label(a) ?? "").localeCompare(label(b) ?? ""));
  }, [rows, q, sub, trade, sort]);
  const picked = useMemo(() => (rows ?? []).filter((v) => sel.includes(v.id)), [rows, sel]);
  const allOn = shown.length > 0 && shown.every((v) => sel.includes(v.id));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSel((s) => (allOn ? s.filter((id) => !shown.some((v) => v.id === id)) : [...new Set([...s, ...shown.map((v) => v.id)])]));
  const phones = picked.map((v) => v.phone).filter((p): p is string => !!p);
  const groupText = () => { if (phones.length) window.location.assign(`sms:${phones.join(",")}`); };
  // Bulk edit (Coy, 2026-10-22): the kind, or a trade added or taken off, on every ticked vendor.
  const tradesOf = (id: string) => (rows ?? []).find((v) => v.id === id)?.trades ?? [];
  const tradeOpts = [...new Set([...allTrades.map((t) => t.name), ...picked.flatMap((v) => v.trades ?? [])])].map((t) => ({ k: t, label: t }));
  const bulkEdits = ([
    { k: "kind", label: "Kind", options: tax.kinds.map((k) => ({ k: k.slug, label: k.label })),
      apply: async (id, v) => { await send(`/api/vendors/${id}`, "PATCH", { subtype: v }); }, did: (l) => `Set {n} to ${l}` },
    { k: "trade+", label: "Add a trade", options: tradeOpts,
      apply: async (id, v) => { await send(`/api/vendors/${id}`, "PATCH", { trades: withTrade(tradesOf(id), v, true) }); }, did: (l) => `Added ${l} to {n}` },
    { k: "trade-", label: "Take a trade off", options: tradeOpts.filter((o) => picked.some((v) => hasTrade(v, o.k))),
      apply: async (id, v) => { await send(`/api/vendors/${id}`, "PATCH", { trades: withTrade(tradesOf(id), v, false) }); }, did: (l) => `Took ${l} off {n}` },
  ] as BulkEdit[]).filter((e) => e.options.length > 0);
  const countLabel = trade === "All" ? (rows ? `${shown.length}` : null) : `${shown.length} ${trade.toLowerCase()}`;

  const listBtn = (key: string, text: string, n: number, on: boolean, act: () => void, indent: number, strong?: boolean) => (
    <button key={key} onClick={act} className="flex items-center gap-2 text-left"
      style={{ height: strong ? 30 : 28, padding: `0 10px 0 ${indent}px`, background: on ? T.sunk : "transparent", borderLeft: `3px solid ${on ? T.hiviz : "transparent"}`,
        color: on ? T.ink : strong ? T.ink : T.ink2, fontWeight: on || strong ? 600 : 400, fontSize: F.sm, cursor: "pointer" }}>
      <span style={{ flex: 1, ...clip }}>{text}</span><span style={{ ...nums, fontSize: F.xs, color: T.ink3 }}>{n}</span>
    </button>
  );
  const tradeList = (
    <nav aria-label="Kind and trade" className="flex flex-col" style={{ width: 210 }}>
      <div style={{ ...eyebrow, padding: "4px 10px" }}>Kind · trade</div>
      {listBtn("all", "All vendors", rows?.length ?? 0, sub === "all" && trade === "All", () => setVendorFilter({ sub: "all", trade: "All" }), 10, true)}
      {groups.map((g) => (
        <React.Fragment key={g.k ?? "none"}>
          {g.k ? listBtn(`k:${g.k}`, g.label, g.n, sub === g.k && trade === "All", () => setVendorFilter({ sub: g.k!, trade: "All" }), 10, true)
            : <div style={{ ...eyebrow, padding: "8px 10px 2px" }}>{g.label}</div>}
          {g.trades.map((t) => listBtn(`t:${g.k}:${t.trade}`, t.trade, t.n, trade === t.trade, () => setVendorFilter({ trade: t.trade, sub: "all" }), 24))}
        </React.Fragment>
      ))}
      {rows && !trades.length && <div style={{ fontSize: F.xs, color: T.ink3, padding: "6px 10px", lineHeight: 1.4 }}>{ready ? "No trades yet — open a vendor and add theirs in Edit." : "Trades need migration 091 — say \"apply 091\"."}</div>}
      <Link href="/dashboard/settings/vendors" style={{ fontSize: F.xs, color: T.chalk, padding: "10px 10px 0" }}>Edit kinds &amp; trades →</Link>
    </nav>
  );

  const reach = (v: VRow) => (
    <span className="flex gap-1">
      <span style={{ ...tag, opacity: v.phone ? 1 : 0.45 }}>{v.phone ? "Text" : "No phone"}</span>
      <span style={{ ...tag, background: v.email ? T.sunk : "transparent", border: v.email ? "none" : `1px solid ${T.hair}`, color: v.email ? T.ink2 : T.ink3 }}>{v.email ? "Email" : "No email"}</span>
    </span>
  );
  const bidsCell = (v: VRow) => (
    <span className="flex flex-col">
      <span style={{ fontSize: F.sm, color: v.bids?.sent ? T.ink : T.ink3 }}>{v.bids?.label ?? "No requests yet"}</span>
      {v.bids?.speed && <span style={{ fontSize: F.xs, color: (v.bids.median_hours ?? 0) <= 12 ? T.green : (v.bids.median_hours ?? 0) >= 72 ? T.red : T.ink3 }}>{v.bids.speed}</span>}
    </span>
  );
  const pricesCell = (v: VRow) => {
    const d = daysAgo(v.newest_price);
    return (
      <span className="flex flex-col">
        <span style={{ fontSize: F.sm, ...nums, color: v.items ? T.ink : T.ink3 }}>{v.items ? `${v.items} price${v.items === 1 ? "" : "s"}` : "No prices"}</span>
        {d !== null && <span style={{ fontSize: F.xs, ...nums, color: d > 90 ? T.red : d > 45 ? T.hivizText : T.ink3 }}>{d === 0 ? "today" : `${d} days`}</span>}
      </span>
    );
  };
  const subLine = (v: VRow) => [kindLabel(tax.kinds, v.subtype), v.crew_size ? `crew of ${v.crew_size}` : null, v.service_area].filter(Boolean).join(" · ");

  return (
    <>
    <PageHeader title="Vendors" count={wide ? countLabel : null}
      sub="Who you buy from and who you hire, by trade. Tick several and send one bid request to all of them."
      actions={<>
        <SearchToggle open={finding || !!q} onToggle={() => { if (finding || q) { setQ(""); setFinding(false); } else setFinding(true); }} label="Find a vendor" />
      </>}>
      {(finding || q) && <div className="mt-2"><SearchBubble value={q} onChange={setQ} onClose={() => setFinding(false)} placeholder="Find a vendor, trade, area, phone…" /></div>}
    </PageHeader>
    <div ref={measure} className="px-3 pb-3 lg:px-5" style={{ paddingBottom: picked.length ? 90 : undefined }}>
      {err && <div className="mb-2 rounded px-3 py-2" style={{ fontSize: F.sm, color: T.red, background: T.redDim }}>{err}</div>}
      {note && <div className="mb-2 rounded px-3 py-2 flex gap-2" style={{ fontSize: F.sm, background: T.greenDim }}><span style={{ flex: 1 }}>{note}</span><button onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}

      {!wide && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1" role="tablist" aria-label="Trade">
          {[{ trade: "All", n: rows?.length ?? 0 }, ...trades].map((t) => {
            const on = t.trade === trade;
            return (
              <button key={t.trade} role="tab" aria-selected={on} onClick={() => setTrade(t.trade)} className="shrink-0 rounded px-2.5 sc-old-nav-only"
                style={{ height: 30, background: on ? T.ink : T.card, color: on ? T.card : T.ink2, border: `1px solid ${on ? T.ink : T.hairStrong}`, fontSize: F.xs, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                {t.trade} <span style={{ opacity: 0.7 }}>{t.n}</span>
              </button>
            );
          })}
          {/* Under Spaces the trades are in the drawer; the pick shows here with × to clear it. */}
          {(trade !== "All" || sub !== "all") && (
            <button type="button" className="shrink-0 rounded px-2.5 sc-spaces-only" onClick={() => setVendorFilter({ trade: "All", sub: "all" })}
              style={{ height: 30, background: T.ink, color: T.card, border: `1px solid ${T.ink}`, fontSize: F.xs, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              {[trade !== "All" ? trade : null, sub !== "all" ? kindLabel(tax.kinds, sub) : null].filter(Boolean).join(" · ")} ×
            </button>
          )}
          <select value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Kind" className="sc-old-nav-only" style={{ ...field, width: "auto", height: 30 }}>
            {SUBS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" style={{ ...field, width: "auto", height: 30 }}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>Sort · {l}</option>)}
          </select>
        </div>
      )}

      <div className="flex gap-4 items-start">
        {wide && <div className="shrink-0 sticky sc-old-nav-only" style={{ top: "calc(var(--sc-head) + var(--sc-subhead, 0px) + 8px)" }}>{tradeList}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          {wide && (
            <div className="flex items-center gap-2 mb-2">
              <Tick on={allOn} onClick={toggleAll} label={allOn ? "Clear these" : "Pick every vendor shown"} />
              <span style={{ fontSize: F.xs, color: T.ink3, flex: 1 }}>{rows ? `${shown.length} vendor${shown.length === 1 ? "" : "s"}${trade !== "All" ? ` in ${trade}` : ""}` : ""}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" style={{ ...field, width: "auto", height: 30 }}>
                {SORTS.map(([k, l]) => <option key={k} value={k}>Sort · {l}</option>)}
              </select>
            </div>
          )}

          {rows === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>
            : shown.length === 0 ? (
              <div className="rounded px-3 py-4" style={{ background: T.card, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
                {rows.length ? "No vendor matches." : "No vendors yet. Add a receipt or quote and Dusty will read who it's from, or file someone as a vendor on Threads."}
              </div>
            ) : wide ? (
              <table className="w-full" style={{ borderCollapse: "collapse", fontSize: F.sm, background: T.card }}>
                <thead><tr style={{ background: T.slab }}>
                  {["", "Vendor", "Trade", "Reach them", "Bids answered", "Prices on file"].map((h, i) => (
                    <th key={i} style={{ ...eyebrow, textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${T.hair}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {shown.map((v) => {
                    const on = sel.includes(v.id);
                    return (
                      <tr key={v.id} onClick={() => router.push(`/dashboard/vendors/${v.id}`)} style={{ borderTop: `1px solid ${T.hairSoft}`, background: on ? T.sunk : "transparent", cursor: "pointer" }}>
                        <td onClick={(e) => { e.stopPropagation(); toggle(v.id); }} style={{ padding: "6px 8px", width: 30 }}><Tick on={on} onClick={() => toggle(v.id)} label={`Pick ${label(v)}`} /></td>
                        <td style={{ padding: "6px 8px", maxWidth: 280 }}>
                          <span className="flex items-center gap-2">
                            <InitialsBox name={label(v) || null} size={28} />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: 600, color: T.ink, ...clip, display: "block" }}>{label(v)}{v.auto ? <span style={{ fontSize: 10, color: T.ink3, fontWeight: 400 }}> · auto</span> : null}</span>
                              <span style={{ display: "block", fontSize: 10.5, color: T.ink3, ...clip }}>{subLine(v) || "—"}</span>
                            </span>
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px" }}><span className="flex gap-1 flex-wrap">{(v.trades ?? []).length ? (v.trades ?? []).map((t) => <span key={t} style={tag}>{t}</span>) : <span style={{ color: T.ink3 }}>—</span>}</span></td>
                        <td style={{ padding: "6px 8px" }}>{reach(v)}</td>
                        <td style={{ padding: "6px 8px" }}>{bidsCell(v)}</td>
                        <td style={{ padding: "6px 8px" }}>{pricesCell(v)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col" style={{ background: T.card }}>
                {shown.map((v) => {
                  const on = sel.includes(v.id);
                  return (
                    <div key={v.id} onClick={() => router.push(`/dashboard/vendors/${v.id}`)} className="px-3 py-2 flex items-center gap-2.5" style={{ borderTop: `1px solid ${T.hairSoft}`, background: on ? T.sunk : "transparent", cursor: "pointer" }}>
                      <Tick on={on} onClick={() => toggle(v.id)} label={`Pick ${label(v)}`} />
                      <div style={{ flex: 1, minWidth: 0, color: T.ink }}>
                        <div style={{ fontWeight: 600, fontSize: F.sm, ...clip }}>{label(v)}</div>
                        <div style={{ fontSize: 10.5, color: T.ink3, ...clip }}>
                          {[(v.trades ?? []).join(" · ") || kindLabel(tax.kinds, v.subtype), v.bids?.speed ?? (v.bids?.sent ? v.bids.label : null)].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <span style={{ fontSize: 10.5, color: T.ink3, whiteSpace: "nowrap" }}>{v.phone && v.email ? "Text · Email" : v.phone ? "Text only" : v.email ? "Email only" : "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      {picked.length > 0 && (
        <BulkBar kind="contact" vendor ids={picked.map((v) => v.id)} what={["vendor", "vendors"]} names={picked.map((v) => label(v) ?? "")} wide={wide}
          onClear={() => setSel([])} onDone={() => { setSel([]); setTick((n) => n + 1); }} edits={bulkEdits}
          summary={<span style={{ fontSize: F.xs, color: "#C9C3B8", whiteSpace: "nowrap" }}>{phones.length} by text · {picked.filter((v) => v.email).length} by email</span>}
          extra={<>
            {wide && phones.length > 1 && <button onClick={groupText} title="Opens a group text on your phone" style={{ height: 32, padding: "0 10px", borderRadius: 4, border: "1px solid #5A554E", color: "#fff", fontSize: F.xs, cursor: "pointer" }}>Group text</button>}
            <button onClick={() => setComposing(true)} style={{ height: 34, padding: "0 14px", borderRadius: 4, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap", cursor: "pointer" }}>
              {wide ? "Send a bid request →" : "Bid →"}
            </button>
          </>} />
      )}

      {composing && <BidComposer open onClose={() => setComposing(false)} vendors={picked}
        from={`Started from Vendors · ${picked.length} vendor${picked.length === 1 ? "" : "s"}${trade !== "All" ? ` in ${trade.toLowerCase()}` : ""}`}
        onDone={(m) => { setNote(m); setSel([]); setTick((n) => n + 1); }} />}
      {adding && <NewVendor onClose={() => setAdding(false)} onMade={(id) => { setAdding(false); window.location.href = `/dashboard/vendors/${id}`; }} />}
      <ReceiptImport key={receipt || "closed"} open={!!receipt} kind={receipt || undefined} onClose={() => setReceipt(false)} onDone={(m) => { setNote(m); setTick((n) => n + 1); }} />
    </div>
    </>
  );
}

/**
 * A vendor's trades: tap the org's own (Settings → Vendors), grouped by kind with the vendor's own
 * kind first, or type another (Vendors v2, migration 091).
 */
function TradePicker({ value, onChange, kind }: { value: string[]; onChange: (v: string[]) => void; kind?: string | null }) {
  const [other, setOther] = useState("");
  const tax = useVendorTaxonomy();
  const known = tax.trades.map((t) => t.name);
  const extra = value.filter((t) => !known.some((k) => k.toLowerCase() === t.toLowerCase()));
  const groups = groupTrades(tax.kinds, [...tax.trades, ...extra.map((name) => ({ name, kind: null }))]).filter((g) => g.trades.length)
    .sort((a, b) => Number((b.kind?.slug ?? null) === kind) - Number((a.kind?.slug ?? null) === kind));
  const flip = (t: string) => onChange(value.some((x) => x.toLowerCase() === t.toLowerCase()) ? value.filter((x) => x.toLowerCase() !== t.toLowerCase()) : cleanTrades([...value, t]));
  return (
    <div>
      <span style={eyebrow}>Trades</span>
      {groups.map((g) => (
        <div key={g.kind?.slug ?? "none"} className="mt-1">
          <div style={{ fontSize: 10, color: T.ink3 }}>{g.kind?.label ?? "Other trades"}</div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {g.trades.map((t) => {
              const on = value.some((x) => x.toLowerCase() === t.name.toLowerCase());
              return <button key={t.name} type="button" onClick={() => flip(t.name)} style={{ height: 26, padding: "0 8px", borderRadius: 3, fontSize: F.xs, border: `1px solid ${on ? T.ink : T.hairStrong}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2, cursor: "pointer" }}>{t.name}</button>;
            })}
          </div>
        </div>
      ))}
      <div className="flex gap-1 mt-1">
        <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Another trade" aria-label="Another trade" style={{ ...field, height: 30 }}
          onKeyDown={(e) => { if (e.key === "Enter" && other.trim()) { e.preventDefault(); onChange(cleanTrades([...value, other])); setOther(""); } }} />
        <button type="button" disabled={!other.trim()} onClick={() => { onChange(cleanTrades([...value, other])); setOther(""); }} style={{ ...btn(false), height: 30, opacity: other.trim() ? 1 : 0.5 }}>Add</button>
      </div>
      <Link href="/dashboard/settings/vendors" style={{ fontSize: 10, color: T.chalk }}>Edit the list of kinds &amp; trades →</Link>
    </div>
  );
}

/** The vendor's kind, from the org's list (Settings → Vendors). */
function KindSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tax = useVendorTaxonomy();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={field} aria-label="Kind">
      {kindOptions(tax.kinds, value).map((k) => <option key={k.slug} value={k.slug}>{k.label}</option>)}
    </select>
  );
}

function NewVendor({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [d, setD] = useState({ name: "", subtype: "supplier", phone: "", email: "", website: "", address: "", service_area: "", trades: [] as string[] });
  const [err, setErr] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string | null; bucket: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null); setExisting(null);
    try {
      const r = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const b = await r.json().catch(() => ({}));
      if (r.status === 409 && b.existing) { setExisting(b.existing); setErr(b.error); return; }
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      onMade(b.vendor.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 sc-drawer z-50 flex items-start justify-center" style={{ background: "rgba(0,0,0,.35)", paddingTop: "calc(var(--sc-head) + 12px)" }} onClick={onClose}>
      <div className="rounded p-3 flex flex-col gap-2" style={{ background: T.card, width: "min(460px, calc(100vw - 24px))", maxHeight: "calc(100dvh - var(--sc-head) - 40px)", overflowY: "auto" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New vendor">
        <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, textTransform: "uppercase" }}>New vendor</div>
        {([["name", "Name"], ["phone", "Phone (optional)"], ["email", "Email"], ["website", "Website"], ["address", "Address"], ["service_area", "Where they deliver"]] as const).map(([k, l]) => (
          <label key={k} className="block"><span style={eyebrow}>{l}</span>
            <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} style={field} aria-label={l} /></label>
        ))}
        <label className="block"><span style={eyebrow}>Kind</span>
          <KindSelect value={d.subtype} onChange={(subtype) => setD({ ...d, subtype })} /></label>
        <TradePicker value={d.trades} kind={d.subtype} onChange={(trades) => setD({ ...d, trades })} />
        {err && <div style={{ fontSize: F.sm, color: T.red }}>{err}{existing && <> <Link href={`/dashboard/messages/${existing.id}`} style={{ color: T.chalk }}>Open {existing.name ?? "them"}</Link></>}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} style={btn(false)}>Cancel</button>
          <button onClick={() => void save()} disabled={busy || !d.name.trim()} style={{ ...btn(true), opacity: busy || !d.name.trim() ? 0.5 : 1 }}>{busy ? "Adding…" : "Add vendor"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one vendor

interface Price {
  id: string; unit_cost: number | null; vendor_sku: string | null; unit: string | null; price_as_of: string | null; price_source: string | null;
  tax_pct_seen: number | null; is_default: boolean; cheapest_other: { unit_cost: number; vendor: string | null } | null;
  group?: string | null;
  item: { id: string; name: string; unit: string | null; cost_type: string };
}
interface VFile { id: string; name: string; category: string | null; read_state: string | null; summary: string | null; created_at: string; url: string | null; facts: Record<string, unknown> | null }
interface VPage {
  vendor: VRow & { contact_type: string; status_summary: string | null;
    /** 1099 and the W-9 asked for (migration 129); missing says why they can't be set yet. */
    is_1099?: boolean | null; w9_requested_at?: string | null; missing?: string | null };
  prices: Price[]; files: VFile[]; jobs: Array<{ id: string; title: string | null; status: string; address: string | null; role: string | null }>; messages: number;
  /** Their account (a customers row) and its people; absent on an older server. */
  account?: { id: string; name: string | null; relation: string } | null;
  people?: VPerson[];
}
interface VPerson { id: string; name: string | null; phone: string | null; email: string | null; role: string | null; bucket: string | null; primary: boolean }

/**
 * The people at a vendor (Coy, 2026-10-21: "a vendor account will have contacts inside it just like a
 * customer account"). Their account is the customers row filing them vendor made (relation vendor · sub);
 * + Add person files the pick as a vendor first, then puts them on it through the customer page's own
 * routes (sc_attach_contact, undoable). Migration 116 keeps a second person there when they are filed again.
 */
function VendorPeople({ p, vendorId, onSaved }: { p: VPage; vendorId: string; onSaved: () => void }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const people = p.people ?? [];
  const acct = p.account;
  const add = async (contactId: string, bucket: string | null) => {
    if (!acct) return;
    setBusy("add"); setErr(null);
    try {
      if (bucket !== "vendor") await call(`/api/contacts/${contactId}/bucket`, "PATCH", { bucket: "vendor" });
      await call(`/api/customers/${acct.id}/contacts`, "POST", { contact_id: contactId });
      setAdding(false); onSaved();
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(null); }
  };
  const remove = async (x: VPerson) => {
    if (!acct || !confirm(`Take ${x.name ?? "them"} off ${acct.name ?? "this vendor"}? Their calls and texts stay with them.`)) return;
    setBusy(x.id); setErr(null);
    try { await call(`/api/customers/${acct.id}/contacts/${x.id}`, "DELETE"); onSaved(); }
    catch (e) { setErr(String((e as Error).message)); } finally { setBusy(null); }
  };
  return (
    <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
      <div className="flex items-center gap-2">
        <span style={panelTitle}>People at {acct?.name || label(p.vendor)} · {people.length}</span>
        {acct && <button onClick={() => setAdding((v) => !v)} style={{ marginLeft: "auto", height: 30, padding: "0 10px", border: `1px solid ${T.hairStrong}`, borderRadius: 2,
          background: "transparent", color: T.ink2, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" }}>{adding ? "Close" : "+ Add person"}</button>}
      </div>
      {!acct && <Empty text="Keep them as a vendor first (the tag under their name) — that makes their account, and people go on it." />}
      {adding && acct && <ContactPicker exclude={people.map((x) => x.id)} onPick={(c) => void add(c.id, c.role === "vendor" || c.role === "sub" ? "vendor" : null)} busy={busy === "add"} bucket="vendor" />}
      {people.map((x) => (
        <div key={x.id} className="flex items-center gap-2.5" style={{ padding: "8px 10px", background: T.card, border: `1px solid ${T.hair}`, borderRadius: 3 }}>
          <InitialsBox name={x.name} size={32} />
          <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
            <span className="flex gap-1.5 items-center">
              <Link href={x.id === vendorId ? `/dashboard/vendors/${x.id}` : `/dashboard/messages/${x.id}?person=1`} className="no-underline" style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{x.name || formatPhone(x.phone) || "No name"}</Link>
              {x.primary && <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: T.hivizText }}>Primary</span>}
              {x.role && <span style={{ fontSize: 12, color: T.ink3 }}>{x.role}</span>}
            </span>
            <span style={{ fontSize: 12.5, color: T.ink3, overflowWrap: "anywhere" }}>{[x.phone ? formatPhone(x.phone) : null, x.email].filter(Boolean).join(" · ") || "No number or email"}</span>
          </div>
          {x.phone && <a href={`tel:${x.phone}`} style={{ fontSize: 13, color: T.ink2 }}>Call</a>}
          {!x.primary && <button onClick={() => void remove(x)} disabled={!!busy} style={{ border: 0, background: "transparent", color: T.ink3, fontSize: 13, cursor: "pointer" }}>{busy === x.id ? "…" : "Take off"}</button>}
        </div>
      ))}
      {err && <span style={{ fontSize: 12, color: T.red }}>{err}</span>}
    </div>
  );
}

/**
 * One vendor (2026-10-05: the customer page's layout — Coy: "consistent
 * formatting across contact, customer and vendor"). The person's page
 * (person-view.tsx) with the vendor's own tabs: Overview · Prices (★ = the
 * price budgets use; their cards below) · Receipts & quotes · Next steps · Jobs
 * · Threads · Timeline · Files.
 */
export function VendorPage({ id }: { id: string }) {
  const router = useRouter();
  const [p, setP] = useState<VPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const [bids, setBids] = useState<BidReq[] | null>(null);
  const [bidsMissing, setBidsMissing] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const tax = useVendorTaxonomy();

  useEffect(() => {
    let off = false;
    call(`/api/vendors/${id}`, "GET").then((b) => { if (!off) { setP(b as VPage); setErr(null); } })
      .catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    call(`/api/bid-requests?vendor=${id}`, "GET").then((b) => { if (!off) { setBids(b.requests as BidReq[]); setBidsMissing(b.missing ?? null); } })
      .catch(() => { if (!off) setBids([]); });
    return () => { off = true; };
  }, [id, tick]);
  // Filed somewhere else from here (⋯ → Change bucket): their own page is the contact page.
  const onPerson = useCallback((x: Person) => {
    if (x.contact.bucket && x.contact.bucket !== "vendor") router.replace(`/dashboard/messages/${id}?person=1`);
  }, [id, router]);

  const makeDefault = async (pr: Price) => {
    setErr(null);
    setP((x) => x && { ...x, prices: x.prices.map((y) => (y.item.id === pr.item.id ? { ...y, is_default: y.id === pr.id } : y)) });
    try { await call(`/api/cost-items/${pr.item.id}/sources/${pr.id}`, "PATCH", { default: true }); setNote(`${label(p!.vendor)}'s price is now the one budgets use for ${pr.item.name}.`); }
    catch (e) { setErr(String((e as Error).message)); } finally { setTick((n) => n + 1); }
  };

  // Back is always the Vendors list (Coy, 2026-10-11: like the customer page).
  const back = { href: "/dashboard/vendors", label: "Vendors" };
  const v = p?.vendor;
  const receipts = p ? p.files.filter((f) => f.category === "receipt" || f.category === "vendor_quote").length : 0;
  const w9s = p ? p.files.filter((f) => f.category === "w9").length : 0;
  const mine = (bids ?? []).flatMap((r) => r.recipients.filter((x) => x.contact_id === id).map((x) => ({ ...x, req: r })));
  const stats = bidStats(mine);
  const extra: RecordExtras = {
    tabs: [
      { key: "bids", label: `Bid requests ${bids ? mine.length : ""}`.trim(), render: () => p ? <VendorBids rows={mine} stats={stats} jobs={p.jobs.length} missing={bidsMissing} onSend={() => setComposing(true)} /> : <Empty text={err ?? "Loading…"} /> },
      { key: "people", label: `People ${p?.people ? p.people.length : ""}`.trim(), render: () => p ? <VendorPeople p={p} vendorId={id} onSaved={() => setTick((n) => n + 1)} /> : <Empty text={err ?? "Loading…"} /> },
      { key: "prices", label: `Cost book ${p?.prices.length ?? ""}`.trim(), render: () => p ? <VendorPrices p={p} onDefault={(pr) => void makeDefault(pr)} /> : <Empty text={err ?? "Loading…"} /> },
      { key: "receipts", label: `Receipts & quotes ${p ? receipts : ""}`.trim(), render: () => p ? <VendorReceipts p={p} onImport={() => setReceipt(true)} /> : <Empty text={err ?? "Loading…"} /> },
      { key: "tax", label: `1099 & W-9${w9s ? ` ${w9s}` : ""}`, render: () => p ? <VendorTax p={p} onSaved={(m) => { if (m) setNote(m); setTick((n) => n + 1); }} /> : <Empty text={err ?? "Loading…"} /> },
    ],
    actions: [
      ...(v?.website ? [{ label: "Website ↗", onClick: () => { window.open(v.website!, "_blank", "noopener,noreferrer"); } }] : []),
    ],
    // App access lives in ⋯ (Coy, 2026-10-24: "Put this in the hamburger menu on the right").
    menu: [
      { label: "App access", onClick: () => {
        // Settings → People opens with this vendor picked for an invite (081).
        try { sessionStorage.setItem(PENDING_VENDOR_KEY, JSON.stringify({ contact_id: id, email: v?.email ?? null })); } catch {}
        window.dispatchEvent(new Event("sc:open-settings"));
      } },
    ],
    onEdit: () => setEditing(true),
    ...(v && p ? {
      address: v.address,
      meta: [(v.trades ?? []).length ? (v.trades ?? []).join(" · ") : v.subtype ? kindLabel(tax.kinds, v.subtype) : "Vendor", v.is_1099 ? "1099" : null, v.crew_size ? `crew of ${v.crew_size}` : null,
        v.service_area ? `works ${v.service_area}` : null, stats.sent ? stats.label : null, `${p.prices.length} price${p.prices.length === 1 ? "" : "s"}`],
      facts: { title: "Vendor", rows: [
        ["Kind", v.subtype ? kindLabel(tax.kinds, v.subtype) : null],
        ["1099", v.is_1099 == null ? null : v.is_1099 ? "Yes — send them a 1099" : "No", v.is_1099 == null ? "— needs migration 129" : undefined],
        ["Website", v.website ? websiteLabel(v.website) : null, "— add it in Edit"],
        ["Trades", (v.trades ?? []).length ? (v.trades ?? []).join(", ") : null, "— add them in Edit"],
        ["Crew", v.crew_size ? `${v.crew_size}` : null],
        ["Bids", stats.sent ? `${stats.label}${stats.speed ? ` · ${stats.speed}` : ""}` : null],
        ["Delivers", v.service_area, v.service_area ? undefined : "— say where, in Edit"],
        ["Prices", p.prices.length ? String(p.prices.length) : null],
        ["Default on", String(p.prices.filter((x) => x.is_default).length), "items budgets price from them"],
        ["Receipts", receipts ? String(receipts) : null],
      ] as Array<[string, string | null, string?]> },
    } : {}),
    note: note ? { text: note, onDismiss: () => setNote(null) } : err && p ? { text: err, onDismiss: () => setErr(null) } : null,
  };

  return (
    <>
      <PersonScreen contactId={id} back={back} extra={extra} onPerson={onPerson} reloadKey={tick} />
      {editing && v && <EditVendor v={v} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setTick((n) => n + 1); }} />}
      <ReceiptImport open={receipt} vendorId={id} onClose={() => setReceipt(false)} onDone={(m) => { setNote(m); setTick((n) => n + 1); }} />
      {composing && v && <BidComposer open onClose={() => setComposing(false)} from={`Started from ${label(v)}`}
        vendors={[{ id, name: v.name, company_name: v.company_name, phone: v.phone, email: v.email, subtype: v.subtype, trades: v.trades }]}
        onDone={(m) => { setNote(m); setTick((n) => n + 1); }} />}
    </>
  );
}

interface BidRec {
  id: string; contact_id: string; name: string; url: string; channel: string; sent_at: string | null; sent_via: string[] | null; opened_at: string | null; view_count: number;
  answered_at: string | null; price_total: number | null; price_lines: PriceLine[] | null; answer_note: string | null; revoked_at: string | null; created_at: string;
}
interface BidReq { id: string; job_id: string; job_title: string | null; price_mode: string; price_by: string | null; scopes: ShownScope[]; created_at: string; recipients: BidRec[] }

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Bid requests to one vendor (V4): do they answer, how fast, what they usually charge, what's open. */
function VendorBids({ rows, stats, jobs, missing, onSend }: { rows: Array<BidRec & { req: BidReq }>; stats: ReturnType<typeof bidStats>; jobs: number; missing: string | null; onSend: () => void }) {
  // Their rates: the newest price per line name and unit from their answers.
  const rates = new Map<string, { name: string; unit: string | null; price: number; at: string }>();
  for (const r of [...rows].filter((x) => x.answered_at && x.price_lines).sort((a, b) => b.answered_at!.localeCompare(a.answered_at!)))
    for (const l of r.price_lines ?? []) {
      const k = `${l.name.toLowerCase()}|${(l.unit ?? "").toLowerCase()}`;
      if (!rates.has(k)) rates.set(k, { name: l.name, unit: l.unit, price: l.price, at: r.answered_at! });
    }
  const stat = (big: string, small: string) => (
    <div className="rounded px-3 py-2" style={{ background: T.card, border: `1px solid ${T.hair}`, flex: "1 1 160px" }}>
      <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700 }}>{big}</div>
      <div style={{ fontSize: F.xs, color: T.ink3 }}>{small}</div>
    </div>
  );
  return (
    <div className="p-4 flex flex-col gap-3" style={{ maxWidth: 900 }}>
      {missing && <div className="rounded px-3 py-2" style={{ fontSize: F.sm, background: T.sunDim, color: T.sun }}>{missing}</div>}
      <div className="flex gap-2 flex-wrap">
        {stat(stats.sent ? `${stats.answered} of ${stats.sent}` : "—", "bid requests answered")}
        {stat(stats.median_hours === null ? "—" : stats.speed!.replace("median ", ""), "median time to a price")}
        {stat(String(jobs), `job${jobs === 1 ? "" : "s"} together`)}
      </div>
      <section className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <h3 style={{ ...panelTitle, flex: 1 }}>Bid requests</h3>
          <button onClick={onSend} className="rounded px-3 py-1.5" style={{ fontSize: F.sm, fontWeight: 600, background: T.hiviz, color: T.onHiviz, cursor: "pointer" }}>+ New bid request</button>
        </div>
        {rows.length === 0 ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>None sent yet. + New bid request starts one to them; you can also send from Vendors (tick several), a job&apos;s Summary or a cost item on the Budget.</div>
          : rows.map((r) => {
            const st = r.revoked_at ? "Link turned off" : r.answered_at ? `Answered ${when(r.answered_at)}${r.sent_at ? ` · in ${hoursLabel((Date.parse(r.answered_at) - Date.parse(r.sent_at)) / 3_600_000)}` : ""}`
              : r.sent_at ? `Sent ${when(r.sent_at)}${r.opened_at ? ` · opened${r.view_count > 1 ? ` ${r.view_count}×` : ""}` : " · not opened"} · no price yet` : "Not sent";
            return (
              <div key={r.id} className="px-3 py-2 flex items-start gap-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/dashboard/scope/${r.req.job_id}/summary?bid=${r.req.id}`} style={{ fontWeight: 600, fontSize: F.sm, color: T.ink }}>{r.req.job_title ?? "Job"}</Link>
                  <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{r.req.scopes.map((s) => `${s.title}${s.size ? ` · ${s.size}` : ""}`).join(" · ")}</div>
                  <div style={{ fontSize: F.xs, color: r.answered_at ? T.green : r.revoked_at ? T.ink3 : T.hivizText }}>{st}</div>
                  {r.answer_note && <div style={{ fontSize: F.xs, color: T.ink2 }}>“{r.answer_note}”</div>}
                </div>
                <span style={{ ...nums, fontSize: F.sm, fontWeight: 600, color: r.price_total !== null ? T.ink : T.ink3 }}>{r.price_total !== null ? money(Number(r.price_total)) : r.price_lines ? "per line" : "—"}</span>
                <a href={r.url} target="_blank" rel="noreferrer" style={{ ...eyebrow, color: T.chalk }}>Link</a>
              </div>
            );
          })}
      </section>
      <section className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="px-3 py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <h3 style={panelTitle}>Their rates</h3>
          <div style={{ fontSize: F.xs, color: T.ink3 }}>From their answers · filled in when you ask for &quot;their rates&quot;</div>
        </div>
        {rates.size === 0 ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>None yet — they show once they price a request line by line.</div>
          : [...rates.values()].slice(0, 30).map((x) => {
            const d = daysAgo(x.at) ?? 0;
            return (
              <div key={`${x.name}|${x.unit}`} className="px-3 py-1.5 flex items-center gap-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                <span style={{ flex: 1, fontSize: F.sm, ...clip }}>{x.name}</span>
                <span style={{ ...nums, fontSize: F.sm }}>{money(x.price)}<span style={{ fontSize: 10, color: T.ink3 }}>/{x.unit ?? "ea"}</span></span>
                <span style={{ ...nums, fontSize: F.xs, width: 64, textAlign: "right", color: d > 90 ? T.red : T.ink3 }}>{d} days</span>
              </div>
            );
          })}
      </section>
    </div>
  );
}

/**
 * Their cost book (Coy, 2026-10-18: "Every vendor has it's own isolated cost book with Cost
 * Groups and Cost items" — chosen "View, by group"): the items they price, under the Price
 * book's own groups, each with their price; ★ the one budgets use (tap to make it so). One
 * catalog, so Compare vendors and default prices still work; their cards are added under it.
 */
function VendorPrices({ p, onDefault }: { p: VPage; onDefault: (pr: Price) => void }) {
  const [q, setQ] = useState("");
  const [cards, setCards] = useState(false);
  const [shut, setShut] = useState<Set<string>>(new Set());
  const s = q.trim().toLowerCase();
  const prices = p.prices.filter((x) => !s || x.item.name.toLowerCase().includes(s) || (x.vendor_sku ?? "").toLowerCase().includes(s) || (x.group ?? "").toLowerCase().includes(s));
  const groups = vendorGroups(prices);
  const flip = (g: string) => setShut((m) => { const n = new Set(m); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const row = (pr: Price) => (
    <div key={pr.id} className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}`, paddingLeft: 22 }}>
      <button onClick={() => { if (!pr.is_default) onDefault(pr); }} aria-label={pr.is_default ? `Default for ${pr.item.name}` : `Make default for ${pr.item.name}`}
        title={pr.is_default ? "Their price is the one budgets use" : "Make theirs the price budgets use"}
        style={{ fontSize: 18, lineHeight: 1, color: pr.is_default ? T.hiviz : T.hair, cursor: pr.is_default ? "default" : "pointer", width: 22 }}>★</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{pr.item.name}</div>
        <div style={{ fontSize: 10, color: T.ink3, ...clip }}>
          {[pr.item.cost_type, pr.vendor_sku ? `#${pr.vendor_sku}` : null, pr.price_as_of ? dateLabel(pr.price_as_of) : null, pr.price_source,
            pr.cheapest_other ? `${pr.cheapest_other.unit_cost < (pr.unit_cost ?? Infinity) ? "cheaper" : "next"}: ${money(pr.cheapest_other.unit_cost)} ${pr.cheapest_other.vendor ?? ""}` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      <span style={{ ...nums, fontSize: F.sm }}>{pr.unit_cost === null ? <span style={{ color: T.hiviz }}>blank</span> : money(pr.unit_cost)}<span style={{ fontSize: 10, color: T.ink3 }}>/{pr.unit ?? pr.item.unit ?? "?"}</span></span>
    </div>
  );
  return (
    <div className="p-4 flex flex-col gap-3">
      <section className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <h3 style={{ ...panelTitle, flex: 1 }}>Their cost book · {p.prices.length} item{p.prices.length === 1 ? "" : "s"} in {vendorGroups(p.prices).length} group{vendorGroups(p.prices).length === 1 ? "" : "s"}</h3>
          {p.prices.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find" aria-label="Find in their cost book" style={{ ...field, width: 160, height: 28 }} />}
          <button onClick={() => setCards((x) => !x)} aria-expanded={cards} className="rounded-full px-3 inline-flex items-center gap-1.5"
            style={{ height: 30, fontSize: F.sm, fontWeight: 700, background: cards ? T.ink : T.hiviz, color: cards ? T.card : T.onHiviz, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,.18)" }}>
            <span aria-hidden style={{ fontSize: 14 }}>{cards ? "×" : "✎"}</span>{cards ? "Done editing" : "Add or edit items"}
          </button>
        </div>
        {cards && <div className="px-3 py-3" style={{ borderBottom: `1px solid ${T.hairSoft}`, background: T.sunk }}><CostCards vendorId={p.vendor.id} vendorName={label(p.vendor)} /></div>}
        {prices.length === 0 ? (
          <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3, lineHeight: 1.5 }}>
            {p.prices.length ? "Nothing matches." : "No prices yet. Add a receipt or quote and Dusty reads their prices; or add them to an item in the Price book."}
          </div>
        ) : groups.map(([g, list]) => (
          <div key={g}>
            <button onClick={() => flip(g)} className="flex items-center gap-2 w-full text-left px-3 py-1.5" aria-expanded={!shut.has(g)}
              style={{ borderTop: `1px solid ${T.hairSoft}`, background: T.sunk, cursor: "pointer" }}>
              <span style={{ fontSize: 10, color: T.ink3, width: 12 }}>{shut.has(g) ? "▸" : "▾"}</span>
              <span style={{ ...eyebrow, flex: 1, color: T.ink2 }}>{g}</span>
              <span style={{ fontSize: 10, color: T.ink3 }}>{list.length}</span>
            </button>
            {!shut.has(g) && list.map(row)}
          </div>
        ))}
        <div className="px-3 py-2" style={{ fontSize: 10, color: T.ink3, borderTop: `1px solid ${T.hairSoft}` }}>
          ★ = their price is the one budgets use for that item. Groups are your Price book&apos;s. <Link href="/dashboard/price-book" style={{ color: T.chalk }}>Price book →</Link>
        </div>
      </section>
    </div>
  );
}

/** A vendor's prices under their Price book groups, A–Z, with no group last. */
function vendorGroups(prices: Price[]): Array<[string, Price[]]> {
  const m = new Map<string, Price[]>();
  for (const pr of prices) {
    const g = pr.group ?? "No group";
    if (!m.has(g)) m.set(g, []);
    m.get(g)!.push(pr);
  }
  return [...m.entries()].sort(([a], [b]) => (a === "No group" ? 1 : b === "No group" ? -1 : a.localeCompare(b)));
}

/**
 * Receipts & quotes filed on them, the page's width (Coy, 2026-10-24: "a new section that shows all the
 * receipts listed and the ability to upload more"), what Dusty read off each, and Import prices from one.
 */
function VendorReceipts({ p, onImport }: { p: VPage; onImport: () => void }) {
  const list = p.files.filter((f) => f.category === "receipt" || f.category === "vendor_quote");
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="p-4">
      <section className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <h3 style={{ ...panelTitle, flex: 1 }}>Receipts &amp; quotes · {list.length}</h3>
          <button onClick={onImport} className="rounded px-3" style={{ height: 30, fontSize: F.sm, fontWeight: 700, background: T.hiviz, color: T.onHiviz, cursor: "pointer" }}>↑ Upload a receipt or quote</button>
        </div>
        {list.length === 0 ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>None yet. Upload a receipt or quote and Dusty reads who it&apos;s from and the prices.</div>
          : list.map((f) => {
            const n = Array.isArray(f.facts?.price_lines) ? (f.facts?.price_lines as unknown[]).length : 0;
            return (
              <div key={f.id} className="px-3 py-2 flex items-center gap-3" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                <span className="rounded px-1.5" style={{ fontSize: 10, fontWeight: 700, background: T.sunk, color: T.ink2, flex: "0 0 auto" }}>{f.category === "receipt" ? "RECEIPT" : "QUOTE"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: F.sm, color: T.ink, display: "block", ...clip }}>{f.name}</a>
                    : <span style={{ fontSize: F.sm, display: "block", ...clip }}>{f.name}</span>}
                  <div style={{ fontSize: 10, color: T.ink3, ...clip }}>{f.read_state === "read" ? (n ? `${n} price line${n === 1 ? "" : "s"}${f.summary ? ` · ${f.summary}` : ""}` : f.summary ?? "read") : f.read_state === "failed" ? "couldn't read" : f.read_state === "skipped" ? "not readable" : "Dusty is reading it…"}</div>
                </div>
                <span style={{ fontSize: 10, color: T.ink3, flex: "0 0 auto" }}>{day(f.created_at)}</span>
              </div>
            );
          })}
        {list.some((f) => Array.isArray(f.facts?.price_lines)) && (
          <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
            <button onClick={onImport} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Import prices from one →</button>
          </div>
        )}
      </section>
    </div>
  );
}

const W9_FORM = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";

/**
 * 1099 and W-9 (Coy, 2026-10-24: "toggle 1099 on/off so I know I need to send them a 1099" and "send a
 * w9 and store access the w9 here … a new folder in the files pages called w9"). The switch is
 * contacts.is_1099; a W-9 is a file on them filed W-9 (Files → W-9); Ask for a W-9 puts the words and
 * the IRS form's link in their thread (or a new email), Coy sends it, and the day is kept. Migration 129.
 */
function VendorTax({ p, onSaved }: { p: VPage; onSaved: (note?: string) => void }) {
  const router = useRouter();
  const v = p.vendor;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const w9s = p.files.filter((f) => f.category === "w9");
  const missing = v.missing ?? null;
  const toggle = async () => {
    setBusy("1099"); setErr(null);
    try { await call(`/api/vendors/${v.id}`, "PATCH", { is_1099: !v.is_1099 }); onSaved(); }
    catch (e) { setErr(String((e as Error).message)); } finally { setBusy(null); }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("w9"); setErr(null);
    try {
      for (const f of Array.from(files)) {
        const made = await call("/api/files", "POST", { name: f.name, mime: f.type, size: f.size, contact_id: v.id, category: "w9" }) as { file: { id: string }; upload: { signed_url: string } };
        await sendBytes(made.upload.signed_url, f, () => {});
        await call(`/api/files/${made.file.id}/done`, "POST");
      }
      onSaved(`W-9 saved on ${label(v)} — it's in Files → W-9 too.`);
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(null); }
  };
  const ask = async (via: "text" | "email") => {
    setBusy(via); setErr(null);
    const first = (v.name ?? "").split(/\s+/)[0] || "there";
    const words = `Hi ${first}, before we pay you for work this year we need a W-9 on file. You can fill out the IRS form here: ${W9_FORM} — send a photo or the PDF back here. Thanks!`;
    try {
      await call(`/api/vendors/${v.id}`, "PATCH", { w9_requested: true }).catch(() => {});
      if (via === "text") {
        window.localStorage.setItem(draftKey(v.id), JSON.stringify({ channel: "text", text: words }));
        router.push(`/dashboard/messages/${v.id}`);
      } else {
        const qs = new URLSearchParams({ contact: v.id, subject: "W-9 for our records", body: words });
        if (v.email) qs.set("to", v.email);
        router.push(`/dashboard/messages/email/new?${qs}`);
      }
    } catch (e) { setErr(String((e as Error).message)); setBusy(null); }
  };
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="p-4 flex flex-col gap-3">
      {missing && <div className="rounded px-3 py-2" style={{ fontSize: F.sm, background: T.sunDim, color: T.sun }}>{missing}</div>}
      {err && <div className="rounded px-3 py-2" style={{ fontSize: F.sm, background: T.redDim, color: T.red }}>{err}</div>}
      <section className="rounded px-3 py-3 flex items-center gap-3" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: F.sm, fontWeight: 700 }}>Send them a 1099</div>
          <div style={{ fontSize: F.xs, color: T.ink3 }}>On for a contractor you pay $600 or more in a year. Dusty and the Vendors list show it.</div>
        </div>
        <button role="switch" aria-checked={!!v.is_1099} aria-label="Send them a 1099" onClick={() => void toggle()} disabled={!!missing || busy === "1099"}
          style={{ width: 46, height: 26, borderRadius: 13, background: v.is_1099 ? T.green : T.hairStrong, position: "relative", cursor: missing ? "default" : "pointer", opacity: missing ? 0.5 : 1, flex: "0 0 auto" }}>
          <span style={{ position: "absolute", top: 3, left: v.is_1099 ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: T.card, transition: "left .15s" }} />
        </button>
      </section>
      <section className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <h3 style={{ ...panelTitle, flex: 1 }}>W-9 · {w9s.length}</h3>
          <button onClick={() => void ask("text")} disabled={!!busy} className="rounded px-3" style={{ height: 30, fontSize: F.sm, fontWeight: 600, border: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>Ask for a W-9 by text</button>
          <button onClick={() => void ask("email")} disabled={!!busy} className="rounded px-3" style={{ height: 30, fontSize: F.sm, fontWeight: 600, border: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>by email</button>
          <label className="rounded px-3 inline-flex items-center" style={{ height: 30, fontSize: F.sm, fontWeight: 700, background: missing ? T.sunk : T.hiviz, color: missing ? T.ink3 : T.onHiviz, cursor: missing ? "default" : "pointer" }}>
            {busy === "w9" ? "Saving…" : "↑ Upload their W-9"}
            <input type="file" accept="application/pdf,image/*" multiple hidden disabled={!!missing || !!busy} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {v.w9_requested_at && <div className="px-3 py-1.5" style={{ fontSize: F.xs, color: T.ink3 }}>Asked for on {day(v.w9_requested_at)}.</div>}
        {w9s.length === 0 ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>No W-9 on file. Ask for one — the words and the IRS form&apos;s link go in their thread for you to send — then upload what they send back.</div>
          : w9s.map((f) => (
            <div key={f.id} className="px-3 py-2 flex items-center gap-3" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
              {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: F.sm, color: T.ink, flex: 1, minWidth: 0, ...clip }}>{f.name}</a>
                : <span style={{ fontSize: F.sm, flex: 1, minWidth: 0, ...clip }}>{f.name}</span>}
              <span style={{ fontSize: 10, color: T.ink3 }}>{day(f.created_at)}</span>
            </div>
          ))}
        <div className="px-3 py-2" style={{ fontSize: 10, color: T.ink3, borderTop: `1px solid ${T.hairSoft}` }}>
          Every vendor&apos;s W-9 is also in <Link href="/dashboard/files?cat=w9" style={{ color: T.chalk }}>Files → W-9</Link>. A W-9 carries their tax number — keep it here, not in a text.
        </div>
      </section>
    </div>
  );
}

function EditVendor({ v, onClose, onSaved }: { v: VRow; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState({ name: v.name ?? "", phone: v.phone ? formatPhone(v.phone) : "", email: v.email ?? "", website: v.website ?? "", address: v.address ?? "", service_area: v.service_area ?? "", subtype: v.subtype ?? "supplier",
    trades: v.trades ?? [], crew_size: v.crew_size ? String(v.crew_size) : "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    // The website goes only when it changed — before migration 105 each save would otherwise add it again as a note.
    const { website, ...rest } = d;
    try { await call(`/api/vendors/${v.id}`, "PATCH", { ...rest, crew_size: d.crew_size.trim() ? Number(d.crew_size) : null, ...(website.trim() !== (v.website ?? "") ? { website } : {}) }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 sc-drawer z-50 flex items-start justify-center" style={{ background: "rgba(0,0,0,.35)", paddingTop: "calc(var(--sc-head) + 12px)" }} onClick={onClose}>
      <div className="rounded p-3 flex flex-col gap-2" style={{ background: T.card, width: "min(460px, calc(100vw - 24px))", maxHeight: "calc(100dvh - var(--sc-head) - 40px)", overflowY: "auto" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit vendor">
        <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, textTransform: "uppercase" }}>Edit vendor</div>
        {([["name", "Name"], ["phone", "Phone"], ["email", "Email"], ["website", "Website"], ["address", "Address"], ["service_area", "Where they deliver"]] as const).map(([k, l]) => (
          <label key={k} className="block"><span style={eyebrow}>{l}</span>
            <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} style={field} aria-label={l} /></label>
        ))}
        <label className="block"><span style={eyebrow}>Kind</span>
          <KindSelect value={d.subtype} onChange={(subtype) => setD({ ...d, subtype })} /></label>
        <TradePicker value={d.trades} kind={d.subtype} onChange={(trades) => setD({ ...d, trades })} />
        <label className="block"><span style={eyebrow}>Crew size</span>
          <input value={d.crew_size} onChange={(e) => setD({ ...d, crew_size: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" style={{ ...field, width: 100 }} aria-label="Crew size" /></label>
        <div style={{ fontSize: 10, color: T.ink3 }}>Distance to a job comes later — for now, say where they deliver.</div>
        {err && <div style={{ fontSize: F.sm, color: T.red }}>{err}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} style={btn(false)}>Cancel</button>
          <button onClick={() => void save()} disabled={busy} style={{ ...btn(true), opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
