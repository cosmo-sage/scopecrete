"use client";
/**
 * The job Summary's parties and site (Claude Design "Job Summary", 2026-10-13; Coy: "we have some
 * updates to the job summary page. And be sure to integrate the streetview/satellite view"):
 *
 *  - Customer · bill to — who pays: the homeowner, or the GC when Sacco is the sub.
 *  - Job for · owner — who the work is for (migration 109, jobs.owner_customer_id; null = the customer).
 *  - Contacts on this job — the job's person and both sides' people, each tagged with their side.
 *  - Job site — the address over its map, with Map · Satellite · Street view.
 *
 * Every write goes through routes that already exist: PATCH /api/jobs/[id] {customer_id |
 * owner_customer_id | address…}, POST /api/customers {contact_id} ("Make X the customer"), and
 * POST /api/customers/[id]/contacts (attach a person). Nothing here prices or files anything else.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, disp, strong, formatPhone } from "@/lib/v34/tokens";
import { InitialsBox } from "@/components/v34/thread-list";
import { ContactPicker } from "@/components/v34/contacts";
import { AddressInput } from "@/components/v34/address-input";
import { MapView, fitView, ZoomButtons, type View } from "@/components/v34/map/map-view";
import { StreetFrame } from "@/components/v34/site-views";
import { miles, distanceLabel } from "@/lib/map";
import { DEFAULT_MAP_PROVIDER, drawnProvider, readMapProvider } from "@/lib/map-provider";
import { usePref } from "@/lib/v34/prefs";
import { useAccess } from "@/lib/v34/access-ctx";

export interface Party {
  id: string; name: string | null; type: string | null; address: string | null; point: { lat: number; lng: number } | null;
  since: string | null; created_at: string | null; people: number; jobs: number; primary_contact_id: string | null;
}
export interface JobPerson {
  id: string; name: string | null; phone: string | null; email: string | null; role: string | null;
  side: "customer" | "owner" | null; primary: boolean; party_primary: boolean;
}
type Pt = { lat: number; lng: number };

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

/* ---- the design's small pieces, on the theme's variables ---- */
const kicker = (color: string): React.CSSProperties => ({ fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color, flex: 1, minWidth: 0 });
const linkBtn: React.CSSProperties = { fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: T.chalk, background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap" };
const tag = (bg: string, fg: string, outline = false): React.CSSProperties => ({
  padding: "1px 6px", borderRadius: 2, fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", whiteSpace: "nowrap",
  ...(outline ? { border: `1px solid ${fg}`, color: fg } : { background: bg, color: fg }),
});
const partyCard = (top: string): React.CSSProperties => ({ background: T.card, border: `1px solid ${T.hair}`, borderTop: `3px solid ${top}`, borderRadius: 3, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 });
const nameStyle: React.CSSProperties = { fontFamily: strong, fontWeight: 600, fontSize: 17, lineHeight: 1.2 };
const iconBtn: React.CSSProperties = { width: 36, height: 36, border: `1px solid ${T.hairStrong}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, background: "transparent", flex: "none" };

export const TYPE_LABEL: Record<string, string> = { residential: "Residential", commercial: "Commercial", public: "Government" };
const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Chicago" });

/** "3 people · 6 jobs · customer since Mar 2025" — only what is known. */
function partyMeta(p: Party, word: "customer" | "owner"): string {
  return [
    `${p.people} ${p.people === 1 ? "person" : "people"}`,
    `${p.jobs} job${p.jobs === 1 ? "" : "s"}`,
    word === "customer" && p.since ? `customer since ${monthYear(p.since)}` : null,
  ].filter(Boolean).join(" · ");
}

/** The street line, lower-cased and squashed, so "123 Main St, Denham Springs" matches "123 main st". */
function streetKey(a: string | null): string {
  return (a ?? "").split(",")[0].toLowerCase().replace(/\b(street|st|road|rd|drive|dr|avenue|ave|lane|ln|boulevard|blvd|court|ct)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
}
export function sameStreet(a: string | null, b: string | null): boolean {
  const x = streetKey(a), y = streetKey(b);
  return !!x && x === y;
}

/** Find a customer by name (Change, attach, set owner), or make a new one by the name typed. */
function CustomerPick({ exclude, onPick, onNew, newLabel, busy }: {
  exclude: string[]; onPick: (id: string) => void; onNew?: (name: string) => void; newLabel?: string; busy?: boolean;
}) {
  const [list, setList] = useState<Array<{ id: string; name: string; city: string | null }> | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/customers").then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((b) => setList(((b.customers ?? []) as Array<{ id: string; name: string; city: string | null }>).sort((a, c) => a.name.localeCompare(c.name))))
      .catch(() => setList([]));
  }, []);
  const words = q.trim().toLowerCase();
  const shown = (list ?? []).filter((x) => !exclude.includes(x.id) && (!words || x.name.toLowerCase().includes(words))).slice(0, 30);
  return (
    <div className="flex flex-col gap-1">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a customer…" aria-label="Find a customer"
        className="rounded px-2 w-full" style={{ height: 36, border: `1px solid ${T.hairStrong}`, fontSize: 14, background: T.card, color: T.ink }} />
      <div className="flex flex-col" style={{ maxHeight: 240, overflowY: "auto" }}>
        {onNew && q.trim() && (
          <button disabled={busy} onClick={() => onNew(q.trim())} className="text-left"
            style={{ padding: "8px 2px", borderBottom: `1px solid ${T.hairSoft}`, fontSize: F.sm, color: T.chalk, fontWeight: 600, cursor: "pointer", background: "none" }}>
            + {newLabel ?? "New"} “{q.trim()}”
          </button>
        )}
        {list === null ? <span style={{ fontSize: F.sm, color: T.ink3, padding: "6px 0" }}>Loading…</span>
          : shown.length === 0 && !onNew ? <span style={{ fontSize: F.sm, color: T.ink3, padding: "6px 0" }}>No customer by that name. Make it on Customers.</span>
          : shown.map((x) => (
            <button key={x.id} disabled={busy} onClick={() => onPick(x.id)} className="text-left flex items-baseline gap-2"
              style={{ padding: "8px 2px", borderBottom: `1px solid ${T.hairSoft}`, fontSize: F.sm, color: T.ink, cursor: "pointer", background: "none" }}>
              <span className="flex-1 min-w-0" style={{ fontWeight: 600 }}>{x.name}</span>
              {x.city && <span style={{ color: T.ink3, fontSize: 12 }}>{x.city}</span>}
            </button>
          ))}
      </div>
    </div>
  );
}

/** One tap: the job's person becomes the customer, billed at the job site (POST /api/customers {contact_id}). */
export async function makeCustomerOf(jobId: string, person: JobPerson, jobType: string | null, site: { address: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  if (!person.name) throw new Error("Give them a name first — tap their name to open their contact card.");
  const r = await fetch("/api/customers", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: person.name, contact_id: person.id,
      customer_type: jobType === "commercial" || jobType === "public" ? jobType : "residential",
      ...(site.address ? { address: site.address.split(",")[0], city: site.city ?? null, state: site.state ?? null, zip: site.zip ?? null } : {}) }) });
  const b = await r.json().catch(() => ({}));
  const id = (b.customer?.id ?? b.existing?.customer_id) as string | undefined;
  if (!id) throw new Error(b.error || "The customer wasn't made.");
  await send(`/api/jobs/${jobId}`, "PATCH", { customer_id: id });
}

/* ---------------- Customer · bill to ---------------- */

export function CustomerCard({ jobId, customer, primary, jobType, siteAddress, site, onSaved }: {
  jobId: string; customer: Party | null; primary: JobPerson | null; jobType: string | null; siteAddress: string | null;
  site: { address: string | null; city?: string | null; state?: string | null; zip?: string | null }; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (id: string) => {
    setBusy(true); setErr(null);
    try { await send(`/api/jobs/${jobId}`, "PATCH", { customer_id: id }); setOpen(false); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const make = async () => {
    if (!primary) return;
    setBusy(true); setErr(null);
    try { await makeCustomerOf(jobId, primary, jobType, site); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const errLine = err && <span style={{ fontSize: 12, color: T.red }}>{err}</span>;

  if (!customer) return (
    <section aria-label="Customer" style={{ border: `1px dashed ${T.hairStrong}`, borderRadius: 3, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <span style={kicker(T.ink3)}>Customer · bill to</span>
      <span style={{ fontSize: 13.5, lineHeight: 1.45, color: T.ink2 }}>No customer yet.</span>
      {primary?.name && !open && (
        <button onClick={() => void make()} disabled={busy} className="text-left"
          style={{ minHeight: 40, padding: "8px 12px", borderRadius: 2, background: T.hiviz, color: T.onHiviz, border: "none", cursor: "pointer",
            fontFamily: disp, fontSize: 13.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
          {busy ? "Making…" : `Make ${primary.name} the customer`}
        </button>
      )}
      {open ? <CustomerPick exclude={[]} onPick={(id) => void pick(id)} busy={busy} />
        : null}
      <button onClick={() => setOpen((v) => !v)} className="text-left" style={linkBtn}>{open ? "Close" : "+ Attach an existing customer"}</button>
      {errLine}
    </section>
  );

  const type = customer.type ? TYPE_LABEL[customer.type] ?? customer.type : null;
  return (
    <section aria-label="Customer" style={partyCard(T.green)}>
      <div className="flex items-center gap-2">
        <span style={kicker(T.green)}>Customer · bill to</span>
        <button onClick={() => setOpen((v) => !v)} style={linkBtn}>{open ? "Close" : "Change"}</button>
      </div>
      {open && <CustomerPick exclude={[customer.id]} onPick={(id) => void pick(id)} busy={busy} />}
      <Link href={`/dashboard/customers/${customer.id}`} className="no-underline flex items-center gap-2" style={{ color: T.ink }}>
        <span style={nameStyle}>{customer.name || "Unnamed customer"}</span>
        <span style={{ fontSize: 15, color: T.chalk }}>›</span>
      </Link>
      {(type || (customer.address && sameStreet(customer.address, siteAddress))) && (
        <div className="flex gap-1.5 flex-wrap">
          {type && <span style={tag(T.greenDim, T.green)}>{type}</span>}
          {customer.address && sameStreet(customer.address, siteAddress) && <span style={tag(T.sunk, T.ink2)}>Address = job site</span>}
        </div>
      )}
      <div className="flex gap-2 items-start" style={{ fontSize: 13, color: customer.address ? T.ink2 : T.ink3, lineHeight: 1.4 }}>
        <span style={{ width: 9, height: 9, marginTop: 4, borderRadius: "50%", background: T.green, flex: "none" }} />
        <span style={{ overflowWrap: "anywhere" }}>{customer.address || "No address on the customer"}</span>
      </div>
      <span style={{ fontSize: 12, color: T.ink3 }}>{partyMeta(customer, "customer")}</span>
      {errLine}
    </section>
  );
}

/* ---------------- Job for · owner ---------------- */

export function OwnerCard({ jobId, owner, customer, supported, ownerPeople, onSaved }: {
  jobId: string; owner: Party | null; customer: Party | null; supported: boolean; ownerPeople: number; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = async (id: string | null) => {
    setBusy(true); setErr(null);
    try { await send(`/api/jobs/${jobId}`, "PATCH", { owner_customer_id: id }); setOpen(false); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  // A new owner is a customer of its own (a company, so its contact carries the company's name).
  const makeNew = async (name: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, customer_type: "commercial" }) });
      const b = await r.json().catch(() => ({}));
      if (!b.customer?.id) throw new Error(b.error || "The owner wasn't made.");
      await send(`/api/jobs/${jobId}`, "PATCH", { owner_customer_id: b.customer.id });
      setOpen(false); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const type = owner?.type ? (owner.type === "commercial" ? "Private commercial" : TYPE_LABEL[owner.type] ?? owner.type) : null;
  return (
    <section aria-label="Job for" style={partyCard(T.violet)}>
      <div className="flex items-center gap-2">
        <span style={kicker(T.violet)}>Job for · owner</span>
        {supported && <button onClick={() => setOpen((v) => !v)} style={linkBtn}>{open ? "Close" : owner ? "Change" : "+ Set owner"}</button>}
      </div>
      {open && (
        <div className="flex flex-col gap-1">
          <CustomerPick exclude={[customer?.id ?? "", owner?.id ?? ""]} onPick={(id) => void set(id)} onNew={(n) => void makeNew(n)} newLabel="New owner" busy={busy} />
          {owner && <button onClick={() => void set(null)} disabled={busy} className="text-left" style={{ ...linkBtn, marginTop: 4 }}>Same as the customer</button>}
        </div>
      )}
      {owner ? (
        <>
          <Link href={`/dashboard/customers/${owner.id}`} className="no-underline" style={{ ...nameStyle, color: T.ink }}>{owner.name || "Unnamed owner"}</Link>
          {type && <div className="flex gap-1.5 flex-wrap"><span style={tag(T.violetDim, T.violet)}>{type}</span></div>}
          {customer?.name && <span style={{ fontSize: 13, lineHeight: 1.45, color: T.ink2 }}>{customer.name} is the GC. You bid to {customer.name}, not the owner.</span>}
          <span style={{ fontSize: 12, color: T.ink3 }}>{ownerPeople} owner-side contact{ownerPeople === 1 ? "" : "s"}{owner.address ? ` · ${owner.address}` : ""}</span>
        </>
      ) : (
        <>
          <span style={{ fontSize: 13.5, lineHeight: 1.45, color: T.ink2 }}>
            Same as the customer{customer?.type === "residential" || !customer?.type ? " — homeowner job." : "."}
          </span>
          <span style={{ fontSize: 12, lineHeight: 1.4, color: T.ink3 }}>
            {supported ? "Set an owner when you're a sub and the work is for someone else." : "Setting an owner waits for migration 109."}
          </span>
        </>
      )}
      {err && <span style={{ fontSize: 12, color: T.red }}>{err}</span>}
    </section>
  );
}

/* ---------------- Contacts on this job ---------------- */

const PhoneIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>;
const MailIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>;

export function ContactsCard({ jobId, people, customer, owner, jobType, site, onSaved }: {
  jobId: string; people: JobPerson[]; customer: Party | null; owner: Party | null; jobType: string | null;
  site: { address: string | null; city?: string | null; state?: string | null; zip?: string | null }; onSaved: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "customer" | "owner">("all");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const shown = people.filter((p) => filter === "all" || p.side === filter);
  // Who a new person goes on: the side picked in the filter, else the customer.
  const addTo = filter === "owner" && owner ? owner : customer ?? owner;
  const attach = async (contactId: string) => {
    if (!addTo) return;
    setBusy("add"); setErr(null);
    try { await send(`/api/customers/${addTo.id}/contacts`, "POST", { contact_id: contactId }); setAdding(false); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const make = async (p: JobPerson) => {
    setBusy(p.id); setErr(null);
    try { await makeCustomerOf(jobId, p, jobType, site); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const chip = (k: "all" | "customer" | "owner", label: string) => (
    <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
      style={{ height: 28, padding: "0 10px", border: `1px solid ${filter === k ? T.ink : T.hairStrong}`, borderRadius: 2, background: filter === k ? T.ink : "transparent",
        color: filter === k ? T.slab : T.ink2, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" }}>{label}</button>
  );
  return (
    <section aria-label="Contacts on this job" style={{ background: T.card, border: `1px solid ${T.hair}`, borderTop: `3px solid ${T.chalk}`, borderRadius: 3, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div className="flex items-center gap-2" style={{ padding: "12px 14px 6px" }}>
        <span style={kicker(T.chalk)}>Contacts on this job · {people.length}</span>
        <button onClick={() => setAdding((v) => !v)} style={linkBtn}>{adding ? "Close" : "+ Add contact"}</button>
      </div>
      {owner && (
        <div className="flex gap-1.5 flex-wrap items-center" style={{ padding: "0 14px 10px" }}>
          <span style={{ fontSize: 12, color: T.ink3 }}>Works for</span>
          {chip("all", "All")}
          {customer && chip("customer", customer.name || "Customer")}
          {chip("owner", `${owner.name || "Owner"} · owner`)}
        </div>
      )}
      {adding && (
        <div style={{ padding: "0 14px 10px" }}>
          {addTo ? (
            <>
              <div style={{ fontSize: 12, color: T.ink3, marginBottom: 4 }}>Put someone on {addTo.name || "the customer"}{owner && customer ? " — pick the side in Works for." : "."}</div>
              <ContactPicker exclude={people.map((p) => p.id)} onPick={(c) => void attach(c.id)} busy={busy === "add"} bucket="customer" />
            </>
          ) : <span style={{ fontSize: 13, color: T.ink3 }}>Set the customer first — a contact goes on the customer they work for.</span>}
        </div>
      )}
      {shown.length === 0 && <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.hairSoft}`, fontSize: 13, color: T.ink3 }}>No one {filter === "all" ? "on this job yet" : "on that side yet"}.</div>}
      {shown.map((p) => {
        const sideName = p.side === "owner" ? owner?.name : p.side === "customer" ? customer?.name : null;
        const isTheCustomer = p.side === "customer" && p.party_primary && (!customer?.type || customer.type === "residential");
        const line = [p.phone ? formatPhone(p.phone) : null, p.email].filter(Boolean).join(" · ");
        return (
          <div key={p.id} className="flex gap-2.5 items-center flex-wrap" style={{ padding: "10px 14px", borderTop: `1px solid ${T.hairSoft}` }}>
            <InitialsBox name={p.name} size={34} />
            <div className="flex flex-col gap-0.5" style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div className="flex gap-1.5 items-center flex-wrap">
                <Link href={`/dashboard/messages/${p.id}?person=1`} className="no-underline" style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{p.name || formatPhone(p.phone) || "No name"}</Link>
                {p.role && <span style={{ fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink3 }}>{p.role}</span>}
                {p.primary && <span style={tag("", T.hivizText, true)}>Primary</span>}
                {owner && sideName && <span style={p.side === "owner" ? tag(T.violetDim, T.violet) : tag(T.greenDim, T.green)}>{p.side === "owner" ? `Owner · ${sideName}` : sideName}</span>}
                {isTheCustomer && <span style={tag("", T.green, true)}>Customer</span>}
              </div>
              {line && <span style={{ fontSize: 12.5, color: T.ink3, overflow: "hidden", textOverflow: "ellipsis", overflowWrap: "anywhere" }}>{line}</span>}
            </div>
            <div className="flex gap-1.5 shrink-0">
              {p.phone ? <a href={`tel:${p.phone}`} aria-label={`Call ${p.name ?? "them"}`} style={iconBtn}><PhoneIcon /></a>
                : <span aria-hidden="true" style={{ ...iconBtn, opacity: 0.35 }}><PhoneIcon /></span>}
              {p.email ? <Link href={`/dashboard/messages/email/new?contact=${encodeURIComponent(p.id)}&to=${encodeURIComponent(p.email)}`} aria-label={`Email ${p.name ?? "them"} in Threads`} style={iconBtn}><MailIcon /></Link>
                : <span aria-hidden="true" style={{ ...iconBtn, opacity: 0.35 }}><MailIcon /></span>}
              {!customer && p.name && (
                <button onClick={() => void make(p)} disabled={!!busy}
                  style={{ height: 36, padding: "0 10px", border: `1px solid ${T.hiviz}`, borderRadius: 2, background: "transparent", color: T.hivizText,
                    fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", whiteSpace: "nowrap", cursor: "pointer" }}>
                  {busy === p.id ? "Making…" : "Make customer"}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {err && <div style={{ padding: "0 14px 10px", fontSize: 12, color: T.red }}>{err}</div>}
    </section>
  );
}

/* ---------------- Job site ---------------- */

/** A point for an address: the stored one, else looked up (not stored — the Map page stores them, 090). */
function useFound(addr: string | null, stored: Pt | null): { point: Pt | null; state: "ok" | "finding" | "none" } {
  const [found, setFound] = useState<{ addr: string; point: Pt | null } | null>(null);
  useEffect(() => {
    if (stored || !addr) return;
    let live = true;
    fetch(`/api/aerial/suggest?find=${encodeURIComponent(addr)}`).then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live) setFound({ addr, point: typeof b?.found?.lat === "number" ? { lat: b.found.lat, lng: b.found.lng } : null }); })
      .catch(() => { if (live) setFound({ addr, point: null }); });
    return () => { live = false; };
  }, [addr, stored]);
  if (stored) return { point: stored, state: "ok" };
  if (!addr) return { point: null, state: "none" };
  const mine = found && found.addr === addr ? found : null;
  return { point: mine?.point ?? null, state: mine ? (mine.point ? "ok" : "none") : "finding" };
}

const CopyIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>;
const PencilIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;

function Pin({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5" style={{ transform: "translate(-9px, -9px)", pointerEvents: "none" }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: color, border: `3px solid ${T.slab}`, boxShadow: "0 1px 4px rgba(0,0,0,.45)", flex: "none" }} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.9)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

/** Map · Satellite · Street view, the pick kept on the device (it was "sc:site-view", sat | street). */
const VIEW_KEY = "sc:site-view";
type SiteView = "map" | "sat" | "street";

export function JobSiteCard({ jobId, address, stored, customer, phone, onSaved }: {
  jobId: string; address: string | null; stored: Pt | null; customer: Party | null; phone: boolean; onSaved: () => void;
}) {
  const site = useFound(address, stored);
  // The customer's office, only when it isn't the site.
  const custAddr = customer?.address && !sameStreet(customer.address, address) ? customer.address : null;
  const office = useFound(custAddr, custAddr ? customer?.point ?? null : null);
  const [mode, setMode] = useState<SiteView>(() => {
    try { const v = typeof window !== "undefined" ? localStorage.getItem(VIEW_KEY) : null; return v === "street" || v === "map" ? v : "sat"; } catch { return "sat"; }
  });
  const pick = (v: SiteView) => { setMode(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* none */ } };
  const [providerPref] = usePref<string>("map_provider", DEFAULT_MAP_PROVIDER);
  const [googleOn, setGoogleOn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/map/provider").then((r) => (r.ok ? r.json() : null)).then((b) => { if (live) setGoogleOn(!!b?.google?.on); }).catch(() => { if (live) setGoogleOn(false); });
    return () => { live = false; };
  }, []);
  const provider = drawnProvider(readMapProvider(providerPref), googleOn !== false, false);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragged, setDragged] = useState<{ key: string; v: View } | null>(null);
  const officePt = custAddr ? office.point : null;
  const pts = useMemo(() => [site.point, officePt].filter((p): p is Pt => !!p), [site.point, officePt]);
  const fitted = useMemo(() => {
    if (!pts.length || !size.w || !size.h) return null;
    if (pts.length === 1) return { ...pts[0], zoom: 16 };
    return fitView(pts, size.w, size.h, 50, 15);
  }, [pts, size.w, size.h]);
  // Re-fit when the points or the box change; a drag keeps its own view until then.
  const fitKey = fitted ? `${fitted.lat.toFixed(5)},${fitted.lng.toFixed(5)},${fitted.zoom.toFixed(2)}` : "";
  const shownView = dragged && dragged.key === fitKey ? dragged.v : fitted;
  const setView = (v: View) => setDragged({ key: fitKey, v });

  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!address) return;
    void navigator.clipboard?.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  };
  const [editing, setEditing] = useState(false);
  const access = useAccess();

  const custShort = customer?.name ? customer.name.split(/\s+/).slice(0, 2).join(" ") : "Customer";
  const toggle = (
    <div role="group" aria-label="Map view" className="flex" style={{ border: `1px solid ${T.hairStrong}`, borderRadius: 2, overflow: "hidden", flex: "none" }}>
      {([["map", "Map"], ["sat", phone ? "Sat" : "Satellite"], ["street", "Street view"]] as const).map(([k, label]) => (
        <button key={k} onClick={() => pick(k)} aria-pressed={mode === k}
          style={{ height: 28, padding: "0 10px", border: "none", background: mode === k ? T.ink : "transparent", color: mode === k ? T.slab : T.ink2,
            fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
      ))}
    </div>
  );
  const addrRow = (
    <div className="flex items-center gap-1 flex-wrap" style={{ minWidth: 0 }}>
      <span style={{ fontSize: phone ? 13 : 14.5, fontWeight: 600, lineHeight: 1.35, marginRight: 4, color: address ? T.ink : T.ink3, overflowWrap: "anywhere" }}>{address || "No address yet"}</span>
      {address && <button onClick={copy} title="Copy address" aria-label="Copy address" style={{ ...iconBtn, width: 30, height: 30, border: "none", cursor: "pointer" }}><CopyIcon /></button>}
      {!access.limited && <button onClick={() => setEditing((v) => !v)} title={address ? "Edit address" : "Add the address"} aria-label="Edit address" style={{ ...iconBtn, width: 30, height: 30, border: "none", cursor: "pointer" }}><PencilIcon /></button>}
      {copied && <span style={{ fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: T.green }}>Copied</span>}
    </div>
  );
  const dist = site.point && officePt ? distanceLabel(miles(site.point, officePt)) : null;

  return (
    <section aria-label="Job site" style={{ background: T.card, border: `1px solid ${T.hair}`, borderRadius: 3, display: "flex", flexDirection: "column", minHeight: phone ? 380 : 440, minWidth: 0 }}>
      <div className="flex items-start gap-2.5 flex-wrap" style={{ padding: "12px 14px" }}>
        <div className="flex flex-col gap-1" style={{ flex: "1 1 200px", minWidth: 0 }}>
          <span style={kicker(T.hiviz)}>Job site</span>
          {!phone && addrRow}
        </div>
        <div className="flex items-center gap-1.5">
          {phone && site.point && (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${site.point.lat},${site.point.lng}`} target="_blank" rel="noopener noreferrer" className="no-underline flex items-center"
              style={{ height: 30, padding: "0 10px", border: `1px solid ${T.hairStrong}`, borderRadius: 2, color: T.ink2, fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" }}>Directions</a>
          )}
          {site.point && toggle}
        </div>
      </div>
      {editing && <SiteAddressEdit jobId={jobId} address={address} onDone={() => { setEditing(false); onSaved(); }} onCancel={() => setEditing(false)} />}
      <div style={{ flex: "1 1 auto", minHeight: 240, position: "relative", borderTop: `1px solid ${T.hair}`, borderBottom: `1px solid ${T.hair}` }}>
        {!site.point ? (
          <div className="flex items-center justify-center" style={{ position: "absolute", inset: 0, fontSize: 13, color: T.ink3, background: T.sunk, padding: 16, textAlign: "center" }}>
            {site.state === "finding" ? "Finding it on the map…" : address ? "The map couldn't place this address." : "Add the job's address to see it on the map."}
          </div>
        ) : mode === "street" ? (
          <div style={{ position: "absolute", inset: 0, padding: 6 }}><StreetFrame key={`${site.point.lat},${site.point.lng}`} point={site.point} height="fill" /></div>
        ) : (
          <div style={{ position: "absolute", inset: 0 }}>
            {shownView ? (
              <MapView view={shownView} onView={setView} mode={mode} provider={provider} onSize={setSize} wheel={false} touchAction={phone ? "pan-y" : "none"}
                overlay={(place) => (
                  <>
                    {officePt && (() => { const q = place(officePt.lat, officePt.lng); return <div style={{ position: "absolute", left: q.x, top: q.y }}><Pin color={T.green} label={custShort} /></div>; })()}
                    {(() => { const q = place(site.point!.lat, site.point!.lng); return <div style={{ position: "absolute", left: q.x, top: q.y }}><Pin color={T.hiviz} label="Job site" /></div>; })()}
                  </>
                )}>
                <ZoomButtons view={shownView} onView={setView} bottom={22} />
              </MapView>
            ) : <MeasureBox onSize={setSize} />}
          </div>
        )}
      </div>
      {(phone || dist) && (
        <div className="flex flex-col gap-1" style={{ padding: "8px 14px 10px" }}>
          {phone && addrRow}
          {dist && officePt && (
            <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: T.ink3 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: T.green, flex: "none" }} />
              {custShort} · {dist === "at this spot" ? "at the site" : `${dist} from site`}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** Measures the map's box before the first fit (MapView needs a view to draw). */
function MeasureBox({ onSize }: { onSize: (s: { w: number; h: number }) => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => onSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, onSize]);
  return <div ref={setEl} style={{ width: "100%", height: "100%" }} />;
}

/** The job's address, changed here: the Map's address finder fills street, city, state and zip. */
function SiteAddressEdit({ jobId, address, onDone, onCancel }: { jobId: string; address: string | null; onDone: () => void; onCancel: () => void }) {
  const [v, setV] = useState(address ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (body: Record<string, string | null>) => {
    setBusy(true); setErr(null);
    try { await send(`/api/jobs/${jobId}`, "PATCH", body); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-1.5" style={{ padding: "0 14px 12px", maxWidth: 560 }}>
      <AddressInput value={v} onChange={setV}
        style={{ width: "100%", height: 36, padding: "0 10px", border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 14 }}
        onPick={(m) => void save({ address: m.line1, city: m.city ?? null, state: m.state ?? null, zip: m.zip ?? null })} />
      <span style={{ fontSize: 11, color: T.ink3 }}>Start typing — pick the address from the list.</span>
      <span className="flex gap-2">
        <button disabled={busy || !v.trim()} onClick={() => void save({ address: v.trim() })} className="rounded px-3"
          style={{ height: 32, background: T.ink, color: T.card, fontWeight: 600, cursor: "pointer", border: "none" }}>{busy ? "Saving…" : "Save as typed"}</button>
        <button onClick={onCancel} className="rounded px-3" style={{ height: 32, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, cursor: "pointer" }}>Cancel</button>
      </span>
      {err && <span style={{ color: T.red, fontSize: 11 }}>{err}</span>}
    </div>
  );
}
