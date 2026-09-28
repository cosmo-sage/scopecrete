"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Phone, CaretDown, CaretRight } from "@phosphor-icons/react";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";

/**
 * v34 palette, mapped onto the key names this screen already used.
 *
 * The screen's logic is the part worth keeping — voicemail rendered distinctly
 * from a summary, next_steps surfaced, transcripts fetched only on expand
 * (they reach ~10,600 characters). Only the colours change, so that rewrite
 * risk stays at zero while the screen stops looking like a different app from
 * the shell around it.
 */
export const DA = {
  bg: T.slab,
  surface: T.card,
  elevated: T.hairSoft,
  accent: T.hiviz,
  textPrimary: T.ink,
  textSecondary: T.ink2,
  textMuted: T.ink3,
  border: T.hair,
  error: T.red,
} as const;

/**
 * The conversation with one contact: calls (voicemail, summary, transcript on
 * expand, stored audio), texts with their photos, and "Same person as…".
 * Shared by the plain conversation screen and the Customer / Vendor pages
 * (src/components/v34/person-view.tsx).
 *
 * Originally the thread detail — real messages for one contact.
 *
 * The route param is a contacts.id (the thread list navigates with it), not the
 * old "thread-001" mock key.
 *
 * The composer that used to live here has been removed rather than left
 * pointing at real data. It appended a message locally and then faked a "Dusty"
 * reply after a 1s timeout. Interleaving invented replies into a view of real
 * customer history is worse than having no composer, and DECISIONS.md §10 is
 * explicit that all outbound contact is the contractor himself and there is no
 * bot-initiated outreach. Outbound texting also needs 10DLC registration, which
 * has not happened. The call button remains — that is the real action available.
 */

export interface ThreadMessage {
  id: string;
  channel: string | null;
  direction: string | null;
  occurred_at: string | null;
  body_text: string | null;
  summary: string | null;
  summary_source: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  status: string | null;
  artifact_kinds: string[];
  /** Files on this message (message_media). Fetched lazily by MessageMedia. */
  media_count: number;
  /** Our line, by name — only when this thread used more than one (migration 035). */
  line?: string | null;
}

interface Artifact {
  kind: string;
  source: string | null;
  content: string | null;
  /** Only a stored copy is playable in a browser — see StoredAudio below. */
  storage_path: string | null;
  url: string | null;
  fetched_at: string | null;
}

interface ArtifactBundle {
  transcript: Artifact | null;
  summary: Artifact | null;
  next_steps: Artifact | null;
  voicemail: Artifact | null;
}

