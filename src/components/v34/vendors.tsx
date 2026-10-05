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
import { useRouter, useSearchParams } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, money, formatPhone } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { call, dateLabel, CostCards } from "@/components/v34/cost-cards";
import { PersonScreen, type Person, type RecordExtras } from "@/components/v34/person-view";
import { Empty, panelTitle } from "@/components/v34/record-page";
import { ReceiptImport } from "@/components/v34/receipt-import";
import { PENDING_VENDOR_KEY } from "@/components/v34/org-settings";

interface VRow {
  id: string; name: string | null; company_name: string | null; subtype: string | null; phone: string | null; email: string | null;
  address: string | null; service_area: string | null; auto: boolean; items: number; defaults: number; newest_price: string | null; files: number;
}
const SUBTYPES: Array<[string, string]> = [["all", "All"], ["supplier", "Suppliers"], ["subcontractor", "Subs"], ["equipment", "Equipment"]];
const SUB_LABEL: Record<string, string> = { supplier: "Supplier", subcontractor: "Sub", equipment: "Equipment", looking_for_work: "Looking for work", lead_gen: "Lead gen" };
const label = (v: { name: string | null; company_name?: string | null; phone: string | null }) => v.name || v.company_name || formatPhone(v.phone);

const btn = (primary: boolean): React.CSSProperties => ({ height: 36, padding: "0 12px", borderRadius: 4, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
  letterSpacing: ".06em", background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer", whiteSpace: "nowrap" });
const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 8px", minWidth: 0, width: "100%" };

export function VendorList() {
  const [rows, setRows] = useState<VRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sub, setSub] = useState("all");
  const [adding, setAdding] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const [tick, setTick] = useState(0);
  const [measure, wide] = useWide<HTMLDivElement>(900);
  // ?receipt=1 — Dusty's + menu → Add a receipt.
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off && new URLSearchParams(window.location.search).get("receipt") === "1") setReceipt(true); });
    // Already on this page: the menu says so with an event.
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === "receipt") setReceipt(true); };
    window.addEventListener("sc:create", on);
    return () => { off = true; window.removeEventListener("sc:create", on); };
  }, []);

  useEffect(() => {
    let off = false;
    call("/api/vendors", "GET").then((b) => { if (!off) { setRows(b.vendors as VRow[]); setErr(null); } })
      .catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    return () => { off = true; };
  }, [tick]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((v) => (sub === "all" || v.subtype === sub) &&
      (!s || [v.name, v.company_name, v.service_area, v.address, v.email, v.phone].some((x) => (x ?? "").toLowerCase().includes(s))));
  }, [rows, q, sub]);

  return (
    <div ref={measure} className="px-3 py-3 mx-auto" style={{ maxWidth: 1180 }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".02em", flex: 1, minWidth: 140 }}>Vendors</h1>
        <button onClick={() => setAdding(true)} style={btn(false)}>+ Vendor</button>
        <button onClick={() => setReceipt(true)} style={btn(true)}>+ Add a receipt or quote</button>
      </div>
      {err && <div className="mb-2 rounded px-3 py-2" style={{ fontSize: F.sm, color: T.red, background: T.redDim }}>{err}</div>}
      {note && <div className="mb-2 rounded px-3 py-2 flex gap-2" style={{ fontSize: F.sm, background: T.greenDim }}><span style={{ flex: 1 }}>{note}</span><button onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      <div className="flex gap-2 flex-wrap items-center mb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a vendor, area, email…" aria-label="Find a vendor" style={{ ...field, maxWidth: 320 }} />
        <div className="flex gap-1" role="tablist" aria-label="Kind">
          {SUBTYPES.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className="rounded px-2.5"
              style={{ height: 30, background: sub === k ? T.ink : T.card, color: sub === k ? T.card : T.ink2, border: `1px solid ${sub === k ? T.ink : T.hair}`,
                fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      {rows === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>
        : shown.length === 0 ? (
          <div className="rounded px-3 py-4" style={{ background: T.card, fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
            {rows.length ? "No vendor matches." : "No vendors yet. Add a receipt or quote and Dusty will read who it's from — or file someone as a vendor on Threads."}
          </div>
        ) : wide ? (
          <table className="w-full" style={{ borderCollapse: "collapse", fontSize: F.sm, background: T.card }}>
            <thead><tr style={{ background: T.slab }}>
              {["Vendor", "Kind", "Where they deliver", "Phone", "Prices", "Default on", "Newest price", "Receipts"].map((h) => (
                <th key={h} style={{ ...eyebrow, textAlign: ["Prices", "Default on", "Receipts"].includes(h) ? "right" : "left", padding: "6px 8px", borderBottom: `1px solid ${T.hair}` }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.id} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                  <td style={{ padding: "6px 8px", maxWidth: 260 }}>
                    <Link href={`/dashboard/vendors/${v.id}`} style={{ fontWeight: 600, color: T.ink, ...clip, display: "block" }}>{label(v)}</Link>
                    {v.address && <span style={{ display: "block", fontSize: 10, color: T.ink3, ...clip }}>{v.address}</span>}
                  </td>
                  <td style={{ padding: "6px 8px", color: T.ink2 }}>{v.subtype ? SUB_LABEL[v.subtype] ?? v.subtype : "—"}{v.auto ? <span style={{ fontSize: 10, color: T.ink3 }}> · auto</span> : null}</td>
                  <td style={{ padding: "6px 8px", color: v.service_area ? T.ink : T.ink3, maxWidth: 220, ...clip }}>{v.service_area ?? "—"}</td>
                  <td style={{ padding: "6px 8px", ...nums }}>{v.phone ? formatPhone(v.phone) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", ...nums }}>{v.items || "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", ...nums }}>{v.defaults || "—"}</td>
                  <td style={{ padding: "6px 8px", ...nums, color: T.ink2 }}>{dateLabel(v.newest_price) ?? "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", ...nums }}>{v.files || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col" style={{ background: T.card }}>
            {shown.map((v) => (
              <Link key={v.id} href={`/dashboard/vendors/${v.id}`} className="px-3 py-2 block" style={{ borderTop: `1px solid ${T.hairSoft}`, color: T.ink }}>
                <div className="flex items-baseline gap-2">
                  <span style={{ fontWeight: 600, fontSize: F.sm, flex: 1, minWidth: 0, ...clip }}>{label(v)}</span>
                  <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{v.items ? `${v.items} price${v.items === 1 ? "" : "s"}` : "no prices"}</span>
                </div>
                <div style={{ fontSize: 10, color: T.ink3, ...clip }}>
                  {[v.subtype ? SUB_LABEL[v.subtype] ?? v.subtype : null, v.service_area, v.newest_price ? `newest ${dateLabel(v.newest_price)}` : null, v.files ? `${v.files} receipt${v.files === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "—"}
                </div>
              </Link>
            ))}
          </div>
        )}

      {adding && <NewVendor onClose={() => setAdding(false)} onMade={(id) => { setAdding(false); window.location.href = `/dashboard/vendors/${id}`; }} />}
      <ReceiptImport open={receipt} onClose={() => setReceipt(false)} onDone={(m) => { setNote(m); setTick((n) => n + 1); }} />
    </div>
  );
}

function NewVendor({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [d, setD] = useState({ name: "", subtype: "supplier", phone: "", email: "", address: "", service_area: "" });
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
      <div className="rounded p-3 flex flex-col gap-2" style={{ background: T.card, width: "min(460px, calc(100vw - 24px))" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New vendor">
        <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, textTransform: "uppercase" }}>New vendor</div>
        {([["name", "Name"], ["phone", "Phone (optional)"], ["email", "Email"], ["address", "Address"], ["service_area", "Where they deliver"]] as const).map(([k, l]) => (
          <label key={k} className="block"><span style={eyebrow}>{l}</span>
            <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} style={field} aria-label={l} /></label>
        ))}
        <label className="block"><span style={eyebrow}>Kind</span>
          <select value={d.subtype} onChange={(e) => setD({ ...d, subtype: e.target.value })} style={field} aria-label="Kind">
            <option value="supplier">Supplier</option><option value="equipment">Equipment rental</option><option value="subcontractor">Subcontractor</option>
          </select></label>
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
  item: { id: string; name: string; unit: string | null; cost_type: string };
}
interface VFile { id: string; name: string; category: string | null; read_state: string | null; summary: string | null; created_at: string; url: string | null; facts: Record<string, unknown> | null }
interface VPage {
  vendor: VRow & { contact_type: string; status_summary: string | null };
  prices: Price[]; files: VFile[]; jobs: Array<{ id: string; title: string | null; status: string; address: string | null; role: string | null }>; messages: number;
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
  const search = useSearchParams();
  const [p, setP] = useState<VPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [receipt, setReceipt] = useState(false);

  useEffect(() => {
    let off = false;
    call(`/api/vendors/${id}`, "GET").then((b) => { if (!off) { setP(b as VPage); setErr(null); } })
      .catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
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

  const t = search.get("t");
  const back = search.get("from") === "threads"
    ? { href: `/dashboard/messages/${id}${t ? `?t=${encodeURIComponent(t)}` : ""}`, label: "Back to the thread" }
    : { href: "/dashboard/vendors", label: "Vendors" };
  const v = p?.vendor;
  const receipts = p ? p.files.filter((f) => f.category === "receipt" || f.category === "vendor_quote").length : 0;
  const extra: RecordExtras = {
    tabs: [
      { key: "prices", label: `Prices ${p?.prices.length ?? ""}`.trim(), render: () => p ? <VendorPrices p={p} onDefault={(pr) => void makeDefault(pr)} /> : <Empty text={err ?? "Loading…"} /> },
      { key: "receipts", label: `Receipts & quotes ${p ? receipts : ""}`.trim(), render: () => p ? <VendorReceipts p={p} onImport={() => setReceipt(true)} /> : <Empty text={err ?? "Loading…"} /> },
    ],
    actions: [
      { label: "+ Receipt or quote", primary: true, onClick: () => setReceipt(true) },
      { label: "App access", onClick: () => {
        // Settings → People opens with this vendor picked for an invite (081).
        try { sessionStorage.setItem(PENDING_VENDOR_KEY, JSON.stringify({ contact_id: id, email: v?.email ?? null })); } catch {}
        window.dispatchEvent(new Event("sc:open-settings"));
      } },
    ],
    onEdit: () => setEditing(true),
    ...(v && p ? {
      address: v.address,
      meta: [v.subtype ? SUB_LABEL[v.subtype] ?? v.subtype : "Vendor", v.service_area ? `delivers ${v.service_area}` : null,
        `${p.prices.length} price${p.prices.length === 1 ? "" : "s"}`],
      facts: { title: "Vendor", rows: [
        ["Kind", v.subtype ? SUB_LABEL[v.subtype] ?? v.subtype : null],
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
    </>
  );
}

/** Prices: theirs on each item, ★ the one budgets use (tap to make it so); their cards under it. */
function VendorPrices({ p, onDefault }: { p: VPage; onDefault: (pr: Price) => void }) {
  const [q, setQ] = useState("");
  const [cards, setCards] = useState(false);
  const s = q.trim().toLowerCase();
  const prices = p.prices.filter((x) => !s || x.item.name.toLowerCase().includes(s) || (x.vendor_sku ?? "").toLowerCase().includes(s));
  return (
    <div className="p-4 flex flex-col gap-3" style={{ maxWidth: 900 }}>
      <section className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <h3 style={{ ...panelTitle, flex: 1 }}>Prices</h3>
          {p.prices.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find" aria-label="Find a price" style={{ ...field, width: 160, height: 28 }} />}
        </div>
        {prices.length === 0 ? (
          <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3, lineHeight: 1.5 }}>
            {p.prices.length ? "Nothing matches." : "No prices yet. Add a receipt or quote and Dusty reads their prices; or add them to an item in the Price book."}
          </div>
        ) : prices.map((pr) => (
          <div key={pr.id} className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
            <button onClick={() => { if (!pr.is_default) onDefault(pr); }} aria-label={pr.is_default ? `Default for ${pr.item.name}` : `Make default for ${pr.item.name}`}
              title={pr.is_default ? "Their price is the one budgets use" : "Make theirs the price budgets use"}
              style={{ fontSize: 18, lineHeight: 1, color: pr.is_default ? T.hiviz : T.hair, cursor: pr.is_default ? "default" : "pointer", width: 22 }}>★</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{pr.item.name}</div>
              <div style={{ fontSize: 10, color: T.ink3, ...clip }}>
                {[pr.vendor_sku ? `#${pr.vendor_sku}` : null, pr.price_as_of ? dateLabel(pr.price_as_of) : null, pr.price_source,
                  pr.cheapest_other ? `${pr.cheapest_other.unit_cost < (pr.unit_cost ?? Infinity) ? "cheaper" : "next"}: ${money(pr.cheapest_other.unit_cost)} ${pr.cheapest_other.vendor ?? ""}` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span style={{ ...nums, fontSize: F.sm }}>{pr.unit_cost === null ? <span style={{ color: T.hiviz }}>blank</span> : money(pr.unit_cost)}<span style={{ fontSize: 10, color: T.ink3 }}>/{pr.unit ?? pr.item.unit ?? "?"}</span></span>
          </div>
        ))}
        <div className="px-3 py-2" style={{ fontSize: 10, color: T.ink3, borderTop: `1px solid ${T.hairSoft}` }}>
          ★ = their price is the one budgets use for that item. <Link href="/dashboard/price-book" style={{ color: T.chalk }}>Price book →</Link>
        </div>
      </section>
      <div>
        <button onClick={() => setCards((x) => !x)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>{cards ? "▾" : "▸"} Cards with them as vendor — edit or add</button>
        {cards && <div className="mt-2"><CostCards vendorId={p.vendor.id} vendorName={label(p.vendor)} /></div>}
      </div>
    </div>
  );
}

/** Receipts & quotes filed on them, what Dusty read off each, and Import prices from one. */
function VendorReceipts({ p, onImport }: { p: VPage; onImport: () => void }) {
  return (
    <div className="p-4" style={{ maxWidth: 900 }}>
      <section className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <h3 style={{ ...panelTitle, flex: 1 }}>Receipts &amp; quotes</h3>
          <button onClick={onImport} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>+ Receipt or quote</button>
        </div>
        {p.files.length === 0 ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>None yet. Add a receipt or quote and Dusty reads who it&apos;s from and the prices.</div>
          : p.files.slice(0, 20).map((f) => {
            const n = Array.isArray(f.facts?.price_lines) ? (f.facts?.price_lines as unknown[]).length : 0;
            return (
              <div key={f.id} className="px-3 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                <div className="flex items-baseline gap-2">
                  {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: F.sm, color: T.ink, flex: 1, minWidth: 0, ...clip }}>{f.name}</a>
                    : <span style={{ fontSize: F.sm, flex: 1, minWidth: 0, ...clip }}>{f.name}</span>}
                  <span style={{ fontSize: 10, color: T.ink3 }}>{new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
                <div style={{ fontSize: 10, color: T.ink3, ...clip }}>{f.read_state === "read" ? (n ? `${n} price line${n === 1 ? "" : "s"}` : f.summary ?? "read") : f.read_state === "failed" ? "couldn't read" : f.read_state === "skipped" ? "not readable" : "reading…"}</div>
              </div>
            );
          })}
        {p.files.some((f) => Array.isArray(f.facts?.price_lines)) && (
          <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
            <button onClick={onImport} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Import prices from one →</button>
          </div>
        )}
      </section>
    </div>
  );
}

function EditVendor({ v, onClose, onSaved }: { v: VRow; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState({ name: v.name ?? "", phone: v.phone ? formatPhone(v.phone) : "", email: v.email ?? "", address: v.address ?? "", service_area: v.service_area ?? "", subtype: v.subtype ?? "supplier" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await call(`/api/vendors/${v.id}`, "PATCH", d); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 sc-drawer z-50 flex items-start justify-center" style={{ background: "rgba(0,0,0,.35)", paddingTop: "calc(var(--sc-head) + 12px)" }} onClick={onClose}>
      <div className="rounded p-3 flex flex-col gap-2" style={{ background: T.card, width: "min(460px, calc(100vw - 24px))" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit vendor">
        <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, textTransform: "uppercase" }}>Edit vendor</div>
        {([["name", "Name"], ["phone", "Phone"], ["email", "Email"], ["address", "Address"], ["service_area", "Where they deliver"]] as const).map(([k, l]) => (
          <label key={k} className="block"><span style={eyebrow}>{l}</span>
            <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} style={field} aria-label={l} /></label>
        ))}
        <label className="block"><span style={eyebrow}>Kind</span>
          <select value={d.subtype} onChange={(e) => setD({ ...d, subtype: e.target.value })} style={field} aria-label="Kind">
            <option value="supplier">Supplier</option><option value="equipment">Equipment rental</option><option value="subcontractor">Subcontractor</option>
            <option value="looking_for_work">Looking for work</option>
          </select></label>
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
