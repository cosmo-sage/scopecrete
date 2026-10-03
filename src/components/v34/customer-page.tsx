"use client";

/**
 * The customer page (Claude Design handoff, design/customer-and-themes;
 * migration 055). A customer — a household, a school, a business — owns the
 * address and the jobs; its contacts are the people who speak for it. Coy on
 * Vercel: "Amber is the contact for this commercial customer. The customer is
 * a business: Art Apartments."
 *
 * Desktop: header (CUSTOMER · name · address · N contacts · N jobs · since;
 * Call · Text · Email · Edit · + New scope), tabs on the left, a 440px right
 * panel — Location, the customer's facts, Contacts. Narrow: one column, the
 * panel's cards at the top of Details.
 *
 * Tabs: Details (Dusty's summary, job cards, the newest four across all
 * channels) · Threads (every contact's calls and texts in one timeline, a
 * filter panel with the only Call control, call cards with summary → next
 * steps → recording → transcript → notes; a message box only when Texts is
 * picked) · Jobs · Documents · Payments · Files · Schedule. Nothing invented:
 * an empty tab says what is missing. Email is not connected yet and says so.
 */

import { EmailList } from "@/components/v34/email-sheet";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, money0, formatPhone, relTime, strong, light } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { useWide } from "@/lib/v34/use-wide";
import { PlayAudio, MessageMedia } from "@/components/v34/conversation";
import { Composer } from "@/components/v34/composer";
import { FilesPanel } from "@/components/v34/files-panel";
import { STATUS_NAME } from "@/lib/jobs/stages";
import { SubRail, type SubIcon } from "@/components/v34/sub-rail";
import { CallNotesPad, DraftQuoteButton } from "@/components/v34/call-notes-pad";

interface Method { kind: "mobile" | "office" | "home" | "phone" | "email"; value: string; can_text: boolean | null; primary: boolean }
interface Contact { id: string; name: string | null; role: string | null; primary: boolean; bucket: string | null; status_summary: string | null; recent_summary: string | null; last_contacted: string | null; methods: Method[] }
interface Job { id: string; title: string | null; status: string | null; job_type: string | null; address: string | null; scheduled_start: string | null; scheduled_end: string | null; won_at: string | null; quote: number | null; quote_basis: string | null; paid: number; invoiced: number }
interface Customer {
  id: string; name: string | null; customer_type: string | null; customer_type_source: string | null; subtype: string | null;
  lead_source: string | null; status: string | null; notes: string | null; since: string | null; primary_contact_id: string | null;
  address_line1: string | null; city: string | null; state: string | null; zip: string | null; address_formatted: string | null;
  lat: number | null; lng: number | null; address_source: string | null; created_at: string;
}
interface Data { customer: Customer; contacts: Contact[]; jobs: Job[]; maps: { embed: boolean; geocode: boolean } }
interface Item {
  id: string; contact_id: string; channel: "call" | "text"; direction: "in" | "out"; at: string; body: string | null;
  duration_s: number | null; status: string | null; media_count: number; summary: string | null; next_steps: string | null;
  has_transcript: boolean; has_recording: boolean; has_voicemail: boolean; notes: Array<{ id: string; body: string; created_at: string }>;
}

