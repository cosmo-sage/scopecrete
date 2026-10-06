"use client";

/**
 * The Customers list (migration 055): one row per customer — a household, a
 * school, a business — not per person. Art Apartments is one row however many
 * of its people call. Filed by Coy, or by Dusty on an earned streak ("auto").
 *
 * Coy, 2026-10-01: filters like the Vendors page, a New customer button, a
 * table sorted by any column with columns he can turn on and off, other
 * views — and no unnamed customers (a number with no name is not a customer;
 * since 2026-10-06 the list doesn't count them — Coy: "this informational row
 * can be removed completely"; they are named from Threads).
 *
 * Views: Table (wide), Cards (the phone's), Board (by the Jobs board's stage).
 * The view, sort and columns are saved to the account (`customers_view`).
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, clip, relTime, nums, formatPhone } from "@/lib/v34/tokens";
import { useWide } from "@/lib/v34/use-wide";
import { PageHeader, SearchBubble, SearchToggle } from "@/components/v34/primitives";
import { usePref } from "@/lib/v34/prefs";
import { STAGES } from "@/lib/jobs/stages";

interface Row {
  id: string; name: string; customer_type: string | null; status: string | null; address: string | null; city: string | null; state: string | null; zip: string | null;
  contacts: number; jobs: number; stages: string[]; first_at: string | null; last_at: string | null; summary: string | null; recent: string | null;
  person: string | null; phone: string | null; email: string | null; lead_source: string | null; since: string | null; auto: boolean;
}
const TYPE: Record<string, string> = { residential: "Residential", commercial: "Commercial", public: "Government" };
const TYPES: Array<[string, string]> = [["all", "All"], ["residential", "Residential"], ["commercial", "Commercial"], ["public", "Government"], ["none", "Type?"]];
const STAGE_CHIPS: Array<[string, string]> = [["any", "Any stage"], ...STAGES.map((s) => [s.k, s.label] as [string, string]), ["nojob", "No job"]];
const SOURCE: Record<string, string> = { website: "Website", referral: "Referral", gc_invite: "GC invite", lead_gen: "Lead gen", repeat: "Repeat", direct: "Direct", other: "Other" };

type Col = { k: string; label: string; get: (r: Row) => string | number | null; show?: (r: Row) => React.ReactNode; right?: boolean; w?: number };
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : null);
const COLS: Col[] = [
  { k: "type", label: "Type", get: (r) => (r.customer_type ? TYPE[r.customer_type] : null), w: 100 },
  { k: "stage", label: "Stage", get: (r) => (r.stages.length ? STAGES.filter((s) => r.stages.includes(s.k)).map((s) => s.label).join(", ") : null), w: 120 },
  { k: "summary", label: "Last communication", get: (r) => r.summary, w: 320 },
  { k: "recent", label: "Recent conversations", get: (r) => r.recent, w: 360 },
  { k: "last", label: "Last contact", get: (r) => r.last_at, show: (r) => (r.last_at ? `${relTime(r.last_at)} ago` : null), w: 100 },
  { k: "first", label: "First contact", get: (r) => r.first_at, show: (r) => date(r.first_at), w: 100 },
  { k: "person", label: "Contact", get: (r) => r.person, w: 140 },
  { k: "phone", label: "Phone", get: (r) => r.phone, show: (r) => (r.phone ? formatPhone(r.phone) : null), w: 120 },
  { k: "email", label: "Email", get: (r) => r.email, w: 180 },
  { k: "address", label: "Address", get: (r) => r.address, w: 220 },
  { k: "city", label: "City", get: (r) => r.city, w: 110 },
  { k: "state", label: "State", get: (r) => r.state, w: 60 },
  { k: "zip", label: "Zip", get: (r) => r.zip, w: 70 },
  { k: "contacts", label: "Contacts", get: (r) => r.contacts, right: true, w: 70 },
  { k: "jobs", label: "Jobs", get: (r) => r.jobs, right: true, w: 60 },
  { k: "source", label: "Source", get: (r) => (r.lead_source ? SOURCE[r.lead_source] ?? r.lead_source : null), w: 90 },
  { k: "since", label: "Customer since", get: (r) => r.since, show: (r) => date(r.since), w: 100 },
];
const COL = new Map(COLS.map((c) => [c.k, c]));
interface View { view: "table" | "cards" | "board"; sort: string; dir: 1 | -1; cols: string[] }
const DEFAULT_VIEW: View = { view: "table", sort: "last", dir: -1, cols: ["type", "stage", "summary", "last", "first", "phone", "city", "state", "jobs"] };

const btn = (primary: boolean): React.CSSProperties => ({ height: 34, padding: "0 12px", borderRadius: 4, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
  letterSpacing: ".06em", background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer", whiteSpace: "nowrap" });
const chip = (on: boolean): React.CSSProperties => ({ height: 28, padding: "0 10px", borderRadius: 4, background: on ? T.ink : T.card, color: on ? T.card : T.ink2,
  border: `1px solid ${on ? T.ink : T.hair}`, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer", whiteSpace: "nowrap" });
const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontSize: F.sm, borderRadius: 4, padding: "0 8px", minWidth: 0, width: "100%" };

export function Customers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [finding, setFinding] = useState(false);
  const [type, setType] = useState("all");
  const [stage, setStage] = useState("any");
  const [adding, setAdding] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [saved, setSaved] = usePref<View>("customers_view", DEFAULT_VIEW);
  const v: View = { ...DEFAULT_VIEW, ...saved, cols: (saved?.cols ?? DEFAULT_VIEW.cols).filter((k) => COL.has(k)) };
  const [measure, wide] = useWide<HTMLDivElement>(900);
  // The table needs room; on a phone the cards are the table.
  const view = !wide && v.view === "table" ? "cards" : v.view;

  // ?new=1 — Dusty's + menu → New customer.
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off && new URLSearchParams(window.location.search).get("new") === "1") setAdding(true); });
    // Already on this page: the menu says so with an event.
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === "customer") setAdding(true); };
    window.addEventListener("sc:create", on);
    return () => { off = true; window.removeEventListener("sc:create", on); };
  }, []);
  useEffect(() => {
    let off = false;
    fetch("/api/customers").then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) { setRows(b.customers as Row[]); } })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) =>
      (type === "all" || (type === "none" ? !r.customer_type : r.customer_type === type)) &&
      (stage === "any" || (stage === "nojob" ? r.jobs === 0 : r.stages.includes(stage))) &&
      (!t || [r.name, r.person, r.address, r.city, r.email, r.phone, r.summary, r.recent].some((x) => (x ?? "").toLowerCase().includes(t))));
    const get = (r: Row) => (v.sort === "name" ? r.name.toLowerCase() : COL.get(v.sort)?.get(r) ?? null);
    return [...list].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1; // blanks last, whichever way
      if (y === null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * v.dir;
    });
  }, [rows, q, type, stage, v.sort, v.dir]);

  const set = (p: Partial<View>) => setSaved({ ...v, ...p });
  const sortBy = (k: string) => set(v.sort === k ? { dir: v.dir === 1 ? -1 : 1 } : { sort: k, dir: k === "last" || k === "first" || k === "since" || k === "jobs" ? -1 : 1 });
  const arrow = (k: string) => (v.sort === k ? (v.dir === 1 ? " ▲" : " ▼") : "");
  const counts = (k: string) => (rows ?? []).filter((r) => (k === "none" ? !r.customer_type : r.customer_type === k)).length;

  // On a phone the type chips and the stage are drop-downs on the sort's row (Coy, 2026-10-06:
  // "a more symmetrical user interface" — "put this drop down menu on the same row as the sort").
  const sel: React.CSSProperties = { ...field, width: "auto", height: 26, fontSize: F.xs, flex: wide ? undefined : "1 1 0" };
  const stageSelect = (
    <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Job stage" style={wide ? { ...field, width: "auto", height: 28, fontSize: F.xs } : sel}>
      {STAGE_CHIPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  const typeSelect = (
    <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" style={sel}>
      {TYPES.map(([k, l]) => (k === "all" || counts(k) > 0) && <option key={k} value={k}>{k === "all" ? "All types" : `${l}${rows ? ` ${counts(k)}` : ""}`}</option>)}
    </select>
  );
  const viewTabs = (
    <div className="flex gap-1" role="tablist" aria-label="View">
      {([["table", "Table"], ["cards", "Cards"], ["board", "Board"]] as const).filter(([k]) => wide || k !== "table").map(([k, l]) => (
        <button key={k} role="tab" aria-selected={view === k} onClick={() => set({ view: k })} style={chip(view === k)}>{l}</button>
      ))}
    </div>
  );
  const sortControls = (
    <>
      <select value={v.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort by" style={sel}>
        <option value="name">Name</option>
        {COLS.filter((c) => ["last", "first", "type", "jobs", "city", "since"].includes(c.k)).map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
      </select>
      <button onClick={() => set({ dir: v.dir === 1 ? -1 : 1 })} aria-label="Reverse the order" style={{ ...chip(false), height: 26, flex: "none" }}>{v.dir === 1 ? "▲" : "▼"}</button>
    </>
  );

  return (
    <>
    <PageHeader title="Customers" count={rows ? rows.length : null} width={view === "table" ? 1376 : 976}
      sub="Everyone you do the work for — homeowners, companies and public bodies — with their people and their jobs."
      actions={<>
        {!wide && viewTabs}
        <SearchToggle open={finding || !!q} onToggle={() => { if (finding || q) { setQ(""); setFinding(false); } else setFinding(true); }} label="Find a customer" />
        <button onClick={() => setAdding(true)} className="sc-new-btn" style={btn(true)}>+ New customer</button>
      </>}>
      {(finding || q) && <div className="mt-2"><SearchBubble value={q} onChange={setQ} onClose={() => setFinding(false)} placeholder="Find a name, address, phone, what was said…" /></div>}
    </PageHeader>
    <div ref={measure} className="mx-auto" style={{ maxWidth: view === "table" ? 1400 : 1000, padding: "0 12px 24px" }}>

      <div className="flex gap-2 flex-wrap items-center mb-2">
        {wide ? (
          <>
            <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Type">
              {TYPES.map(([k, l]) => (k === "all" || counts(k) > 0) && (
                <button key={k} role="tab" aria-selected={type === k} onClick={() => setType(k)} style={chip(type === k)}>
                  {l}{k !== "all" && rows ? ` ${counts(k)}` : ""}
                </button>
              ))}
            </div>
            {stageSelect}
          </>
        ) : null}
        {wide && <span className="flex-1" />}
        {wide && viewTabs}
        {view === "table" && (
          <div className="relative">
            <button onClick={() => setColsOpen((o) => !o)} aria-expanded={colsOpen} style={chip(colsOpen)}>Columns ▾</button>
            {colsOpen && <button aria-label="Close columns" onClick={() => setColsOpen(false)} className="fixed inset-0 z-20" style={{ cursor: "default" }} />}
            {colsOpen && (
              <div className="absolute right-0 z-30 mt-1 rounded p-2 flex flex-col" style={{ background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 8px 24px rgba(0,0,0,.14)", width: 220 }}>
                {COLS.map((c) => (
                  <label key={c.k} className="flex items-center gap-2 py-1" style={{ fontSize: F.sm, cursor: "pointer" }}>
                    <input type="checkbox" checked={v.cols.includes(c.k)} style={{ accentColor: T.hiviz }}
                      onChange={(e) => set({ cols: e.target.checked ? COLS.map((x) => x.k).filter((k) => k === c.k || v.cols.includes(k)) : v.cols.filter((k) => k !== c.k) })} />
                    {c.label}
                  </label>
                ))}
                <button onClick={() => set({ cols: DEFAULT_VIEW.cols })} className="mt-1 text-left" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Back to the default</button>
              </div>
            )}
          </div>
        )}
      </div>

      {!wide && (
        <div className="flex gap-1 items-center mb-2">
          {typeSelect}
          {stageSelect}
          {view === "cards" && sortControls}
        </div>
      )}

      {err && <div role="alert" style={{ color: T.red, fontSize: F.sm, marginTop: 8 }}>Couldn&apos;t load customers: {err}</div>}
      {rows === null && !err && <div className="animate-pulse rounded" style={{ height: 80, background: T.hairSoft }} />}
      {rows !== null && shown.length === 0 && (
        <div className="rounded px-3 py-4" style={{ background: T.card, fontSize: F.sm, color: T.ink3 }}>
          {rows.length ? "Nothing matches." : "No customers yet — + New customer, or file someone as Customer in Threads."}
        </div>
      )}

      {shown.length > 0 && view === "table" && (
        <div className="overflow-x-auto rounded" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
          <table style={{ borderCollapse: "collapse", fontSize: F.sm, width: "100%", minWidth: 600 }}>
            <thead><tr style={{ background: T.slab }}>
              <th onClick={() => sortBy("name")} style={{ ...eyebrow, textAlign: "left", padding: "6px 8px", cursor: "pointer", position: "sticky", left: 0, background: T.slab, minWidth: 180 }}>Customer{arrow("name")}</th>
              {v.cols.map((k) => { const c = COL.get(k)!; return (
                <th key={k} onClick={() => sortBy(k)} style={{ ...eyebrow, textAlign: c.right ? "right" : "left", padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>{c.label}{arrow(k)}</th>
              ); })}
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                  <td style={{ padding: "6px 8px", position: "sticky", left: 0, background: T.card, maxWidth: 240 }}>
                    <Link href={`/dashboard/customers/${r.id}`} style={{ fontWeight: 600, color: T.ink, display: "block", ...clip }}>{r.name}</Link>
                    {(r.person || r.auto) && <span style={{ display: "block", fontSize: 10, color: T.ink3, ...clip }}>{[r.person, r.auto ? "auto" : null].filter(Boolean).join(" · ")}</span>}
                  </td>
                  {v.cols.map((k) => { const c = COL.get(k)!; const val = c.show ? c.show(r) : c.get(r); return (
                    <td key={k} title={typeof c.get(r) === "string" ? String(c.get(r)) : undefined}
                      style={{ padding: "6px 8px", textAlign: c.right ? "right" : "left", color: val === null || val === "" ? T.ink3 : T.ink2, maxWidth: c.w, ...clip, ...(c.right ? nums : {}) }}>
                      {val === null || val === "" ? "—" : val}
                    </td>
                  ); })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && view === "cards" && (
        <div className="rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          {wide && (
            <div className="flex gap-1 px-3 py-1.5 items-center" style={{ background: T.slab, fontSize: F.xs }}>
              <span style={{ ...eyebrow }}>Sort</span>
              {sortControls}
            </div>
          )}
          {shown.map((r) => <Card key={r.id} r={r} />)}
        </div>
      )}

      {shown.length > 0 && view === "board" && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[...STAGES.map((s) => [s.k, s.label] as [string, string]), ["nojob", "No job"] as [string, string]].map(([k, l]) => {
            const col = shown.filter((r) => (k === "nojob" ? r.jobs === 0 : r.stages.includes(k)));
            return (
              <div key={k} className="shrink-0 rounded" style={{ width: 260, background: T.sunk, border: `1px solid ${T.hair}` }}>
                <div className="px-2 py-1.5" style={{ ...eyebrow, color: T.ink }}>{l} · {col.length}</div>
                <div className="flex flex-col gap-1 px-1 pb-1">
                  {col.map((r) => <div key={r.id} className="rounded" style={{ background: T.card, border: `1px solid ${T.hairSoft}` }}><Card r={r} compact /></div>)}
                  {!col.length && <div className="px-2 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>None</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <NewCustomer onClose={() => setAdding(false)} onMade={(id) => { setAdding(false); window.location.href = `/dashboard/customers/${id}`; }} />}
    </div>
    </>
  );
}

function Card({ r, compact }: { r: Row; compact?: boolean }) {
  return (
    <Link href={`/dashboard/customers/${r.id}`} className="block px-3 py-2" style={{ borderTop: compact ? "none" : `1px solid ${T.hairSoft}`, color: T.ink }}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontWeight: 600, fontSize: F.sm, flex: 1, minWidth: 0, ...clip }}>{r.name}</span>
        {r.auto && <span style={{ ...eyebrow, fontSize: 9, color: T.ink3 }}>auto</span>}
        {r.customer_type && !compact && <span style={{ fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".08em", color: T.ink3 }}>{TYPE[r.customer_type]}</span>}
        <span style={{ fontSize: F.xs, color: T.ink3 }}>{r.last_at ? relTime(r.last_at) : ""}</span>
      </div>
      <div style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
        {[r.person, [r.city, r.state].filter(Boolean).join(", ") || r.address, `${r.jobs} job${r.jobs === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
      </div>
      {r.summary && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{r.summary}</div>}
    </Link>
  );
}

/** + New customer — the list's button and Dusty's + menu. Coy's tap; nothing is made without it. */
export function NewCustomer({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [d, setD] = useState({ name: "", customer_type: "residential", person: "", phone: "", email: "", address: "", city: "", state: "LA", zip: "" });
  const [err, setErr] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string | null; customer_id: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const company = d.customer_type !== "residential";
  const save = async () => {
    setBusy(true); setErr(null); setExisting(null);
    try {
      const r = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const b = await r.json().catch(() => ({}));
      if (r.status === 409 && b.existing) { setExisting(b.existing); setErr(b.error); return; }
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      onMade(b.customer.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const input = (k: keyof typeof d, l: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block"><span style={eyebrow}>{l}</span>
      <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} style={field} aria-label={l} {...extra} /></label>
  );
  return (
    <div className="fixed inset-0 sc-drawer z-[70] flex items-start justify-center overflow-y-auto" style={{ background: "rgba(0,0,0,.35)", padding: "12px" }} onClick={onClose}>
      <div className="rounded p-3 flex flex-col gap-2 mt-[var(--sc-head)] lg:mt-3" style={{ background: T.card, color: T.ink, width: "min(480px, 100%)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New customer">
        <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, textTransform: "uppercase" }}>New customer</div>
        <div className="flex gap-1">
          {(["residential", "commercial", "public"] as const).map((t) => (
            <button key={t} onClick={() => setD({ ...d, customer_type: t })} aria-pressed={d.customer_type === t} style={chip(d.customer_type === t)}>{TYPE[t]}</button>
          ))}
        </div>
        {input("name", company ? "Business, school or agency" : "Household (e.g. Maurice Watkins)", { autoFocus: true })}
        {input("person", company ? "Contact person" : "Contact person (if not the same)")}
        <div className="grid grid-cols-2 gap-2">{input("phone", "Phone", { inputMode: "tel" })}{input("email", "Email", { inputMode: "email" })}</div>
        {input("address", "Street address")}
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 64px 90px" }}>{input("city", "City")}{input("state", "State")}{input("zip", "Zip", { inputMode: "numeric" })}</div>
        {err && <div style={{ fontSize: F.sm, color: T.red }}>{err}{existing && <> <Link href={existing.customer_id ? `/dashboard/customers/${existing.customer_id}` : `/dashboard/messages/${existing.id}`} style={{ color: T.chalk }}>Open {existing.name ?? "them"}</Link></>}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} style={btn(false)}>Cancel</button>
          <button onClick={() => void save()} disabled={busy || !d.name.trim()} style={{ ...btn(true), opacity: busy || !d.name.trim() ? 0.5 : 1 }}>{busy ? "Adding…" : "Add customer"}</button>
        </div>
      </div>
    </div>
  );
}
