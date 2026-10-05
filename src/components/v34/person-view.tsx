"use client";

/**
 * A contact's own page and the vendor page (Coy, 2026-09-28; reshaped
 * 2026-10-05 to the customer page's layout — "I would rather have consistent
 * formatting across contact, customer and vendor … Really a contact needs to
 * become a customer or vendor or spam anyway").
 *
 * The same parts as the customer page (record-page.tsx): ‹ back · name (with
 * its pencil) and role tag · Edit · New job · Ask Dusty (more under ⋯) · the
 * facts line · one row of tabs — Overview first, then Next steps · Jobs ·
 * Threads · Timeline · Files (a vendor adds Prices and Receipts & quotes, from
 * vendors.tsx). The Overview: Dusty's read, the person's card with every
 * number and email, next steps, jobs, the threads they're in; on the right
 * Location, the facts and Recent. Someone not filed yet has the four buckets
 * right under the header — filing them is the point of the page.
 *
 * Text sends through Quo from the composer on Coy's tap (DECISIONS §6,
 * 2026-10-05); Email opens the phone's mail app; Ask Dusty opens Dusty on this
 * person.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow, clip, relTime, strong, BUCKET } from "@/lib/v34/tokens";
import { Composer } from "@/components/v34/composer";
import { DA, MergeSheet, Timeline, formatPhone, type MergeInfo, type Note, type ThreadMessage } from "@/components/v34/conversation";
import { JOB_TYPE_LABEL, stageOf } from "@/lib/jobs/stages";
import { NameEditor, FileAsSheet } from "@/components/v34/contact-edit";
import { BucketPicker, type Bucket } from "@/components/v34/bucket-picker";
import { RoleTag } from "@/components/v34/thread-list";
import { useWide } from "@/lib/v34/use-wide";
import { FilesPanel } from "@/components/v34/files-panel";
import { FilesPage } from "@/components/v34/files-page";
import { Sheet } from "@/components/v34/primitives";
import { CallNotesPad } from "@/components/v34/call-notes-pad";
import { ArchiveButton } from "@/components/v34/archive-actions";
import { AddressInput } from "@/components/v34/address-input";
import { roleOf, type Channel } from "@/lib/v34/threads";
import { useLiveThreads } from "@/lib/v34/live-threads";
import {
  RecordHeader, HeaderNote, OverviewGrid, PanelCard, SectionHead, Facts, LocationPanel, ContactCard, ThreadChips, RecentCard, JobRow, Field,
  ASK_DUSTY, menuItem, btn, fieldStyle, send, type RecordAction, type CardMethod,
} from "@/components/v34/record-page";

export interface Person {
  contact: {
    id: string; customer_id?: string | null; name: string | null; name_confirmed: boolean; phones: string[];
    email: string | null; address: string | null; address_source?: string | null; company: string | null;
    bucket: "customer" | "vendor" | "personal" | "spam" | null;
    bucket_state: "confirmed" | "auto" | null;
    subtype: string | null; subtype_label: string | null;
    status_summary: string | null; recent_summary: string | null;
    job_type_hint: string | null; status_summary_at: string | null;
    /** Dusty's latest classification — the picker's dashed guess. */
    guess?: string | null;
  };
  subtypes?: Array<{ bucket: "customer" | "vendor" | "personal" | "spam"; slug: string; label: string }>;
  /** Coy's notes (migration 041), newest first. */
  notes?: Array<{ id: string; body: string; created_at: string }>;
  jobs: Array<{
    id: string; title: string | null; status: string | null; job_type: string | null; flag_reason: string | null;
    counts: boolean; address: string | null;
    vendors: Array<{ contact_id: string; name: string | null; phone: string | null; role: string | null }>;
  }>;
  vendor_jobs: Array<{ id: string; title: string | null; status: string | null; job_type: string | null; role: string | null; customer: string | null }>;
  tasks: Task[];
  /** Another live contact with the same name or email — maybe the same person. */
  possible_duplicates?: Array<{ id: string; name: string | null; phone: string | null; same: "name" | "email" }>;
  scope: { project_type: string | null; scope_summary: string | null; site_hint: string | null; sqft_stated: number | null;
           length_ft: number | null; width_ft: number | null; start_timing: string | null; has_media: boolean } | null;
}

interface Task {
  id: string; title: string; due_on: string | null; source: "coy" | "dusty"; status: "open" | "done" | "dismissed";
  evidence_quote: string | null; job_id: string | null; created_at: string; done_at: string | null;
}

/**
 * What the vendor page adds to a person's page (vendors.tsx): its own tabs
 * (Prices, Receipts & quotes), header buttons, the Edit form, the facts panel
 * and the address it keeps.
 */
export interface RecordExtras {
  tabs?: Array<{ key: string; label: string; render: () => React.ReactNode }>;
  actions?: RecordAction[];
  onEdit?: () => void;
  facts?: { title: string; rows: Array<[string, string | null, string?]> };
  address?: string | null;
  /** Leading facts for the line under the name ("Supplier · delivers Baton Rouge"). */
  meta?: Array<string | null>;
  /** A note under the facts line (a receipt imported, a default changed). */
  note?: { text: string; onDismiss: () => void } | null;
}

/** The system thread each bucket lives in (Threads ?t=). */
const THREAD_KEY: Record<string, string> = { customer: "customers", vendor: "vendors", personal: "personal", spam: "spam" };
const BUCKET_LABEL: Record<string, string> = { customer: "Customer", vendor: "Vendor", personal: "Personal", spam: "Spam" };

