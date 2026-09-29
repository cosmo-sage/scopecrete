"use client";

/**
 * The Customer page and the Vendor intelligence page (Coy, 2026-09-28).
 *
 * Threads is the intake: conversations summarised and sorted. Opening a
 * customer or a vendor leads here — everything about them in one place, every
 * channel on it: who they are and how sure the bucket is, Dusty's read of where
 * things stand, a next-steps checklist (Dusty seeds it, Coy adds his own), the
 * whole conversation, and their jobs — the jobs they are paying for, or, for a
 * vendor, the jobs they are on (job_vendors).
 *
 * Nothing here sends anything. Text writes a draft to copy into Quo (10DLC is
 * not registered, DECISIONS §6); Email opens the phone's mail app; Ask Dusty
 * opens Dusty on this person, read-only.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { T, F, disp, eyebrow, nums, clip } from "@/lib/v34/tokens";
import { Composer } from "@/components/v34/composer";
import { Timeline, formatPhone, type Note, type ThreadMessage } from "@/components/v34/conversation";
import { JOB_TYPE_LABEL, stageOf } from "@/lib/jobs/stages";
import { NameEditor, FileAsSheet } from "@/components/v34/contact-edit";
import { useWide } from "@/lib/v34/use-wide";
import { FilesPanel } from "@/components/v34/files-panel";
import { CostCards } from "@/components/v34/cost-cards";

export interface Person {
  contact: {
    id: string; name: string | null; name_confirmed: boolean; phones: string[];
    email: string | null; address: string | null; company: string | null;
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

const COLOUR: Record<string, string> = { customer: T.green, vendor: T.chalk, personal: T.violet, spam: T.red };
const LABEL: Record<string, string> = { customer: "Customer", vendor: "Vendor", personal: "Personal", spam: "Spam" };

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

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

export function PersonView({ person, messages, onReload, onMerge }: {
  person: Person;
  messages: ThreadMessage[];
  onReload: () => void;
  /** Open "Same person as…", optionally straight on a suggested match. */
  onMerge: (preselectId?: string) => void;
}) {
  const router = useRouter();
  const c = person.contact;
  const isVendor = c.bucket === "vendor";
  const phone = c.phones[0] ?? null;
  const title = c.name ?? formatPhone(phone);
  const colour = c.bucket ? COLOUR[c.bucket] : T.ink3;
  const [tab, setTab] = useState<"activity" | "jobs" | "prices" | "files" | "about">("activity");
  const [error, setError] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  // Room for two columns (Coy, 2026-09-29: no dead space either side on a
  // desktop). The conversation fills the left; next steps, jobs and about
  // stand in a column on the right, as in the desktop design's 1d. Narrow —
  // a phone, or a desktop with Dusty docked — keeps the single column + tabs.
  const [measure, wide] = useWide<HTMLDivElement>(880);

  const jobType = !isVendor
    ? (person.jobs.find((j) => j.job_type)?.job_type
        ? { l: JOB_TYPE_LABEL[person.jobs.find((j) => j.job_type)!.job_type!], sure: true }
        : c.job_type_hint ? { l: JOB_TYPE_LABEL[c.job_type_hint], sure: false } : null)
    : null;

  const texts = messages.filter((m) => m.channel !== "call").length;
  const calls = messages.length - texts;
  const jobCount = isVendor ? person.vendor_jobs.length : person.jobs.length;

  const act: React.CSSProperties = {
    height: 38, flex: 1, minWidth: 0, borderRadius: 4, border: `1px solid ${T.hair}`, background: T.card, color: T.ink,
    fontFamily: disp, fontSize: F.sm, fontWeight: 600, letterSpacing: ".02em", textTransform: "uppercase", whiteSpace: "nowrap",
    display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", cursor: "pointer",
  };

  return (
    <div ref={measure} className={wide ? "w-full flex-1 min-h-0 grid" : "w-full"}
      style={wide ? { gridTemplateColumns: "minmax(0,1fr) 340px" } : { paddingBottom: 24 }}>
      <div className={wide ? "flex flex-col min-h-0 min-w-0" : undefined}>
      {/* ---------------- who they are ---------------- */}
      <div className="px-3 pt-2.5 pb-3" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="lg:hidden" aria-label="Back"
            style={{ background: "none", border: "none", color: T.ink3, padding: 0, cursor: "pointer" }}>
            <ArrowLeft size={18} />
          </button>
          <span className="rounded" style={{ ...eyebrow, lineHeight: "16px", padding: "0 5px", color: c.bucket_state === "confirmed" ? "#fff" : colour,
            background: c.bucket_state === "confirmed" ? colour : "transparent", border: `1px solid ${colour}` }}
            title={c.bucket_state === "confirmed" ? "Confirmed by you" : "Filed by Dusty — keep or undo it on Threads"}>
            {c.bucket ? LABEL[c.bucket] : "Unsorted"}{c.bucket_state === "confirmed" ? " ✓" : c.bucket_state === "auto" ? " · auto" : ""}
          </span>
          {c.subtype_label && <span style={{ ...eyebrow, color: T.ink2 }}>{c.subtype_label}</span>}
          {jobType && <span style={{ ...eyebrow, color: jobType.sure ? T.ink2 : T.ink3 }}>{jobType.l}{jobType.sure ? "" : "?"}</span>}
          <span className="flex-1" />
          {/* Coy, 2026-09-28: "this is a vendor but there is no way to change this from within the contact page". */}
          <button onClick={() => setFiling(true)} className="rounded px-2 shrink-0"
            style={{ height: 24, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, cursor: "pointer",
                     fontFamily: disp, fontSize: F.xs, letterSpacing: ".04em", textTransform: "uppercase" }}>
            Change bucket
          </button>
        </div>
        <div style={{ marginTop: 4 }}>
          <NameEditor contactId={c.id} name={c.name} fallback={title} onSaved={() => onReload()}
            style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, lineHeight: 1.1, color: c.name ? T.ink : T.ink2 }} />
        </div>
        {c.company && <div style={{ fontSize: F.sm, color: T.ink2 }}>{c.company}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1" style={{ fontSize: F.xs, color: T.ink2, ...nums }}>
          {c.phones.map((p) => <a key={p} href={`tel:${p}`} style={{ color: T.ink2 }}>{formatPhone(p)}</a>)}
          {c.email && <a href={`mailto:${c.email}`} style={{ color: T.ink2 }}>{c.email}</a>}
          {c.address && <span>{c.address}</span>}
          <span style={{ color: T.ink3 }}>{texts} text{texts === 1 ? "" : "s"} · {calls} call{calls === 1 ? "" : "s"}</span>
        </div>

        {c.status_summary && (
          <div className="mt-2 rounded px-2.5 py-2" style={{ background: T.slab }}>
            <div style={{ ...eyebrow, color: T.ink3 }}>Where it stands · Dusty</div>
            <div style={{ fontSize: F.sm, color: T.ink, lineHeight: 1.4, marginTop: 1 }}>{c.status_summary}</div>
          </div>
        )}

        {/* Every channel, one row. Nothing here sends on its own. */}
        <div className="flex gap-1.5 mt-2.5">
          {phone ? <a href={`tel:${phone}`} style={{ ...act, background: T.ink, color: "#fff", borderColor: T.ink }}>Call</a>
            : <span style={{ ...act, opacity: 0.4 }}>Call</span>}
          <button onClick={() => { setTab("activity"); setTimeout(() => document.getElementById("person-composer")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}
            style={act} title="Write it here, copy it into Quo — sending waits on 10DLC">Text</button>
          {c.email ? <a href={`mailto:${c.email}`} style={act}>Email</a>
            : <span style={{ ...act, opacity: 0.4, cursor: "default" }} title="No email on file for them">Email</span>}
          <button onClick={() => window.dispatchEvent(new Event("sc:dusty-open"))} style={{ ...act, color: T.hiviz, borderColor: T.hiviz }}>Ask Dusty</button>
        </div>
      </div>

      {error && <div className="mx-3 mt-2" style={{ fontSize: F.xs, color: T.red }}>{error}</div>}

      {!wide && <SamePerson person={person} onMerge={onMerge} />}
      {!wide && <NextSteps contactId={c.id} tasks={person.tasks} onChanged={onReload} onError={setError} />}

      {/* ---------------- tabs (narrow only) ---------------- */}
      {!wide && <div className="flex mt-3 px-3" style={{ gap: 2 }}>
        {([["activity", "Activity"], ["jobs", `Jobs (${jobCount})`], ...(isVendor ? [["prices", "Prices"] as const] : []), ["files", "Files"], ["about", "About"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="flex-1"
            style={{ height: 34, background: tab === k ? T.card : "transparent", cursor: "pointer",
                     borderBottom: tab === k ? `2px solid ${T.hiviz}` : `1px solid ${T.hair}`,
                     fontFamily: disp, fontSize: F.sm, fontWeight: 600, textTransform: "uppercase",
                     color: tab === k ? T.ink : T.ink3 }}>{l}</button>
        ))}
      </div>}

      {(wide || tab === "activity") && <Activity messages={messages} notes={person.notes ?? []} phone={phone} contactId={c.id} name={c.name}
        onMerge={() => onMerge()} onNoteSaved={onReload} fill={wide} />}
      {!wide && tab === "jobs" && (isVendor
        ? <VendorJobs person={person} onChanged={onReload} onError={setError} />
        : <CustomerJobs person={person} onChanged={onReload} onError={setError} />)}
      {!wide && tab === "files" && <div className="mx-3 mt-2"><FilesPanel contactId={c.id} /></div>}
      {!wide && tab === "prices" && isVendor && <div className="mx-0 mt-1"><CostCards vendorId={c.id} vendorName={c.name} /></div>}
      {!wide && tab === "about" && <About person={person} />}
      </div>

      {/* ---------------- the right column (wide only) ---------------- */}
      {wide && (
        <aside className="min-h-0 overflow-y-auto pb-4" style={{ borderLeft: `1px solid ${T.hair}`, background: T.slab }} aria-label="Next steps, jobs and about">
          <SamePerson person={person} onMerge={onMerge} />
          <NextSteps contactId={c.id} tasks={person.tasks} onChanged={onReload} onError={setError} />
          <div className="mx-3 mt-4" style={{ ...eyebrow, color: T.ink }}>{isVendor ? "On jobs" : "Jobs"} ({jobCount})</div>
          {isVendor
            ? <VendorJobs person={person} onChanged={onReload} onError={setError} />
            : <CustomerJobs person={person} onChanged={onReload} onError={setError} />}
          {isVendor && <CostCards vendorId={c.id} vendorName={c.name} />}
          <div className="mx-3 mt-4"><FilesPanel contactId={c.id} compact /></div>
          <div className="mx-3 mt-4" style={{ ...eyebrow, color: T.ink }}>About</div>
          <About person={person} />
        </aside>
      )}

      <FileAsSheet open={filing} onClose={() => setFiling(false)} contactId={c.id}
        target={{ bucket: c.bucket, subtype: c.subtype, bucket_auto: c.bucket_state === "auto" ? { reason: null } : null,
                  proposal: c.guess ? { classification: c.guess } : null }}
        subtypes={person.subtypes}
        onFiled={() => { setFiling(false); onReload(); }} />
    </div>
  );
}

/* ----------------------------------------------------------- same person */

/**
 * "Also Amber · (225) 926-8939 — same person?" Another live contact with the
 * same name or email. One tap opens the merge on its confirm step; nothing is
 * merged without that tap (DECISIONS §2c), and every merge can be undone.
 */
export function SamePerson({ person, onMerge }: { person: Pick<Person, "possible_duplicates">; onMerge: (id?: string) => void }) {
  const dups = person.possible_duplicates ?? [];
  if (!dups.length) return null;
  return (
    <div className="mx-3 mt-3 rounded px-3 py-2" style={{ background: T.chalkDim, border: `1px solid ${T.chalk}` }}>
      {dups.map((d) => (
        <div key={d.id} className="flex items-center gap-2 py-0.5">
          <span style={{ fontSize: F.sm, color: T.ink, flex: 1, minWidth: 0 }}>
            Also <b>{d.name ?? formatPhone(d.phone)}</b>{d.phone ? ` · ${formatPhone(d.phone)}` : ""}
            <span style={{ color: T.ink2 }}> — same {d.same}. Same person?</span>
          </span>
          <button onClick={() => onMerge(d.id)} className="rounded px-2.5 shrink-0"
            style={{ height: 30, background: T.chalk, color: "#fff", border: "none", fontFamily: disp, fontSize: F.xs,
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
    <section className="mx-3 mt-3 rounded" style={{ background: T.card, border: `1px solid ${T.hair}` }} aria-label="Next steps">
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
          style={{ height: 34, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
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
    <div className={fill ? "mx-3 mt-2 mb-3 flex flex-col flex-1 min-h-0" : "mx-3 mt-2"}>
      <div className="flex gap-1 items-center shrink-0">
        {([["all", "All"], ["sms", "Texts"], ["call", "Calls"], ["notes", "Notes"]] as const).map(([k, l]) => {
          const on = chan === k;
          const count = k === "all" ? messages.length + notes.length : k === "notes" ? notes.length : n(k);
          return (
            <button key={k} onClick={() => setChan(k)} disabled={!count} className="rounded px-2"
              style={{ height: 28, whiteSpace: "nowrap", flexShrink: 0, background: on ? T.ink : T.card, color: on ? "#fff" : count ? T.ink2 : T.ink3,
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
        <Composer contactId={contactId} phone={phone} name={name} onNoteSaved={onNoteSaved} />
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
    <div className="mx-3 mt-2 space-y-2">
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
    <div className="mx-3 mt-2 space-y-2">
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

/* ----------------------------------------------------------------- about */

function About({ person }: { person: Person }) {
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
    <div className="mx-3 mt-2 space-y-2">
      <div className="rounded px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div style={{ ...eyebrow, color: T.ink3 }}>Latest · Dusty</div>
        <div style={{ fontSize: F.sm, color: c.recent_summary ? T.ink : T.ink3, lineHeight: 1.45, marginTop: 2 }}>
          {c.recent_summary ?? "Dusty hasn't summarised them yet — he reads new traffic within a few minutes."}
        </div>
        {c.status_summary_at && (
          <div style={{ fontSize: F.micro, color: T.ink3, marginTop: 4 }}>
            Read {new Date(c.status_summary_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>
      {seeds.length > 0 && (
        <div className="rounded px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div style={{ ...eyebrow, color: T.ink3 }}>What they&apos;ve said about the work · Dusty</div>
          {seeds.map(([k, v]) => (
            <div key={k} className="flex gap-2 py-1" style={{ borderTop: `1px solid ${T.hairSoft}`, fontSize: F.sm }}>
              <span style={{ color: T.ink3, width: 56, flexShrink: 0 }}>{k}</span>
              <span style={{ color: T.ink }}>{v}</span>
            </div>
          ))}
          {s?.has_media && <div style={{ fontSize: F.xs, color: T.hiviz, marginTop: 4 }}>They sent photos — look before trusting the scope.</div>}
        </div>
      )}
    </div>
  );
}
