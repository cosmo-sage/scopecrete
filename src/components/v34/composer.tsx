"use client";

/**
 * The composer — v34's (scopecrete-v34.jsx L4737-4820), honest about what it
 * can do today.
 *
 * v34 lays it out as a channel row (Note · Email · Text), a + attach menu
 * (Photo, Files, Receipt), the text box, hold-to-talk, and a Send arrow that
 * appears once there is something to send. That layout is kept.
 *
 * WHAT WORKS NOW
 *   - Writing, with the draft kept per contact on this device, so leaving the
 *     thread does not lose it.
 *   - Copy: the draft onto the clipboard, to paste into Quo — which is how Coy
 *     texts today.
 *   - Call: a tel: link to the contact's number. A real action on a phone.
 *
 * WHAT DOES NOT, AND SAYS SO
 *   - Send. There is no send path: outbound texting needs 10DLC registration,
 *     email has no ingestion or sending at all, and a note has no table to live
 *     in yet (job_notes arrives with FEAT-009's migration). The old composer on
 *     this screen appended the message locally and then faked a "Dusty" reply a
 *     second later; that is the thing this must never do again. So Send is
 *     visibly off, with the reason next to it — never a button that appears to
 *     work.
 *   - Attach and hold-to-talk: same, for the same reasons. Voice capture is
 *     work order 16.
 *
 * DRAFTS ARE LOCAL. localStorage, per contact, per device. That is a
 * convenience, not a record: it is not shared, not backed up, and gone if the
 * browser clears site data. When a drafts table exists this is the one place
 * to change. Every storage access is wrapped, because private windows and
 * blocked storage throw.
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F, disp, body, eyebrow, clip } from "@/lib/v34/tokens";

type Channel = "text" | "email" | "note";

/** Why each channel cannot send from here yet. Shown, not hidden. */
const NOT_CONNECTED: Record<Channel, string> = {
  text: "Texts aren't sent from here yet — copy it into Quo.",
  email: "Email isn't connected yet — copy it into your mail.",
  note: "Notes can't be saved yet — they need the notes table from FEAT-009.",
};

const draftKey = (contactId: string) => `sc:draft:${contactId}`;

function readDraft(contactId: string): { channel: Channel; text: string } {
  try {
    const raw = window.localStorage.getItem(draftKey(contactId));
    if (!raw) return { channel: "text", text: "" };
    const v = JSON.parse(raw) as { channel?: Channel; text?: string };
    return { channel: v.channel ?? "text", text: typeof v.text === "string" ? v.text : "" };
  } catch {
    return { channel: "text", text: "" };
  }
}

function writeDraft(contactId: string, channel: Channel, text: string) {
  try {
    if (text.trim()) window.localStorage.setItem(draftKey(contactId), JSON.stringify({ channel, text }));
    else window.localStorage.removeItem(draftKey(contactId));
  } catch {
    /* storage unavailable — the draft simply lives only as long as the screen */
  }
}

