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
 *   - Notes (migration 041, 2026-09-28): Save writes a contact_notes row. It
 *     shows on their timeline, and Dusty reads it — in chat and when he reads
 *     the thread in the background.
 *   - The mic: dictation, through the browser's own speech recognition (Chrome
 *     sends the audio to Google to turn into words; nothing of ours stores
 *     it). Tap, talk, the words land in the box. Where the browser has no
 *     recognition the mic is shown off with that reason.
 *
 * WHAT DOES NOT, AND SAYS SO
 *   - Send for email. Email has no sending at all, so Send is visibly off with
 *     the reason next to it. The old composer on this screen appended the
 *     message locally and then faked a "Dusty" reply a second later; that is
 *     the thing this must never do again.
 *
 * TEXTS SEND THROUGH QUO (Coy, 2026-10-05). Send posts to /api/texts, which
 * asks Quo's API to send from the picked line. Nothing is shown as sent until
 * Quo says it took it, and the text itself appears in the thread only when
 * Quo's webhook brings it back — the same road as one sent from the Quo app.
 *
 * GONE (Coy, 2026-09-28): the Call button here — the page has one at the top —
 * and the + attach menu, which could do nothing until sending exists.
 *
 * DRAFTS ARE LOCAL. localStorage, per contact, per device. That is a
 * convenience, not a record: it is not shared, not backed up, and gone if the
 * browser clears site data. When a drafts table exists this is the one place
 * to change. Every storage access is wrapped, because private windows and
 * blocked storage throw.
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F, disp, body, eyebrow, clip, formatPhone } from "@/lib/v34/tokens";
import { segments } from "@/lib/texting";
import { proposalLink } from "@/lib/v34/send-proposal";

type Channel = "text" | "email" | "note";

/** Why each channel cannot send from here yet. Shown, not hidden. */
const NOT_CONNECTED: Record<Channel, string> = {
  text: "Sends through Quo from your line.",
  email: "Email isn't connected yet — copy it into your mail.",
  note: "Saved to their page. Dusty reads your notes.",
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

/** The browser's speech recognition, where there is one (Chrome: webkit-prefixed). */
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void;
};
function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface SlashProposal {
  job_id: string; job_title: string | null; number: string; version: number; status: "draft" | "final"; total: number | null;
  link: { id: string; url: string; token: string; views: string } | null;
}

