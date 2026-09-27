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
 * Added by work order 17: the filter chips and the row expand.
 *
 * THE CHIP RULE. A chip is rendered only when there is a real source for its
 * number. v34 has eleven filters; ten appear here. `Drafts` does not, because
 * there is no outbox table in the schema — see the header of
 * src/app/api/threads/counts/route.ts. `Today` is the one count computed on
 * this side, because "today" depends on the viewer's timezone and the server
 * has no timezone to work from.
 *
 * A chip reading 0 is fine and often the point: `Quoted 0` is a true statement
 * about a query that ran. What is not fine is a chip with nothing behind it.
 *
 * No mock constants. v34's THREADS array is not imported and must not be.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, relTime } from "@/lib/v34/tokens";
import { Avatar, EmptyState } from "@/components/v34/primitives";
import { Composer } from "@/components/v34/composer";
import { TRAY_PX, decideSwipe, isHorizontal, clampDrag } from "@/lib/swipe";

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
  /** Customer · Vendor · Personal · Spam — confirmed, or filed by Dusty. Null = Unsorted. */
  bucket: Bucket | null;
  subtype: string | null;
  /** Dusty filed this one itself (spam), with the line it went on. */
  bucket_auto: { reason: string | null } | null;
  proposal: Proposal | null;
  /** Applied because they introduced themselves; Keep or Undo in the row. */
  auto_name: { claim_id: string; quote: string | null; channel: string | null } | null;
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
type Bucket = "customer" | "vendor" | "personal" | "spam";
type Subtype = { bucket: Bucket; slug: string; label: string };

/**
 * Threads sorts PEOPLE (DECISIONS §6): the four buckets plus Unsorted. Job
 * stages — lead, quoted, pouring, won — are the Jobs board, not chips here.
 * `c` is the count pill's colour.
 */
const CHIPS: Array<{ k: string; l: string; c: string | null }> = [
  { k: "customers", l: "Customers", c: T.green },
  { k: "vendors", l: "Vendors", c: T.chalk },
  { k: "unsorted", l: "Unsorted", c: T.hiviz },
  { k: "all", l: "All", c: null },
  { k: "needs", l: "Needs you", c: T.hiviz },
  { k: "today", l: "Today", c: T.ink },
  { k: "personal", l: "Personal", c: T.violet },
  { k: "spam", l: "Spam", c: null },
];

/** Up front. The rest live behind the funnel. */
const FRONT = ["customers", "vendors", "unsorted"];

/** Local midnight, so "today" means the viewer's today rather than UTC's. */
function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function matches(t: Thread, k: string): boolean {
  // Spam shows only under its own chip.
  if (k !== "spam" && t.bucket === "spam") return false;
  switch (k) {
    case "all": return true;
    case "today": return isToday(t.occurred_at);
    case "needs": return t.direction === "inbound";
    case "unsorted": return t.bucket === null;
    case "customers": return t.bucket === "customer";
    case "vendors": return t.bucket === "vendor";
    case "personal": return t.bucket === "personal";
    case "spam": return t.bucket === "spam";
    default: return true;
  }
}

/** What an empty filtered list should say — the reason, not just "nothing". */
const WHY_EMPTY: Record<string, string> = {
  today: "Nothing has come in today. The list is not broken — the phone is quiet.",
  needs: "Every thread's last word is yours. Nothing is waiting on a reply.",
  unsorted: "Everyone who has called or texted is in a bucket.",
  customers: "Nobody is filed as a customer yet. Open a thread in Unsorted and tap Customer.",
  vendors: "Nobody is filed as a vendor yet — subs, suppliers, rental yards and people looking for work go here.",
  personal: "Nobody is filed as personal.",
  spam: "Nothing is filed as spam.",
};

/* ------------------------------------------------------------- buckets */

const BUCKETS: Array<{ k: Bucket; l: string; c: string }> = [
  { k: "customer", l: "Customer", c: T.green },
  { k: "vendor", l: "Vendor", c: T.chalk },
  { k: "personal", l: "Personal", c: T.violet },
  { k: "spam", l: "Spam", c: T.ink3 },
];

/** Dusty's classification, as the bucket it points at. */
const SUGGESTS: Record<string, Bucket> = {
  customer: "customer", vendor: "vendor", sub: "vendor", personal: "personal", spam: "spam",
};

