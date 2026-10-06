"use client";

/**
 * The Threads list — chips, rows, drift banner.
 *
 * Lives here rather than in the route so the messages LAYOUT can hold it: on
 * desktop the list and a conversation sit side by side, and a list owned by
 * the index route would unmount the moment you opened a thread, losing the
 * scroll position and refetching on every row you clicked.
 *
 * Carried over from the previous version because it was right:
 *  - voicemail glance lines are LABELLED as voicemails, not passed off as
 *    summaries
 *  - 176 of 197 contacts have no name, so the phone number IS the display name
 *    and nothing here invents one
 *  - the preview keeps a fixed minHeight so rows do not reflow as summaries land
 *  - the drift banner reads the real /api/dashboard/drift, and a failure to read
 *    it renders as UNKNOWN, never as all-clear
 *
 * The chips are the five places a person can be (Coy, 2026-09-28): Unsorted,
 * the inbox, then Customers · Vendors · Personal · Spam. Filing someone moves
 * them out of Unsorted. Every count comes from /api/threads/counts; one that
 * could not be read shows "·", never 0.
 *
 * No mock constants. v34's THREADS array is not imported and must not be.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveThreads } from "@/lib/v34/live-threads";
import { useLiveCalls } from "@/lib/v34/alerts-live";
import { liveCallFor } from "@/lib/alerts";
import { LiveCallBadge } from "@/components/v34/incoming-alerts";
import { ArchiveDialog } from "@/components/v34/archive-actions";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip, relTime } from "@/lib/v34/tokens";
import { EmptyState, MenuButton, SearchBubble, SearchToggle, Sheet } from "@/components/v34/primitives";
import { JOB_TYPE_LABEL } from "@/lib/jobs/stages";
import { TRAY_PX, ACTIONS_PX, decideSwipe, isHorizontal, clampDrag } from "@/lib/swipe";
import { BucketPicker, BUCKETS, SUGGESTS, type Bucket, type Subtype } from "@/components/v34/bucket-picker";
import { BUCKET } from "@/lib/v34/tokens";
import { useThreads } from "@/components/v34/threads-ctx";
import { threadLabel } from "@/components/v34/thread-rail";
import { ROLE_LABEL, initials, initialsHue, isSystemKey, sortRows, THREAD_SORTS, type ContactRole, type ThreadSort } from "@/lib/v34/threads";
import { ContactPicker, bookName } from "@/components/v34/contacts";
import type { BookEntry } from "@/lib/contacts-book";

interface Thread {
  contact_id: string;
  display_name: string;
  name_is_phone: boolean;
  phone: string | null;
  contact_type: string | null;
  contact_subtype: string | null;
  channel: string | null;
  direction: string | null;
  occurred_at: string | null;
  preview: string;
  preview_source: "body" | "summary" | "synthesised";
  summary_source: string | null;
  msg_count: number;
  job_status: string | null;
  job_unscoped: boolean;
  /** From the contact's most advanced job: residential | commercial | public. */
  job_type: string | null;
  /** open | done (every job complete) | lost (every job lost) | null (no job) — Coy, 2026-10-04. */
  job_state?: "open" | "done" | "lost" | null;
  /** Dusty's words (migration 037): where things stand, and the latest conversations. */
  status_summary: string | null;
  recent_summary: string | null;
  /** Dusty's guess at the job type, when there is no job to take it from. */
  job_type_hint: string | null;
  /** Customer · Vendor · Personal · Spam — confirmed, or filed by Dusty. Null = Unsorted. */
  bucket: Bucket | null;
  subtype: string | null;
  /** Dusty filed this one itself (spam), with the line it went on. */
  bucket_auto: { reason: string | null } | null;
  proposal: Proposal | null;
  /** Applied because they introduced themselves; Keep or Undo in the row. */
  auto_name: { claim_id: string; quote: string | null; channel: string | null } | null;
  /** Nothing was ever said on it — calls with no words (migration 066). */
  silent?: boolean;
  /** On the Archived view: when, and whether archived or deleted. */
  archived?: { at: string; reason: string | null; back?: boolean } | null;
  /** Threads v2: their role, and what the second line says. */
  role?: ContactRole;
  customer_id?: string | null;
  person_role?: string | null;
  company?: string | null;
  numbers?: number;
  has_email?: boolean;
  /** Addresses and job titles — searched, never shown. */
  places?: string[];
}

/**
 * A pending enrich-contacts proposal. A QUESTION, not an answer.
 *
 * It must never reach `display_name` or the Avatar. A proposed name that shows
 * up in the list before anyone confirmed it is the "Hi Coy" bug and the "Brad
 * Chaney" mislabel a third time — both were a name lifted from message content
 * and attached to the wrong party with no review step.
 */
interface Proposal {
  id: string;
  proposed_name: string | null;
  proposed_company: string | null;
  proposed_role: string | null;
  classification: string;
  confidence: number;
  evidence_quote: string | null;
  evidence_message_id: string | null;
  project_type: string | null;
  scope_summary: string | null;
  start_timing: string | null;
  length_ft: number | null;
  width_ft: number | null;
  sqft_stated: number | null;
  site_hint: string | null;
  has_media: boolean;
  model: string | null;
  prompt_version: string | null;
}

type Counts = Record<string, number>;

/** Coy's reason for archiving, or null when it is only the default word ("archived", "deleted …"). */
const reasonText = (r: string | null | undefined) => (r && !/^(archived|deleted\b)/.test(r) ? r : null);

function matches(t: Thread, k: string): boolean {
  switch (k) {
    case "unsorted": return t.bucket === null;
    case "customers": return t.bucket === "customer";
    case "vendors": return t.bucket === "vendor";
    case "personal": return t.bucket === "personal";
    case "spam": return t.bucket === "spam";
    case "all": return t.bucket !== "spam";
    default: return true;
  }
}

/** What an empty filtered list should say — the reason, not just "nothing". */
const WHY_EMPTY: Record<string, string> = {
  all: "Nobody has called or texted yet — or everyone is archived or spam.",
  archived: "Nothing is archived. Select threads and tap Archive — they come back on their own if that number calls or texts again.",
  unsorted: "Everyone who has called or texted is in a bucket.",
  customers: "Nobody is filed as a customer yet. In Unsorted, swipe a row right and tap Customer.",
  vendors: "Nobody is filed as a vendor yet — subs, suppliers, rental yards and people looking for work go here.",
  personal: "Nobody is filed as personal.",
  spam: "Nothing is filed as spam.",
};

/* ------------------------------------------------------------- the review */

const CLASS_LABEL: Record<string, string> = {
  customer: "a customer", vendor: "a vendor", sub: "a sub",
  not_work: "not work", unknown: "unclear",
  // The table's CHECK allows these two; the enricher never emits them.
  personal: "personal", spam: "spam",
};


/**
 * The proposal, shown as a question with its evidence attached.
 *
 * Name and classification confirm SEPARATELY, because Coy may believe one and
 * not the other. "Yes that's Amber, no she isn't a vendor" has to be
 * expressible, and folding them together would make the cheap judgement carry
 * the expensive one.
 *
 * The evidence quote is the whole reason this is reviewable in two seconds
 * rather than two minutes. A proposal without it is an assertion.
 */
