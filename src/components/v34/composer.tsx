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
 *   - Send for email here. Email Send opens the email composer (migration
 *     100) with these words, where To, files and the two-tap Send live. The old composer on this screen appended the
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

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { T, F, disp, body, eyebrow, clip, formatPhone } from "@/lib/v34/tokens";
import { segments } from "@/lib/texting";
import { draftKey, proposalLink } from "@/lib/v34/send-proposal";
import { sendBytes } from "@/components/v34/files-panel";

type Channel = "text" | "email" | "note";

/** Why each channel cannot send from here yet. Shown, not hidden. */
const NOT_CONNECTED: Record<Channel, string> = {
  text: "Sends through Quo from your line.",
  email: "Send opens it in the email composer, with To, files and the two-tap Send.",
  note: "Saved to their page. Dusty reads your notes.",
};

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

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
  // Files picked with + (Coy, 2026-10-09: "add attachments like any other chat"). Each is saved on
  // their Files at once. Quo's API sends words only, so a text with files goes out through the
  // phone's share sheet (Coy picks Quo there); the words alone still go through Quo from here.
  const [attached, setAttached] = useState<Array<{ key: string; file: File; state: "up" | "ok" | "err"; err?: string }>>([]);
  const pick = useRef<HTMLInputElement | null>(null);
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
  // The box grows with what's in it, a typed message or a filled-in proposal text, up to
  // ten lines or 40% of the screen, then scrolls (Coy, 2026-10-13: "does not allow me to
  // view everything I've typed out").
  const box = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = Math.min(window.innerHeight * 0.4, 230);
    el.style.height = `${Math.min(el.scrollHeight + 2, cap)}px`;
    el.style.overflowY = el.scrollHeight + 2 > cap ? "auto" : "hidden";
  }, [text]);
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
  async function attach(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const add = files.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, state: "up" as const }));
    setAttached((a) => [...a, ...add]);
    for (const a of add) {
      const set = (patch: { state: "ok" | "err"; err?: string }) => setAttached((xs) => xs.map((x) => (x.key === a.key ? { ...x, ...patch } : x)));
      try {
        const made = await postJson("/api/files", { name: a.file.name, mime: a.file.type, size: a.file.size, contact_id: contactId });
        await sendBytes(made.upload.signed_url, a.file, () => {});
        await postJson(`/api/files/${made.file.id}/done`, undefined);
        set({ state: "ok" });
      } catch (e) {
        set({ state: "err", err: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  /** Files and words together, through the phone's share sheet — Quo's API can't send pictures. */
  async function shareOut() {
    const files = attached.map((a) => a.file);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const data: ShareData = { files, ...(text.trim() ? { text: text.trim() } : {}) };
    if (!nav.share || (nav.canShare && !nav.canShare(data))) {
      setSendMsg({ ok: false, text: "Quo can't send pictures from here, and this browser has no share sheet. They're saved on their Files; send them from the Quo app." });
      return;
    }
    try {
      await nav.share(data);
      setAttached([]); setText("");
      setSendMsg({ ok: true, text: "Handed to your phone's share sheet. It shows here once Quo has it." });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setSendMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

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
      {attached.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {attached.map((a) => (
            <span key={a.key} className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1"
              style={{ height: 26, maxWidth: 220, border: `1px solid ${a.state === "err" ? T.red : T.hair}`, background: T.card, fontSize: F.xs, color: a.state === "err" ? T.red : T.ink2 }}
              title={a.err ?? (a.state === "ok" ? "Saved on their Files" : "Saving…")}>
              <span style={clip}>{a.state === "up" ? "Saving… " : a.state === "err" ? "Didn't save · " : ""}{a.file.name}</span>
              <button type="button" onClick={() => setAttached((xs) => xs.filter((x) => x.key !== a.key))} aria-label={`Take ${a.file.name} off`}
                style={{ border: 0, background: "transparent", color: T.ink3, cursor: "pointer", fontSize: 14, width: 20 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        {/* The line it goes from is picked once, in the thread's toolbar (Coy, 2026-10-05: "it exists already at the top"). */}
        <div className="flex-1 relative" style={{ minWidth: 0 }}>
          <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 1}
            // An empty box, no words in it (Coy, 2026-10-05: "I know what to do with message box").
            aria-label={channel === "note" ? "Internal note" : channel === "email" ? "Email" : "Text message"}
            className="w-full py-2 rounded-lg outline-none resize-none block"
            style={{ border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, paddingLeft: compact ? 10 : 34, paddingRight: 10,
                     lineHeight: 1.4, fontFamily: body, minWidth: 0 }} />
          {!compact && (
            <>
              <button type="button" onClick={() => pick.current?.click()} aria-label="Attach photos or files"
                title="Attach photos or files — saved on their Files"
                style={{ position: "absolute", left: 4, bottom: 4, width: 26, height: 26, border: 0, borderRadius: 13,
                         background: T.hairSoft, color: T.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                  <path d="M6.5 1.8v9.4M1.8 6.5h9.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
              <input ref={pick} type="file" multiple hidden onChange={(e) => { void attach(e.target.files); e.target.value = ""; }} />
            </>
          )}
        </div>

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
        {channel === "text" && (() => {
          // Always there, far right (Coy, 2026-10-09: "I need a send button"); off until there is something to send.
          const files = attached.length > 0;
          const off = sending || !phone || (!has && !files) || attached.some((a) => a.state === "up");
          return (
          <button onClick={() => void (files ? shareOut() : sendText())} disabled={off}
            aria-label={files ? "Send with the files — opens your phone's share sheet" : phone ? `Send the text to ${formatPhone(phone)}` : "No number to text"}
            title={files ? "Quo sends words only from here — the share sheet hands the files to the Quo app" : phone ? `Send through Quo to ${formatPhone(phone)}` : "They have no number to text"}
            style={{ ...iconBtn, background: off ? T.card : T.hiviz, borderColor: off ? T.hair : T.hiviz, cursor: off ? "default" : "pointer", opacity: sending || !phone ? 0.5 : 1 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" style={{ color: off ? T.ink3 : T.onHiviz }}>
              <path d="M7.5 12.4V2.8M3.4 6.9 7.5 2.6l4.1 4.3" fill="none" stroke="currentColor"
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          );
        })()}
        {has && channel === "email" && (
          // Email goes through the email composer (migration 100): the words carry over, Send is two taps there.
          <a href={`/dashboard/messages/email/new?contact=${encodeURIComponent(contactId)}&body=${encodeURIComponent(text.trim().slice(0, 1500))}`}
            aria-label="Write this as an email" title="Open in the email composer"
            style={{ ...iconBtn, background: T.hiviz, borderColor: T.hiviz, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" style={{ color: T.onHiviz }}>
              <path d="M7.5 12.4V2.8M3.4 6.9 7.5 2.6l4.1 4.3" fill="none" stroke="currentColor"
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>

      {/* Copy, and what Send does (or why it can't). Only while there is something to say: the Proposal button and the
          idle "Drafts stay on this device" line are gone (Coy, 2026-10-09: he asks Dusty to send a proposal). */}
      {(has || attached.length > 0 || micError || listening || sending || sendMsg || noteMsg) && (
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
            : attached.length > 0 && channel === "text" ? "Saved on their Files. Send opens your phone's share sheet — pick Quo; its API sends words only."
            : attached.length > 0 ? "Saved on their Files."
            : has && channel === "text" ? `${NOT_CONNECTED.text}${phone ? ` To ${formatPhone(phone)}.` : ""} ${segments(text.trim())} ${segments(text.trim()) === 1 ? "segment" : "segments"}.`
            : has ? NOT_CONNECTED[channel]
            : channel === "note" ? "Notes stay internal. Dusty reads them." : channel === "text" ? "Drafts stay on this device until you send them." : "Drafts stay on this device until they can be sent.")}
        </span>
      </div>
      )}
    </div>
  );
}