export function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  const d = raw.replace(/[^\d]/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Quo writes next steps as bullet or numbered lines; show them as a list. */
function splitSteps(text: string): string[] {
  return text.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
}

function formatDuration(s: number | null): string | null {
  if (typeof s !== "number" || s <= 0) return null;
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function formatTime(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(ts: string | null): string {
  if (!ts) return "Undated";
  return new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatMsgTime(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/**
 * Audio that either plays or is honest about why it cannot.
 *
 * `artifact.url` points at Quo and is unusable from a browser. `storage_path`
 * is a copy in Supabase Storage, and /api/messages/[id]/audio signs a link to
 * it. With no stored copy this renders one line of explanation and NO player,
 * because a dead control is worse than an absent one.
 */
function StoredAudio({ messageId, kind, artifact }: {
  messageId: string; kind: string; artifact: Artifact;
}) {
  // "No stored copy" is a fact about the props, not state to set in an
  // effect — deriving it keeps every setState inside an async callback.
  const hasCopy = Boolean(artifact.storage_path);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasCopy) return;
    let cancelled = false;
    fetch(`/api/messages/${messageId}/audio?kind=${encodeURIComponent(kind)}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok || !b?.url) throw new Error(b?.reason ?? b?.error ?? `HTTP ${r.status}`);
        return b.url as string;
      })
      .then((u) => { if (!cancelled) setSrc(u); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [messageId, kind, hasCopy]);

  if (!hasCopy) {
    return (
      <div className="text-[11px] mt-2" style={{ color: DA.textMuted }}>
        Audio not downloaded yet — only the transcript is stored.
      </div>
    );
  }
  if (src) {
    return <audio controls preload="none" src={src} className="w-full mt-2" style={{ height: 32 }} />;
  }
  if (failed) {
    return <div className="text-[11px] mt-2" style={{ color: DA.error }}>Audio could not be loaded.</div>;
  }
  return <div className="text-[11px] mt-2" style={{ color: DA.textMuted }}>Loading audio…</div>;
}

/** One call row. Transcript is fetched only when this is expanded. */
export function CallRow({ m }: { m: ThreadMessage }) {
  const [open, setOpen] = useState(false);
  const [bundle, setBundle] = useState<ArtifactBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasArtifacts = m.artifact_kinds.length > 0;
  const hasNext = m.artifact_kinds.includes("next_steps");
  const duration = formatDuration(m.duration_seconds);
  const isOut = m.direction === "outbound";

  // Next steps are what the caller wanted — the receptionist's whole job — so
  // a call that has them shows them without a tap (desktop design, 1d). Only
  // those calls fetch up front; transcripts stay behind the expand.
  useEffect(() => {
    if (!hasNext) return;
    let off = false;
    fetch(`/api/messages/${m.id}/artifacts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off && b) setBundle(b as ArtifactBundle); })
      .catch(() => {});
    return () => { off = true; };
  }, [hasNext, m.id]);

  const expand = useCallback(async () => {
    const next = !open;
    setOpen(next);
    // Transcripts reach ~10,600 characters, so the fetch happens here and not
    // in the thread query. Once loaded it is kept.
    if (!next || bundle || !hasArtifacts) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/messages/${m.id}/artifacts`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
      setBundle(body as ArtifactBundle);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [open, bundle, hasArtifacts, m.id]);

  return (
    <div
      className="rounded-xl px-3 py-2.5 mb-2"
      style={{ background: DA.surface, border: `1px solid ${DA.border}` }}
    >
      <div className="flex items-center gap-2">
        <Phone size={13} weight="fill" color={isOut ? DA.accent : DA.textMuted} className="shrink-0" />
        <span style={{ ...eyebrow, color: DA.textPrimary }}>
          {isOut ? "Outbound call" : "Inbound call"}
        </span>
        {m.line && (
          <span className="text-[10px]" style={{ color: DA.textMuted }}>{m.line}</span>
        )}
        {duration && (
          <span className="text-[10px] tabular-nums" style={{ color: DA.textMuted }}>{duration}</span>
        )}
        {m.status && m.status !== "completed" && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                style={{ background: DA.elevated, color: DA.textMuted }}>
            {m.status}
          </span>
        )}
        <span className="text-[10px] ml-auto shrink-0" style={{ color: DA.textMuted }}>
          {formatMsgTime(m.occurred_at)}
        </span>
      </div>

      {/* Glance line. summary_source distinguishes what this text IS: a
          voicemail is the caller's own words, Quo's summary is a paraphrase of
          a conversation. Showing both unlabelled as "summary" would quietly
          claim someone said something they did not. */}
      {m.summary?.trim() && m.summary_source === "quo_voicemail" && (
        <div className="text-[9px] uppercase tracking-wide mt-1.5" style={{ color: DA.accent }}>
          Voicemail
        </div>
      )}
      <div className="text-xs mt-1" style={{
        color: m.summary ? DA.textSecondary : DA.textMuted,
        fontStyle: m.summary ? "normal" : "italic",
        minHeight: "1.1rem", lineHeight: "1.15rem",
      }}>
        {m.summary?.trim() || `No summary${duration ? ` · ${duration}` : ""}`}
      </div>

      {/* No player here. m.recording_url is a Quo resource endpoint: a browser
          hitting it has no API key and is cross-origin, so it loads nothing and
          the control sits at 0:00 / 0:00. A play button that cannot play is a
          control that lies about what it can do. Playback returns through
          StoredAudio once the audio is copied into Supabase Storage. */}

      {!open && bundle?.next_steps?.content && (
        <div className="mt-2 rounded px-2.5 py-2" style={{ background: DA.elevated }}>
          <div style={{ ...eyebrow, color: DA.accent, marginBottom: 3 }}>Next steps — extracted from the call</div>
          <ul style={{ fontSize: F.xs, color: DA.textPrimary, lineHeight: 1.45, paddingLeft: 14, listStyle: "square" }}>
            {splitSteps(bundle.next_steps.content).map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}

      {hasArtifacts && (
        <button
          onClick={expand}
          className="flex items-center gap-1 mt-2 text-[11px]"
          style={{ background: "none", border: "none", cursor: "pointer", color: DA.accent, padding: 0 }}
        >
          {open ? <CaretDown size={11} /> : <CaretRight size={11} />}
          {open ? "Hide details" : m.artifact_kinds.includes("transcript") ? "Read the full transcript" : `Details (${m.artifact_kinds.join(", ")})`}
        </button>
      )}

      {open && (
        <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${DA.border}` }}>
          {loading && <div className="text-[11px]" style={{ color: DA.textMuted }}>Loading…</div>}
          {err && <div className="text-[11px]" style={{ color: DA.error }}>{err}</div>}

          {/* The voicemail is what the caller ACTUALLY SAID, in their words —
              not Quo's paraphrase. On a missed call it is the only content that
              exists, and it is usually a self-identification plus an ask
              ("this is Don Simpson… give me a call"). So it leads, and it is
              labelled as a voicemail rather than blurring into "summary". */}
          {bundle?.voicemail && (bundle.voicemail.content || bundle.voicemail.url) && (
            <div className="mb-2 rounded-lg px-2.5 py-2" style={{ background: DA.elevated }}>
              <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: DA.accent }}>
                Voicemail{bundle.voicemail.source ? ` · ${bundle.voicemail.source}` : ""}
              </div>
              {bundle.voicemail.content && (
                <div className="text-xs whitespace-pre-wrap" style={{ color: DA.textPrimary }}>
                  {bundle.voicemail.content}
                </div>
              )}
              <StoredAudio messageId={m.id} kind="voicemail" artifact={bundle.voicemail} />
            </div>
          )}

          {/* next_steps — the closest thing the system has to what
              this person actually wanted, which is the whole receptionist goal. */}
          {bundle?.next_steps?.content && (
            <div className="mb-2 rounded-lg px-2.5 py-2" style={{ background: DA.elevated }}>
              <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: DA.accent }}>
                Next steps
              </div>
              <div className="text-xs whitespace-pre-wrap" style={{ color: DA.textPrimary }}>
                {bundle.next_steps.content}
              </div>
            </div>
          )}

          {/* call_artifacts is authoritative; messages.summary is a cache. When
              both exist and disagree, the artifact is what gets shown. */}
          {bundle?.summary?.content && bundle.summary.content.trim() !== (m.summary ?? "").trim() && (
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: DA.textMuted }}>
                Summary (from call_artifacts)
              </div>
              <div className="text-xs whitespace-pre-wrap" style={{ color: DA.textSecondary }}>
                {bundle.summary.content}
              </div>
            </div>
          )}

          {bundle?.transcript?.content && (
            <div>
              <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: DA.textMuted }}>
                Transcript
                {bundle.transcript.source && ` · ${bundle.transcript.source}`}
              </div>
              {/* Speaker labels are raw E.164 numbers. Resolving them to names
                  is not built — see the report. Rendered monospace so the
                  columns line up and it reads as a transcript, not prose. */}
              <div
                className="text-[11px] whitespace-pre-wrap overflow-y-auto"
                style={{ color: DA.textSecondary, maxHeight: "40vh", fontFamily: "ui-monospace, monospace" }}
              >
                {bundle.transcript.content}
              </div>
            </div>
          )}

          {bundle && !bundle.transcript && !bundle.next_steps && !bundle.summary
            && !bundle.voicemail && !loading && (
            <div className="text-[11px]" style={{ color: DA.textMuted }}>
              No transcript, voicemail or summary stored for this call.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface MediaItem {
  id: string;
  kind: string;
  mime_type: string | null;
  state: "ready" | "unavailable";
  url: string | null;
  reason: string | null;
}

const KIND_LABEL: Record<string, string> = {
  image: "Photo", video: "Video", audio: "Audio", document: "Document", vcard: "Contact card", other: "File",
};

/**
 * The files on one text. Fetched only for messages that have any
 * (media_count > 0), and only when the row renders — the route copies each file
 * out of Quo into private storage the first time it is asked, so opening a
 * thread is what captures its photos.
 *
 * A file that cannot be fetched says why in words. It never renders as a broken
 * image, which reads as a bug in the app rather than a fact about the file.
 */
function MessageMedia({ messageId, count, isOut }: { messageId: string; count: number; isOut: boolean }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch(`/api/messages/${messageId}/media`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
        if (!off) setItems(Array.isArray(b.items) ? b.items : []);
      })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [messageId]);

  const muted = isOut ? "rgba(255,255,255,0.8)" : DA.textMuted;

  if (err) return <div className="text-[11px] mt-1" style={{ color: muted }}>Couldn&apos;t load {count === 1 ? "the attachment" : "attachments"}: {err}</div>;
  if (!items) {
    return (
      <div className="flex gap-1.5 mt-1">
        {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
          <div key={i} className="rounded-lg animate-pulse" style={{ width: 96, height: 96, background: isOut ? "rgba(255,255,255,0.25)" : DA.elevated }} />
        ))}
      </div>
    );
  }

  const full = items.find((x) => x.id === open && x.url);

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {items.map((it) => {
          if (it.state !== "ready" || !it.url) {
            return (
              <div key={it.id} className="rounded-lg px-2 py-1.5 text-[11px]"
                style={{ background: isOut ? "rgba(255,255,255,0.18)" : DA.elevated, color: muted, maxWidth: 220 }}>
                {KIND_LABEL[it.kind] ?? "File"} not available — {it.reason}
              </div>
            );
          }
          if (it.kind === "image") {
            return (
              <button key={it.id} onClick={() => setOpen(it.id)} aria-label="Open photo"
                className="rounded-lg overflow-hidden" style={{ width: 120, height: 120, padding: 0, border: "none", cursor: "zoom-in" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a static asset */}
                <img src={it.url} alt="Photo sent in this message" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            );
          }
          if (it.kind === "video") {
            return <video key={it.id} src={it.url} controls style={{ maxWidth: 220, borderRadius: 8 }} />;
          }
          return (
            <a key={it.id} href={it.url} target="_blank" rel="noopener noreferrer"
              className="rounded-lg px-2.5 py-1.5 text-[11px] no-underline"
              style={{ background: isOut ? "rgba(255,255,255,0.18)" : DA.elevated, color: isOut ? "#fff" : DA.textPrimary }}>
              {KIND_LABEL[it.kind] ?? "File"} — open
            </a>
          );
        })}
      </div>

      {full && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(10,12,14,0.86)", cursor: "zoom-out" }} onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={full.url as string} alt="Photo sent in this message"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }} />
        </div>
      )}
    </>
  );
}