/** Local YYYY-MM-DD, so "today" is Coy's today. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dueLabel(d: string): string {
  const t = today();
  if (d === t) return "Today";
  const dt = new Date(`${d}T12:00:00`);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PersonView({ person, messages, channels, onReload, onMerge, back, merges, onUndoMerge, extra }: {
  person: Person;
  messages: ThreadMessage[];
  /** Their channels from /api/threads (each number with its label), when the caller has them. */
  channels?: Channel[];
  onReload: () => void;
  /** Open "Same person as…", optionally straight on a suggested match. */
  onMerge: (preselectId?: string) => void;
  back: { href: string; label: string };
  /** Numbers merged into this person — each can be undone. */
  merges?: MergeInfo[];
  onUndoMerge?: (mergeId: string) => Promise<void>;
  extra?: RecordExtras;
}) {
  const router = useRouter();
  const c = person.contact;
  const isVendor = c.bucket === "vendor";
  const phone = c.phones[0] ?? null;
  const title = c.name ?? formatPhone(phone);
  const [tab, setTab] = useState<string>("overview");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; href?: string; link?: string } | null>(null);
  const [filing, setFiling] = useState(false);
  const [filingBusy, setFilingBusy] = useState(false);
  const [callNotes, setCallNotes] = useState(false);
  const [editing, setEditing] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [custom, setCustom] = useState<Array<{ id: string; name: string; contact_ids: string[]; count: number }>>([]);
  const [measure, wide] = useWide<HTMLDivElement>(1000);

  // The threads Coy made (migration 073) — the chips say which hold this person.
  useEffect(() => {
    let off = false;
    send("/api/threads/custom", "GET").then((b) => { if (!off) setCustom(b.threads ?? []); }).catch(() => {});
    return () => { off = true; };
  }, []);

  const firstJobType = person.jobs.find((j) => j.job_type)?.job_type ?? null;
  const jobType = !isVendor
    ? (firstJobType ? { l: JOB_TYPE_LABEL[firstJobType], sure: true } : c.job_type_hint ? { l: JOB_TYPE_LABEL[c.job_type_hint], sure: false } : null)
    : null;
  const texts = messages.filter((m) => m.channel !== "call" && m.channel !== "voicemail").length;
  const calls = messages.length - texts;
  const jobCount = isVendor ? person.vendor_jobs.length : person.jobs.length;
  const openSteps = person.tasks.filter((x) => x.status === "open").length;
  const role = roleOf({ bucket: c.bucket, subtype: c.subtype, customer_id: c.customer_id ?? null, is_primary_on_customer: true, customer_people: 1 });
  const threadKey = c.bucket ? THREAD_KEY[c.bucket] : "unsorted";
  const threadHref = `/dashboard/messages/${c.id}?t=${threadKey}`;
  const theirThreads = custom.filter((t) => t.contact_ids.includes(c.id));
  const lastAt = messages.length ? messages[messages.length - 1].occurred_at : null;
  const address = extra?.address !== undefined ? extra.address : c.address;
  const unfiled = !c.bucket || c.bucket_state === "auto";
  const edit = () => (extra?.onEdit ? extra.onEdit() : setEditing(true));

  // A line per number (with the name Coy gave it in Threads) and the email.
  const methods: CardMethod[] = [
    ...(channels?.some((x) => x.kind === "phone" && x.value)
      ? channels.filter((x) => x.kind === "phone" && x.value).map((x) => ({ kind: "phone" as const, label: x.label, value: x.value as string }))
      : c.phones.map((p, i) => ({ kind: "phone" as const, label: i ? `Phone ${i + 1}` : "Phone", value: p }))),
    ...(c.email ? [{ kind: "email" as const, label: "Email", value: c.email }] : []),
  ];

  const meta = [
    ...(extra?.meta ?? [c.subtype_label]),
    jobType ? `${jobType.l}${jobType.sure ? "" : "?"}` : null,
    c.company,
    `${texts} text${texts === 1 ? "" : "s"} · ${calls} call${calls === 1 ? "" : "s"}`,
    lastAt ? `last heard ${relTime(lastAt)}` : null,
  ].filter(Boolean).join(" · ");

  const newJob = async () => {
    setError(null);
    try {
      const b = await send("/api/jobs", "POST", { contact_id: c.id, job_type: c.job_type_hint ?? undefined });
      router.push(`/dashboard/scope/${b.job.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const file = async (bucket: Bucket | null, subtype?: string | null) => {
    setFilingBusy(true); setError(null);
    try {
      await send(`/api/contacts/${c.id}/bucket`, "PATCH", { bucket, subtype: subtype ?? null });
      setNote(!bucket ? { text: "Back to Unsorted." }
        : bucket === "vendor" ? { text: "Filed as vendor.", href: `/dashboard/vendors/${c.id}`, link: "Their vendor page ›" }
        : { text: `Filed as ${BUCKET_LABEL[bucket].toLowerCase()}.` });
      onReload();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setFilingBusy(false); }
  };

  const pageLink: RecordAction | null = c.bucket === "customer" && c.customer_id ? { label: "Customer page ›", href: `/dashboard/customers/${c.customer_id}` }
    : isVendor && !extra ? { label: "Vendor page ›", href: `/dashboard/vendors/${c.id}` } : null;
  const actions: RecordAction[] = [
    ...(pageLink ? [pageLink] : []),
    { label: "Edit", onClick: edit },
    ...(extra?.actions ?? []),
    ...(!isVendor ? [{ label: "New job", primary: true, onClick: () => void newJob() }] : []),
    ASK_DUSTY,
  ];
  const menu: Array<RecordAction | React.ReactElement> = [
    { label: "Call notes", title: "Notes while you're on the phone — they land on the call", onClick: () => setCallNotes(true) },
    { label: c.bucket ? "Change bucket" : "File as…", onClick: () => setFiling(true) },
    { label: "Same person as…", onClick: () => onMerge() },
    isVendor
      ? <ArchiveButton key="del" kind="contact" id={c.id} action="delete" what={title} then="/dashboard/vendors" style={{ ...menuItem, color: T.red }}>Delete vendor</ArchiveButton>
      : <ArchiveButton key="arch" kind="contact" id={c.id} action="archive" what={title} then="/dashboard/messages" style={menuItem}>Archive</ArchiveButton>,
  ];

  const tabs: Array<[string, string]> = [
    ["overview", "Overview"],
    ...(extra?.tabs ?? []).map((t) => [t.key, t.label] as [string, string]),
    ["steps", `Next steps ${openSteps}`],
    ["jobs", `Jobs ${jobCount}`],
    ["threads", `Threads ${theirThreads.length + 1}`],
    ["timeline", "Timeline"],
    ["files", "Files"],
  ];
  const bucketChip = { label: c.bucket ? BUCKET_LABEL[c.bucket] : "Unsorted", colour: c.bucket ? BUCKET[c.bucket] : BUCKET.unsorted, href: threadHref };
  const facts = extra?.facts ?? {
    title: "Contact",
    rows: [
      ["Filed as", c.bucket ? BUCKET_LABEL[c.bucket] : "Unsorted", c.bucket_state === "auto" ? "(by Dusty)" : !c.bucket ? "— file them above" : undefined],
      ["Kind", c.subtype_label],
      ["Company", c.company],
      ["Work", jobType ? jobType.l : null, jobType && !jobType.sure ? "(Dusty's guess)" : undefined],
    ] as Array<[string, string | null, string?]>,
  };
  const addressNote = !address ? null
    : c.address_source === "call" ? "Heard on a call — the transcript's spelling; check it."
    : c.address_source === "text" ? "They texted it." : null;
  const side = (compact?: boolean) => (
    <div className="flex flex-col gap-3" style={{ minWidth: 0 }}>
      <PanelCard>
        <LocationPanel addr={address} note={addressNote} onAdd={edit} />
        {!compact && <Facts title={facts.title} rows={facts.rows} onEdit={edit} />}
      </PanelCard>
      {!compact && (
        <div>
          <div style={{ ...eyebrow, marginBottom: 6 }}>Recent, across every channel</div>
          <div className="flex flex-col gap-2">
            {messages.length === 0 && <div style={{ fontSize: F.sm, color: T.ink3 }}>Nothing yet.</div>}
            {messages.slice(-4).reverse().map((m) => {
              const out = m.direction === "outbound";
              const kind = m.channel === "call" ? "Call" : m.channel === "voicemail" ? "Voicemail" : m.media_count && !m.body_text ? "Photo" : "Text";
              return (
                <RecentCard key={m.id} href={threadHref} at={m.occurred_at ?? new Date().toISOString()} kind={`${kind} · ${out ? "out" : "in"}`}
                  who={m.counterparty ? formatPhone(m.counterparty) : ""}
                  text={m.channel === "call" ? m.summary ?? `${out ? "Outbound" : "Inbound"} call` : m.body_text ?? (m.media_count ? "Photo" : "")} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
  const jobsSection = (
    <section>
      <SectionHead title={isVendor ? "On jobs" : "Jobs"} action={{ label: isVendor ? "+ Put them on a job" : "+ New job", onClick: () => (isVendor ? setTab("jobs") : void newJob()) }} />
      <div className="flex flex-col gap-2">
        {isVendor
          ? person.vendor_jobs.map((j) => (
              <JobRow key={j.id} href={`/dashboard/scope/${j.id}`} title={j.title || "Untitled job"}
                sub={[j.customer ? `for ${j.customer}` : null, j.role ? `as ${j.role.replace(/_/g, " ")}` : null].filter(Boolean).join(" · ")}
                right={<span style={{ ...eyebrow, color: T.hiviz }}>{stageOf(j.status).label}</span>} />
            ))
          : person.jobs.map((j) => (
              <JobRow key={j.id} href={`/dashboard/scope/${j.id}`} title={j.title || "Untitled job"}
                sub={[j.job_type ? JOB_TYPE_LABEL[j.job_type] : "Type?", j.address, !j.counts ? "suggested — accept it on Jobs" : null].filter(Boolean).join(" · ")}
                right={<span style={{ ...eyebrow, color: T.hiviz }}>{stageOf(j.status).label}</span>} />
            ))}
        {jobCount === 0 && (
          <button onClick={() => (isVendor ? setTab("jobs") : void newJob())} className="rounded text-left"
            style={{ padding: "10px 12px", border: `1px dashed ${T.hairStrong}`, color: T.hivizText, fontSize: F.sm, cursor: "pointer", background: "transparent" }}>
            {isVendor ? "Not on a job yet — put them on one" : "No jobs yet — start one"}
          </button>
        )}
      </div>
    </section>
  );

  return (
    <div ref={measure} className="w-full" style={{ minHeight: "100%", background: T.slab, paddingBottom: 24 }}>
      {(merges ?? []).map((m) => (
        <div key={m.id} className="px-4 py-1.5 flex items-center gap-2 text-[11px]"
          style={{ background: DA.elevated, borderBottom: `1px solid ${DA.border}`, color: DA.textSecondary }}>
          <span className="flex-1 min-w-0 truncate">{m.phone ? formatPhone(m.phone) : "Another number"} was merged into this person</span>
          {onUndoMerge && (
            <button onClick={() => { setUndoing(m.id); void onUndoMerge(m.id).finally(() => setUndoing(null)); }} disabled={undoing === m.id}
              style={{ color: DA.accent, fontWeight: 600, cursor: "pointer", background: "none", border: "none" }}>
              {undoing === m.id ? "Undoing…" : "Undo"}
            </button>
          )}
        </div>
      ))}
      <RecordHeader back={back} wide={wide} actions={actions} menu={menu} meta={meta} tabs={tabs} tab={tab} onTab={setTab}
        title={
          <NameEditor contactId={c.id} name={c.name} fallback={title} onSaved={() => onReload()}
            style={{ fontFamily: strong, fontWeight: 700, fontSize: wide ? 24 : 20, lineHeight: 1.2, color: c.name ? T.ink : T.ink2 }} />
        }
        tag={
          <button onClick={() => setFiling(true)} title={c.bucket ? "Change bucket" : "File them"} aria-label={c.bucket ? "Change bucket" : "File them"}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}>
            <RoleTag role={role} auto={c.bucket_state === "auto"} />
          </button>
        }>
        {/* Not filed yet, or filed by Dusty: a contact needs to become a customer, vendor, personal or spam (Coy, 2026-10-05). */}
        {unfiled && (
          <div className="mt-2 rounded px-3 pb-2.5" style={{ border: `1.5px dashed ${BUCKET.unsorted}`, background: T.slab }}>
            <BucketPicker t={{ bucket: c.bucket, subtype: c.subtype, bucket_auto: c.bucket_state === "auto" ? { reason: null } : null, proposal: c.guess ? { classification: c.guess } : null }}
              busy={filingBusy} subtypes={person.subtypes ?? []} onPick={(b, st) => void file(b, st)} />
            {!c.bucket && <div style={{ fontSize: 11, color: T.ink3, marginTop: 6 }}>Filing them takes them out of Unsorted. Vendors and subs stop making leads; a customer gets a customer page.</div>}
          </div>
        )}
        {note && <HeaderNote text={note.href ? <>{note.text} <Link href={note.href} style={{ color: T.chalk, fontWeight: 600 }}>{note.link}</Link></> : note.text} onDismiss={() => setNote(null)} />}
        {extra?.note && <HeaderNote text={extra.note.text} onDismiss={extra.note.onDismiss} />}
        {error && <div className="mt-2" style={{ fontSize: F.xs, color: T.red }}>{error}</div>}
      </RecordHeader>
      <CallNotesPad contactId={c.id} who={title} open={callNotes} onClose={() => { setCallNotes(false); onReload(); }} />

      {tab === "overview" && (
        <OverviewGrid wide={wide} side={side()} sideCompact={side(true)}>
          {(person.possible_duplicates?.length ?? 0) > 0 && <SamePerson person={person} onMerge={onMerge} className="" />}
          <DustyRead person={person} />
          <section>
            <SectionHead title={isVendor ? "Their contact details" : "Contact"} />
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <ContactCard c={{ id: c.id, name: c.name, role: c.subtype_label, methods, href: threadHref }} />
            </div>
          </section>
          <section>
            <SectionHead title="Next steps" />
            <NextSteps contactId={c.id} tasks={person.tasks} onChanged={onReload} onError={setError} />
          </section>
          {jobsSection}
          <section>
            <SectionHead title="Threads they're in" />
            <ThreadChips bucket={bucketChip} threads={theirThreads} />
          </section>
        </OverviewGrid>
      )}
      {(extra?.tabs ?? []).map((t) => (tab === t.key ? <React.Fragment key={t.key}>{t.render()}</React.Fragment> : null))}
      {tab === "steps" && <div className="p-4" style={{ maxWidth: 760 }}><NextSteps contactId={c.id} tasks={person.tasks} onChanged={onReload} onError={setError} /></div>}
      {tab === "jobs" && (
        <div className="p-4" style={{ maxWidth: 900 }}>
          {isVendor
            ? <VendorJobs person={person} onChanged={onReload} onError={setError} />
            : <CustomerJobs person={person} onChanged={onReload} onError={setError} />}
        </div>
      )}
      {tab === "threads" && (
        <div className="p-4">
          <ThreadChips bucket={bucketChip} threads={theirThreads} big emptyText="Not in any thread you made. In Threads, + New makes one from a job, a customer, or by hand." />
        </div>
      )}
      {tab === "timeline" && (
        <div className="p-4">
          <Activity messages={messages} notes={person.notes ?? []} phone={phone} contactId={c.id} name={c.name} onMerge={() => onMerge()} onNoteSaved={onReload} />
        </div>
      )}
      {tab === "files" && <PersonFiles contactId={c.id} name={c.name ?? title} />}

      <FileAsSheet open={filing} onClose={() => setFiling(false)} contactId={c.id}
        target={{ bucket: c.bucket, subtype: c.subtype, bucket_auto: c.bucket_state === "auto" ? { reason: null } : null,
                  proposal: c.guess ? { classification: c.guess } : null }}
        subtypes={person.subtypes}
        onFiled={() => { setFiling(false); onReload(); }} />
      {!extra?.onEdit && <EditContact open={editing} person={person} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onReload(); }} />}
    </div>
  );
}

/**
 * A person's page with its own loading — the vendor page (vendors.tsx) uses
 * it; the thread's ?person=1 page already has the data and renders PersonView.
 */
export function PersonScreen({ contactId, back, extra, onPerson, reloadKey }: {
  contactId: string; back: { href: string; label: string }; extra?: RecordExtras;
  /** Told each time the person loads (the vendor page leaves when they're no longer a vendor). */
  onPerson?: (p: Person) => void;
  /** Bump to load again (the vendor page's own edits). */
  reloadKey?: number;
}) {
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(null);
  const [thread, setThread] = useState<{ messages: ThreadMessage[]; channels: Channel[]; merges: MergeInfo[] }>({ messages: [], channels: [], merges: [] });
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Their next text or call appears here as it lands (live-threads.ts).
  useLiveThreads(() => setTick((n) => n + 1), contactId);
  const [merging, setMerging] = useState<false | { preselect: string | null }>(false);
  useEffect(() => {
    let off = false;
    send(`/api/people/${contactId}`, "GET").then((b) => {
      if (off) return;
      if (b.redirect_to) { router.replace(`/dashboard/messages/${b.redirect_to}?person=1`); return; }
      setPerson(b as Person); setErr(null); onPerson?.(b as Person);
    }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    // The conversation: a failure here leaves the page without it, which still works.
    send(`/api/threads/${contactId}`, "GET").then((b) => {
      if (off) return;
      setThread({ messages: Array.isArray(b.messages) ? [...b.messages].reverse() : [], channels: Array.isArray(b.channels) ? b.channels : [], merges: Array.isArray(b.merges) ? b.merges : [] });
    }).catch(() => {});
    return () => { off = true; };
  }, [contactId, tick, reloadKey, router, onPerson]);

  if (err && !person) return <div className="p-4" style={{ color: T.red, fontSize: F.sm }}>Couldn&apos;t load them: {err}</div>;
  if (!person) return <div className="p-4"><div className="rounded animate-pulse" style={{ height: 140, background: T.hairSoft }} /></div>;
  return (
    <>
      <PersonView person={person} messages={thread.messages} channels={thread.channels} back={back} extra={extra}
        merges={thread.merges} onUndoMerge={async (id) => { try { await send(`/api/contacts/merge/${id}/undo`, "POST"); } finally { setTick((n) => n + 1); } }}
        onReload={() => setTick((n) => n + 1)} onMerge={(id) => setMerging({ preselect: id ?? null })} />
      {merging && (
        <MergeSheet contactId={contactId} keepLabel={person.contact.name ?? formatPhone(person.contact.phones[0] ?? null)} keepCount={thread.messages.length}
          preselectId={merging.preselect} onClose={() => setMerging(false)}
          onMerged={() => { setMerging(false); setTick((n) => n + 1); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------ dusty's read */

/** Where it stands, the latest, and what they said about the work — Dusty's words, marked as his. */
function DustyRead({ person }: { person: Person }) {
  const c = person.contact;
  const s = person.scope;
  const seeds: Array<[string, string]> = [];
  if (s?.project_type) seeds.push(["Work", s.project_type]);
  if (s?.sqft_stated) seeds.push(["Size", `${s.sqft_stated} sqft`]);
  else if (s?.length_ft && s?.width_ft) seeds.push(["Size", `${s.length_ft} × ${s.width_ft} ft`]);
  if (s?.site_hint) seeds.push(["Site", s.site_hint]);
  if (s?.start_timing) seeds.push(["Timing", s.start_timing]);
  if (s?.scope_summary) seeds.push(["Scope", s.scope_summary]);
  return (
    <section>
      <SectionHead title="Where it stands · Dusty" />
      <div className="rounded px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div style={{ fontSize: F.sm, color: c.status_summary ? T.ink : T.ink3, lineHeight: 1.45 }}>
          {c.status_summary ?? "Dusty hasn't read them yet — he reads new traffic within a few minutes."}
        </div>
        {c.recent_summary && <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.45, marginTop: 6 }}>{c.recent_summary}</div>}
        {seeds.length > 0 && (
          <div className="mt-2">
            <div style={{ ...eyebrow, color: T.ink3 }}>What they&apos;ve said about the work</div>
            {seeds.map(([k, v]) => (
              <div key={k} className="flex gap-2 py-1" style={{ borderTop: `1px solid ${T.hairSoft}`, fontSize: F.sm }}>
                <span style={{ color: T.ink3, width: 56, flexShrink: 0 }}>{k}</span>
                <span style={{ color: T.ink }}>{v}</span>
              </div>
            ))}
            {s?.has_media && <div style={{ fontSize: F.xs, color: T.hiviz, marginTop: 4 }}>They sent photos — look before trusting the scope.</div>}
          </div>
        )}
        {c.status_summary_at && (
          <div style={{ fontSize: F.micro, color: T.ink3, marginTop: 4 }}>
            Read {new Date(c.status_summary_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ files */

/** Files (as on the customer page): the Files page pinned to this person, and + Add files. */
function PersonFiles({ contactId, name }: { contactId: string; name: string }) {
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);
  const fixed = useMemo(() => ({ contact: contactId }), [contactId]);
  return (
    <div className="p-4 flex flex-col gap-3">
      <FilesPage key={tick} embedded fixed={fixed} extra={<button onClick={() => setAdding(true)} style={btn(true)}>+ Add files</button>} />
      {adding && (
        <Sheet open onClose={() => { setAdding(false); setTick((n) => n + 1); }} title="Add files" sub={`Filed on ${name}; Dusty reads them in the background.`}>
          <div className="p-4"><FilesPanel contactId={contactId} title="Files" /></div>
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- edit */

/** Their name and address (PATCH /api/contacts/[id]/name and …/address — Coy's, as typed). */
function EditContact({ open, person, onClose, onSaved }: { open: boolean; person: Person; onClose: () => void; onSaved: () => void }) {
  const c = person.contact;
  const [f, setF] = useState({ name: "", address_line1: "", city: "", state: "", zip: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const key = open ? c.id + (c.name ?? "") + (c.address ?? "") : null;
  if (key !== seen) {
    setSeen(key);
    if (open) setF({ name: c.name ?? "", address_line1: "", city: "", state: "", zip: "" });
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const save = () => void run(async () => {
    if (f.name.trim() && f.name.trim() !== (c.name ?? "")) await send(`/api/contacts/${c.id}/name`, "PATCH", { name: f.name.trim() });
    if (f.address_line1.trim()) await send(`/api/contacts/${c.id}/address`, "PATCH", f);
  });
  return (
    <Sheet open={open} onClose={onClose} title="Edit contact" sub="Numbers are added in Threads (+ Number); the bucket under ⋯ → Change bucket.">
      <div className="px-4 py-3 flex flex-col gap-3">
        <Field k="Name"><input value={f.name} onChange={set("name")} maxLength={80} style={fieldStyle} /></Field>
        <Field k={c.address ? `Address — now ${c.address}` : "Address"}>
          <AddressInput value={f.address_line1} onChange={(v) => setF((x) => ({ ...x, address_line1: v }))} style={fieldStyle}
            onPick={(m) => setF((x) => ({ ...x, address_line1: m.line1, city: m.city ?? "", state: m.state ?? "", zip: m.zip ?? "" }))} />
        </Field>
        <div className="grid gap-2" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
          <Field k="City"><input value={f.city} onChange={set("city")} style={fieldStyle} /></Field>
          <Field k="State"><input value={f.state} onChange={set("state")} style={fieldStyle} /></Field>
          <Field k="Zip"><input value={f.zip} onChange={set("zip")} style={fieldStyle} /></Field>
        </div>
        {c.address && (
          <button onClick={() => void run(() => send(`/api/contacts/${c.id}/address`, "PATCH", { address_line1: "" }))} disabled={busy}
            className="text-left" style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>Clear the address</button>
        )}
        {err && <div style={{ color: T.red, fontSize: F.sm }}>{err}</div>}
        <button onClick={save} disabled={busy || (!f.name.trim() && !f.address_line1.trim())} style={{ ...btn(true), justifyContent: "center", height: 40 }}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------- same person */

/**
 * "Also Amber · (225) 926-8939 — same person?" Another live contact with the
 * same name or email. One tap opens the merge on its confirm step; nothing is
 * merged without that tap (DECISIONS §2c), and every merge can be undone.
 */
export function SamePerson({ person, onMerge, className = "mx-3 mt-3" }: { person: Pick<Person, "possible_duplicates">; onMerge: (id?: string) => void; className?: string }) {
  const dups = person.possible_duplicates ?? [];
  if (!dups.length) return null;
  return (
    <div className={`${className} rounded px-3 py-2`} style={{ background: T.chalkDim, border: `1px solid ${T.chalk}` }}>
      {dups.map((d) => (
        <div key={d.id} className="flex items-center gap-2 py-0.5">
          <span style={{ fontSize: F.sm, color: T.ink, flex: 1, minWidth: 0 }}>
            Also <b>{d.name ?? formatPhone(d.phone)}</b>{d.phone ? ` · ${formatPhone(d.phone)}` : ""}
            <span style={{ color: T.ink2 }}> — same {d.same}. Same person?</span>
          </span>
          <button onClick={() => onMerge(d.id)} className="rounded px-2.5 shrink-0"
            style={{ height: 30, background: T.chalk, color: T.card, border: "none", fontFamily: disp, fontSize: F.xs,
                     letterSpacing: ".04em", textTransform: "uppercase", cursor: "pointer" }}>Review</button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ next steps */

function NextSteps({ contactId, tasks, onChanged, onError }: {
  contactId: string; tasks: Task[]; onChanged: () => void; onError: (e: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [openQuote, setOpenQuote] = useState<string | null>(null);
  const t = today();
  const open = tasks.filter((x) => x.status === "open")
    .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.created_at.localeCompare(b.created_at));
  const done = tasks.filter((x) => x.status === "done");

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); onError(null);
    try { await fn(); onChanged(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [onChanged, onError]);

  const add = () => {
    if (!draft.trim()) return;
    void run(() => send(`/api/people/${contactId}/tasks`, "POST", { title: draft, due_on: due || null }))
      .then(() => { setDraft(""); setDue(""); });
  };

  return (
    <section className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }} aria-label="Next steps">
      <div className="px-3 pt-2.5 flex items-baseline gap-2">
        <span style={{ ...eyebrow, color: T.ink }}>Next steps</span>
        <span style={{ fontSize: F.xs, color: T.ink3 }}>Dusty suggests · you add your own · he reminds you</span>
      </div>
      <div className="px-1.5 pt-1">
        {open.length === 0 && (
          <div className="px-1.5 py-2" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing open.</div>
        )}
        {open.map((x) => {
          const late = x.due_on && x.due_on < t;
          return (
            <div key={x.id} className="flex items-start gap-2 px-1.5 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
              <input type="checkbox" aria-label={`Done: ${x.title}`} disabled={busy} checked={false}
                onChange={() => void run(() => send(`/api/tasks/${x.id}`, "PATCH", { status: "done" }))}
                style={{ width: 18, height: 18, marginTop: 1, accentColor: T.green, cursor: "pointer" }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: F.sm, color: T.ink, lineHeight: 1.35 }}>{x.title}</div>
                <div className="flex flex-wrap gap-x-2 items-center" style={{ marginTop: 1 }}>
                  {x.due_on && <span style={{ ...eyebrow, color: late ? T.red : x.due_on === t ? T.hiviz : T.ink3 }}>{late ? "Overdue · " : ""}{dueLabel(x.due_on)}</span>}
                  {x.source === "dusty" && (
                    <button onClick={() => setOpenQuote(openQuote === x.id ? null : x.id)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
                      Dusty{x.evidence_quote ? " · why" : ""}
                    </button>
                  )}
                </div>
                {openQuote === x.id && x.evidence_quote && (
                  <div style={{ fontSize: F.xs, color: T.ink2, fontStyle: "italic", marginTop: 3, paddingLeft: 6, borderLeft: `2px solid ${T.chalk}` }}>
                    “{x.evidence_quote}”
                  </div>
                )}
              </div>
              <button aria-label={`Dismiss: ${x.title}`} disabled={busy} title={x.source === "dusty" ? "Not needed — Dusty won't suggest it again" : "Remove"}
                onClick={() => void run(() => send(`/api/tasks/${x.id}`, "PATCH", { status: "dismissed" }))}
                style={{ color: T.ink3, fontSize: F.md, lineHeight: 1, padding: "0 4px", cursor: "pointer", background: "none", border: "none" }}>×</button>
            </div>
          );
        })}
      </div>
      <form className="flex gap-1.5 px-3 py-2.5" style={{ borderTop: `1px solid ${T.hairSoft}` }}
        onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="+ Add a next step" maxLength={200}
          aria-label="New next step"
          className="flex-1 min-w-0 rounded px-2 outline-none"
          style={{ height: 34, fontSize: F.sm, border: `1px solid ${T.hair}`, background: T.card, color: T.ink }} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date"
          className="rounded px-1.5 outline-none" style={{ height: 34, fontSize: F.xs, width: 128, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2 }} />
        <button type="submit" disabled={busy || !draft.trim()} className="rounded px-3"
          style={{ height: 34, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
                   opacity: busy || !draft.trim() ? 0.5 : 1, cursor: "pointer", border: "none" }}>Add</button>
      </form>
      {done.length > 0 && (
        <div className="px-3 pb-2.5">
          <button onClick={() => setShowDone((s) => !s)} style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>
            {showDone ? "Hide" : "Show"} {done.length} done
          </button>
          {showDone && done.map((x) => (
            <div key={x.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked aria-label={`Reopen: ${x.title}`} disabled={busy}
                onChange={() => void run(() => send(`/api/tasks/${x.id}`, "PATCH", { status: "open" }))}
                style={{ width: 16, height: 16, accentColor: T.green }} />
              <span style={{ fontSize: F.sm, color: T.ink3, textDecoration: "line-through" }}>{x.title}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- activity */

function Activity({ messages, notes, phone, contactId, name, onMerge, onNoteSaved, fill }: {
  messages: ThreadMessage[]; notes: Note[]; phone: string | null; contactId: string; name: string | null;
  onMerge: () => void; onNoteSaved: () => void;
  /** Wide layout: the timeline takes the column's full height, composer under it. */
  fill?: boolean;
}) {
  const [chan, setChan] = useState<"all" | "sms" | "call" | "notes">("all");
  const shown = useMemo(() => chan === "all" ? messages : chan === "notes" ? []
    : messages.filter((m) => (chan === "call" ? m.channel === "call" : m.channel !== "call")), [messages, chan]);
  const shownNotes = chan === "all" || chan === "notes" ? notes : [];
  const n = (k: "sms" | "call") => messages.filter((m) => (k === "call" ? m.channel === "call" : m.channel !== "call")).length;
  const scroller = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [shown.length, shownNotes.length]);

  return (
    <div className={fill ? "flex flex-col flex-1 min-h-0" : undefined}>
      <div className="flex gap-1 items-center shrink-0">
        {([["all", "All"], ["sms", "Texts"], ["call", "Calls"], ["notes", "Notes"]] as const).map(([k, l]) => {
          const on = chan === k;
          const count = k === "all" ? messages.length + notes.length : k === "notes" ? notes.length : n(k);
          return (
            <button key={k} onClick={() => setChan(k)} disabled={!count} className="rounded px-2"
              style={{ height: 28, whiteSpace: "nowrap", flexShrink: 0, background: on ? T.ink : T.card, color: on ? T.card : count ? T.ink2 : T.ink3,
                       border: `1px solid ${on ? T.ink : T.hair}`, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase",
                       opacity: count ? 1 : 0.45, cursor: "pointer" }}>
              {l}{k !== "all" && count ? ` · ${count}` : ""}
            </button>
          );
        })}
        <span className="rounded px-2 flex items-center shrink-0" title="Email isn't connected yet"
          style={{ height: 28, border: `1px solid ${T.hair}`, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", color: T.ink3, opacity: 0.45 }}>Email</span>
        <span className="flex-1" />
        <button onClick={onMerge} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>Same as…</button>
      </div>
      <div ref={scroller} className={`mt-1.5 rounded px-2.5 py-1 overflow-y-auto${fill ? " flex-1 min-h-0" : ""}`}
        style={{ background: T.slab, border: `1px solid ${T.hair}`, maxHeight: fill ? undefined : "60vh" }}>
        <Timeline messages={shown} notes={shownNotes} phone={phone} />
      </div>
      <div id="person-composer" className="mt-1.5 rounded overflow-hidden shrink-0" style={{ border: `1px solid ${T.hair}` }}>
        <Composer contactId={contactId} phone={phone} name={name} onNoteSaved={onNoteSaved} onSent={onNoteSaved} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ jobs */

function CustomerJobs({ person, onChanged, onError }: { person: Person; onChanged: () => void; onError: (e: string | null) => void }) {
  const router = useRouter();
  const [vendors, setVendors] = useState<Array<{ id: string; name: string | null; phone: string | null; subtype: string | null }> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false;
    fetch("/api/people?bucket=vendor").then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off) setVendors(Array.isArray(b?.people) ? b.people : []); }).catch(() => {});
    return () => { off = true; };
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); onError(null);
    try { await fn(); onChanged(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const start = () => void run(async () => {
    const b = await send("/api/jobs", "POST", { contact_id: person.contact.id, job_type: person.contact.job_type_hint ?? undefined });
    router.push(`/dashboard/scope/${b.job.id}`);
  });

  return (
    <div className="space-y-2">
      {person.jobs.length === 0 && (
        <div className="rounded px-3 py-4 text-center" style={{ fontSize: F.sm, color: T.ink3, border: `1px dashed ${T.hair}` }}>
          No job yet. One is made on its own when you file a customer whose conversation names the work.
        </div>
      )}
      {person.jobs.map((j) => (
        <div key={j.id} className="rounded px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div className="flex items-baseline gap-2">
            <Link href={`/dashboard/scope/${j.id}`} className="no-underline"
              style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink, flex: 1, minWidth: 0, ...clip }}>
              {j.title || "Untitled job"} ›
            </Link>
            <span style={{ ...eyebrow, color: T.hiviz }}>{stageOf(j.status).label}</span>
          </div>
          <div className="flex gap-2.5 mt-0.5">
            <span style={{ ...eyebrow, color: j.job_type ? T.chalk : T.hiviz }}>{j.job_type ? JOB_TYPE_LABEL[j.job_type] : "Type?"}</span>
            {!j.counts && <span style={{ ...eyebrow, color: T.hiviz }}>Suggested — accept it on Jobs</span>}
          </div>
          {j.flag_reason && <div className="mt-1" style={{ fontSize: F.xs, color: T.hiviz }}>{j.flag_reason} — decide on the Jobs board.</div>}
          <div className="mt-2" style={{ borderTop: `1px solid ${T.hairSoft}`, paddingTop: 6 }}>
            <div style={{ ...eyebrow, color: T.ink3 }}>Crew & suppliers</div>
            {j.vendors.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3 }}>Nobody linked yet.</div>}
            {j.vendors.map((v) => (
              <div key={v.contact_id} className="flex items-center gap-2 py-0.5">
                <Link href={`/dashboard/messages/${v.contact_id}`} style={{ fontSize: F.sm, color: T.ink, flex: 1, minWidth: 0, ...clip }}>
                  {v.name ?? formatPhone(v.phone)}
                </Link>
                {v.role && <span style={{ ...eyebrow, color: T.chalk }}>{v.role.replace(/_/g, " ")}</span>}
                <button disabled={busy} aria-label="Remove from job" onClick={() => void run(() => send(`/api/jobs/${j.id}/vendors?contact_id=${v.contact_id}`, "DELETE"))}
                  style={{ color: T.ink3, cursor: "pointer", background: "none", border: "none" }}>×</button>
              </div>
            ))}
            {vendors && vendors.length > 0 && (
              <select disabled={busy} value="" aria-label="Add a vendor to this job"
                onChange={(e) => { const id = e.target.value; if (id) void run(() => send(`/api/jobs/${j.id}/vendors`, "POST", { contact_id: id })); }}
                className="rounded px-1.5 mt-1 outline-none"
                style={{ height: 28, fontSize: F.xs, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2 }}>
                <option value="">+ Add a vendor…</option>
                {vendors.filter((v) => !j.vendors.some((x) => x.contact_id === v.id)).map((v) => (
                  <option key={v.id} value={v.id}>{v.name ?? formatPhone(v.phone)}{v.subtype ? ` — ${v.subtype.replace(/_/g, " ")}` : ""}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}
      <button disabled={busy} onClick={start} className="rounded w-full"
        style={{ height: 38, border: `1px dashed ${T.hiviz}`, color: T.hiviz, background: T.card, fontFamily: disp,
                 fontSize: F.sm, textTransform: "uppercase", cursor: "pointer" }}>
        + Start a job
      </button>
    </div>
  );
}

function VendorJobs({ person, onChanged, onError }: { person: Person; onChanged: () => void; onError: (e: string | null) => void }) {
  const [jobs, setJobs] = useState<Array<{ id: string; title: string | null; contact_name: string | null; contact_phone: string | null }> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false;
    fetch("/api/jobs").then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off) setJobs(Array.isArray(b?.jobs) ? b.jobs : []); }).catch(() => {});
    return () => { off = true; };
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); onError(null);
    try { await fn(); onChanged(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const on = new Set(person.vendor_jobs.map((j) => j.id));

  return (
    <div className="space-y-2">
      {person.vendor_jobs.length === 0 && (
        <div className="rounded px-3 py-4 text-center" style={{ fontSize: F.sm, color: T.ink3, border: `1px dashed ${T.hair}` }}>
          Not on any job yet.
        </div>
      )}
      {person.vendor_jobs.map((j) => (
        <div key={j.id} className="rounded px-3 py-2.5 flex items-center gap-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div className="flex-1 min-w-0">
            <Link href={`/dashboard/scope/${j.id}`} className="no-underline" style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink, ...clip, display: "block" }}>
              {j.title || "Untitled job"} ›
            </Link>
            <div style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
              {j.customer ? `for ${j.customer}` : ""}{j.role ? ` · as ${j.role.replace(/_/g, " ")}` : ""}
            </div>
          </div>
          <span style={{ ...eyebrow, color: T.hiviz }}>{stageOf(j.status).label}</span>
          <button disabled={busy} aria-label="Take off this job" onClick={() => void run(() => send(`/api/jobs/${j.id}/vendors?contact_id=${person.contact.id}`, "DELETE"))}
            style={{ color: T.ink3, cursor: "pointer", background: "none", border: "none" }}>×</button>
        </div>
      ))}
      {jobs && jobs.filter((j) => !on.has(j.id)).length > 0 && (
        <select disabled={busy} value="" aria-label="Put them on a job"
          onChange={(e) => { const id = e.target.value; if (id) void run(() => send(`/api/jobs/${id}/vendors`, "POST", { contact_id: person.contact.id })); }}
          className="rounded px-2 w-full outline-none"
          style={{ height: 36, fontSize: F.sm, border: `1px dashed ${T.chalk}`, background: T.card, color: T.chalk }}>
          <option value="">+ Put them on a job…</option>
          {jobs.filter((j) => !on.has(j.id)).map((j) => (
            <option key={j.id} value={j.id}>{j.title || "Untitled job"}{j.contact_name || j.contact_phone ? ` — ${j.contact_name ?? formatPhone(j.contact_phone)}` : ""}</option>
          ))}
        </select>
      )}
    </div>
  );
}
