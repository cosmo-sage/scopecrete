"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Phone, ArrowLeft, CaretDown, CaretRight, WarningCircle } from "@phosphor-icons/react";
import { DA } from "@/lib/design-tokens";
import DustyDrawer from "@/components/dashboard/DustyDrawer";
import ToolboxDrawer from "@/components/dashboard/ToolboxDrawer";

/**
 * Thread detail — real messages for one contact.
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

interface ThreadMessage {
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
}

interface Artifact {
  kind: string;
  source: string | null;
  content: string | null;
  url: string | null;
  fetched_at: string | null;
}

interface ArtifactBundle {
  transcript: Artifact | null;
  summary: Artifact | null;
  next_steps: Artifact | null;
  voicemail: Artifact | null;
}

function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  const d = raw.replace(/[^\d]/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function formatDuration(s: number | null): string | null {
  if (typeof s !== "number" || s <= 0) return null;
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function formatMsgTime(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** One call row. Transcript is fetched only when this is expanded. */
function CallRow({ m }: { m: ThreadMessage }) {
  const [open, setOpen] = useState(false);
  const [bundle, setBundle] = useState<ArtifactBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasArtifacts = m.artifact_kinds.length > 0;
  const duration = formatDuration(m.duration_seconds);
  const isOut = m.direction === "outbound";

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
        <span className="text-xs font-semibold" style={{ color: DA.textPrimary }}>
          {isOut ? "Outgoing call" : "Incoming call"}
        </span>
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

      {/* The recording links do not expire — verified alive at 118.8 hours. */}
      {m.recording_url && (
        <audio controls preload="none" src={m.recording_url}
               className="w-full mt-2" style={{ height: 32 }} />
      )}

      {hasArtifacts && (
        <button
          onClick={expand}
          className="flex items-center gap-1 mt-2 text-[11px]"
          style={{ background: "none", border: "none", cursor: "pointer", color: DA.accent, padding: 0 }}
        >
          {open ? <CaretDown size={11} /> : <CaretRight size={11} />}
          {open ? "Hide details" : `Details (${m.artifact_kinds.join(", ")})`}
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
              {/* Same playback affordance a recording gets. */}
              {bundle.voicemail.url && (
                <audio controls preload="none" src={bundle.voicemail.url}
                       className="w-full mt-2" style={{ height: 32 }} />
              )}
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

function SmsRow({ m }: { m: ThreadMessage }) {
  const isOut = m.direction === "outbound";
  return (
    <div className={`flex mb-2 ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[78%] rounded-2xl px-3 py-2"
        style={{
          background: isOut ? DA.accent : DA.surface,
          border: isOut ? "none" : `1px solid ${DA.border}`,
        }}
      >
        <div className="text-xs whitespace-pre-wrap" style={{ color: isOut ? "#fff" : DA.textPrimary }}>
          {m.body_text?.trim() || <span style={{ fontStyle: "italic", opacity: 0.7 }}>(no text)</span>}
        </div>
        <div className="text-[9px] mt-1" style={{ color: isOut ? "rgba(255,255,255,0.7)" : DA.textMuted }}>
          {formatMsgTime(m.occurred_at)}
        </div>
      </div>
    </div>
  );
}

export default function ChatThreadPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params?.id as string;

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dustyOpen, setDustyOpen] = useState(false);
  const [toolboxOpen, setToolboxOpen] = useState(false);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    fetch(`/api/threads/${contactId}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        return body;
      })
      .then((data) => {
        if (cancelled) return;
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setPhone(data.counterparty_phone ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [contactId]);

  // The counterparty phone is derived server-side from the message addresses
  // against org_phone_numbers; contacts is not readable through a session
  // client today (see api/threads/route.ts for why).
  const headerTitle = formatPhone(phone);

  return (
    <div className="flex flex-col" style={{ background: DA.bg, height: "100dvh" }}>
      <div
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: DA.surface, borderBottom: `1px solid ${DA.border}` }}
      >
        <button
          onClick={() => router.back()}
          style={{ background: "none", border: "none", cursor: "pointer", color: DA.textMuted, padding: 0 }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: DA.textPrimary }}>
            {headerTitle}
          </div>
          <div className="text-[10px]" style={{ color: DA.textMuted }}>
            {loading ? "Loading…" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: DA.surface }} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <WarningCircle size={32} color={DA.error} />
            <p className="text-sm mt-2 font-semibold" style={{ color: DA.textPrimary }}>
              Couldn&apos;t load this thread
            </p>
            <p className="text-xs mt-1 break-words" style={{ color: DA.textMuted }}>{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm py-16" style={{ color: DA.textMuted }}>
            No messages in this thread.
          </div>
        ) : (
          messages.map((m) =>
            m.channel === "call"
              ? <CallRow key={m.id} m={m} />
              : <SmsRow key={m.id} m={m} />
          )
        )}
      </div>

      <DustyDrawer open={dustyOpen} onClose={() => setDustyOpen(false)} />
      <ToolboxDrawer open={toolboxOpen} onClose={() => setToolboxOpen(false)} />
    </div>
  );
}