export function Composer({ contactId, phone, name, compact = false, onNoteSaved, onSent, only, fromLine }: {
  contactId: string;
  /** E.164, for the Call link. */
  phone: string | null;
  /** Shown as "to …" on the channel row. Falls back to the number. */
  name?: string | null;
  /** The small form used inside an expanded thread row. */
  compact?: boolean;
  /** A note was saved — the page reloads its timeline. */
  onNoteSaved?: () => void;
  /** A text was taken by Quo — the page reloads once the webhook has brought it back. */
  onSent?: () => void;
  /** The customer page picks the channel from its filter: no tabs, this one only. */
  only?: "text" | "email";
  /**
   * Which of your lines a text goes from (Lines, Claude Design package 9) — the
   * line they last used, else the primary; picked from `lines`. Only when the
   * org has two or more. Send uses it; Copy is still there for the Quo app.
   */
  fromLine?: { lines: Array<{ id: string; name: string; color: string; provider: string | null }>; value: string | null; onPick: (id: string) => void } | null;
}) {
  // Lazy init reads the saved draft once, on mount. No effect needed, so no
  // setState inside one.
  const [chosen, setChannel] = useState<Channel>(() =>
    typeof window === "undefined" ? "text" : readDraft(contactId).channel);
  const channel: Channel = only ?? chosen;
  const [text, setText] = useState(() =>
    typeof window === "undefined" ? "" : readDraft(contactId).text);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);
  const [canDictate] = useState(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Send a job's proposal from here (Coy, 2026-10-05) — its own sheet: the job, the words, Preview, Send.
  // "/" in the box lists their final proposals; a pick puts its link in the text (Coy, 2026-10-07).
  const [finals, setFinals] = useState<SlashProposal[] | null>(null);
  const [slashBusy, setSlashBusy] = useState(false);
  const [slashOff, setSlashOff] = useState<string | null>(null);
  const linked = useRef<Set<string>>(new Set());
  const slash = channel !== "note" ? /(?:^|\s)\/([\w-]*)$/.exec(text) : null;
  const slashOpen = !!slash && slashOff !== text;
  useEffect(() => {
    if (!slashOpen || finals) return;
    let off = false;
    fetch(`/api/proposals?contact=${contactId}`).then((r) => r.json()).then((b) => {
      if (!off) setFinals(((b.proposals ?? []) as SlashProposal[]).filter((x) => x.status === "final"));
    }).catch(() => { if (!off) setFinals([]); });
    return () => { off = true; };
  }, [slashOpen, finals, contactId]);
  const slashList = (finals ?? []).filter((x) => {
    const q = (slash?.[1] ?? "").toLowerCase();
    return !q || "proposal".startsWith(q) || `${x.number} ${x.job_title ?? ""}`.toLowerCase().includes(q);
  });
  async function insertProposal(x: SlashProposal) {
    setSlashBusy(true);
    try {
      const link = x.link ?? (await proposalLink(x.job_id)).link;
      linked.current.add(link.id);
      setText((t) => t.replace(/\/([\w-]*)$/, link.url));
    } catch (e) {
      setSendMsg({ ok: false, text: `No link: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setSlashBusy(false); }
  }

  useEffect(() => { writeDraft(contactId, channel, text); }, [contactId, channel, text]);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  useEffect(() => () => { rec.current?.stop(); }, []);

  function dictate() {
    if (listening) { rec.current?.stop(); return; }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US"; r.interimResults = false; r.continuous = false;
    r.onresult = (e) => {
      let said = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript;
      said = said.trim();
      if (said) setText((t) => (t.trim() ? `${t.trimEnd()} ${said}` : said));
    };
    r.onerror = (e) => setMicError(e.error === "not-allowed" ? "Microphone blocked — allow it for this site in Chrome." : `Didn't catch that (${e.error}).`);
    r.onend = () => { setListening(false); rec.current = null; };
    setMicError(null);
    try { r.start(); rec.current = r; setListening(true); } catch { setListening(false); }
  }

  async function saveNote() {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true); setNoteMsg(null);
    try {
      const r = await fetch(`/api/people/${contactId}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setText("");
      setNoteMsg("Note saved");
      onNoteSaved?.();
    } catch (e) {
      setNoteMsg(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function sendText() {
    const msg = text.trim();
    if (!msg || sending || !phone) return;
    setSending(true); setSendMsg(null);
    try {
      const r = await fetch("/api/texts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, body: msg, to: phone, line_id: fromLine?.value ?? undefined }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      const lineName = fromLine?.lines.find((l) => l.id === b.from_line)?.name;
      setText("");
      // A proposal link put in with "/" is marked sent by text, so its openings count from here.
      for (const id of linked.current) if (msg.includes("/p/")) void fetch(`/api/proposal-links/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sent: "text" }) }).catch(() => {});
      linked.current.clear();
      setSendMsg({ ok: true, text: `Sent to ${formatPhone(b.to)}${lineName ? ` from ${lineName}` : ""} — it shows here once Quo confirms.` });
      // Quo's webhook usually lands within seconds; reload twice to pick it up.
      if (onSent) { setTimeout(onSent, 4000); setTimeout(onSent, 15000); }
    } catch (e) {
      setSendMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

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
          {!only && ([["text", "Text"], ["email", "Email"], ["note", "Note"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setChannel(k)} aria-pressed={channel === k}
              className="rounded px-2.5"
              style={{ height: 26, background: channel === k ? T.ink : T.card,
                       color: channel === k ? T.card : T.ink2,
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

      {slashOpen && (
        <div role="listbox" aria-label="Put a proposal's link in" className="rounded-lg mb-1.5"
          style={{ border: `1px solid ${T.hair}`, background: T.card, boxShadow: "0 6px 20px rgba(0,0,0,.12)", maxHeight: 220, overflowY: "auto" }}>
          <div className="flex items-center px-2.5 py-1.5" style={{ ...eyebrow, fontSize: 9, color: T.ink3, borderBottom: `1px solid ${T.hairSoft}` }}>
            <span className="flex-1">Put a proposal&apos;s link in</span>
            <button type="button" onClick={() => setSlashOff(text)} aria-label="Close" style={{ border: 0, background: "transparent", color: T.ink3, cursor: "pointer", fontSize: 13 }}>×</button>
          </div>
          {finals === null ? <div className="px-2.5 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>Looking…</div>
            : slashList.length === 0 ? <div className="px-2.5 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>No final proposal on their jobs yet — open the proposal and Preview it to make one.</div>
            : slashList.map((x) => (
              <button key={x.job_id} type="button" role="option" aria-selected={false} disabled={slashBusy} onClick={() => void insertProposal(x)}
                className="w-full text-left px-2.5 py-1.5" style={{ border: 0, borderBottom: `1px solid ${T.hairSoft}`, background: "transparent", cursor: "pointer", display: "block" }}>
                <div style={{ fontSize: F.sm, color: T.ink, ...clip }}>{x.number} · {x.job_title ?? "Untitled job"}</div>
                <div style={{ fontSize: F.xs, color: T.ink3 }}>v{x.version}{x.total != null ? ` · $${Math.round(x.total).toLocaleString()}` : ""}{x.link ? ` · ${x.link.views}` : " · makes its link"}</div>
              </button>
            ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        {/* The line it goes from is picked once, in the thread's toolbar (Coy, 2026-10-05: "it exists already at the top"). */}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 1}
          // An empty box, no words in it (Coy, 2026-10-05: "I know what to do with message box").
          aria-label={channel === "note" ? "Internal note" : channel === "email" ? "Email" : "Text message"}
          className="flex-1 px-2.5 py-2 rounded-lg outline-none resize-none"
          style={{ border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm,
                   maxHeight: 120, lineHeight: 1.4, fontFamily: body, minWidth: 0 }} />

        {!compact && (
          <button onClick={dictate} disabled={!canDictate}
            aria-label={!canDictate ? "Dictation isn't available in this browser" : listening ? "Stop listening" : "Talk — the words land in the box"}
            aria-pressed={listening}
            title={!canDictate ? "This browser has no speech recognition" : listening ? "Listening — tap to stop" : "Tap and talk"}
            className={listening ? "sc-rec" : undefined}
            style={{ ...iconBtn, opacity: canDictate ? 1 : 0.45, cursor: canDictate ? "pointer" : "not-allowed",
                     background: listening ? T.red : T.card, borderColor: listening ? T.red : T.hair }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" style={{ color: listening ? T.card : T.ink2 }}>
              <rect x="5.4" y="1.6" width="4.2" height="7.6" rx="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 7.4a4.5 4.5 0 0 0 9 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7.5 11.9v1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {has && channel === "note" && (
          <button onClick={() => void saveNote()} disabled={saving} aria-label="Save note"
            style={{ ...iconBtn, background: T.ink, borderColor: T.ink, cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <path d="M7.5 12.4V2.8M3.4 6.9 7.5 2.6l4.1 4.3" fill="none" stroke="#fff"
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {has && channel === "text" && (
          <button onClick={() => void sendText()} disabled={sending || !phone}
            aria-label={phone ? `Send the text to ${formatPhone(phone)}` : "No number to text"}
            title={phone ? `Send through Quo to ${formatPhone(phone)}` : "They have no number to text"}
            style={{ ...iconBtn, background: T.hiviz, borderColor: T.hiviz, cursor: sending || !phone ? "default" : "pointer", opacity: sending || !phone ? 0.5 : 1 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" style={{ color: T.onHiviz }}>
              <path d="M7.5 12.4V2.8M3.4 6.9 7.5 2.6l4.1 4.3" fill="none" stroke="currentColor"
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {has && channel === "email" && (
          // Email Send: present where v34 puts it, and visibly off. Never a
          // button that looks like it worked.
          <button disabled aria-label="Send — not connected" title={NOT_CONNECTED[channel]}
            style={{ ...iconBtn, background: T.hairSoft, border: `1px dashed ${T.ink3}`, cursor: "not-allowed" }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <path d="M7.5 12.4V2.8M3.4 6.9 7.5 2.6l4.1 4.3" fill="none" stroke="currentColor" style={{ color: T.ink3 }}
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Copy, and what Send does (or why it can't). Only while there is something to say: the Proposal button and the
          idle "Drafts stay on this device" line are gone (Coy, 2026-10-09: he asks Dusty to send a proposal). */}
      {(has || micError || listening || sending || sendMsg || noteMsg) && (
      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 6 }}>
        {has && channel !== "note" && (
          <button onClick={() => void copy()} className="rounded px-2.5"
            style={{ height: 28, border: `1px solid ${T.hair}`, background: T.card, color: T.ink,
                     fontFamily: disp, fontSize: F.xs, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
            {copied === "ok" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy"}
          </button>
        )}
        <span style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.3, flex: "1 1 160px" }}>
          {micError ?? (listening ? "Listening…" : sending ? "Sending through Quo…"
            : sendMsg && (!has || !sendMsg.ok) && channel === "text" ? <span style={{ color: sendMsg.ok ? T.green : T.red }}>{sendMsg.text}</span>
            : noteMsg && !has ? noteMsg
            : has && channel === "text" ? `${NOT_CONNECTED.text}${phone ? ` To ${formatPhone(phone)}.` : ""} ${segments(text.trim())} ${segments(text.trim()) === 1 ? "segment" : "segments"}.`
            : has ? NOT_CONNECTED[channel]
            : channel === "note" ? "Notes stay internal. Dusty reads them." : channel === "text" ? "Drafts stay on this device until you send them." : "Drafts stay on this device until they can be sent.")}
        </span>
      </div>
      )}
    </div>
  );
}