type Tab = "details" | "threads" | "jobs" | "documents" | "payments" | "files" | "schedule";
const TABS: Array<[Tab, string]> = [["details", "Details"], ["threads", "Threads"], ["jobs", "Jobs"], ["documents", "Documents"], ["payments", "Payments"], ["files", "Files"], ["schedule", "Schedule"]];
const TYPE_LABEL: Record<string, string> = { residential: "Residential", commercial: "Commercial", public: "Government" };
const lbl: React.CSSProperties = { fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" };
const panelTitle: React.CSSProperties = { fontFamily: light, fontWeight: 300, fontSize: 20, margin: 0, color: T.ink };

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}
const initials = (n: string | null) => (n ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const firstPhone = (c: Contact | undefined) => c?.methods.find((m) => m.kind !== "email")?.value ?? null;
const firstEmail = (c: Contact | undefined) => c?.methods.find((m) => m.kind === "email")?.value ?? null;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dur = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

function btn(primary?: boolean): React.CSSProperties {
  return { ...lbl, height: 32, padding: "0 12px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center",
    background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink, border: primary ? "none" : `1px solid ${T.hairStrong}`, textDecoration: "none" };
}

export function CustomerPage({ customerId, focusContact }: { customerId: string; focusContact?: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>(focusContact ? "threads" : "details");
  const [editing, setEditing] = useState(false);
  const [callNotes, setCallNotes] = useState(false);
  const [note, setNote] = useState<{ text: string; undo?: string } | null>(null);
  const [measure, wide] = useWide<HTMLDivElement>(1000);
  const reload = () => setTick((n) => n + 1);

  useEffect(() => {
    let off = false;
    send(`/api/customers/${customerId}`, "GET")
      .then((b) => { if (off) return; if (b.redirect_to) { router.replace(`/dashboard/customers/${b.redirect_to}`); return; } setData(b as Data); setErr(null); })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [customerId, tick, router]);

  if (err) return <div ref={measure} className="p-4" style={{ color: T.red, fontSize: F.sm }}>Couldn&apos;t load this customer: {err}</div>;
  if (!data) return <div ref={measure} className="p-4"><div className="rounded animate-pulse" style={{ height: 140, background: T.hairSoft }} /></div>;

  const { customer: cu, contacts, jobs } = data;
  const primary = contacts.find((c) => c.primary) ?? contacts[0];
  const phone = firstPhone(primary);
  const email = firstEmail(primary);
  const meta = [cu.address_formatted,
    cu.since ? `customer since ${new Date(cu.since).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : null].filter(Boolean).join(" · ");
  // "1 contact" opens Details at the contacts; "1 job" opens Jobs (Coy, 2026-09-30).
  const toContacts = () => {
    setTab("details");
    requestAnimationFrame(() => document.getElementById("sc-customer-contacts")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const countLink: React.CSSProperties = { fontSize: F.sm, color: T.chalk, cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: "underline", textUnderlineOffset: 2, textDecorationColor: T.hairStrong };

  const newScope = async () => {
    try {
      const b = await send("/api/jobs", "POST", { contact_id: primary?.id, job_type: cu.customer_type ?? undefined });
      router.push(`/dashboard/scope/${b.job.id}`);
    } catch (e) { setNote({ text: e instanceof Error ? e.message : String(e) }); }
  };

  const panel = (
    <>
      <LocationCard cu={cu} maps={data.maps} onEdit={() => setEditing(true)} />
      <Facts cu={cu} onEdit={() => setEditing(true)} />
      <Contacts cu={cu} contacts={contacts} onChanged={reload} onNote={setNote} />
    </>
  );

  return (
    <div ref={measure} style={{ minHeight: "calc(100dvh - var(--sc-head))", background: T.slab }}>
      {/* ---- header ---- */}
      <div className="px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
        <div className="flex items-start gap-3 flex-wrap">
          <div style={{ flex: 1, minWidth: 220 }}>
            {/* Coy, 2026-09-30: one row, smaller — "Customer | Maurice Watkins", then the counts. */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <Link href="/dashboard/customers" style={{ ...eyebrow, color: T.ink3 }}>Customer</Link>
              <span aria-hidden="true" style={{ color: T.hairStrong }}>|</span>
              <h1 style={{ fontFamily: strong, fontWeight: 600, fontSize: 18, lineHeight: 1.2, margin: 0, color: T.ink }}>{cu.name || "Unnamed customer"}</h1>
              <span className="flex items-baseline gap-2" style={{ marginLeft: 4 }}>
                <button onClick={toContacts} style={countLink}>{contacts.length} contact{contacts.length === 1 ? "" : "s"}</button>
                <span style={{ color: T.ink3 }}>·</span>
                <button onClick={() => setTab("jobs")} style={countLink}>{jobs.length} job{jobs.length === 1 ? "" : "s"}</button>
              </span>
            </div>
            {meta && <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 2 }}>{meta}</div>}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            {phone ? <a href={`tel:${phone}`} style={btn()}>Call</a> : <span style={{ ...btn(), opacity: 0.45 }} title="No number on file">Call</span>}
            <button onClick={() => setTab("threads")} style={btn()}>Text</button>
            {email ? <a href={`mailto:${email}`} style={btn()}>Email</a> : <span style={{ ...btn(), opacity: 0.45 }} title="No email on file">Email</span>}
            <button onClick={() => setCallNotes(true)} disabled={!primary} style={btn()} title="Notes while you're on the phone — they land on the call">Call notes</button>
            <button onClick={() => setEditing(true)} style={btn()}>Edit</button>
            <button onClick={() => void newScope()} disabled={!primary} style={btn(true)}>+ New scope</button>
          </div>
          {primary && <CallNotesPad contactId={primary.id} who={primary.name || cu.name || "this customer"} open={callNotes} onClose={() => { setCallNotes(false); setTick((n) => n + 1); }} />}
        </div>
        {note && (
          <div className="mt-2 rounded px-3 py-1.5 flex items-center gap-2" style={{ background: T.hivizDim, fontSize: F.sm }}>
            <span className="flex-1">{note.text}</span>
            {note.undo && <button onClick={() => void send(`/api/customer-moves/${note.undo}/undo`, "POST").then(() => { setNote(null); reload(); }).catch((e) => setNote({ text: String(e.message ?? e) }))}
              style={{ ...lbl, color: T.chalk, cursor: "pointer" }}>Undo</button>}
            <button onClick={() => setNote(null)} aria-label="Dismiss" style={{ color: T.ink3, cursor: "pointer" }}>×</button>
          </div>
        )}
        {!wide && <div role="tablist" className="flex gap-4 mt-3 overflow-x-auto" style={{ marginBottom: -9 }}>
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              style={{ ...lbl, fontSize: 13, padding: "6px 0", whiteSpace: "nowrap", cursor: "pointer", color: tab === k ? T.ink : T.ink3,
                       borderBottom: `2px solid ${tab === k ? T.hiviz : "transparent"}` }}>{l}</button>
          ))}
        </div>}
      </div>

      <div className={wide ? "flex items-start" : ""}>
        {/* Desktop: the sub-pages as a second rail beside the main one (Coy, 2026-09-30). */}
        {wide && <SubRail label="Customer pages" value={tab} onChange={setTab}
          items={TABS.map(([k, l]) => ({ k, label: l, icon: k as SubIcon }))} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!wide && tab === "details" && <div style={{ borderBottom: `1px solid ${T.hair}` }}>{panel}</div>}
          {tab === "details" && <Details cu={cu} contacts={contacts} jobs={jobs} onThreads={() => setTab("threads")} />}
          {tab === "threads" && <Threads customerId={customerId} contacts={contacts} focusContact={focusContact ?? null} wide={wide} />}
          {tab === "jobs" && <JobsTab jobs={jobs} onNew={() => void newScope()} />}
          {tab === "documents" && <DocsTab customerId={customerId} />}
          {tab === "payments" && <Payments jobs={jobs} />}
          {tab === "files" && (primary
            ? <div className="p-4"><FilesPanel contactId={primary.id} title={`Files · filed on ${primary.name ?? "the primary contact"}`} /></div>
            : <Empty text="No contact to file uploads under yet." />)}
          {tab === "schedule" && <Schedule jobs={jobs} />}
        </div>
        {wide && (
          <aside className="overflow-y-auto" style={{ width: 440, flexShrink: 0, borderLeft: `1px solid ${T.hair}`, background: T.card,
            position: "sticky", top: "var(--sc-head)", maxHeight: "calc(100dvh - var(--sc-head))" }}>
            {panel}
          </aside>
        )}
      </div>

      <EditSheet open={editing} cu={cu} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6" style={{ fontSize: F.sm, color: T.ink3 }}>{text}</div>;
}

/* ------------------------------------------------------------ right panel */

function LocationCard({ cu, maps, onEdit }: { cu: Customer; maps: Data["maps"]; onEdit: () => void }) {
  const [view, setView] = useState<"map" | "street">("map");
  const [copied, setCopied] = useState(false);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? "";
  const addr = cu.address_formatted;
  const hasLatLng = cu.lat != null && cu.lng != null;
  const q = addr ? encodeURIComponent(addr) : "";
  const src = view === "map"
    ? `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}&zoom=16`
    : `https://www.google.com/maps/embed/v1/streetview?key=${key}&location=${cu.lat},${cu.lng}&fov=80`;
  const copy = async () => {
    if (!addr) return;
    try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };
  const seg = (on: boolean): React.CSSProperties => ({ ...lbl, fontSize: 11, padding: "4px 10px", cursor: "pointer", border: "none",
    background: on ? T.ink : "transparent", color: on ? T.slab : T.ink2 });
  const showMap = !!(key && maps.embed && addr);
  return (
    <section style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${T.hair}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="flex items-center gap-2">
        <h3 style={{ ...panelTitle, flex: 1 }}>Location</h3>
        {showMap && (
          <div role="tablist" className="flex overflow-hidden" style={{ border: `1px solid ${T.hairStrong}`, borderRadius: 3 }}>
            <button role="tab" aria-selected={view === "map"} onClick={() => setView("map")} style={seg(view === "map")}>Map</button>
            <button role="tab" aria-selected={view === "street"} disabled={!hasLatLng} onClick={() => setView("street")}
              title={hasLatLng ? undefined : maps.geocode ? "Save the address again to place it" : "Street view needs the map key"}
              style={{ ...seg(view === "street"), borderLeft: `1px solid ${T.hairStrong}`, opacity: hasLatLng ? 1 : 0.45 }}>Street view</button>
          </div>
        )}
      </div>
      {showMap && (
        <div style={{ height: 190, border: `1px solid ${T.hair}`, borderRadius: 4, overflow: "hidden", background: T.sunk }}>
          <iframe key={view} title={view === "map" ? "Map" : "Street view"} src={src} width="100%" height="100%" style={{ border: 0, display: "block" }}
            loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        </div>
      )}
      {addr ? (
        <div className="flex gap-1.5">
          <button onClick={() => void copy()} title="Copy address" className="flex items-center gap-2 text-left"
            style={{ flex: 1, minWidth: 0, padding: "7px 10px", border: `1px dashed ${T.hairStrong}`, borderRadius: 3, background: "transparent", cursor: "pointer", color: T.ink }}>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{addr}</span>
            <span style={{ ...lbl, fontSize: 11, color: copied ? T.green : T.ink3 }}>{copied ? "Copied ✓" : "Copy"}</span>
          </button>
          <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer"
            style={{ ...lbl, fontSize: 11, height: 33, padding: "0 10px", borderRadius: 3, border: `1px solid ${T.hairStrong}`, display: "flex", alignItems: "center", color: T.chalk }}>
            Open in Maps ↗
          </a>
        </div>
      ) : (
        <button onClick={onEdit} className="text-left" style={{ padding: "8px 10px", border: `1px dashed ${T.hairStrong}`, borderRadius: 3, color: T.hivizText, fontSize: F.sm, cursor: "pointer", background: "transparent" }}>
          No address on file — add one
        </button>
      )}
      <span style={{ fontSize: 11, color: T.ink3 }}>
        {addr && cu.address_source === "contact" ? "Copied from the contact's details — check it. " : ""}
        {!showMap && addr ? "The map shows once the Google Maps key is set. " : ""}
        The customer&apos;s address. Each job can have its own site address.
      </span>
    </section>
  );
}

function Facts({ cu, onEdit }: { cu: Customer; onEdit: () => void }) {
  const row = (k: string, v: string | null, hint?: string) => (
    <div className="flex gap-3 py-1" style={{ fontSize: F.sm }}>
      <span style={{ ...lbl, fontSize: 11, width: 96, color: T.ink3, paddingTop: 2 }}>{k}</span>
      <span style={{ flex: 1, color: v ? T.ink : T.ink3 }}>{v ?? "—"}{hint && <span style={{ fontSize: 11, color: T.ink3 }}> {hint}</span>}</span>
    </div>
  );
  return (
    <section style={{ padding: "12px 16px", borderBottom: `1px solid ${T.hair}` }}>
      <div className="flex items-center"><h3 style={{ ...panelTitle, flex: 1 }}>Customer</h3>
        <button onClick={onEdit} style={{ ...lbl, fontSize: 11, color: T.chalk, cursor: "pointer" }}>Edit</button></div>
      {row("Type", cu.customer_type ? [TYPE_LABEL[cu.customer_type] ?? cu.customer_type, cu.subtype].filter(Boolean).join(" · ") : null,
        cu.customer_type_source === "jobs" ? "(from its jobs)" : undefined)}
      {row("Lead source", cu.lead_source)}
      {row("Status", cu.status)}
      {row("Notes", cu.notes)}
    </section>
  );
}

function Contacts({ cu, contacts, onChanged, onNote }: { cu: Customer; contacts: Contact[]; onChanged: () => void; onNote: (n: { text: string; undo?: string }) => void }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Array<{ id: string; name: string | null; phone: string | null; email: string | null; contact_type: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [roleFor, setRoleFor] = useState<string | null>(null);
  const [role, setRole] = useState("");

  useEffect(() => {
    if (!adding || q.trim().length < 2) return;
    let off = false;
    const t = setTimeout(() => {
      send(`/api/customers/${cu.id}/contacts?q=${encodeURIComponent(q.trim())}`, "GET")
        .then((b) => { if (!off) setFound(b.people ?? []); }).catch(() => {});
    }, 220);
    return () => { off = true; clearTimeout(t); };
  }, [adding, q, cu.id]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onChanged(); } catch (e) { onNote({ text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  const attach = (id: string, name: string | null) => void run(async () => {
    const b = await send(`/api/customers/${cu.id}/contacts`, "POST", { contact_id: id });
    onNote({ text: `${name ?? "They"} now ${name ? "is" : "are"} a contact of ${cu.name ?? "this customer"}.`, undo: b.move_id ?? undefined });
    setAdding(false); setQ(""); setFound([]);
  });
  const detach = (c: Contact) => {
    if (!window.confirm(`Take ${c.name ?? "this person"} off ${cu.name ?? "this customer"}? They keep their own history and jobs.`)) return;
    void run(async () => {
      const b = await send(`/api/customers/${cu.id}/contacts/${c.id}`, "DELETE");
      onNote({ text: `${c.name ?? "They"} is no longer a contact of ${cu.name ?? "this customer"}.`, undo: b.move_id ?? undefined });
    });
  };
  const methodLabel: Record<Method["kind"], string> = { mobile: "Mobile", office: "Office", home: "Home", phone: "Phone", email: "Email" };

  return (
    <section id="sc-customer-contacts" style={{ padding: "12px 16px 16px", scrollMarginTop: "calc(var(--sc-head) + 8px)" }}>
      <div className="flex items-center">
        <h3 style={{ ...panelTitle, flex: 1 }}>Contacts</h3>
        <button onClick={() => setAdding((a) => !a)} style={{ ...lbl, fontSize: 11, color: T.chalk, cursor: "pointer" }}>{adding ? "Close" : "+ Add contact"}</button>
      </div>
      {adding && (
        <div className="mt-2 rounded p-2" style={{ border: `1px solid ${T.hair}`, background: T.slab }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person: name, number or email"
            style={{ width: "100%", height: 32, padding: "0 8px", border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: F.sm }} />
          <div className="mt-1 flex flex-col">
            {q.trim().length >= 2 && found.length === 0 && <span style={{ fontSize: F.xs, color: T.ink3, padding: "4px 2px" }}>Nobody matches.</span>}
            {found.map((p) => (
              <button key={p.id} disabled={busy} onClick={() => attach(p.id, p.name)} className="text-left py-1.5 px-1" style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                <span style={{ fontSize: F.sm, fontWeight: 600, color: T.ink }}>{p.name ?? formatPhone(p.phone)}</span>
                <span style={{ fontSize: F.xs, color: T.ink3 }}> · {[p.name ? formatPhone(p.phone) : null, p.email, p.contact_type ?? "unsorted"].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>Their calls and texts join this customer&apos;s threads; their own jobs come with them. Undo is offered after.</div>
        </div>
      )}
      <div className="mt-2 flex flex-col gap-2">
        {contacts.length === 0 && <span style={{ fontSize: F.sm, color: T.ink3 }}>No contacts yet.</span>}
        {contacts.map((c) => (
          <div key={c.id} className="rounded" style={{ border: `1px solid ${T.hair}`, background: T.card, padding: "9px 11px" }}>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: T.sunk, fontFamily: strong, fontWeight: 600, fontSize: 12, color: T.ink2, flexShrink: 0 }}>{initials(c.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-1.5">
                  <Link href={`/dashboard/messages/${c.id}?person=1`} style={{ fontFamily: strong, fontWeight: 600, fontSize: 14, color: T.ink, ...clip }}>{c.name ?? formatPhone(firstPhone(c))}</Link>
                  {c.primary && <span style={{ ...lbl, fontSize: 10, color: T.hivizText }}>★ Primary</span>}
                </div>
                {roleFor === c.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); void run(() => send(`/api/customers/${cu.id}/contacts/${c.id}`, "PATCH", { role })).then(() => setRoleFor(null)); }} className="flex gap-1 mt-1">
                    <input autoFocus value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role — e.g. Property manager"
                      style={{ flex: 1, height: 26, padding: "0 6px", border: `1px solid ${T.hairStrong}`, borderRadius: 3, fontSize: F.xs, background: T.card, color: T.ink }} />
                    <button type="submit" style={{ ...lbl, fontSize: 10, color: T.chalk }}>Save</button>
                  </form>
                ) : (
                  <button onClick={() => { setRoleFor(c.id); setRole(c.role ?? ""); }} className="text-left" style={{ fontSize: F.xs, color: c.role ? T.ink2 : T.ink3, cursor: "pointer" }}>
                    {c.role ?? "+ role"}
                  </button>
                )}
              </div>
            </div>
            <div className="mt-1.5 flex flex-col gap-1">
              {c.methods.length === 0 && <span style={{ fontSize: F.xs, color: T.ink3 }}>No number or email on file.</span>}
              {c.methods.map((m) => (
                <div key={m.kind + m.value} className="flex items-center gap-2" style={{ fontSize: F.sm }}>
                  <span style={{ ...lbl, fontSize: 10, width: 48, color: T.ink3 }}>{methodLabel[m.kind]}</span>
                  <span style={{ flex: 1, minWidth: 0, color: T.ink, ...nums, ...clip }}>{m.kind === "email" ? m.value : formatPhone(m.value)}</span>
                  {m.kind === "email"
                    ? <a href={`mailto:${m.value}`} style={{ ...lbl, fontSize: 10, color: T.chalk }}>Email</a>
                    : <>
                        <a href={`tel:${m.value}`} style={{ ...lbl, fontSize: 10, color: T.chalk }}>Call</a>
                        {m.can_text !== false && <a href={`sms:${m.value}`} style={{ ...lbl, fontSize: 10, color: T.chalk }}>Text</a>}
                      </>}
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-3">
              {!c.primary && <button disabled={busy} onClick={() => void run(() => send(`/api/customers/${cu.id}/contacts/${c.id}`, "PATCH", { primary: true }))} style={{ ...lbl, fontSize: 10, color: T.ink3, cursor: "pointer" }}>Make primary</button>}
              {contacts.length > 1 && <button disabled={busy} onClick={() => detach(c)} style={{ ...lbl, fontSize: 10, color: T.ink3, cursor: "pointer" }}>Remove from customer</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function L({ k, children }: { k: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span style={{ ...eyebrow }}>{k}</span>{children}</label>;
}

function EditSheet({ open, cu, onClose, onSaved }: { open: boolean; cu: Customer; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const openKey = open ? cu.id + cu.name + cu.address_formatted : null;
  if (openKey !== seen) {
    setSeen(openKey);
    if (open) setF({ name: cu.name ?? "", customer_type: cu.customer_type_source === "coy" ? cu.customer_type ?? "" : "", subtype: cu.subtype ?? "",
      lead_source: cu.lead_source ?? "", status: cu.status ?? "", notes: cu.notes ?? "",
      address_line1: cu.address_line1 ?? "", city: cu.city ?? "", state: cu.state ?? "", zip: cu.zip ?? "" });
  }
  const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.sm, borderRadius: 3, padding: "0 8px", width: "100%" };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await send(`/api/customers/${cu.id}`, "PATCH", { ...f, customer_type: f.customer_type || null });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit customer">
      <div className="px-4 py-3 flex flex-col gap-3">
        <L k="Name"><input value={f.name ?? ""} onChange={set("name")} style={field} /></L>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <L k="Type"><select value={f.customer_type ?? ""} onChange={set("customer_type")} style={field}>
            <option value="">From its jobs</option><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="public">Government</option>
          </select></L>
          <L k="Kind"><input value={f.subtype ?? ""} onChange={set("subtype")} placeholder="Public school, HOA…" style={field} /></L>
          <L k="Lead source"><input value={f.lead_source ?? ""} onChange={set("lead_source")} placeholder="Website, referral…" style={field} /></L>
          <L k="Status"><input value={f.status ?? ""} onChange={set("status")} placeholder="Active customer…" style={field} /></L>
        </div>
        <L k="Street"><input value={f.address_line1 ?? ""} onChange={set("address_line1")} style={field} /></L>
        <div className="grid gap-2" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
          <L k="City"><input value={f.city ?? ""} onChange={set("city")} style={field} /></L>
          <L k="State"><input value={f.state ?? ""} onChange={set("state")} style={field} /></L>
          <L k="Zip"><input value={f.zip ?? ""} onChange={set("zip")} style={field} /></L>
        </div>
        <L k="Notes"><textarea value={f.notes ?? ""} onChange={set("notes")} rows={3} style={{ ...field, height: "auto", padding: 8 }} /></L>
        {err && <div style={{ color: T.red, fontSize: F.sm }}>{err}</div>}
        <button onClick={() => void save()} disabled={busy || !(f.name ?? "").trim()} style={{ ...btn(true), justifyContent: "center", height: 40 }}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ tabs */

function Details({ cu, contacts, jobs, onThreads }: { cu: Customer; contacts: Contact[]; jobs: Job[]; onThreads: () => void }) {
  const [latest, setLatest] = useState<Item[] | null>(null);
  useEffect(() => {
    let off = false;
    send(`/api/customers/${cu.id}/timeline?limit=20`, "GET").then((b) => { if (!off) setLatest((b.items as Item[]).slice(-4).reverse()); }).catch(() => { if (!off) setLatest([]); });
    return () => { off = true; };
  }, [cu.id]);
  const summaries = contacts.map((c) => c.recent_summary ?? c.status_summary).filter(Boolean) as string[];
  const name = new Map(contacts.map((c) => [c.id, c.name ?? formatPhone(firstPhone(c))]));
  return (
    <div className="p-4 flex flex-col gap-4">
      {summaries.length > 0
        ? <div className="rounded" style={{ background: T.dustyTint, borderLeft: `3px solid ${T.dustyEdge}`, padding: "10px 14px", fontFamily: light, fontWeight: 300, fontSize: 15, lineHeight: 1.65, letterSpacing: ".005em", color: T.ink }}>
            {summaries.slice(0, 2).join(" ")}
          </div>
        : <div style={{ fontSize: F.sm, color: T.ink3 }}>Dusty hasn&apos;t read this customer&apos;s conversations yet.</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {jobs.length === 0 && <span style={{ fontSize: F.sm, color: T.ink3 }}>No jobs yet — + New scope starts one.</span>}
        {jobs.map((j) => <JobCard key={j.id} j={j} />)}
      </div>
      <div>
        <div className="flex items-center"><span style={{ ...lbl, flex: 1, color: T.ink2 }}>Latest across calls, texts and email</span>
          <button onClick={onThreads} style={{ ...lbl, fontSize: 11, color: T.chalk, cursor: "pointer" }}>All threads ›</button></div>
        <div className="mt-1.5 rounded" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
          {latest === null && <div className="p-3" style={{ fontSize: F.sm, color: T.ink3 }}>…</div>}
          {latest?.length === 0 && <div className="p-3" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing yet.</div>}
          {latest?.map((m, i) => (
            <div key={m.id} className="flex gap-2 px-3 py-2" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", fontSize: F.sm }}>
              <span style={{ ...lbl, fontSize: 10, width: 44, color: m.channel === "call" ? T.chalk : T.green }}>{m.channel === "call" ? "Call" : "Text"}</span>
              <span style={{ flex: 1, minWidth: 0, ...clip, color: T.ink }}>
                <b style={{ fontWeight: 600 }}>{m.direction === "out" ? "You" : name.get(m.contact_id) ?? "Them"}</b> · {m.channel === "call" ? (m.summary ?? `${m.direction === "out" ? "Outbound" : "Inbound"} call ${dur(m.duration_s)}`) : (m.body ?? (m.media_count ? "Photo" : ""))}
              </span>
              <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{relTime(m.at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JobCard({ j }: { j: Job }) {
  const won = ["won", "scheduled", "in_progress", "complete", "closed"].includes(j.status ?? "");
  const cell = (k: string, v: string | null) => (
    <div><div style={{ ...lbl, fontSize: 10, color: T.ink3 }}>{k}</div><div style={{ fontFamily: strong, fontWeight: 600, fontSize: 14, color: v ? T.ink : T.ink3, ...nums }}>{v ?? "—"}</div></div>
  );
  const open = j.quote != null ? Math.max(0, j.quote - j.paid) : null;
  return (
    <Link href={`/dashboard/scope/${j.id}`} className="rounded block" style={{ border: `1px solid ${T.hair}`, background: T.card, padding: "10px 12px", color: T.ink }}>
      <div className="flex items-center gap-2">
        <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 14, flex: 1, ...clip }}>{j.title || "Untitled job"}</span>
        <span style={{ ...lbl, fontSize: 10, padding: "2px 6px", borderRadius: 3, background: T.sunk, color: T.ink2 }}>{STATUS_NAME[j.status ?? ""] ?? j.status ?? "Lead"}</span>
      </div>
      <div className="grid mt-2 gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        {won
          ? <>{cell("Invoiced", j.invoiced ? money0(j.invoiced) : null)}{cell("Paid", j.paid ? money0(j.paid) : null)}{cell(j.status === "complete" || j.status === "closed" ? "Closed" : "Open", open != null ? money0(open) : null)}</>
          : <>{cell(j.quote_basis === "lowest" ? "Quote from" : "Quote", j.quote != null ? money0(j.quote) : null)}{cell("Paid", j.paid ? money0(j.paid) : null)}{cell("Open", open != null ? money0(open) : null)}</>}
      </div>
      {j.quote == null && <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>No price yet — it comes from the job&apos;s budget.</div>}
    </Link>
  );
}

function JobsTab({ jobs, onNew }: { jobs: Job[]; onNew: () => void }) {
  return (
    <div className="p-4 flex flex-col gap-2">
      <div><button onClick={onNew} style={btn(true)}>+ New scope</button></div>
      {jobs.length === 0 ? <span style={{ fontSize: F.sm, color: T.ink3 }}>No jobs yet.</span>
        : <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>{jobs.map((j) => <JobCard key={j.id} j={j} />)}</div>}
    </div>
  );
}

function DocsTab({ customerId }: { customerId: string }) {
  const [files, setFiles] = useState<Array<{ id: string; name: string; category: string | null; created_at: string; summary: string | null; kind: string }> | null>(null);
  useEffect(() => {
    let off = false;
    send(`/api/documents?customer=${customerId}`, "GET").then((b) => { if (!off) setFiles(b.files); }).catch(() => { if (!off) setFiles([]); });
    return () => { off = true; };
  }, [customerId]);
  if (files === null) return <Empty text="…" />;
  if (!files.length) return <Empty text="No documents on this customer's people or jobs yet." />;
  return (
    <div className="p-4 flex flex-col">
      {files.map((f, i) => (
        <Link key={f.id} href={`/dashboard/documents?file=${f.id}`} className="flex gap-3 py-2" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", color: T.ink }}>
          <span style={{ ...lbl, fontSize: 10, width: 40, color: f.kind === "pdf" ? T.red : T.ink3 }}>{f.kind === "pdf" ? "PDF" : f.kind}</span>
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: F.sm, fontWeight: 600, ...clip }}>{f.name}</span>
            {f.summary && <span style={{ display: "block", fontSize: F.xs, color: T.ink3, ...clip }}>{f.summary}</span>}</span>
          <span style={{ fontSize: F.xs, color: T.ink3 }}>{relTime(f.created_at)}</span>
        </Link>
      ))}
    </div>
  );
}

function Payments({ jobs }: { jobs: Job[] }) {
  const rows = jobs.filter((j) => j.paid || j.invoiced);
  if (!rows.length) return <Empty text="No payments or invoices recorded for this customer." />;
  return (
    <div className="p-4">
      {rows.map((j) => (
        <div key={j.id} className="flex gap-3 py-1.5" style={{ fontSize: F.sm, borderBottom: `1px solid ${T.hairSoft}` }}>
          <span style={{ flex: 1 }}>{j.title || "Untitled job"}</span>
          <span style={{ ...nums, color: T.ink2 }}>invoiced {money0(j.invoiced)}</span>
          <span style={{ ...nums, color: T.green }}>paid {money0(j.paid)}</span>
        </div>
      ))}
    </div>
  );
}

function Schedule({ jobs }: { jobs: Job[] }) {
  const rows = jobs.filter((j) => j.scheduled_start).sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? ""));
  if (!rows.length) return <Empty text="Nothing scheduled for this customer." />;
  return (
    <div className="p-4">
      {rows.map((j) => (
        <Link key={j.id} href={`/dashboard/scope/${j.id}`} className="flex gap-3 py-1.5" style={{ fontSize: F.sm, color: T.ink, borderBottom: `1px solid ${T.hairSoft}` }}>
          <span style={{ width: 150, ...nums }}>{new Date(`${j.scheduled_start}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{j.scheduled_end && j.scheduled_end !== j.scheduled_start ? ` – ${new Date(`${j.scheduled_end}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
          <span style={{ flex: 1 }}>{j.title || "Untitled job"}</span>
        </Link>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- threads */

type ChannelFilter = "all" | "call" | "text" | "email";

function Threads({ customerId, contacts, focusContact, wide }: { customerId: string; contacts: Contact[]; focusContact: string | null; wide: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [emailCount, setEmailCount] = useState<number | null>(null);
  const [who, setWho] = useState<string | null>(focusContact && contacts.some((c) => c.id === focusContact) ? focusContact : null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let off = false;
    send(`/api/customers/${customerId}/timeline`, "GET").then((b) => { if (!off) setItems(b.items as Item[]); }).catch((e) => { if (!off) setErr(String(e.message ?? e)); });
    return () => { off = true; };
  }, [customerId]);

  const shown = useMemo(() => (items ?? []).filter((m) => (channel === "all" || m.channel === channel) && (!who || m.contact_id === who)), [items, channel, who]);
  // Open at the newest (the bottom), and again when a filter changes.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const go = () => { el.scrollTop = el.scrollHeight; };
    go(); const r = requestAnimationFrame(go); const t = setTimeout(go, 120);
    return () => { cancelAnimationFrame(r); clearTimeout(t); };
  }, [shown.length, channel, who]);

  const name = new Map(contacts.map((c) => [c.id, c.name ?? formatPhone(firstPhone(c))]));
  const count = (ch: ChannelFilter, cid: string | null = who) => (items ?? []).filter((m) => (ch === "all" || m.channel === ch) && (!cid || m.contact_id === cid)).length;
  const target = contacts.find((c) => c.id === who) ?? contacts.find((c) => c.primary) ?? contacts[0];
  const addNote = useCallback(async (id: string, body: string) => {
    const b = await send(`/api/messages/${id}/notes`, "POST", { body });
    setItems((xs) => (xs ?? []).map((m) => (m.id === id ? { ...m, notes: [...m.notes, b.note] } : m)));
  }, []);

  const chip = (on: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 3,
    background: on ? T.hivizDim : "transparent", color: on ? T.ink : T.ink2, fontSize: F.sm, cursor: "pointer" });
  const filters = (
    <div style={{ width: wide ? 220 : "100%", flexShrink: 0, padding: 12, borderRight: wide ? `1px solid ${T.hair}` : "none", borderBottom: wide ? "none" : `1px solid ${T.hair}` }}>
      <div style={{ ...lbl, fontSize: 11, color: T.ink3, marginBottom: 4 }}>Channel</div>
      <div className={wide ? "flex flex-col" : "flex gap-1 flex-wrap"}>
        {([["all", "All channels"], ["call", "Calls"], ["text", "Texts"], ["email", "Emails"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setChannel(k)} style={{ ...chip(channel === k), width: wide ? "100%" : "auto" }}>
            <span style={{ flex: 1 }}>{l}</span><span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{k === "email" ? (emailCount ?? "—") : count(k)}</span>
          </button>
        ))}
      </div>
      <div style={{ ...lbl, fontSize: 11, color: T.ink3, margin: "10px 0 4px" }}>Contact</div>
      <div className={wide ? "flex flex-col" : "flex gap-1 flex-wrap"}>
        <button onClick={() => setWho(null)} style={{ ...chip(!who), width: wide ? "100%" : "auto" }}><span style={{ flex: 1 }}>Everyone</span><span style={{ fontSize: F.xs, color: T.ink3 }}>{count(channel, null)}</span></button>
        {contacts.map((c) => {
          const ph = firstPhone(c);
          return (
            <div key={c.id} className="flex items-center gap-1" style={{ width: wide ? "100%" : "auto" }}>
              <button onClick={() => setWho(c.id)} style={{ ...chip(who === c.id), flex: 1 }}>
                <span style={{ flex: 1, ...clip }}>{c.name ?? formatPhone(ph)}</span><span style={{ fontSize: F.xs, color: T.ink3 }}>{count(channel, c.id)}</span>
              </button>
              {ph && <a href={`tel:${ph}`} aria-label={`Call ${c.name ?? formatPhone(ph)}`} title={`Call ${formatPhone(ph)}`}
                className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: T.green, color: T.card, flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 1.2 4.4 1l.9 2.3-1.1.8a6 6 0 0 0 2.7 2.7l.8-1.1 2.3.9-.2 1.8c-.1.5-.5.8-1 .8C5.1 9.2 2.8 6.9 1.8 2.2c0-.5.3-.9.8-1Z" fill="currentColor" /></svg>
              </a>}
            </div>
          );
        })}
      </div>
    </div>
  );

  let lastDay = "";
  return (
    <div className={wide ? "flex" : ""} style={{ height: wide ? "calc(100dvh - var(--sc-head) - 128px)" : undefined, minHeight: 420 }}>
      {filters}
      <div className="flex flex-col" style={{ flex: 1, minWidth: 0, height: wide ? "100%" : "70dvh" }}>
        <div ref={scroller} className="overflow-y-auto px-4 py-3" style={{ flex: 1 }}>
          {err && <div style={{ color: T.red, fontSize: F.sm }}>{err}</div>}
          {items === null && !err && <div className="rounded animate-pulse" style={{ height: 120, background: T.hairSoft }} />}
          {/* The email mirror (migration 061): bid emails forwarded to the intake inbox, filed on this customer. */}
          {channel === "email" && <div className="-mx-4 -my-3"><EmailList customer={customerId} onCount={setEmailCount} /></div>}
          {items && channel !== "email" && shown.length === 0 && <div className="py-6" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing here.</div>}
          {channel !== "email" && shown.map((m) => {
            const d = day(m.at);
            const divider = d !== lastDay;
            lastDay = d;
            return (
              <React.Fragment key={m.id}>
                {divider && <div className="flex items-center gap-2 my-3"><span style={{ flex: 1, height: 1, background: T.hair }} /><span style={{ ...lbl, fontSize: 10, color: T.ink3 }}>{d}</span><span style={{ flex: 1, height: 1, background: T.hair }} /></div>}
                {m.channel === "call"
                  ? <CallCard m={m} who={name.get(m.contact_id) ?? "Them"} onAddNote={addNote} />
                  : <TextBubble m={m} who={name.get(m.contact_id) ?? "Them"} showWho={!who && contacts.length > 1} />}
              </React.Fragment>
            );
          })}
        </div>
        {channel === "text" && target && (
          <Composer contactId={target.id} phone={firstPhone(target)} name={target.name} only="text" />
        )}
        {channel === "email" && target && firstEmail(target) && (
          <Composer contactId={target.id} phone={firstPhone(target)} name={target.name} only="email" />
        )}
      </div>
    </div>
  );
}

function TextBubble({ m, who, showWho }: { m: Item; who: string; showWho: boolean }) {
  const out = m.direction === "out";
  return (
    <div className={`flex mb-2 ${out ? "justify-end" : "justify-start"}`}>
      <div style={{ maxWidth: "76%", background: out ? T.outBg : T.card, color: out ? T.outInk : T.ink, border: `1px solid ${T.hair}`, borderRadius: 10, padding: "7px 11px" }}>
        {showWho && !out && <div style={{ ...lbl, fontSize: 10, color: T.ink3 }}>{who}</div>}
        {m.body && <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{m.body}</div>}
        {m.media_count > 0 && <MessageMedia messageId={m.id} count={m.media_count} isOut={out} />}
        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2, textAlign: out ? "right" : "left" }}>{time(m.at)}</div>
      </div>
    </div>
  );
}

/** A call, per the handoff: summary first → next steps → recording → transcript → notes. Nothing here places a call. */
function CallCard({ m, who, onAddNote }: { m: Item; who: string; onAddNote: (id: string, body: string) => Promise<void> }) {
  const [tx, setTx] = useState<string | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [txErr, setTxErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const steps = (m.next_steps ?? "").split(/\n+|(?<=\.)\s+(?=[A-Z])/).map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
  const openTx = async () => {
    const next = !txOpen;
    setTxOpen(next);
    if (!next || tx !== null) return;
    try {
      const r = await fetch(`/api/messages/${m.id}/artifacts`);
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error ?? `HTTP ${r.status}`);
      setTx(b?.transcript?.content ?? "");
    } catch (e) { setTxErr(e instanceof Error ? e.message : String(e)); }
  };
  const row: React.CSSProperties = { minHeight: 36, display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.hairSoft}` };
  return (
    <article className="mb-2.5" style={{ maxWidth: 600, background: T.card, border: `1px solid ${T.hair}`, borderRadius: 5, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
      <header className="flex items-center gap-2">
        <span style={{ ...lbl, color: T.chalk }}>Call · {m.direction === "out" ? "Out" : "In"}{m.has_voicemail ? " · Voicemail" : ""}{m.duration_s != null ? ` · ${dur(m.duration_s)}` : ""}</span>
        <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 12, color: T.ink }}>{m.direction === "out" ? `to ${who}` : who}</span>
        <span className="flex-1" />
        <span style={{ ...lbl, fontWeight: 400, fontSize: 11, color: T.ink3 }}>{time(m.at)}</span>
      </header>
      <DraftQuoteButton messageId={m.id} style={{ alignSelf: "flex-start" }} />
      {m.summary && <div><div style={{ ...lbl, fontSize: 11, color: T.hivizText }}>Summary · Dusty</div><p style={{ margin: "3px 0 0", fontSize: 13.5, lineHeight: 1.5, color: T.ink }}>{m.summary}</p></div>}
      {steps.length > 0 && (
        <div style={{ background: T.dustyTint, borderRadius: 3, padding: "7px 11px" }}>
          <div style={{ ...lbl, fontSize: 11, color: T.dustyText }}>Next steps</div>
          {steps.map((s) => <div key={s} className="flex gap-2 items-center mt-1" style={{ fontSize: 13, color: T.ink }}><span style={{ width: 12, height: 12, borderRadius: 2, border: `1.5px solid ${T.dustyEdge}`, flexShrink: 0 }} />{s}</div>)}
        </div>
      )}
      <div style={{ borderTop: `1px solid ${T.hairSoft}` }}>
        <div style={row}>
          <span style={{ ...lbl, width: 80, color: T.ink2 }}>Recording</span>
          {m.has_recording || m.has_voicemail
            ? <div style={{ flex: 1 }}><PlayAudio messageId={m.id} kind={m.has_recording ? "recording" : "voicemail"} label={m.has_recording ? "Play recording" : "Play voicemail"} /></div>
            : <span style={{ fontSize: 12, color: T.ink3 }}>No recording</span>}
        </div>
        <button onClick={() => void openTx()} disabled={!m.has_transcript} aria-expanded={txOpen} className="w-full text-left"
          style={{ ...row, cursor: m.has_transcript ? "pointer" : "default", background: "transparent", color: T.ink }}>
          <span style={{ width: 12, textAlign: "center", transform: txOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
          <span style={{ ...lbl, color: T.ink2 }}>Transcript</span>
          <span style={{ fontSize: 12, color: T.ink3 }}>{!m.has_transcript ? "Not transcribed" : txOpen ? "Hide" : "Tap to read"}</span>
        </button>
        {txOpen && (
          <div style={{ padding: "8px 0 10px 22px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", color: T.ink, borderBottom: `1px solid ${T.hairSoft}`, maxHeight: 360, overflowY: "auto" }}>
            {txErr ? <span style={{ color: T.red }}>{txErr}</span> : tx === null ? "…" : tx || "Empty transcript."}
          </div>
        )}
        <div style={{ ...row, borderBottom: "none", alignItems: "flex-start", paddingTop: 8 }}>
          <span style={{ ...lbl, width: 80, color: T.ink2 }}>Notes</span>
          <div className="flex flex-col gap-1" style={{ flex: 1 }}>
            {m.notes.map((n) => <span key={n.id} style={{ fontSize: 13, color: T.ink }}>{n.body} <span style={{ fontSize: 10, color: T.ink3 }}>{relTime(n.created_at)}</span></span>)}
            {adding ? (
              <form onSubmit={async (e) => { e.preventDefault(); if (!draft.trim()) return; await onAddNote(m.id, draft.trim()); setDraft(""); setAdding(false); }} className="flex gap-1.5">
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Note on this call"
                  style={{ flex: 1, height: 28, padding: "0 8px", border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.slab, color: T.ink }} />
                <button type="submit" style={{ ...lbl, height: 28, padding: "0 10px", borderRadius: 3, background: T.hiviz, color: T.onHiviz }}>Save</button>
              </form>
            ) : (
              <button onClick={() => setAdding(true)} className="text-left" style={{ fontSize: 13, color: T.chalk, cursor: "pointer" }}>+ Add a note to this call</button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
