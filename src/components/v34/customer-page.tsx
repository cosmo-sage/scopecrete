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
 * picked) · Jobs · Payments · Files · Schedule (2026-09-30; reshaped 2026-10-03, below). Nothing invented:
 * an empty tab says what is missing. Email is not connected yet and says so.
 */

import { EmailList } from "@/components/v34/email-sheet";
import { plainNote } from "@/lib/mentions";
import { MentionField } from "@/components/v34/mention-field";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { T, F, eyebrow, nums, clip, money0, formatPhone, relTime, strong, BUCKET } from "@/lib/v34/tokens";
import { RoleTag } from "@/components/v34/thread-list";
import { RecordHeader, HeaderNote, OverviewGrid, PanelCard, SectionHead, Empty, Facts, ContactCard, ThreadChips, RecentCard, JobRow, Field,
  ASK_DUSTY, menuItem, btn, lbl, panelTitle, send, type CardPerson } from "@/components/v34/record-page";
import { Sheet } from "@/components/v34/primitives";
import { SiteViews, AddressLink } from "@/components/v34/site-views";
import { useWide } from "@/lib/v34/use-wide";
import { PlayAudio, MessageMedia } from "@/components/v34/conversation";
import { Composer } from "@/components/v34/composer";
import { FilesPage } from "@/components/v34/files-page";
import { FilesPanel } from "@/components/v34/files-panel";
import { STATUS_NAME } from "@/lib/jobs/stages";
import { CallNotesPad, DraftQuoteButton } from "@/components/v34/call-notes-pad";
import { ArchiveButton } from "@/components/v34/archive-actions";
import { AddressInput } from "@/components/v34/address-input";
import type { AddressMatch } from "@/lib/address-check";
import { ContactPicker } from "@/components/v34/contacts";

interface Method { kind: "mobile" | "office" | "home" | "phone" | "email"; value: string; can_text: boolean | null; primary: boolean }
interface Contact { id: string; name: string | null; role: string | null; primary: boolean; bucket: string | null; status_summary: string | null; recent_summary: string | null; last_contacted: string | null; methods: Method[] }
interface Job { id: string; title: string | null; status: string | null; job_type: string | null; address: string | null; scheduled_start: string | null; scheduled_end: string | null; won_at: string | null; quote: number | null; quote_basis: string | null; paid: number; invoiced: number }
interface Customer {
  id: string; name: string | null; customer_type: string | null; customer_type_source: string | null; subtype: string | null;
  lead_source: string | null; status: string | null; notes: string | null; since: string | null; primary_contact_id: string | null;
  address_line1: string | null; city: string | null; state: string | null; zip: string | null; address_formatted: string | null;
  lat: number | null; lng: number | null; address_source: string | null; created_at: string;
  archived_at?: string | null;
}
interface Data { customer: Customer; contacts: Contact[]; jobs: Job[]; maps: { embed: boolean; geocode: boolean }; heard_address?: { hint: string; match: AddressMatch | null } | null }
interface Item {
  id: string; contact_id: string; channel: "call" | "text"; direction: "in" | "out"; at: string; body: string | null;
  duration_s: number | null; status: string | null; media_count: number; summary: string | null; next_steps: string | null;
  has_transcript: boolean; has_recording: boolean; has_voicemail: boolean; notes: Array<{ id: string; body: string; created_at: string }>;
}

// Threads v2 handoff §4: Overview · Contacts · Jobs · Threads (the threads they're in) · Files, then
// Timeline (every call and text, with call notes), Payments, Schedule. Documents is gone — Files is the one place (Coy, 2026-10-03).
type Tab = "overview" | "contacts" | "jobs" | "threads" | "files" | "timeline" | "payments" | "schedule";
const TYPE_LABEL: Record<string, string> = { residential: "Residential", commercial: "Commercial", public: "Government" };