function ProposalReview({ p, onDecide, busy, nameOn }: {
  p: Proposal;
  busy: boolean;
  /** The proposed name is already this contact's name — nothing to ask. */
  nameOn: boolean;
  onDecide: (body: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.proposed_name ?? "");

  const who = [p.proposed_name, p.proposed_company].filter(Boolean).join(" · ");

  // The scope seed. Read-only: nothing applies these yet, and a field that
  // looks actionable but writes nothing is worse than one that looks inert.
  const caught: Array<[string, string]> = [];
  if (p.project_type) caught.push(["Type", p.project_type]);
  if (p.sqft_stated) caught.push(["Stated", `${p.sqft_stated} sqft`]);
  else if (p.length_ft && p.width_ft) caught.push(["Stated", `${p.length_ft} × ${p.width_ft} ft`]);
  if (p.site_hint) caught.push(["Site", p.site_hint]);
  if (p.start_timing) caught.push(["Timing", p.start_timing]);

  const btn = (primary?: boolean): React.CSSProperties => ({
    height: 28, padding: "0 10px", borderRadius: 3,
    border: `1px solid ${primary ? T.ink : T.hair}`,
    background: primary ? T.ink : T.card, color: primary ? T.card : T.ink2,
    fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em",
    textTransform: "uppercase", cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.5 : 1,
  });

  return (
    <div className="mt-2 rounded" style={{ background: T.chalkDim, border: `1px solid #C9D9F5`, padding: 10 }}>
      <div style={{ ...eyebrow, color: T.chalk }}>
        Dusty thinks · {p.confidence}% sure
      </div>

      <div style={{ fontSize: F.sm, color: T.ink, marginTop: 3, lineHeight: 1.35 }}>
        {who
          ? <>This is <strong>{who}</strong>{p.proposed_role ? `, ${p.proposed_role}` : ""} — {CLASS_LABEL[p.classification] ?? p.classification}.</>
          : <>No name found. Looks like {CLASS_LABEL[p.classification] ?? p.classification}.</>}
      </div>

      {/* Verbatim, and visibly a quote. This is what makes it judgeable. */}
      {p.evidence_quote && (
        <div style={{
          fontSize: F.xs, color: T.ink2, marginTop: 6, paddingLeft: 8,
          borderLeft: `2px solid ${T.chalk}`, fontStyle: "italic", lineHeight: 1.4,
        }}>
          “{p.evidence_quote.length > 240 ? `${p.evidence_quote.slice(0, 240)}…` : p.evidence_quote}”
        </div>
      )}

      {p.has_media && (
        <div style={{ fontSize: F.xs, color: "#8A4200", marginTop: 6 }}>
          Photos attached — the scope is not settled until someone looks at them.
        </div>
      )}

      {/* ---- name ---- */}
      {!nameOn && <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
        <span style={{ ...eyebrow, color: T.ink3, minWidth: 54 }}>Name</span>
        {editing ? (
          <>
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="Type the name"
              className="rounded px-2 outline-none"
              style={{ height: 28, fontSize: F.sm, border: `1px solid ${T.chalk}`,
                       background: T.card, color: T.ink, minWidth: 0, flex: "1 1 120px" }} />
            <button disabled={busy || !draft.trim()} style={btn(true)}
              onClick={() => onDecide({ name: "accept", name_override: draft.trim() })}>
              Save
            </button>
            <button disabled={busy} style={btn()} onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button disabled={busy || !p.proposed_name} style={btn(true)}
              onClick={() => onDecide({ name: "accept" })}>
              {p.proposed_name ? "Confirm" : "No name"}
            </button>
            <button disabled={busy} style={btn()} onClick={() => { setDraft(p.proposed_name ?? ""); setEditing(true); }}>
              {p.proposed_name ? "Edit" : "Type one"}
            </button>
            <button disabled={busy} style={btn()} onClick={() => onDecide({ name: "reject" })}>Reject</button>
          </>
        )}
      </div>}

      {caught.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid #C9D9F5` }}>
          <div style={{ ...eyebrow, color: T.ink3 }}>Also caught — not applied anywhere yet</div>
          <div className="flex flex-wrap gap-x-3" style={{ fontSize: F.xs, color: T.ink2, marginTop: 2 }}>
            {caught.map(([k, v]) => (
              <span key={k}><span style={{ color: T.ink3 }}>{k}</span> {v}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A name the system applied because the person introduced themselves. Shown
 * with the line they said it in; Keep makes it Coy's, Undo takes it off and it
 * is never applied to this contact again.
 */
function AutoNameStrip({ a, name, busy, onName }: {
  a: NonNullable<Thread["auto_name"]>; name: string; busy: boolean;
  onName: (action: "keep" | "undo") => void;
}) {
  const btn = (primary?: boolean): React.CSSProperties => ({
    height: 28, padding: "0 10px", borderRadius: 3,
    border: `1px solid ${primary ? T.ink : T.hair}`,
    background: primary ? T.ink : T.card, color: primary ? T.card : T.ink2,
    fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em",
    textTransform: "uppercase", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
  });
  return (
    <div className="mt-2 rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: 10 }}>
      <div style={{ ...eyebrow, color: T.chalk }}>
        Named automatically — they said it {a.channel === "call" ? "on a call" : "in a text"}
      </div>
      {a.quote && (
        <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 5, paddingLeft: 8,
                      borderLeft: `2px solid ${T.chalk}`, fontStyle: "italic", lineHeight: 1.4 }}>
          “{a.quote.length > 240 ? `${a.quote.slice(0, 240)}…` : a.quote}”
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
        <button disabled={busy} style={btn(true)} onClick={() => onName("keep")}>Keep {name}</button>
        <button disabled={busy} style={btn()} onClick={() => onName("undo")}>Undo</button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- row */

/**
 * A bucket on the row, in its colour. Confirmed (Coy put them there): solid
 * with a tick. Filed by Dusty: outlined, "· auto". Dusty's guess: dashed, "?".
 */
function BucketTag({ label, c, state }: { label: string; c: string; state: "confirmed" | "auto" | "suggested" }) {
  const title = state === "confirmed" ? "Confirmed by you"
    : state === "auto" ? "Filed by Dusty — Keep or undo it in the row"
    : "Dusty's guess — swipe left to accept, right for all four";
  return (
    <span className="shrink-0 rounded" title={title}
      style={{ ...eyebrow, lineHeight: "15px", padding: "0 4px", letterSpacing: ".06em",
               color: state === "confirmed" ? T.card : c, background: state === "confirmed" ? c : "transparent",
               border: `1px ${state === "suggested" ? "dashed" : "solid"} ${c}` }}>
      {label}{state === "confirmed" ? " ✓" : state === "auto" ? " · auto" : "?"}
    </span>
  );
}

/** The role a bucket's own people have — its tag isn't repeated there. */
const NATURAL: Record<string, ContactRole> = { customer: "customer", vendor: "vendor", personal: "personal", spam: "spam", unsorted: "unsorted" };
const ROLE_COLOR: Record<ContactRole, string> = {
  customer: BUCKET.customer, contact: BUCKET.customer, vendor: BUCKET.vendor, sub: BUCKET.vendor,
  personal: BUCKET.personal, spam: BUCKET.spam, unsorted: BUCKET.unsorted, other: T.ink2,
};

/** A contact's role, in its colour (Threads v2). Dusty's filing says "· auto". */
export function RoleTag({ role, auto }: { role: ContactRole; auto?: boolean }) {
  const c = ROLE_COLOR[role];
  return (
    <span className="shrink-0 rounded" title={auto ? "Filed by Dusty — keep or change it" : undefined}
      style={{ fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", lineHeight: "15px",
        padding: "0 4px", border: `1px solid ${c}`, color: c, whiteSpace: "nowrap", borderRadius: 2 }}>
      {ROLE_LABEL[role]}{auto ? " · auto" : ""}
    </span>
  );
}

/** Initials in a square; a dashed "#" for a number with no name. Filled when selected. */
export function InitialsBox({ name, on, size = 30 }: { name: string | null; on?: boolean; size?: number }) {
  // A colour per person (Coy, 2026-10-06), mixed with the theme's card and ink.
  const hue = name ? initialsHue(name) : null;
  const bg = on ? T.hiviz : hue ? `color-mix(in srgb, ${hue} 20%, ${T.card})` : T.slab;
  const fg = on ? T.onHiviz : hue ? `color-mix(in srgb, ${hue} 78%, ${T.ink})` : T.ink3;
  const edge = on ? T.hiviz : hue ? `color-mix(in srgb, ${hue} 45%, ${T.card})` : T.hairStrong;
  return (
    <span className="shrink-0 flex items-center justify-center" aria-hidden="true"
      style={{ width: size, height: size, borderRadius: 3, background: bg, color: fg,
        border: `1px ${name ? "solid" : "dashed"} ${edge}`, fontFamily: "var(--sc-font-strong)", fontWeight: 600, fontSize: size >= 32 ? 12.5 : 12 }}>
      {name ? initials(name) : "#"}
    </span>
  );
}

/** "Homeowner · 2 numbers · email" — only what is known. */
function subLine(t: Thread): string {
  return [t.company, t.person_role, (t.numbers ?? 0) > 1 ? `${t.numbers} numbers` : null, t.has_email ? "email" : null].filter(Boolean).join(" · ");
}

function ThreadRow({ t, first, expanded, onToggle, onOpen, onDecide, onName, onBucket, subtypes, deciding, tray, onTray, onArchive, chipShown, selected }: {
  t: Thread; first: boolean; expanded: boolean; onToggle: () => void; onOpen: () => void;
  /** This contact is the one open beside the list. */
  selected: boolean;
  /** The open chip already says the bucket (Coy, 2026-09-28: the tag is redundant there). */
  chipShown: boolean;
  /** Swipe right: the four buckets; swipe left: Spam · Archive. One row at a time. */
  tray: "buckets" | "actions" | null;
  onTray: (side: "buckets" | "actions" | null) => void;
  /** Archive this thread (asks why first). */
  onArchive: () => void;
  onDecide: (proposalId: string, body: Record<string, unknown>) => void;
  onName: (claimId: string, action: "keep" | "undo") => void;
  onBucket: (contactId: string, bucket: Bucket | null, subtype?: string | null) => void;
  subtypes: Subtype[];
  deciding: boolean;
}) {
  // On a call right now (2026-10-06) — in place of the age, in green.
  const calls = useLiveCalls();
  const live = calls.length ? liveCallFor(calls, t.contact_id) ?? liveCallFor(calls, null, t.phone) : null;
  const badge = t.bucket ? BUCKETS.find((b) => b.k === t.bucket) : null;
  // Dusty's guess, shown on the collapsed row so the list can be read without
  // opening anything, and marked in the buckets a right swipe opens.
  const guess = !t.bucket && t.proposal ? SUGGESTS[t.proposal.classification] ?? null : null;
  const guessB = guess ? BUCKETS.find((b) => b.k === guess)! : null;
  const when = relTime(t.occurred_at);
  // Customers carry their job type: the job's own when there is one, else
  // Dusty's guess, marked with "?" like his bucket guess.
  const isCustomer = t.bucket === "customer" || guess === "customer";
  const jobType = !isCustomer ? null
    : t.job_type ? { l: JOB_TYPE_LABEL[t.job_type] ?? t.job_type, sure: true }
    : t.job_type_hint ? { l: JOB_TYPE_LABEL[t.job_type_hint] ?? t.job_type_hint, sure: false }
    : null;

  // Swipe: right opens the buckets, left opens Spam · Archive (Coy, 2026-10-05).
  // touch-action: pan-y leaves vertical scrolling to the browser.
  const [drag, setDrag] = useState<number | null>(null);
  const [rebucket, setRebucket] = useState(false);
  const start = React.useRef<{ x: number; y: number; w: number; on: boolean } | null>(null);
  const swipeable = !expanded;
  const rest = tray === "buckets" ? TRAY_PX : tray === "actions" ? -ACTIONS_PX : 0;
  const offset = drag ?? rest;
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!swipeable) return;
    const p = e.touches[0];
    start.current = { x: p.clientX, y: p.clientY, w: e.currentTarget.clientWidth, on: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const st = start.current; if (!st) return;
    const p = e.touches[0];
    const dx = p.clientX - st.x + rest, dy = p.clientY - st.y;
    if (!st.on) { if (!isHorizontal(p.clientX - st.x, dy)) return; st.on = true; }
    setDrag(clampDrag(dx));
  };
  const onTouchEnd = () => {
    const st = start.current; start.current = null;
    if (!st?.on || drag === null) { setDrag(null); return; }
    const r = decideSwipe(drag);
    setDrag(null);
    onTray(r === "open" ? "buckets" : r === "actions" ? "actions" : null);
  };
  const isVoicemail = t.summary_source === "quo_voicemail";
  const synthesised = t.preview_source === "synthesised";
  // The role tag says what the thread doesn't already: a customer's other
  // person or a sub in Customer / Vendor, everyone in a thread Coy made.
  const roleShown = !chipShown || (t.role !== undefined && t.role !== NATURAL[t.bucket ?? "unsorted"]);
  const sub = subLine(t);
  const decidable = !t.bucket || !!t.bucket_auto || !!t.auto_name || !!(t.proposal && t.name_is_phone && t.proposal.proposed_name);
  void badge;

  return (
    <div className="relative overflow-hidden" style={{ borderTop: first ? "none" : `1px solid ${T.hair}` }}>
      {/* Behind the row, left: the four buckets (swipe right). */}
      {offset > 0 && (
        <div className="absolute inset-y-0 left-0 flex" style={{ width: TRAY_PX }} aria-label="File as">
          {BUCKETS.map((b) => (
            <button key={b.k} disabled={deciding} onClick={() => { onTray(null); onBucket(t.contact_id, b.k, guess === b.k && t.proposal?.classification === "sub" ? "subcontractor" : null); }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{ background: b.c, color: T.card, fontFamily: disp, fontSize: F.micro, fontWeight: 700, textTransform: "uppercase",
                       letterSpacing: 0, boxShadow: guess === b.k ? "inset 0 0 0 3px rgba(255,255,255,.85)" : undefined }}>
              {b.l}
              {guess === b.k && <span style={{ fontSize: F.micro, opacity: 0.9 }}>Dusty</span>}
            </button>
          ))}
        </div>
      )}
      {/* Behind the row, right: Spam and Archive (swipe left; Coy, 2026-10-05). */}
      {offset < 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_PX }} aria-label="Spam or archive">
          <button disabled={deciding || t.bucket === "spam"} onClick={() => { onTray(null); onBucket(t.contact_id, "spam", null); }}
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={{ background: BUCKET.spam, color: T.card, fontFamily: disp, fontSize: F.micro, fontWeight: 700, textTransform: "uppercase", opacity: t.bucket === "spam" ? 0.5 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M5 15L15 5" /></svg>
            Spam
          </button>
          <button onClick={() => { onTray(null); onArchive(); }}
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={{ background: T.ink2, color: T.card, fontFamily: disp, fontSize: F.micro, fontWeight: 700, textTransform: "uppercase" }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="4" /><path d="M4 7.5v9h12v-9M8 11h4" /></svg>
            Archive
          </button>
        </div>
      )}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{ background: T.card, position: "relative", touchAction: "pan-y",
                 transform: offset ? `translateX(${offset}px)` : undefined,
                 transition: drag === null ? "transform .18s ease-out" : "none" }}>
      {/* Threads v2 row: initials, name, role tag, age · who they are · the latest.
          A tap opens them; ▾ (only while there is something to decide about
          who they are) drops down the filing tools. */}
      <div className="flex items-stretch" style={{ borderLeft: `3px solid ${selected ? T.hiviz : "transparent"}`, background: selected ? T.hivizDim : "transparent" }}>
      <button onClick={() => (tray ? onTray(null) : onOpen())} aria-current={selected ? "true" : undefined}
        className="flex-1 min-w-0 flex gap-2.5 items-start text-left" style={{ padding: "9px 4px 9px 7px", cursor: "pointer" }}>
        <InitialsBox name={t.name_is_phone ? null : t.display_name} on={selected} size={30} />
        <span style={{ minWidth: 0, flex: 1, display: "block" }}>
          <span className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
            <span style={{ fontFamily: "var(--sc-font-strong)", fontSize: 13.5, fontWeight: 600, lineHeight: 1.25, ...clip,
              color: t.name_is_phone ? T.ink2 : T.ink }}>{t.display_name}</span>
            {t.auto_name && (
              <span className="shrink-0" title="Named from their own words — not yet kept by you"
                style={{ ...eyebrow, color: T.chalk }}>Auto</span>
            )}
            {roleShown && t.role && <RoleTag role={t.role} auto={!!t.bucket_auto} />}
            {guessB && <BucketTag label={guessB.l} c={guessB.c} state="suggested" />}
            {jobType && (
              <span className="shrink-0" title={jobType.sure ? "From the job" : "Dusty's guess — set when the job is made"}
                style={{ ...eyebrow, color: jobType.sure ? T.ink2 : T.ink3 }}>
                {jobType.l}{jobType.sure ? "" : "?"}
              </span>
            )}
            <span className="flex-1" />
            {live ? <span className="shrink-0"><LiveCallBadge call={live} compact /></span>
              : when && <span className="shrink-0" style={{ fontSize: 12, color: T.ink3, ...nums }}>{when}</span>}
          </span>
          {sub && <span style={{ display: "block", fontSize: 11.5, color: T.ink3, marginTop: 1, ...clip }}>{sub}</span>}
          {t.archived?.back && (
            // Back after being archived — and why it was (Coy, 2026-10-04).
            <span style={{ display: "block", fontSize: 11.5, color: T.hivizText, marginTop: 1, ...clip }} title={t.archived.reason ?? undefined}>
              ↩ Back · archived {new Date(t.archived.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{reasonText(t.archived.reason) ? `: ${reasonText(t.archived.reason)}` : ""}
            </span>
          )}
          {isVoicemail && !t.status_summary && (
            <span style={{ ...eyebrow, color: T.hiviz, display: "block", marginTop: 2 }}>Voicemail</span>
          )}
          <span style={{
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            fontSize: 12.5, marginTop: 2, lineHeight: 1.4,
            color: !t.status_summary && synthesised ? T.ink3 : T.ink2, fontStyle: !t.status_summary && synthesised ? "italic" : "normal",
          }}>{t.status_summary ?? t.preview}</span>
        </span>
      </button>
      {decidable && (
        <button onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? "Close the filing tools" : "Who are they? File them"}
          title="Who are they? File them" className="shrink-0 flex items-start justify-center"
          style={{ width: 28, paddingTop: 10, color: expanded ? T.hiviz : T.ink3, cursor: "pointer", fontSize: 12 }}>{expanded ? "▴" : "▾"}</button>
      )}
      </div>

      {/* Expanded: what has been going on, anything still to decide about
          who they are, and one way through to their page (Coy, 2026-09-28).
          Calling, texting and email live on that page, not here. */}
      {expanded && (
        <div className="px-2.5 pb-2.5" style={{ paddingLeft: 46 }}>
          {t.recent_summary ? (
            <div>
              <div style={{ ...eyebrow, color: T.ink3 }}>Latest · Dusty</div>
              <div style={{ fontSize: F.sm, color: T.ink, lineHeight: 1.4, marginTop: 2 }}>{t.recent_summary}</div>
            </div>
          ) : (
            <div>
              <div style={{ ...eyebrow, color: T.ink3 }}>
                Last {t.channel === "call" ? "call" : "message"}{t.status_summary ? "" : " · Dusty hasn't summarised them yet"}
              </div>
              <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.4, marginTop: 2 }}>{t.preview}</div>
            </div>
          )}

          {t.auto_name && (
            <AutoNameStrip a={t.auto_name} name={t.display_name} busy={deciding}
              onName={(action) => onName(t.auto_name!.claim_id, action)} />
          )}

          {/* Sorting is a question only while they are unsorted, or Dusty filed
              them. A confirmed bucket can still be changed, one tap away. */}
          {!t.bucket || t.bucket_auto || rebucket ? (
            <BucketPicker t={t} busy={deciding} subtypes={subtypes}
              onPick={(bucket, subtype) => { setRebucket(false); onBucket(t.contact_id, bucket, subtype); }} />
          ) : null}

          {/* The name question, only for a number with no name. */}
          {t.proposal && t.name_is_phone && t.proposal.proposed_name && (
            <ProposalReview p={t.proposal} busy={deciding} nameOn={false}
              onDecide={(body) => onDecide(t.proposal!.id, body)} />
          )}

          <div className="mt-2.5 flex items-center gap-3">
            <button onClick={onOpen} className="rounded px-4 flex items-center gap-2"
              style={{ height: 36, border: "none", background: T.ink, color: T.card,
                       fontFamily: disp, fontSize: F.sm, letterSpacing: ".06em",
                       textTransform: "uppercase", cursor: "pointer" }}>
              Open {badge ? badge.l.toLowerCase() : "thread"} <span style={{ color: T.hiviz }}>›</span>
            </button>
            {t.bucket && !t.bucket_auto && !rebucket && (
              <button onClick={() => setRebucket(true)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
                Change bucket
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- screen */

/** A row while choosing what to archive (or in the Archived view): a tick, the name, what's there. */
function SelectRow({ t, selecting, on, onPick, onOpen, onRestore }: {
  t: Thread; selecting: boolean; on: boolean; onPick: () => void; onOpen: () => void; onRestore?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3" style={{ minHeight: 56, borderBottom: `1px solid ${T.hairSoft}`, background: on ? T.hivizDim : T.card }}>
      {selecting && (
        <button role="checkbox" aria-checked={on} aria-label={`Select ${t.display_name}`} onClick={onPick}
          className="shrink-0 rounded flex items-center justify-center"
          style={{ width: 24, height: 24, border: `2px solid ${on ? T.hiviz : T.hairStrong}`, background: on ? T.hiviz : T.card, color: T.onHiviz, cursor: "pointer", fontWeight: 700 }}>
          {on ? "✓" : ""}
        </button>
      )}
      <button onClick={selecting ? onPick : onOpen} className="text-left" style={{ flex: 1, minWidth: 0, cursor: "pointer", padding: "8px 0" }}>
        <div style={{ fontSize: F.md, fontWeight: 600, color: T.ink, ...clip }}>{t.display_name}</div>
        <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
          {t.silent ? `Nothing said · ${t.msg_count} call${t.msg_count === 1 ? "" : "s"}` : t.status_summary ?? t.preview}
          {t.archived ? ` · ${t.archived.reason?.startsWith("deleted") ? "deleted" : "archived"} ${relTime(t.archived.at)}${reasonText(t.archived.reason) ? ` — ${reasonText(t.archived.reason)}` : ""}` : ""}
        </div>
      </button>
      <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{relTime(t.occurred_at)}</span>
      {onRestore && !selecting && (
        <button onClick={onRestore} className="rounded px-2" style={{ ...eyebrow, height: 28, border: `1px solid ${T.chalk}`, color: T.chalk, background: T.card, cursor: "pointer" }}>Unarchive</button>
      )}
    </div>
  );
}

/** Add people to a thread Coy made — anyone in Contacts, or someone new (2026-10-05). */
function AddToThread({ thread, onClose, onAdded }: {
  thread: { id: string; name: string; contact_ids: string[] }; onClose: () => void; onAdded: () => void;
}) {
  const [picked, setPicked] = useState<BookEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/threads/custom/${thread.id}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_ids: picked.map((p) => p.id) }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      onAdded();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Add to ${thread.name}`} sub="Being in a thread never moves anyone out of Customer or Vendor.">
      <div className="px-4 py-3 flex flex-col gap-2">
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded" style={{ height: 26, padding: "0 4px 0 8px", background: T.hivizDim, color: T.hivizText, fontSize: F.xs, fontWeight: 600 }}>
                {bookName(p)}
                <button onClick={() => setPicked((l) => l.filter((x) => x.id !== p.id))} aria-label={`Take ${bookName(p)} off`} style={{ width: 18, color: T.hivizText }}>×</button>
              </span>
            ))}
          </div>
        )}
        <ContactPicker exclude={[...thread.contact_ids, ...picked.map((p) => p.id)]} onPick={(c) => setPicked((l) => [...l, c])} />
        {err && <div style={{ color: T.red, fontSize: F.sm }}>{err}</div>}
        <button onClick={() => void add()} disabled={!picked.length || busy} className="rounded" style={{ height: 38, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", opacity: !picked.length || busy ? 0.5 : 1 }}>
          {busy ? "Adding…" : `Add ${picked.length || ""}`}
        </button>
      </div>
    </Sheet>
  );
}

export function ThreadList({ folded = false }: { folded?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const ctx = useThreads();
  const openId = /^\/dashboard\/messages\/([^/?]+)/.exec(pathname)?.[1] ?? null;

  const [threads, setThreads] = useState<Thread[]>([]);
  const counts: Counts | null = ctx?.counts ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [drift, setDrift] = useState<{ count: number | null; error?: string } | null>(null);

  // The thread picked in the rail / drawer (Threads v2): a bucket, "archived", or one Coy made.
  const filter = ctx?.thread ?? "all";
  const isCustom = !isSystemKey(filter) && filter !== "archived";
  const label = threadLabel(filter, ctx?.custom ?? null);
  const customThread = isCustom ? ctx?.custom?.find((t) => t.id === filter) ?? null : null;
  // Search in this list (Coy, 2026-10-05: "a search icon here to search by word, phrase, name or
  // location"): names, numbers, Dusty's lines, where their work is, and — from the server — every
  // word they or you said, in this thread only.
  const [finding, setFinding] = useState(false);
  const [find, setFind] = useState("");
  const [saidBy, setSaidBy] = useState<{ q: string; ids: Set<string> } | null>(null);
  const findQ = find.trim().toLowerCase();
  const [openRow, setOpenRow] = useState<string | null>(null);
  // Swipe tray: one row at a time. Toast: what was just filed, with Undo.
  const [trayRow, setTrayRow] = useState<{ id: string; side: "buckets" | "actions" } | null>(null);
  const [toast, setToast] = useState<{ contactId: string; label: string } | null>(null);
  const [deciding, setDeciding] = useState(false);
  // Archive (migration 066): pick rows, archive them with Undo; the Archived view brings them back.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [archived, setArchived] = useState<Thread[] | null>(null);
  const [archToast, setArchToast] = useState<{ label: string; logId: string | null } | null>(null);
  const [archBusy, setArchBusy] = useState(false);
  // Recent → A–Z → By role, remembered per thread on this device (Threads v2).
  const [sorts, setSorts] = useState<Record<string, ThreadSort>>({});
  useEffect(() => {
    const t = setTimeout(() => { try { setSorts(JSON.parse(localStorage.getItem("sc:threads-sorts") ?? "{}")); } catch { /* no storage */ } }, 0);
    return () => clearTimeout(t);
  }, []);
  const sort: ThreadSort = sorts[filter] ?? "recent";
  const pickSort = (k: ThreadSort) => setSorts((m) => { const n = { ...m, [filter]: k }; try { localStorage.setItem("sc:threads-sorts", JSON.stringify(n)); } catch { /* no storage */ } return n; });

  // Bumped after a confirm, so the list and the chip counts both refetch: the
  // row's display_name becomes the real name and Unsorted drops by one. A
  // client-side patch of the row would leave the counts lying.
  const [reload, setReload] = useState(0);
  // A text or call that lands while the list is open shows up on its own (live-threads.ts).
  useLiveThreads(() => setReload((n) => n + 1));

  /**
   * Confirm or reject half a proposal.
   *
   * One contact at a time, deliberately. DECISIONS.md §2b requires a human
   * confirmation, and fifty accepted with one tap is a human dismissing a
   * prompt rather than confirming anything.
   */
  const decide = useCallback(async (proposalId: string, body: Record<string, unknown>) => {
    setDeciding(true);
    try {
      const r = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeciding(false);
    }
  }, []);

  // The types under each bucket — data, not code (org_contact_subtypes).
  const [subtypes, setSubtypes] = useState<Subtype[]>([]);
  useEffect(() => {
    let off = false;
    fetch("/api/contacts/subtypes").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && Array.isArray(d?.subtypes)) setSubtypes(d.subtypes); }).catch(() => {});
    return () => { off = true; };
  }, []);

  /** One tap: put a person in a bucket (or back to Unsorted with null). */
  const bucketDecide = useCallback(async (contactId: string, bucket: Bucket | null, subtype?: string | null) => {
    setDeciding(true);
    // Move the row at once — out of Unsorted, into its bucket. The refetch
    // below brings the counts and the server's word.
    setThreads((ts) => ts.map((t) => t.contact_id === contactId
      ? { ...t, bucket, subtype: subtype ?? null, bucket_auto: null, contact_type: bucket }
      : t));
    try {
      const r = await fetch(`/api/contacts/${contactId}/bucket`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bucket, subtype: subtype ?? null }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeciding(false);
    }
  }, []);

  /** File from the row or a swipe, then offer Undo for five seconds. */
  const fileAndToast = useCallback((contactId: string, bucket: Bucket | null, subtype?: string | null) => {
    void bucketDecide(contactId, bucket, subtype);
    if (bucket) {
      setToast({ contactId, label: BUCKETS.find((b) => b.k === bucket)?.l ?? bucket });
      setTimeout(() => setToast((cur) => (cur?.contactId === contactId ? null : cur)), 5000);
    }
  }, [bucketDecide]);

  const nameDecide = useCallback(async (claimId: string, action: "keep" | "undo") => {
    setDeciding(true);
    try {
      const r = await fetch(`/api/name-claims/${claimId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeciding(false);
    }
  }, []);

  useEffect(() => {
    let off = false;
    fetch("/api/threads")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (b?.code === "no_org") { if (!off) { setNoOrg(true); setLoading(false); } return null; }
          throw new Error(b?.error || `HTTP ${r.status}`);
        }
        return b;
      })
      .then((data) => {
        if (off || data === null) return;
        setThreads(Array.isArray(data.threads) ? data.threads : []);
        setLoading(false);
      })
      .catch((e) => { if (!off) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); } });

    // v34 has a mock constant also called DRIFT. It is not imported anywhere
    // and must never be. A drift figure that did not come from here is a bug.
    fetch("/api/dashboard/drift")
      .then((r) => r.json())
      .then((d) => { if (!off) setDrift(d); })
      .catch(() => { if (!off) setDrift({ count: null, error: "unreachable" }); });

    return () => { off = true; };
  }, [reload]);
  // The rail's counts follow every change here.
  const refreshCounts = ctx?.refresh;
  const [seenReload, setSeenReload] = useState(0);
  if (reload !== seenReload) { setSeenReload(reload); if (reload > 0) refreshCounts?.(); }

  // A thread Coy made: its members, including those with no calls or texts yet.
  const [customRows, setCustomRows] = useState<Thread[] | null>(null);
  useEffect(() => {
    if (!isCustom) return;
    let off = false;
    fetch(`/api/threads?thread=${encodeURIComponent(filter)}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off) setCustomRows(Array.isArray(d?.threads) ? d.threads : []); })
      .catch(() => { if (!off) setCustomRows([]); });
    return () => { off = true; };
  }, [filter, isCustom, reload]);

  useEffect(() => {
    if (filter !== "archived") return;
    let off = false;
    fetch("/api/threads?view=archived").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off) setArchived(Array.isArray(d?.threads) ? d.threads : []); })
      .catch(() => { if (!off) setArchived([]); });
    return () => { off = true; };
  }, [filter, reload]);

  // Archiving asks why first (Coy, 2026-10-04); restoring doesn't.
  const [asking, setAsking] = useState<string[] | null>(null);
  const archive = useCallback(async (ids: string[], restore: boolean, note: string | null = null) => {
    if (!ids.length) return;
    setArchBusy(true);
    // Out of the list at once; the refetch brings the server's word and the counts.
    if (restore) setArchived((a) => (a ?? []).filter((t) => !ids.includes(t.contact_id)));
    else setThreads((ts) => ts.filter((t) => !ids.includes(t.contact_id)));
    try {
      const r = await fetch(restore ? "/api/archive/restore" : "/api/archive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(restore ? { kind: "contact", ids } : { kind: "contact", ids, action: "archive", note }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setArchToast({ label: restore ? `Unarchived ${b.restored ?? ids.length}` : b.label ?? `Archived ${ids.length}`, logId: restore ? null : b.log_id ?? null });
      setTimeout(() => setArchToast((cur) => (cur?.logId === (restore ? null : b.log_id ?? null) ? null : cur)), 8000);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPicked(new Set()); setSelecting(false); setArchBusy(false); setReload((n) => n + 1); }
  }, []);
  const undoArchive = useCallback(async (logId: string) => {
    setArchToast(null);
    try {
      const r = await fetch(`/api/archive/${logId}/undo`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setReload((n) => n + 1);
  }, []);

  const chipCount = useCallback((k: string): number | null => {
    if (!isSystemKey(k) && k !== "archived") return ctx?.customCounts[k] ?? customThread?.count ?? null;
    if (!counts) return null;
    return typeof counts[k] === "number" ? counts[k] : null;
  }, [counts, ctx, customThread]);


  // Customers whose work is finished are tucked away until asked for (Coy, 2026-10-04:
  // "hide completed customer threads and archive lost thread"), remembered on the device.
  const [showDone, setShowDoneState] = useState(false);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { try { if (!off && localStorage.getItem("sc:threads-show-done") === "1") setShowDoneState(true); } catch { /* none */ } });
    return () => { off = true; };
  }, []);
  const setShowDone = (v: boolean) => { setShowDoneState(v); try { localStorage.setItem("sc:threads-show-done", v ? "1" : "0"); } catch { /* private window */ } };
  const finishing = filter === "customers" && !q;
  const [archBucket, setArchBucket] = useState<string>("all");
  const doneHere = finishing ? threads.filter((t) => matches(t, filter) && t.job_state === "done").length : 0;
  const lostIds = finishing ? threads.filter((t) => matches(t, filter) && t.job_state === "lost").map((t) => t.contact_id) : [];
  const visible = useMemo(() => {
    // A search looks in every bucket; otherwise the chip decides.
    // Archived is its own tab (Coy, 2026-10-04), filtered by bucket and searched on its own.
    let rows = filter === "archived" ? (archived ?? []).filter((t) => archBucket === "all" || matches(t, archBucket))
      : q ? threads : isCustom ? (customRows ?? []) : threads.filter((t) => matches(t, filter));
    if (filter === "customers" && !q && !showDone) rows = rows.filter((t) => t.job_state !== "done");
    if (q) {
      rows = rows.filter((t) =>
        t.display_name.toLowerCase().includes(q)
        || (t.phone ?? "").toLowerCase().includes(q)
        || t.preview.toLowerCase().includes(q));
    }
    if (findQ) {
      const digits = findQ.replace(/\D/g, "");
      rows = rows.filter((t) => {
        const hay = [t.display_name, t.preview, t.status_summary, t.recent_summary, t.company, t.person_role, t.job_type, t.job_type_hint, ...(t.places ?? [])].filter(Boolean).join(" \n ").toLowerCase();
        const said = saidBy?.q === findQ && saidBy.ids.has(t.contact_id);
        return said || findQ.split(/\s+/).every((w) => hay.includes(w)) || (digits.length >= 4 && (t.phone ?? "").replace(/\D/g, "").includes(digits));
      });
    }
    // Recent, A–Z (a bare number last) or by role (Threads v2).
    if (!q) rows = sortRows(rows, sort);
    return rows;
  }, [threads, filter, q, archived, sort, isCustom, customRows, showDone, archBucket, findQ, saidBy]);
  // Words said in calls and texts, searched on the server for this thread's people.
  useEffect(() => {
    if (findQ.length < 3) return;
    const bucket = ({ all: "all", customers: "customer", vendors: "vendor", personal: "personal", spam: "spam", unsorted: "unsorted" } as Record<string, string>)[filter];
    const p = new URLSearchParams({ q: findQ, type: "all" });
    if (bucket) { p.set("bucket", bucket); p.set("contacts", ""); }
    else p.set("contacts", (customRows ?? archived ?? []).map((t) => t.contact_id).slice(0, 400).join(","));
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/threads/search?${p}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : null))
        .then((b: { results?: Array<{ contact_id: string }> } | null) => { if (b) setSaidBy({ q: findQ, ids: new Set((b.results ?? []).map((r) => r.contact_id)) }); })
        .catch(() => {});
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [findQ, filter, customRows, archived]);
  const silentHere = visible.filter((t) => t.silent).length;
  // Opening a contact keeps the thread in the address and folds the list on a desktop.
  const openContact = (id: string) => {
    router.push(`/dashboard/messages/${id}?t=${encodeURIComponent(filter)}`);
    if (window.matchMedia("(min-width: 1024px)").matches) ctx?.setFolded(true);
  };
  const [adding, setAdding] = useState(false);

  // Folded (Threads v2): a 56px column of initials, the open one filled; › brings the list back.
  if (folded) {
    return (
      <div className="flex flex-col items-center">
        <button onClick={() => ctx?.setFolded(false)} aria-label="Show the list" title="Show the list"
          className="flex items-center justify-center" style={{ width: "100%", height: 46, color: T.ink2, cursor: "pointer", borderBottom: `1px solid ${T.hairSoft}` }}>›</button>
        <div style={{ ...eyebrow, fontSize: 9, color: label.color, padding: "4px 0" }}>{chipCount(filter) ?? ""}</div>
        {visible.map((t) => (
          <button key={t.contact_id} onClick={() => openContact(t.contact_id)} title={t.display_name} aria-label={t.display_name}
            className="flex items-center justify-center" style={{ width: "100%", height: 46, cursor: "pointer",
              borderLeft: `3px solid ${openId === t.contact_id ? T.hiviz : "transparent"}`, background: openId === t.contact_id ? T.hivizDim : "transparent" }}>
            <InitialsBox name={t.name_is_phone ? null : t.display_name} on={openId === t.contact_id} size={32} />
          </button>
        ))}
      </div>
    );
  }
  const pick = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div>
      {adding && customThread && (
        <AddToThread thread={customThread} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); setReload((n) => n + 1); }} />
      )}
      {/* Phone: + adds someone to the thread Coy made. */}
      {customThread && !selecting && (
        <button onClick={() => setAdding(true)} aria-label="Add a contact to this thread" className="lg:hidden fixed z-30 flex items-center justify-center rounded"
          style={{ right: 16, bottom: "calc(var(--sc-foot) + 16px)", width: 48, height: 48, background: T.hiviz, color: T.onHiviz, fontSize: 24, boxShadow: "0 6px 16px rgba(0,0,0,.25)", cursor: "pointer" }}>+</button>
      )}
      {toast && (
        <div className="fixed left-3 right-3 lg:left-auto lg:right-6 lg:w-[360px] bottom-[84px] lg:bottom-6 z-40 rounded-lg px-3 flex items-center gap-2"
          role="status" style={{ height: 44, background: T.ink, color: T.card, boxShadow: "0 6px 20px rgba(0,0,0,.25)" }}>
          <span style={{ fontSize: F.sm, flex: 1 }}>Filed as {toast.label}</span>
          <button onClick={() => { const c = toast.contactId; setToast(null); void bucketDecide(c, null); }}
            style={{ ...eyebrow, color: T.hiviz, fontSize: F.sm, cursor: "pointer" }}>Undo</button>
        </div>
      )}

      {archToast && (
        <div className="fixed left-3 right-3 lg:left-auto lg:right-6 lg:w-[360px] bottom-[84px] lg:bottom-6 z-40 rounded-lg px-3 flex items-center gap-2"
          role="status" style={{ height: 44, background: T.ink, color: T.card, boxShadow: "0 6px 20px rgba(0,0,0,.25)" }}>
          <span style={{ fontSize: F.sm, flex: 1 }}>{archToast.label}</span>
          {archToast.logId && <button onClick={() => void undoArchive(archToast.logId as string)}
            style={{ ...eyebrow, color: T.hiviz, fontSize: F.sm, cursor: "pointer" }}>Undo</button>}
        </div>
      )}

      {/* Drift: only a message that never reached the app shows here (the
          alarm); notes on messages that did arrive live on More → Logs. A
          failure to read it renders as UNKNOWN — never as all-clear. */}
      {drift && (drift.count === null || drift.count > 0) && (
        <div className="px-3 py-1.5 flex items-center gap-2"
          style={{ background: T.hivizDim, borderBottom: `1px solid ${T.hair}` }}>
          <span style={{ ...eyebrow, color: "#C24A00" }}>
            {drift.count === null ? "Drift unknown" : `Drift ${drift.count}`}
          </span>
          <span style={{ fontSize: F.xs, color: T.ink2, ...clip, flex: 1 }}>
            {drift.count === null
              ? "Could not read the data check."
              : `${drift.count === 1 ? "A message" : "Messages"} reached your line but not the app.`}
          </span>
          <Link href="/dashboard/more/logs" style={{ ...eyebrow, color: T.chalk }}>Logs ›</Link>
        </div>
      )}

      {/* The name, sort and search stay put while the list scrolls (Coy, 2026-10-05). */}
      <div className="sticky top-[var(--sc-head)] lg:top-0" style={{ zIndex: 6, background: T.card }}>
      {q && (
        <div className="px-3 py-1.5 flex items-center gap-2"
          style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <span style={eyebrow}>Searching</span>
          <span style={{ fontSize: F.sm, color: T.ink, ...clip }}>{q}</span>
          <span className="flex-1" />
          {/* A real button, not a word: on a phone the text alone was too
              small to hit (Coy, 2026-09-28). */}
          {/* history.replaceState, not router.replace: in the production build
              router.replace to the same route minus ?q= did nothing at all
              (reproduced 2026-09-28 with `next start`; the dev server hid it).
              Next syncs useSearchParams with the History API, so the list
              re-renders without the search. */}
          <button onClick={() => window.history.replaceState(null, "", "/dashboard/messages")} aria-label="Clear search"
            className="rounded px-3 shrink-0"
            style={{ ...eyebrow, height: 30, color: T.chalk, border: `1px solid ${T.chalk}`, background: T.card, cursor: "pointer" }}>✕ Clear</button>
        </div>
      )}

      {/* Threads v2 header: the thread's name in its colour, how many, the
          sort, and — with a contact open — the fold. On a phone ☰ opens the
          threads drawer (the five buckets, yours, + New). */}
      {!q && (
        <div style={{ padding: "12px 12px 10px 14px", borderBottom: `1px solid ${T.hairSoft}` }}>
          <div className="flex items-center gap-2">
            <MenuButton onClick={() => ctx?.setDrawer(true)} label="Threads" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="flex items-baseline gap-2" style={{ minWidth: 0 }}>
                <span className="sc-page-title" style={{ fontFamily: disp, fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: label.color, lineHeight: 1.1, ...clip }}>{label.name}</span>
                <span className="sc-page-count" style={{ ...nums, fontSize: 13, color: T.ink3 }}>{chipCount(filter) ?? ""}</span>
              </div>
              {customThread?.job_line && <div className="lg:hidden" style={{ fontSize: 11.5, color: T.ink3, ...clip }}>{customThread.job_line}</div>}
            </div>
            {filter !== "archived" && (
              <select value={sort} onChange={(e) => pickSort(e.target.value as ThreadSort)} aria-label="Sort" title="Sort the list" className="shrink-0 rounded"
                style={{ fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", height: 26, padding: "0 4px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer" }}>
                {THREAD_SORTS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
              </select>
            )}
            {/* Select, as an icon beside sort and search (Coy, 2026-10-05). */}
            {!loading && !error && visible.length > 0 && (
              <button onClick={() => { if (selecting) { setSelecting(false); setPicked(new Set()); } else { setSelecting(true); setPicked(new Set()); setOpenRow(null); setTrayRow(null); } }}
                aria-label="Select threads" aria-pressed={selecting} title="Select threads to archive"
                className="shrink-0 flex items-center justify-center rounded" style={{ width: 26, height: 26, border: `1px solid ${selecting ? T.hiviz : T.hairStrong}`, background: selecting ? T.hivizDim : T.card, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={selecting ? T.hiviz : T.ink2} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2.5" y="2.5" width="6" height="6" rx="1" /><path d="M4 5.5l1.3 1.3L7.5 4.2" /><rect x="2.5" y="11.5" width="6" height="6" rx="1" /><path d="M11.5 5.5h6M11.5 14.5h6" />
                </svg>
              </button>
            )}
            <SearchToggle open={finding} onToggle={() => { setFinding((v) => !v); if (finding) setFind(""); }} label="Search this list" />
            {openId && (
              <button onClick={() => ctx?.setFolded(true)} aria-label="Fold the list" title="Fold the list to initials" className="hidden lg:flex shrink-0 items-center justify-center rounded"
                style={{ width: 24, height: 24, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, cursor: "pointer" }}>‹</button>
            )}
          </div>
          {customThread && <div className="hidden lg:flex items-center gap-2 mt-1" style={{ fontSize: 11.5, color: T.ink3, minWidth: 0 }}>
            {customThread?.job_id && (
              <span className="shrink-0 rounded" style={{ fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", padding: "0 4px", lineHeight: "15px", border: `1px solid ${T.hiviz}`, color: T.hiviz }}>Job</span>
            )}
            <span style={{ ...clip, flex: 1 }}>
              {customThread.job_id
                  ? <Link href={`/dashboard/scope/${customThread.job_id}`} style={{ color: T.ink3 }}>{customThread.job_line}</Link>
                  : customThread.source === "customer" ? "Everyone on this customer" : "Hand-picked"}
            </span>
            <button onClick={() => setAdding(true)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>+ Add contact</button>
          </div>}
        </div>
      )}

      {finding && !q && (
        <div className="px-3 pb-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <SearchBubble value={find} onChange={setFind} onClose={() => setFinding(false)} placeholder={`Search ${label.name} — a word, a name, a street…`} />
        </div>
      )}
      </div>

      {filter === "archived" && !loading && (archived?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 overflow-x-auto" style={{ borderBottom: `1px solid ${T.hairSoft}`, scrollbarWidth: "none" }} aria-label="Filter archived threads">
          {([["all", "All"], ["customers", "Customer"], ["unsorted", "Unsorted"], ["vendors", "Vendor"], ["personal", "Personal"], ["spam", "Spam"]] as const).map(([k, l]) => {
            const n = k === "all" ? archived!.length : archived!.filter((t) => matches(t, k)).length;
            if (k !== "all" && n === 0) return null;
            const on = archBucket === k;
            return (
              <button key={k} onClick={() => setArchBucket(k)} className="shrink-0 rounded px-2.5"
                style={{ height: 28, border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2, fontSize: 12, cursor: "pointer" }}>
                {l} <span style={{ opacity: 0.7 }}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <ArchiveDialog open={!!asking} kind="contact" action="archive" count={asking?.length ?? 1}
        what={asking && asking.length > 1 ? `${asking.length} threads` : "this thread"}
        onCancel={() => setAsking(null)} onConfirm={(note) => { const ids = asking ?? []; setAsking(null); void archive(ids, false, note); }} />
      {/* Select and archive (Coy, 2026-10-03: calls where nothing was said — not spam, not anyone).
          Archived threads come back on their own when that number calls or texts again. */}
      {!q && !loading && !error && (selecting || filter === "archived" || doneHere > 0 || lostIds.length > 0) && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 flex-wrap" style={{ borderBottom: `1px solid ${T.hairSoft}`, background: selecting ? T.hivizDim : "transparent" }}>
          {!selecting ? (
            <>
              {/* Archived is its own tab in the rail now, under Vendor (Coy, 2026-10-04). */}
              {filter === "archived" && <Link href="/dashboard/archive" style={{ ...eyebrow, color: T.ink3 }}>Deleted customers &amp; jobs ›</Link>}
              {doneHere > 0 && (
                <button onClick={() => setShowDone(!showDone)} style={{ ...eyebrow, color: showDone ? T.ink : T.ink3, cursor: "pointer", marginLeft: 10 }}
                  title="Customers whose every job is complete">
                  {showDone ? `Hide done · ${doneHere}` : `Done · ${doneHere} hidden — show`}
                </button>
              )}
              {lostIds.length > 0 && (
                <button disabled={archBusy} onClick={() => setAsking(lostIds)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer", marginLeft: 10 }}
                  title="Archive every customer whose jobs are all lost — they come back if they call or text again">
                  Archive lost · {lostIds.length}
                </button>
              )}
            </>
          ) : (
            <>
              <span style={{ fontSize: F.sm, fontWeight: 600 }}>{picked.size} selected</span>
              {lostIds.length > 0 && (
                <button onClick={() => setPicked(new Set(lostIds))}
                  className="rounded px-2" style={{ ...eyebrow, height: 28, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer" }}>
                  Lost · {lostIds.length}
                </button>
              )}
              {filter !== "archived" && silentHere > 0 && (
                <button onClick={() => setPicked(new Set(visible.filter((t) => t.silent).map((t) => t.contact_id)))}
                  className="rounded px-2" style={{ ...eyebrow, height: 28, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer" }}>
                  Nothing said · {silentHere}
                </button>
              )}
              <button onClick={() => setPicked(picked.size === visible.length ? new Set() : new Set(visible.map((t) => t.contact_id)))}
                className="rounded px-2" style={{ ...eyebrow, height: 28, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer" }}>
                {picked.size === visible.length ? "None" : "All"}
              </button>
              <span className="flex-1" />
              <button onClick={() => { setSelecting(false); setPicked(new Set()); }} style={{ ...eyebrow, color: T.ink3, cursor: "pointer" }}>Cancel</button>
              <button disabled={!picked.size || archBusy} onClick={() => (filter === "archived" ? void archive([...picked], true) : setAsking([...picked]))}
                className="rounded px-3" style={{ ...eyebrow, height: 30, background: T.hiviz, color: T.onHiviz, cursor: "pointer", opacity: !picked.size || archBusy ? 0.5 : 1 }}>
                {filter === "archived" ? `Unarchive ${picked.size || ""}` : `Archive ${picked.size || ""}`}
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="p-3 space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded animate-pulse" style={{ height: 52, background: T.hairSoft }} />
          ))}
        </div>
      ) : noOrg ? (
        <EmptyState tone="warn"
          title="This account isn't a member of any organisation"
          detail="You are signed in, but nothing is shared with this account yet. Ask for an invitation to your organisation." />
      ) : error ? (
        <EmptyState tone="warn" title="Couldn't load threads" detail={error} />
      ) : threads.length === 0 && filter !== "archived" && !isCustom ? (
        <EmptyState title="No threads yet" detail="Calls and texts appear here as they arrive." />
      ) : visible.length === 0 ? (
        <EmptyState
          title={q || findQ ? `Nothing matches “${q || find.trim()}”` : filter === "archived" ? "Nothing archived" : isCustom ? "Nobody in this thread yet" : `Nothing under ${label.name}`}
          detail={findQ ? `Nothing in ${label.name} by that name, place or word. The search in the header looks everywhere.` : q
            ? "This searches names, numbers and each thread's latest message. Full text over every message isn't wired yet, so a word said mid-conversation won't be found here."
            : isCustom ? "Tap + Add contact to put people in it. A job thread fills itself as people join the job." : WHY_EMPTY[filter] ?? "Nothing under this filter."} />
      ) : (
        <div>
          {(selecting || filter === "archived") && visible.map((t) => (
            <SelectRow key={t.contact_id} t={t} selecting={selecting} on={picked.has(t.contact_id)} onPick={() => pick(t.contact_id)}
              onOpen={() => openContact(t.contact_id)}
              onRestore={filter === "archived" ? () => void archive([t.contact_id], true) : undefined} />
          ))}
          {!selecting && filter !== "archived" && visible.map((t, i) => (
            <ThreadRow key={t.contact_id} t={t} first={i === 0}
              expanded={openRow === t.contact_id}
              onToggle={() => setOpenRow(openRow === t.contact_id ? null : t.contact_id)}
              onOpen={() => openContact(t.contact_id)}
              selected={openId === t.contact_id}
              onDecide={decide} onName={nameDecide} onBucket={(id, bucket, sub) => fileAndToast(id, bucket, sub)}
              subtypes={subtypes} deciding={deciding}
              chipShown={!q && isSystemKey(filter) && filter !== "all"}
              tray={trayRow?.id === t.contact_id ? trayRow.side : null}
              onTray={(side) => setTrayRow(side ? { id: t.contact_id, side } : null)}
              onArchive={() => setAsking([t.contact_id])} />
          ))}
        </div>
      )}
    </div>
  );
}