/**
 * One tap to sort a person. Dusty's guess is outlined; the confirmed bucket is
 * solid. After a bucket, the types under it (from org_contact_subtypes) are one
 * more optional tap. Filing someone as a vendor or sub also stops quo-intake
 * making leads for them (sc_classify_contact keeps the lead guard in step).
 */
function BucketPicker({ t, busy, subtypes, onPick }: {
  t: Thread; busy: boolean; subtypes: Subtype[];
  onPick: (bucket: Bucket | null, subtype?: string | null) => void;
}) {
  const guess = !t.bucket && t.proposal ? SUGGESTS[t.proposal.classification] ?? null : null;
  const guessSub = guess === "vendor" && t.proposal?.classification === "sub" ? "subcontractor" : null;
  const types = t.bucket ? subtypes.filter((x) => x.bucket === t.bucket) : [];
  const chip = (on: boolean, hint: boolean, colour: string): React.CSSProperties => ({
    height: 30, padding: "0 11px", borderRadius: 3, fontFamily: disp, fontSize: F.sm,
    letterSpacing: ".04em", textTransform: "uppercase", cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.5 : 1,
    border: `1.5px ${hint ? "dashed" : "solid"} ${on || hint ? colour : T.hair}`,
    background: on ? colour : T.card, color: on ? "#fff" : hint ? colour : T.ink2,
  });

  if (t.bucket_auto && t.bucket) {
    const name = BUCKETS.find((b) => b.k === t.bucket)?.l.toLowerCase() ?? t.bucket;
    return (
      <div className="mt-2 rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: 10 }}>
        <div style={{ ...eyebrow, color: T.chalk }}>Filed as {name} by Dusty</div>
        {t.bucket_auto.reason && (
          <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 5, paddingLeft: 8, borderLeft: `2px solid ${T.chalk}`, fontStyle: "italic" }}>
            “{t.bucket_auto.reason.length > 200 ? `${t.bucket_auto.reason.slice(0, 200)}…` : t.bucket_auto.reason}”
          </div>
        )}
        <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 8 }}>
          <button disabled={busy} style={chip(true, false, T.ink)} onClick={() => onPick(t.bucket!, t.subtype ?? null)}>Keep as {name}</button>
          <button disabled={busy} style={chip(false, false, T.ink)} onClick={() => onPick(null)}>Not {name}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div style={{ ...eyebrow, color: T.ink3, marginBottom: 4 }}>
        {t.bucket ? "Filed as" : guess ? `Dusty thinks ${BUCKETS.find((b) => b.k === guess)?.l.toLowerCase()} — tap to file` : "What are they?"}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {BUCKETS.map((b) => (
          <button key={b.k} disabled={busy} style={chip(t.bucket === b.k, guess === b.k, b.c)}
            onClick={() => onPick(t.bucket === b.k ? null : b.k, t.bucket === b.k ? null : guess === b.k ? guessSub : null)}>
            {b.l}
          </button>
        ))}
      </div>
      {types.length > 0 && (
        <div className="flex gap-1 flex-wrap" style={{ marginTop: 6 }}>
          {types.map((x) => (
            <button key={x.slug} disabled={busy} onClick={() => onPick(t.bucket, t.subtype === x.slug ? null : x.slug)}
              className="rounded-full px-2.5"
              style={{ height: 26, fontSize: F.xs, cursor: "pointer", border: `1px solid ${t.subtype === x.slug ? T.ink : T.hair}`,
                       background: t.subtype === x.slug ? T.ink : T.card, color: t.subtype === x.slug ? "#fff" : T.ink2 }}>
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
    background: primary ? T.ink : T.card, color: primary ? "#fff" : T.ink2,
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
    background: primary ? T.ink : T.card, color: primary ? "#fff" : T.ink2,
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

function ThreadRow({ t, first, expanded, onToggle, onOpen, onDecide, onName, onBucket, subtypes, deciding, trayOpen, onTray, onAccept }: {
  t: Thread; first: boolean; expanded: boolean; onToggle: () => void; onOpen: () => void;
  /** Swipe right: this row's four-bucket tray is open. One row at a time. */
  trayOpen: boolean;
  onTray: (open: boolean) => void;
  /** Swipe left all the way: file Dusty's guess. */
  onAccept: (bucket: Bucket) => void;
  onDecide: (proposalId: string, body: Record<string, unknown>) => void;
  onName: (claimId: string, action: "keep" | "undo") => void;
  onBucket: (contactId: string, bucket: Bucket | null, subtype?: string | null) => void;
  subtypes: Subtype[];
  deciding: boolean;
}) {
  const badge = t.bucket ? BUCKETS.find((b) => b.k === t.bucket) : null;
  // Dusty's guess, shown on the collapsed row so the list can be read — and
  // accepted with a left swipe — without opening anything.
  const guess = !t.bucket && t.proposal ? SUGGESTS[t.proposal.classification] ?? null : null;
  const guessB = guess ? BUCKETS.find((b) => b.k === guess)! : null;
  const when = relTime(t.occurred_at);

  // Swipe: right opens the buckets, left all the way accepts the guess.
  // touch-action: pan-y leaves vertical scrolling to the browser.
  const [drag, setDrag] = useState<number | null>(null);
  const start = React.useRef<{ x: number; y: number; w: number; on: boolean } | null>(null);
  const swipeable = !expanded;
  const offset = drag ?? (trayOpen ? TRAY_PX : 0);
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!swipeable) return;
    const p = e.touches[0];
    start.current = { x: p.clientX, y: p.clientY, w: e.currentTarget.clientWidth, on: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const st = start.current; if (!st) return;
    const p = e.touches[0];
    const dx = p.clientX - st.x + (trayOpen ? TRAY_PX : 0), dy = p.clientY - st.y;
    if (!st.on) { if (!isHorizontal(p.clientX - st.x, dy)) return; st.on = true; }
    setDrag(clampDrag(dx, st.w, !!guess));
  };
  const onTouchEnd = () => {
    const st = start.current; start.current = null;
    if (!st?.on || drag === null) { setDrag(null); return; }
    const r = decideSwipe(drag, st.w, !!guess);
    setDrag(null);
    if (r === "open") onTray(true);
    else { onTray(false); if (r === "accept" && guess) onAccept(guess); }
  };
  const isVoicemail = t.summary_source === "quo_voicemail";
  const synthesised = t.preview_source === "synthesised";

  return (
    <div className="relative overflow-hidden" style={{ borderTop: first ? "none" : `1px solid ${T.hair}` }}>
      {/* Behind the row, left: the four buckets (swipe right). */}
      {offset > 0 && (
        <div className="absolute inset-y-0 left-0 flex" style={{ width: TRAY_PX }} aria-label="File as">
          {BUCKETS.map((b) => (
            <button key={b.k} disabled={deciding} onClick={() => { onTray(false); onBucket(t.contact_id, b.k, guess === b.k && t.proposal?.classification === "sub" ? "subcontractor" : null); }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{ background: b.c, color: "#fff", fontFamily: disp, fontSize: F.micro, fontWeight: 700, textTransform: "uppercase",
                       letterSpacing: 0, boxShadow: guess === b.k ? "inset 0 0 0 3px rgba(255,255,255,.85)" : undefined }}>
              {b.l}
              {guess === b.k && <span style={{ fontSize: F.micro, opacity: 0.9 }}>Dusty</span>}
            </button>
          ))}
        </div>
      )}
      {/* Behind the row, right: accept Dusty's guess (swipe left). */}
      {offset < 0 && guessB && (
        <div className="absolute inset-0 flex items-center justify-end pr-4"
          style={{ background: guessB.c, color: "#fff", fontFamily: disp, fontSize: F.md, fontWeight: 600, textTransform: "uppercase" }}>
          {offset < -120 ? `✓ ${guessB.l}` : guessB.l}
        </div>
      )}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{ background: T.card, position: "relative", touchAction: "pan-y",
                 transform: offset ? `translateX(${offset}px)` : undefined,
                 transition: drag === null ? "transform .18s ease-out" : "none" }}>
      <button onClick={() => (trayOpen ? onTray(false) : onToggle())} aria-expanded={expanded}
        className="w-full px-2.5 py-2 flex gap-2.5 items-start text-left">
        <Avatar label={t.display_name} kind={t.contact_type} dim={t.name_is_phone} />
        <span style={{ minWidth: 0, flex: 1, display: "block" }}>
          <span className="flex items-baseline gap-1.5" style={{ minWidth: 0 }}>
            <span style={{
              fontFamily: disp, fontSize: F.md, fontWeight: 600, lineHeight: 1.2, ...clip,
              // A phone number is a weaker identity than a name and is coloured
              // as such — but it is still the real one. Nothing is invented to
              // fill the gap.
              color: t.name_is_phone ? T.ink2 : T.ink,
            }}>{t.display_name}</span>
            {t.auto_name && (
              <span className="shrink-0" title="Named from their own words — not yet kept by you"
                style={{ ...eyebrow, color: T.chalk }}>Auto</span>
            )}
            {badge && (
              <span className="shrink-0" title={t.bucket_auto ? "Filed by Dusty — Undo in the row" : undefined}
                style={{ ...eyebrow, color: badge.c }}>
                {badge.l}{t.bucket_auto ? " · auto" : ""}
              </span>
            )}
            {guessB && (
              <span className="shrink-0 rounded px-1" title="Dusty's guess — swipe left to accept, right for all four"
                style={{ ...eyebrow, color: guessB.c, border: `1px dashed ${guessB.c}` }}>
                {guessB.l}?
              </span>
            )}
            <span className="flex-1" />
            {t.msg_count > 1 && <span style={{ fontSize: F.micro, color: T.ink3, ...nums }}>{t.msg_count}</span>}
            {when && <span className="shrink-0" style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{when}</span>}
          </span>

          {isVoicemail && (
            <span style={{ ...eyebrow, color: T.hiviz, display: "block", marginTop: 2 }}>Voicemail</span>
          )}

          {/* Fixed height so several hundred rows gaining a summary changes no
              geometry. Unclipped once expanded. */}
          <span style={{
            display: "block", fontSize: F.sm, marginTop: 2,
            color: synthesised ? T.ink3 : T.ink2,
            fontStyle: synthesised ? "italic" : "normal",
            minHeight: "1.1rem", lineHeight: "1.15rem",
            ...(expanded
              ? { whiteSpace: "normal" as const }
              : { overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }),
          }}>{t.preview}</span>
        </span>
      </button>

      {/* The expanded region shows only what exists. v34's version offers
          "Tell Dusty what this is", an About-them channel and scope actions;
          none of those have a writer, and a button that does nothing is worse
          than no button. */}
      {expanded && (
        <div className="px-2.5 pb-2.5" style={{ paddingLeft: 46 }}>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ fontSize: F.xs, color: T.ink3 }}>
            {t.channel && <span>{t.channel === "call" ? "Call" : "Text"}</span>}
            <span style={nums}>{t.msg_count} message{t.msg_count === 1 ? "" : "s"}</span>
            {t.phone && <span style={nums}>{t.phone}</span>}
            {t.occurred_at && (
              <span style={nums}>
                {new Date(t.occurred_at).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {/* Still says this when there is no proposal — the absence of an
              opinion is itself information, and 176 of 197 contacts are in
              exactly this state. */}
          {t.name_is_phone && !t.proposal && (
            <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4, fontStyle: "italic" }}>
              Nobody has put a name to this number yet.
            </div>
          )}

          {t.auto_name && (
            <AutoNameStrip a={t.auto_name} name={t.display_name} busy={deciding}
              onName={(action) => onName(t.auto_name!.claim_id, action)} />
          )}

          <BucketPicker t={t} busy={deciding} subtypes={subtypes}
            onPick={(bucket, subtype) => onBucket(t.contact_id, bucket, subtype)} />

          {t.proposal && (
            <ProposalReview p={t.proposal} busy={deciding}
              nameOn={!t.name_is_phone && !!t.proposal.proposed_name
                && t.proposal.proposed_name.trim().toLowerCase() === t.display_name.trim().toLowerCase()}
              onDecide={(body) => onDecide(t.proposal!.id, body)} />
          )}

          {/* Reply without leaving the list. Same composer as the thread, in
              its compact form; the draft is shared between the two. */}
          <Composer contactId={t.contact_id} phone={t.phone}
            name={t.name_is_phone ? null : t.display_name} compact />

          <button onClick={onOpen} className="mt-2 rounded px-3 flex items-center gap-2"
            style={{ height: 32, border: `1px solid ${T.hair}`, background: T.card,
                     fontFamily: disp, fontSize: F.sm, letterSpacing: ".06em",
                     textTransform: "uppercase", cursor: "pointer" }}>
            Open thread <span style={{ color: T.hiviz }}>›</span>
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- screen */

export function ThreadList() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [drift, setDrift] = useState<{ count: number | null; error?: string } | null>(null);

  // ?f= opens the list on a chip — the desktop top bar's "unnamed" counter
  // links to ?f=unsorted. Adjusted during render (not in an effect) when the
  // param changes while the list stays mounted in the messages layout.
  const fParam = params.get("f");
  const [filter, setFilter] = useState(fParam ?? "all");
  const [seenF, setSeenF] = useState(fParam);
  if (fParam !== seenF) {
    setSeenF(fParam);
    if (fParam) setFilter(fParam);
  }
  const [moreFilters, setMoreFilters] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  // Swipe tray: one row at a time. Toast: what was just filed, with Undo.
  const [trayRow, setTrayRow] = useState<string | null>(null);
  const [toast, setToast] = useState<{ contactId: string; label: string } | null>(null);
  const [deciding, setDeciding] = useState(false);

  // Bumped after a confirm, so the list and the chip counts both refetch: the
  // row's display_name becomes the real name and Unsorted drops by one. A
  // client-side patch of the row would leave the counts lying.
  const [reload, setReload] = useState(0);

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

    // Counts for everything the thread list cannot see on its own. A failure
    // here leaves `counts` null and the affected chips simply do not render —
    // it never falls back to zero.
    fetch("/api/threads/counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && d?.counts) setCounts(d.counts as Counts); })
      .catch(() => {});

    // v34 has a mock constant also called DRIFT. It is not imported anywhere
    // and must never be. A drift figure that did not come from here is a bug.
    fetch("/api/dashboard/drift")
      .then((r) => r.json())
      .then((d) => { if (!off) setDrift(d); })
      .catch(() => { if (!off) setDrift({ count: null, error: "unreachable" }); });

    return () => { off = true; };
  }, [reload]);

  // `today` is derived here; everything else comes from the counts route.
  const chipCount = useCallback((k: string): number | null => {
    if (k === "today") return loading ? null : threads.filter((t) => isToday(t.occurred_at)).length;
    if (!counts) return null;
    return typeof counts[k] === "number" ? counts[k] : null;
  }, [counts, threads, loading]);

  // Only chips with a real number. A key the API omits never reaches the row.
  const live = useMemo(() => CHIPS.filter((c) => chipCount(c.k) !== null), [chipCount]);

  const visible = useMemo(() => {
    let rows = threads.filter((t) => matches(t, filter));
    if (q) {
      rows = rows.filter((t) =>
        t.display_name.toLowerCase().includes(q)
        || (t.phone ?? "").toLowerCase().includes(q)
        || t.preview.toLowerCase().includes(q));
    }
    return rows;
  }, [threads, filter, q]);

  const hiddenActive = !FRONT.includes(filter) && filter !== "all";
  const frontChips = [
    ...(hiddenActive ? live.filter((c) => c.k === filter) : []),
    ...live.filter((c) => FRONT.includes(c.k)),
  ].slice(0, 4);

  function chipStyle(on: boolean): React.CSSProperties {
    return {
      height: 30, flex: "0 1 auto", minWidth: 0,
      border: `1px solid ${on ? T.ink : T.hair}`,
      background: on ? T.ink : T.card, color: on ? "#fff" : T.ink2,
      fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
    };
  }

  function Pill({ n, on, c }: { n: number; on: boolean; c: string | null }) {
    return (
      <span className="flex items-center justify-center rounded-full shrink-0"
        style={{ minWidth: 17, height: 17, padding: "0 4px",
                 background: on ? "rgba(255,255,255,.92)" : (n > 0 && c ? c : T.hairSoft),
                 color: on ? T.ink : (n > 0 && c ? "#fff" : T.ink3),
                 fontFamily: disp, fontSize: F.xs, fontWeight: 700, ...nums }}>{n}</span>
    );
  }

  return (
    <div>
      {toast && (
        <div className="fixed left-3 right-3 lg:left-auto lg:right-6 lg:w-[360px] bottom-[84px] lg:bottom-6 z-40 rounded-lg px-3 flex items-center gap-2"
          role="status" style={{ height: 44, background: T.ink, color: "#fff", boxShadow: "0 6px 20px rgba(0,0,0,.25)" }}>
          <span style={{ fontSize: F.sm, flex: 1 }}>Filed as {toast.label}</span>
          <button onClick={() => { const c = toast.contactId; setToast(null); void bucketDecide(c, null); }}
            style={{ ...eyebrow, color: T.hiviz, fontSize: F.sm, cursor: "pointer" }}>Undo</button>
        </div>
      )}

      {/* Drift: 0 is all-clear, >0 is an outage that reached the app, and a
          failure to read it renders as UNKNOWN — never as all-clear. */}
      {drift && (drift.count === null || drift.count > 0) && (
        <div className="px-3 py-1.5 flex items-center gap-2"
          style={{ background: T.hivizDim, borderBottom: `1px solid ${T.hair}` }}>
          <span style={{ ...eyebrow, color: "#C24A00" }}>
            {drift.count === null ? "Drift unknown" : `Drift ${drift.count}`}
          </span>
          <span style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
            {drift.count === null
              ? "Could not read the spine-drift check."
              : "message(s) arrived but never reached the app."}
          </span>
        </div>
      )}

      {q && (
        <div className="px-3 py-1.5 flex items-center gap-2"
          style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <span style={eyebrow}>Searching</span>
          <span style={{ fontSize: F.sm, color: T.ink, ...clip }}>{q}</span>
          <span className="flex-1" />
          <button onClick={() => router.push("/dashboard/messages")}
            style={{ ...eyebrow, color: T.chalk }}>Clear</button>
        </div>
      )}

      {/* One row, no scrolling. The three you reach for live out here; the rest
          sit behind the funnel. If you pick one from inside it takes the front
          slot, so you can always see what you are filtered to. */}
      {live.length > 0 && (
        <div className="flex gap-1 px-2.5 pt-2.5 pb-1.5 items-center sc-chips">
          {frontChips.map(({ k, l, c }) => {
            const on = filter === k;
            const n = chipCount(k) ?? 0;
            return (
              <button key={k} onClick={() => setFilter(on ? "all" : k)}
                className="pl-2.5 pr-2 rounded flex items-center gap-1.5" style={chipStyle(on)}>
                <span style={clip}>{l}</span>
                <Pill n={n} on={on} c={c} />
              </button>
            );
          })}

          <button onClick={() => setMoreFilters((o) => !o)} aria-label="All filters"
            aria-expanded={moreFilters}
            className="rounded flex items-center justify-center shrink-0 relative ml-auto"
            style={{ width: 32, height: 30,
                     border: `1px solid ${moreFilters || hiddenActive ? T.ink : T.hair}`,
                     background: moreFilters ? T.ink : T.card }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <path d="M1.6 2.6h11.8L9.1 7.5v4.3l-3.2 1.6V7.5z" fill="none"
                stroke={moreFilters ? "#fff" : T.ink2} strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            {hiddenActive && !moreFilters && (
              <span className="absolute rounded-full"
                style={{ top: -3, right: -3, width: 8, height: 8, background: T.hiviz }} />
            )}
          </button>
        </div>
      )}

      {moreFilters && (
        <div className="mx-2.5 mb-2 rounded px-2 py-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div className="grid grid-cols-2 gap-1">
            {live.map(({ k, l, c }) => {
              const on = filter === k;
              const n = chipCount(k) ?? 0;
              return (
                <button key={k} onClick={() => { setFilter(k); setMoreFilters(false); }}
                  className="rounded px-2.5 flex items-center justify-between gap-1.5"
                  style={{ ...chipStyle(on), height: 32 }}>
                  <span style={clip}>{l}</span>
                  <Pill n={n} on={on} c={c} />
                </button>
              );
            })}
          </div>
          {/* Says what is missing and why, rather than leaving a gap where v34
              has a chip. */}
          <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 8, lineHeight: 1.4 }}>
            No Drafts filter: there is no outbox in the schema yet, so a count
            would be invented rather than zero.
          </div>
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
      ) : threads.length === 0 ? (
        <EmptyState title="No threads yet" detail="Calls and texts appear here as they arrive." />
      ) : visible.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : `Nothing under ${CHIPS.find((c) => c.k === filter)?.l ?? filter}`}
          detail={q
            ? "This searches names, numbers and each thread's latest message. Full text over every message isn't wired yet, so a word said mid-conversation won't be found here."
            : WHY_EMPTY[filter] ?? "Nothing under this filter."} />
      ) : (
        <div>
          {visible.map((t, i) => (
            <ThreadRow key={t.contact_id} t={t} first={i === 0}
              expanded={openRow === t.contact_id}
              onToggle={() => setOpenRow(openRow === t.contact_id ? null : t.contact_id)}
              onOpen={() => router.push(`/dashboard/messages/${t.contact_id}`)}
              onDecide={decide} onName={nameDecide} onBucket={(id, bucket, sub) => fileAndToast(id, bucket, sub)}
              subtypes={subtypes} deciding={deciding}
              trayOpen={trayRow === t.contact_id}
              onTray={(open) => setTrayRow(open ? t.contact_id : null)}
              onAccept={(bucket) => fileAndToast(t.contact_id, bucket, bucket === "vendor" && t.proposal?.classification === "sub" ? "subcontractor" : null)} />
          ))}
        </div>
      )}
    </div>
  );
}