const initials = (n: string | null) => (n ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const firstPhone = (c: Contact | undefined) => c?.methods.find((m) => m.kind !== "email")?.value ?? null;
const firstEmail = (c: Contact | undefined) => c?.methods.find((m) => m.kind === "email")?.value ?? null;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dur = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

export function CustomerPage({ customerId, focusContact }: { customerId: string; focusContact?: string | null }) {
  const router = useRouter();
  const search = useSearchParams();
  const fromThread = search.get("from") === "threads" && focusContact ? `/dashboard/messages/${focusContact}${search.get("t") ? `?t=${encodeURIComponent(search.get("t") as string)}` : ""}` : null;
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [callNotes, setCallNotes] = useState(false);
  const [note, setNote] = useState<{ text: string; undo?: string } | null>(null);
  const [custom, setCustom] = useState<Array<{ id: string; name: string; contact_ids: string[]; count: number }>>([]);
  const [measure, wide] = useWide<HTMLDivElement>(1000);
  const reload = () => setTick((n) => n + 1);

  useEffect(() => {
    let off = false;
    send(`/api/customers/${customerId}`, "GET")
      .then((b) => { if (off) return; if (b.redirect_to) { router.replace(`/dashboard/customers/${b.redirect_to}`); return; } setData(b as Data); setErr(null); })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [customerId, tick, router]);
  // The threads Coy made (migration 073) — the chips say which of them hold these people.
  useEffect(() => {
    let off = false;
    send("/api/threads/custom", "GET").then((b) => { if (!off) setCustom(b.threads ?? []); }).catch(() => {});
    return () => { off = true; };
  }, [tick]);

  if (err) return <div ref={measure} className="p-4" style={{ color: T.red, fontSize: F.sm }}>Couldn&apos;t load this customer: {err}</div>;
  if (!data) return <div ref={measure} className="p-4"><div className="rounded animate-pulse" style={{ height: 140, background: T.hairSoft }} /></div>;

  const { customer: cu, contacts, jobs } = data;
  const primary = contacts.find((c) => c.primary) ?? contacts[0];
  const ids = new Set(contacts.map((c) => c.id));
  const theirThreads = custom.filter((t) => t.contact_ids.some((id) => ids.has(id)));
  const quoted = jobs.reduce((n, j) => n + (j.quote ?? 0), 0);
  const meta = [
    cu.customer_type ? TYPE_LABEL[cu.customer_type] ?? cu.customer_type : null,
    cu.since ? `since ${new Date(cu.since).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : null,
    `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`,
    `${jobs.length} job${jobs.length === 1 ? "" : "s"}`,
    quoted ? `${money0(quoted)} quoted` : null,
  ].filter(Boolean).join(" · ");
  const customerBucket = { label: "Customer", colour: BUCKET.customer, href: contacts[0] ? `/dashboard/messages/${contacts[0].id}?t=customers` : "/dashboard/messages?t=customers" };
  const tabs: Array<[Tab, string]> = [["overview", "Overview"], ["contacts", `Contacts ${contacts.length}`], ["jobs", `Jobs ${jobs.length}`], ["threads", `Threads ${theirThreads.length + 1}`],
    ["files", "Files"], ["timeline", "Timeline"], ["payments", "Payments"], ["schedule", "Schedule"]];

  const newScope = async () => {
    try {
      const b = await send("/api/jobs", "POST", { contact_id: primary?.id, job_type: cu.customer_type ?? undefined });
      router.push(`/dashboard/scope/${b.job.id}`);
    } catch (e) { setNote({ text: e instanceof Error ? e.message : String(e) }); }
  };
  const toCard = (c: Contact): CardPerson => ({ id: c.id, name: c.name, role: c.role, primary: c.primary, href: `/dashboard/messages/${c.id}?t=customers`,
    methods: c.methods.map((m) => ({ kind: m.kind === "email" ? "email" as const : "phone" as const, label: METHOD_LABEL[m.kind], value: m.value, can_text: m.can_text })) });

  return (
    <div ref={measure} style={{ minHeight: "calc(100dvh - var(--sc-head))", background: T.slab }}>
      {cu.archived_at && (
        <div className="px-4 py-2 flex items-center gap-2" style={{ background: T.redDim, fontSize: F.sm }}>
          <span style={{ flex: 1 }}>This customer is deleted — out of every list, with their people and the jobs deleted with them.</span>
          <button onClick={() => void fetch("/api/archive/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "customer", ids: [cu.id] }) }).then(() => setTick((n) => n + 1))}
            className="rounded px-2.5" style={{ height: 28, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, fontWeight: 600, cursor: "pointer" }}>Restore</button>
        </div>
      )}
      {/* ---- header (Threads v2 handoff §4; shared with the contact and vendor pages, record-page.tsx) ---- */}
      <RecordHeader back={{ href: fromThread ?? "/dashboard/customers", label: fromThread ? "Back to the thread" : "Customers" }}
        title={cu.name || "Unnamed customer"} tag={<RoleTag role="customer" />} wide={wide}
        actions={[{ label: "Edit", onClick: () => setEditing(true) }, { label: "New job", primary: true, disabled: !primary, onClick: () => void newScope() }, ASK_DUSTY]}
        menu={[
          { label: "Call notes", disabled: !primary, onClick: () => setCallNotes(true) },
          <ArchiveButton key="del" kind="customer" id={cu.id} action="delete" what={cu.name || "this customer"} then="/dashboard/customers"
            style={{ ...menuItem, color: T.red }}>Delete customer</ArchiveButton>,
        ]}
        meta={meta} tabs={tabs} tab={tab} onTab={(k) => setTab(k as Tab)}>
        {note && <HeaderNote text={note.text} onDismiss={() => setNote(null)}
          action={note.undo ? { label: "Undo", onClick: () => void send(`/api/customer-moves/${note.undo}/undo`, "POST").then(() => { setNote(null); reload(); }).catch((e) => setNote({ text: String(e.message ?? e) })) } : undefined} />}
      </RecordHeader>
      {primary && <CallNotesPad contactId={primary.id} who={primary.name || cu.name || "this customer"} open={callNotes} onClose={() => { setCallNotes(false); setTick((n) => n + 1); }} />}

      {tab === "overview" && (
        <OverviewGrid wide={wide} meta={meta}
          sideCompact={<OverviewSide cu={cu} data={data} contacts={contacts} onEdit={() => setEditing(true)} onSaved={reload} compact />}
          side={<OverviewSide cu={cu} data={data} contacts={contacts} onEdit={() => setEditing(true)} onSaved={reload} />}>
          <section>
            <SectionHead title="Contacts on this customer" action={{ label: "+ Add contact", onClick: () => setTab("contacts") }} />
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {contacts.map((c) => <ContactCard key={c.id} c={toCard(c)} compact={!wide} />)}
              {!contacts.length && <Empty text="No contacts on this customer." />}
            </div>
          </section>
          <section>
            <SectionHead title="Jobs" />
            <div className="flex flex-col gap-2">
              {jobs.map((j) => (
                <JobRow key={j.id} href={`/dashboard/scope/${j.id}`} title={j.title || "Untitled job"}
                  sub={[j.status ? STATUS_NAME[j.status] ?? j.status : null, j.address].filter(Boolean).join(" · ")}
                  right={j.quote != null ? money0(j.quote) : <span style={{ fontSize: 12, color: T.ink3 }}>no price yet</span>} />
              ))}
              {!jobs.length && <button onClick={() => void newScope()} className="rounded text-left" style={{ padding: "10px 12px", border: `1px dashed ${T.hairStrong}`, color: T.hivizText, fontSize: F.sm, cursor: "pointer" }}>No jobs yet — start one</button>}
            </div>
          </section>
          <section>
            <SectionHead title="Threads these contacts are in" />
            <ThreadChips bucket={customerBucket} threads={theirThreads} />
          </section>
        </OverviewGrid>
      )}
      {tab === "contacts" && (
        <div className={wide ? "grid" : ""} style={wide ? { gridTemplateColumns: "minmax(0,1fr) 400px", gap: 14, padding: "14px 16px" } : undefined}>
          <div style={{ background: T.card, border: wide ? `1px solid ${T.hair}` : "none", borderRadius: 4 }}><Contacts cu={cu} contacts={contacts} onChanged={reload} onNote={setNote} /></div>
          <div style={{ background: T.card, border: wide ? `1px solid ${T.hair}` : "none", borderRadius: 4 }}><CustomerFacts cu={cu} onEdit={() => setEditing(true)} /></div>
        </div>
      )}
      {tab === "jobs" && <JobsTab jobs={jobs} onNew={() => void newScope()} />}
      {tab === "threads" && <ThreadsSummary customerId={customerId} contacts={contacts} bucket={customerBucket} threads={theirThreads} onTimeline={() => setTab("timeline")} />}
      {tab === "files" && <FilesTab customerId={customerId} primaryId={primary?.id ?? null} primaryName={primary?.name ?? null} />}
      {tab === "timeline" && <Threads customerId={customerId} contacts={contacts} focusContact={focusContact ?? null} wide={wide} />}
      {tab === "payments" && <Payments jobs={jobs} />}
      {tab === "schedule" && <Schedule jobs={jobs} />}

      <EditSheet open={editing} cu={cu} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
    </div>
  );
}

/**
 * Threads tab (Coy, 2026-10-05: "The threads tab is supposed to be more useful … pull information
 * from the thread into here. maybe a summary"): for each person on the customer, Dusty's line on
 * where it stands and on the latest conversations, their last few calls and texts, and the way into
 * their thread; then the threads they're in.
 */
function ThreadsSummary({ customerId, contacts, bucket, threads, onTimeline }: {
  customerId: string; contacts: Contact[];
  bucket: React.ComponentProps<typeof ThreadChips>["bucket"]; threads: React.ComponentProps<typeof ThreadChips>["threads"];
  onTimeline: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    let off = false;
    send(`/api/customers/${customerId}/timeline?limit=60`, "GET").then((b) => { if (!off) setItems(b.items as Item[]); }).catch(() => { if (!off) setItems([]); });
    return () => { off = true; };
  }, [customerId]);
  return (
    <div className="p-4 flex flex-col gap-3" style={{ maxWidth: 980 }}>
      {contacts.map((c) => {
        const latest = (items ?? []).filter((m) => m.contact_id === c.id).slice(-3).reverse();
        return (
          <PanelCard key={c.id}><div style={{ padding: "12px 14px" }}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span style={{ fontFamily: strong, fontSize: 15, fontWeight: 600 }}>{c.name || formatPhone(c.methods.find((m) => m.kind !== "email")?.value ?? "") || "No name"}</span>
              {c.role && <span style={{ fontSize: 12, color: T.ink3 }}>{c.role}</span>}
              {c.last_contacted && <span style={{ fontSize: 12, color: T.ink3 }}>· last heard {relTime(c.last_contacted)}</span>}
              <span className="flex-1" />
              <Link href={`/dashboard/messages/${c.id}?t=customers`} style={{ ...eyebrow, color: T.chalk }}>Open in Threads ›</Link>
            </div>
            {c.status_summary && <div style={{ fontSize: 13.5, color: T.ink, marginTop: 6, lineHeight: 1.45 }}>{c.status_summary}</div>}
            {c.recent_summary && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4, lineHeight: 1.5 }}>{c.recent_summary}</div>}
            {!c.status_summary && !c.recent_summary && <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 6 }}>Dusty hasn&apos;t summed up their conversations yet.</div>}
            {latest.length > 0 && (
              <div className="mt-2 flex flex-col" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                {latest.map((m) => (
                  <div key={m.id} className="flex items-baseline gap-2" style={{ padding: "6px 0", borderBottom: `1px solid ${T.hairSoft}`, fontSize: 12.5 }}>
                    <span style={{ ...eyebrow, fontSize: 10.5, color: T.ink3, width: 64, flex: "none" }}>{m.channel === "call" ? (m.direction === "in" ? "Call in" : "Call out") : m.direction === "in" ? "Text in" : "Text out"}</span>
                    <span style={{ flex: 1, minWidth: 0, color: T.ink2, ...clip }}>{m.summary || m.body || (m.channel === "call" ? (m.has_voicemail ? "Voicemail" : "Call — nothing summed up") : m.media_count ? "Photo or file" : "")}</span>
                    <span style={{ fontSize: 11, color: T.ink3, ...nums, flex: "none" }}>{new Date(m.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                ))}
                <button onClick={onTimeline} className="text-left mt-1.5" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Every call and text in Timeline ›</button>
              </div>
            )}
            {items && !latest.length && <div style={{ fontSize: 12, color: T.ink3, marginTop: 6 }}>No calls or texts with them yet.</div>}
          </div></PanelCard>
        );
      })}
      {!contacts.length && <Empty text="No contacts on this customer." />}
      <section>
        <SectionHead title="Threads they're in" />
        <ThreadChips bucket={bucket} threads={threads} />
      </section>
    </div>
  );
}

/** The right column: the map and address, then the latest from every contact on every channel. */
function OverviewSide({ cu, data, contacts, onEdit, onSaved, compact }: { cu: Customer; data: Data; contacts: Contact[]; onEdit: () => void; onSaved: () => void; compact?: boolean }) {
  const [latest, setLatest] = useState<Item[] | null>(null);
  useEffect(() => {
    if (compact) return;
    let off = false;
    send(`/api/customers/${cu.id}/timeline?limit=20`, "GET").then((b) => { if (!off) setLatest((b.items as Item[]).slice(-4).reverse()); }).catch(() => { if (!off) setLatest([]); });
    return () => { off = true; };
  }, [cu.id, compact]);
  const who = new Map(contacts.map((c) => [c.id, c]));
  return (
    <div className="flex flex-col gap-3" style={{ minWidth: 0 }}>
      <PanelCard>
        <LocationCard cu={cu} maps={data.maps} heard={data.heard_address ?? null} onEdit={onEdit} onSaved={onSaved} />
      </PanelCard>
      {!compact && (
        <div>
          <div style={{ ...eyebrow, marginBottom: 6 }}>Recent, across every contact and channel</div>
          <div className="flex flex-col gap-2">
            {latest === null && <div style={{ fontSize: F.sm, color: T.ink3 }}>…</div>}
            {latest?.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3 }}>Nothing yet.</div>}
            {latest?.map((m) => {
              const c = who.get(m.contact_id);
              const num = c?.methods.find((x) => x.kind !== "email")?.value ?? null;
              return (
                <RecentCard key={m.id} href={`/dashboard/messages/${m.contact_id}?t=customers`}
                  kind={`${m.channel === "call" ? (m.has_voicemail ? "Voicemail" : "Call") : m.media_count && !m.body ? "Photo" : "Text"} · ${m.direction}`}
                  who={[c?.name, num ? formatPhone(num) : null].filter(Boolean).join(" · ")} at={m.at}
                  text={m.channel === "call" ? m.summary ?? `${m.direction === "out" ? "Outbound" : "Inbound"} call ${dur(m.duration_s)}` : m.body ?? (m.media_count ? "Photo" : "")} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const METHOD_LABEL: Record<Method["kind"], string> = { mobile: "Mobile", office: "Work", home: "Home", phone: "Phone", email: "Email" };

/** Files (Coy, 2026-10-03: one place — Documents is gone): everything on their people and jobs, filtered, and Add files. */
function FilesTab({ customerId, primaryId, primaryName }: { customerId: string; primaryId: string | null; primaryName: string | null }) {
  // The Files page's own search and filters, pinned to this customer (its people's and jobs' files).
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);
  const fixed = useMemo(() => ({ customer: customerId }), [customerId]);
  return (
    <div className="p-4 flex flex-col gap-3">
      <FilesPage key={tick} embedded fixed={fixed} extra={primaryId ? <button onClick={() => setAdding(true)} style={btn(true)}>+ Add files</button> : null} />
      {adding && primaryId && (
        <Sheet open onClose={() => { setAdding(false); setTick((n) => n + 1); }} title="Add files" sub={`Filed on ${primaryName ?? "the primary contact"}; Dusty reads them in the background.`}>
          <div className="p-4"><FilesPanel contactId={primaryId} title="Files" /></div>
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ right panel */

function LocationCard({ cu, heard, onEdit, onSaved }: { cu: Customer; maps: Data["maps"]; heard: Data["heard_address"]; onEdit: () => void; onSaved: () => void }) {
  const addr = cu.address_formatted;
  const stored = cu.lat != null && cu.lng != null ? { lat: cu.lat, lng: cu.lng } : null;
  return (
    <section style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${T.hair}`, display: "flex", flexDirection: "column", gap: 8 }}>
      {addr ? (
        <>
          <AddressLink addr={addr} />
          <SiteViews addr={addr} stored={stored} />
        </>
      ) : heard ? (
        <HeardAddress cu={cu} heard={heard} onEdit={onEdit} onSaved={onSaved} />
      ) : (
        <button onClick={onEdit} className="text-left" style={{ padding: "8px 10px", border: `1px dashed ${T.hairStrong}`, borderRadius: 3, color: T.hivizText, fontSize: F.sm, cursor: "pointer", background: "transparent" }}>
          No address on file — add one
        </button>
      )}
      {addr && (cu.address_source === "contact" || cu.address_source === "geocode") && (
        <span style={{ fontSize: 11, color: T.ink3 }}>
          {cu.address_source === "contact" ? "From their own text or contact details — check it." : "Heard on a call and matched by Mapbox — check it."}
        </span>
      )}
    </section>
  );
}