export function Composer({ contactId, phone, name, compact = false }: {
  contactId: string;
  /** E.164, for the Call link. */
  phone: string | null;
  /** Shown as "to …" on the channel row. Falls back to the number. */
  name?: string | null;
  /** The small form used inside an expanded thread row. */
  compact?: boolean;
}) {
  // Lazy init reads the saved draft once, on mount. No effect needed, so no
  // setState inside one.
  const [channel, setChannel] = useState<Channel>(() =>
    typeof window === "undefined" ? "text" : readDraft(contactId).channel);
  const [text, setText] = useState(() =>
    typeof window === "undefined" ? "" : readDraft(contactId).text);
  const [attachOpen, setAttachOpen] = useState(false);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { writeDraft(contactId, channel, text); }, [contactId, channel, text]);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2400);
  }

  const who = name || (phone ? phone : null);
  const has = text.trim().length > 0;
  const iconBtn: React.CSSProperties = {
    width: 34, height: 34, border: `1px solid ${T.hair}`, background: T.card, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };

  return (
    <div style={{ background: T.card, borderTop: compact ? "none" : `1px solid ${T.hair}` }}
      className={compact ? "mt-2" : "shrink-0 px-2.5 pt-2 pb-2"}>

      {/* Which surface am I speaking on. */}
      {!compact && (
        <div className="flex items-center gap-1 pb-2">
          {([["text", "Text"], ["email", "Email"], ["note", "Note"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setChannel(k)} aria-pressed={channel === k}
              className="rounded px-2.5"
              style={{ height: 26, background: channel === k ? T.ink : T.card,
                       color: channel === k ? "#fff" : T.ink2,
                       border: `1px solid ${channel === k ? T.ink : T.hair}`,
                       fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer" }}>
              {label}
            </button>
          ))}
          <span className="ml-auto" style={{ ...eyebrow, fontSize: 9, color: T.ink3, ...clip }}>
            {channel === "note" ? "stays internal" : who ? `to ${who}` : "no address"}
          </span>
        </div>
      )}

      {attachOpen && (
        <div className="flex gap-1.5 pb-2">
          {[["Photo", "needs a send path"], ["Files", "needs a send path"], ["Receipt", "camera capture isn't built"]].map(([l, sub]) => (
            <div key={l} aria-disabled="true" className="flex-1 rounded px-2 py-2"
              style={{ background: T.slab, border: `1px solid ${T.hair}`, minWidth: 0, opacity: 0.6 }}>
              <div style={{ fontFamily: disp, fontSize: F.sm, fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 9.5, color: T.ink3, lineHeight: 1.3 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        {!compact && (
          <button onClick={() => setAttachOpen((o) => !o)} aria-label="Attach" aria-expanded={attachOpen}
            style={{ ...iconBtn, background: attachOpen ? T.ink : T.card, color: attachOpen ? "#fff" : T.ink2,
                     fontSize: 19, lineHeight: 1, cursor: "pointer" }}>+</button>
        )}

        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 1}
          placeholder={channel === "note" ? "A note about them — stays internal"
            : channel === "email" ? "Write the email" : `Text ${who ?? "them"} back…`}
          className="flex-1 px-2.5 py-2 rounded-lg outline-none resize-none"
          style={{ border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm,
                   maxHeight: 120, lineHeight: 1.4, fontFamily: body, minWidth: 0 }} />

        {!compact && (
          // Hold-to-talk: shown, off. Voice capture is work order 16.
          <button disabled aria-label="Hold to talk — not built yet" title="Voice capture isn't built yet"
            style={{ ...iconBtn, opacity: 0.45, cursor: "not-allowed" }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <rect x="5.4" y="1.6" width="4.2" height="7.6" rx="2.1" fill="none" stroke={T.ink2} strokeWidth="1.5" />
              <path d="M3 7.4a4.5 4.5 0 0 0 9 0" fill="none" stroke={T.ink2} strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7.5 11.9v1.6" stroke={T.ink2} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {has && (
          // Send: present where v34 puts it, and visibly off. Never a button
          // that looks like it worked.
          <button disabled aria-label="Send — not connected" title={NOT_CONNECTED[channel]}
            style={{ ...iconBtn, background: T.hairSoft, border: `1px dashed ${T.ink3}`, cursor: "not-allowed" }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <path d="M7.5 12.4V2.8M3.4 6.9 7.5 2.6l4.1 4.3" fill="none" stroke={T.ink3}
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* The things that DO work, and the plain reason Send does not. */}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 6 }}>
        {phone && (
          <a href={`tel:${phone}`} className="rounded px-2.5 no-underline flex items-center"
            style={{ height: 28, border: `1px solid ${T.hair}`, color: T.ink,
                     fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em", textTransform: "uppercase" }}>
            Call
          </a>
        )}
        {has && (
          <button onClick={() => void copy()} className="rounded px-2.5"
            style={{ height: 28, border: `1px solid ${T.hair}`, background: T.card, color: T.ink,
                     fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
            {copied === "ok" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy"}
          </button>
        )}
        <span style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.3, flex: "1 1 160px" }}>
          {has ? NOT_CONNECTED[channel] : "Drafts stay on this device until they can be sent."}
        </span>
      </div>
    </div>
  );
}