export function SmsRow({ m }: { m: ThreadMessage }) {
  const isOut = m.direction === "outbound";
  const text = m.body_text?.trim();
  return (
    <div className={`flex mb-2 ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[78%] rounded-2xl px-3 py-2"
        style={{
          background: isOut ? DA.accent : DA.surface,
          border: isOut ? "none" : `1px solid ${DA.border}`,
        }}
      >
        {/* "(no text)" only when there is genuinely nothing — a photo with no
            caption is not an empty message, and labelling it one is how two of
            Amber's photos read as blank bubbles. */}
        {(text || m.media_count === 0) && (
          <div className="text-xs whitespace-pre-wrap" style={{ color: isOut ? "#fff" : DA.textPrimary }}>
            {text || <span style={{ fontStyle: "italic", opacity: 0.7 }}>(no text)</span>}
          </div>
        )}
        {m.media_count > 0 && <MessageMedia messageId={m.id} count={m.media_count} isOut={isOut} />}
        <div className="text-[9px] mt-1" style={{ color: isOut ? "rgba(255,255,255,0.7)" : DA.textMuted, letterSpacing: ".06em" }}>
          {isOut ? "OUT" : "IN"} · {formatTime(m.occurred_at)}{m.line ? ` · ${m.line}` : ""}
        </div>
      </div>
    </div>
  );
}

interface ThreadListItem {
  contact_id: string;
  display_name: string;
  name_is_phone: boolean;
  phone: string | null;
  preview: string;
  msg_count: number;
}

export interface MergeInfo { id: string; merged_at: string; phone: string | null }

/**
 * "Same person as…" — pick another thread and fold it into this one.
 *
 * One pair, one confirmation. The confirm step shows both sides with their
 * message counts, because the thing being asked is "are these the same
 * person?" and that is answered by looking, not by a button label. The thread
 * that is open is the one kept; the picked one's calls, texts and photos move
 * onto it. Undo is offered straight after, and stays on the thread.
 */
export function MergeSheet({ contactId, keepLabel, keepCount, onClose, onMerged }: {
  contactId: string;
  keepLabel: string;
  keepCount: number;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [list, setList] = useState<ThreadListItem[] | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<ThreadListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/threads")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
        if (!off) setList((Array.isArray(b.threads) ? b.threads : []).filter((t: ThreadListItem) => t.contact_id !== contactId));
      })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [contactId]);

  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = (list ?? []).filter((t) =>
    !needle
    || t.display_name.toLowerCase().includes(needle)
    || (digits.length >= 3 && (t.phone ?? "").replace(/\D/g, "").includes(digits))
    || t.preview.toLowerCase().includes(needle)).slice(0, 40);

  async function merge() {
    if (!pick) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/contacts/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner_id: contactId, loser_id: pick.contact_id }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      onMerged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const btn = (primary?: boolean): React.CSSProperties => ({
    height: 34, padding: "0 14px", borderRadius: 4, cursor: busy ? "default" : "pointer",
    border: `1px solid ${primary ? DA.textPrimary : DA.border}`,
    background: primary ? DA.textPrimary : DA.surface, color: primary ? "#fff" : DA.textPrimary,
    fontFamily: disp, fontSize: F.sm, letterSpacing: ".06em", textTransform: "uppercase", opacity: busy ? 0.6 : 1,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center"
      style={{ background: "rgba(10,12,14,0.5)" }} onClick={onClose}>
      <div className="w-full lg:max-w-lg rounded-t-xl lg:rounded-xl flex flex-col"
        style={{ background: DA.surface, maxHeight: "85dvh" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${DA.border}` }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: DA.textMuted }}>Same person as…</div>
          <div className="text-sm font-semibold" style={{ color: DA.textPrimary }}>
            {pick ? "Confirm these are one person" : `Pick the other number ${keepLabel} uses`}
          </div>
        </div>

        {!pick ? (
          <>
            <div className="px-4 py-2">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="A name, a number, a word they said"
                className="w-full rounded px-2.5 outline-none text-sm"
                style={{ height: 36, border: `1px solid ${DA.border}`, background: DA.bg, color: DA.textPrimary }} />
            </div>
            <div className="overflow-y-auto flex-1">
              {err && <div className="px-4 py-2 text-xs" style={{ color: DA.error }}>{err}</div>}
              {!list && !err && <div className="px-4 py-3 text-xs" style={{ color: DA.textMuted }}>Loading threads…</div>}
              {list && shown.length === 0 && (
                <div className="px-4 py-3 text-xs" style={{ color: DA.textMuted }}>Nothing matches.</div>
              )}
              {shown.map((t) => (
                <button key={t.contact_id} onClick={() => setPick(t)}
                  className="w-full text-left px-4 py-2" style={{ borderTop: `1px solid ${DA.border}` }}>
                  <div className="text-sm font-semibold truncate" style={{ color: t.name_is_phone ? DA.textSecondary : DA.textPrimary }}>
                    {t.display_name}
                    <span className="text-[10px] font-normal ml-2" style={{ color: DA.textMuted }}>{t.msg_count} msg</span>
                  </div>
                  <div className="text-xs truncate" style={{ color: DA.textMuted }}>{t.preview}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded p-2.5" style={{ border: `1px solid ${DA.border}` }}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: DA.textMuted }}>Keep</div>
                <div className="text-sm font-semibold truncate" style={{ color: DA.textPrimary }}>{keepLabel}</div>
                <div className="text-[11px]" style={{ color: DA.textMuted }}>{keepCount} messages</div>
              </div>
              <div className="rounded p-2.5" style={{ border: `1px solid ${DA.accent}` }}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: DA.accent }}>Fold in</div>
                <div className="text-sm font-semibold truncate" style={{ color: DA.textPrimary }}>{pick.display_name}</div>
                <div className="text-[11px]" style={{ color: DA.textMuted }}>{pick.msg_count} messages</div>
              </div>
            </div>
            <p className="text-xs mt-3" style={{ color: DA.textSecondary, lineHeight: 1.5 }}>
              Every call, text, photo and lead on <strong>{pick.display_name}</strong> moves onto this
              thread, and both numbers are kept. You can undo it afterwards.
            </p>
            {err && <p className="text-xs mt-2" style={{ color: DA.error }}>{err}</p>}
            <div className="flex gap-2 mt-3">
              <button disabled={busy} style={btn(true)} onClick={() => void merge()}>
                {busy ? "Merging…" : "Same person — merge"}
              </button>
              <button disabled={busy} style={btn()} onClick={() => setPick(null)}>Back</button>
            </div>
          </div>
        )}

        <div className="px-4 py-2" style={{ borderTop: `1px solid ${DA.border}` }}>
          <button onClick={onClose} className="text-xs" style={{ color: DA.textMuted }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}


/**
 * The timeline itself: day rules, one row per call or text, and the "nothing
 * on record" note for a number that only ever rang.
 */
export function Timeline({ messages, phone }: { messages: ThreadMessage[]; phone: string | null }) {
  const calls = messages.filter((m) => m.channel === "call").length;
  const silent = messages.length > 0 && messages.every((m) =>
    m.channel === "call" && !m.summary?.trim() && m.artifact_kinds.length === 0);
  if (messages.length === 0) {
    return <div className="text-center text-sm py-16" style={{ color: DA.textMuted }}>No messages in this thread.</div>;
  }
  return (
    <>
      {messages.map((m, i) => {
        const day = dayLabel(m.occurred_at);
        const sep = i === 0 || day !== dayLabel(messages[i - 1].occurred_at);
        return (
          <React.Fragment key={m.id}>
            {sep && (
              <div className="flex items-center gap-2 my-2.5" aria-hidden="true">
                <span className="flex-1" style={{ height: 1, background: DA.border }} />
                <span style={{ ...eyebrow }}>{day}</span>
                <span className="flex-1" style={{ height: 1, background: DA.border }} />
              </div>
            )}
            {m.channel === "call" ? <CallRow m={m} /> : <SmsRow m={m} />}
          </React.Fragment>
        );
      })}
      {silent && (
        <div className="mt-4 py-4" style={{ borderTop: `2px solid ${DA.textPrimary}`, borderBottom: `2px solid ${DA.textPrimary}` }}>
          <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, color: DA.textPrimary }}>
            Nothing was said on record.
          </div>
          <p style={{ fontSize: F.sm, color: DA.textSecondary, lineHeight: 1.5, marginTop: 4 }}>
            {calls} call{calls === 1 ? "" : "s"} from this number. No voicemail, no transcript, no summary.
            All this thread knows is that the phone rang. Naming the number is the only thing that
            makes the next one readable — do it from this row in the thread list.
          </p>
          {phone && (
            <a href={`tel:${phone}`} className="inline-flex rounded px-3 mt-2 items-center"
              style={{ height: 34, border: `1px solid ${DA.border}`, background: DA.surface, color: DA.textPrimary,
                       fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em", textTransform: "uppercase", textDecoration: "none" }}>Call back</a>
          )}
        </div>
      )}
    </>
  );
}