/** An address said on a call that Mapbox couldn't match for sure (071): shown, never saved without Coy's tap. */
function HeardAddress({ cu, heard, onEdit, onSaved }: { cu: Customer; heard: NonNullable<Data["heard_address"]>; onEdit: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = heard.match;
  const use = async () => {
    if (!m) return;
    setBusy(true); setErr(null);
    try { await send(`/api/customers/${cu.id}`, "PATCH", { address_line1: m.line1, city: m.city, state: m.state, zip: m.zip }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div style={{ padding: "8px 10px", border: `1px dashed ${T.hivizText}`, borderRadius: 3, fontSize: F.sm, color: T.ink, display: "flex", flexDirection: "column", gap: 6 }}>
      <div><span style={{ color: T.ink3 }}>Heard on a call:</span> “{heard.hint}”</div>
      {m
        ? <div><span style={{ color: T.ink3 }}>Mapbox finds:</span> <b>{m.formatted}</b>{m.confidence ? <span style={{ color: T.ink3, fontSize: 11 }}> · {m.confidence} match</span> : null}</div>
        : <div style={{ color: T.ink3 }}>Mapbox didn&apos;t find that address — a transcript can mishear a street.</div>}
      <div className="flex gap-2">
        {m && <button onClick={() => void use()} disabled={busy} style={{ ...btn(true), height: 30 }}>{busy ? "Saving…" : "Use it"}</button>}
        <button onClick={onEdit} style={{ ...btn(false), height: 30 }}>Type it</button>
      </div>
      {err && <div style={{ color: T.red, fontSize: 11 }}>{err}</div>}
    </div>
  );
}

function CustomerFacts({ cu, onEdit }: { cu: Customer; onEdit: () => void }) {
  return (
    <Facts title="Customer" onEdit={onEdit} rows={[
      ["Type", cu.customer_type ? [TYPE_LABEL[cu.customer_type] ?? cu.customer_type, cu.subtype].filter(Boolean).join(" · ") : null,
        cu.customer_type_source === "jobs" ? "(from its jobs)" : undefined],
      ["Lead source", cu.lead_source],
      ["Status", cu.status],
      ["Notes", cu.notes],
    ]} />
  );
}

function Contacts({ cu, contacts, onChanged, onNote }: { cu: Customer; contacts: Contact[]; onChanged: () => void; onNote: (n: { text: string; undo?: string }) => void }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roleFor, setRoleFor] = useState<string | null>(null);
  const [role, setRole] = useState("");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onChanged(); } catch (e) { onNote({ text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  const attach = (id: string, name: string | null) => void run(async () => {
    const b = await send(`/api/customers/${cu.id}/contacts`, "POST", { contact_id: id });
    onNote({ text: `${name ?? "They"} now ${name ? "is" : "are"} a contact of ${cu.name ?? "this customer"}.`, undo: b.move_id ?? undefined });
    setAdding(false);
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
          <ContactPicker busy={busy} exclude={contacts.map((c) => c.id)} placeholder="Find a person in Contacts: name, number or email"
            onPick={(p) => attach(p.id, p.name)} />
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

const L = Field;

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
        <L k="Street"><AddressInput value={f.address_line1 ?? ""} onChange={(v) => setF((x) => ({ ...x, address_line1: v }))} style={field}
          near={cu.lat != null && cu.lng != null ? { lat: cu.lat, lng: cu.lng } : null}
          onPick={(m) => setF((x) => ({ ...x, address_line1: m.line1, city: m.city ?? "", state: m.state ?? "", zip: m.zip ?? "" }))} /></L>
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

/** A call, per the handoff: summary first → recording (next steps are Dusty's, 2026-10-06) → transcript → notes. Nothing here places a call. */
function CallCard({ m, who, onAddNote }: { m: Item; who: string; onAddNote: (id: string, body: string) => Promise<void> }) {
  const [tx, setTx] = useState<string | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [txErr, setTxErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
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
            {m.notes.map((n) => <span key={n.id} style={{ fontSize: 13, color: T.ink }}>{plainNote(n.body)} <span style={{ fontSize: 10, color: T.ink3 }}>{relTime(n.created_at)}</span></span>)}
            {adding ? (
              <form onSubmit={async (e) => { e.preventDefault(); if (!draft.trim()) return; await onAddNote(m.id, draft.trim()); setDraft(""); setAdding(false); }} className="flex gap-1.5">
                {/* @ tags a teammate, onsite estimators included — they get a notification (081). */}
                <MentionField autoFocus value={draft} onChange={setDraft} placeholder="Note on this call · @ to tag"
                  style={{ height: 28, padding: "0 8px", border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.slab, color: T.ink }} />
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
