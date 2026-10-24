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
import { AddressField, type FileLite } from "@/components/v34/email-client";
import { slashBlocks, withoutSlash, type SlashKey } from "@/lib/v34/slash-blocks";
import { setDustyUse } from "@/lib/v34/dusty-live";
import { USE_ASK } from "@/lib/dusty/use-block";
import { atEmail } from "@/lib/email-mention";

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

/** An email written in the box with @email: its To, Cc and subject (the words are the body). */
interface MailBlock { to: string[]; cc: string[]; subject: string; showCc: boolean }

function readDraft(contactId: string): { channel: Channel; text: string; mail: MailBlock | null } {
  try {
    const raw = window.localStorage.getItem(draftKey(contactId));
    if (!raw) return { channel: "text", text: "", mail: null };
    const v = JSON.parse(raw) as { channel?: Channel; text?: string; mail?: MailBlock | null };
    const m = v.mail && Array.isArray(v.mail.to) ? { to: v.mail.to, cc: Array.isArray(v.mail.cc) ? v.mail.cc : [], subject: String(v.mail.subject ?? ""), showCc: !!v.mail.showCc } : null;
    return { channel: v.channel ?? "text", text: typeof v.text === "string" ? v.text : "", mail: m };
  } catch {
    return { channel: "text", text: "", mail: null };
  }
}

function writeDraft(contactId: string, channel: Channel, text: string, mail: MailBlock | null = null) {
  try {
    if (text.trim() || mail) window.localStorage.setItem(draftKey(contactId), JSON.stringify({ channel, text, mail }));
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

/** What the one email drafter opens with, from "/" → Email draft, a picked file, or @email. */
export interface EmailSeed { to?: string | null; body?: string; subject?: string; files?: FileLite[] }

interface SlashProposal {
  job_id: string; job_title: string | null; number: string; version: number; status: "draft" | "final"; total: number | null;
  link: { id: string; url: string; token: string; views: string } | null;
}

export function Composer({ contactId, phone, name, compact = false, onNoteSaved, onSent, only, fromLine, onEmail, onNote }: {
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
  /**
   * The page's one email drafter (Coy, 2026-10-24: "consolidate into one outcome"). Given, "/" → Email
   * draft and @email open it with the words typed; without it @email is the inline draft as before.
   */
  onEmail?: (seed: EmailSeed) => void;
  /** "/" → Internal note when the page keeps notes apart (the thread's Notes); else the box turns to a note. */
  onNote?: () => void;
}) {
  // Lazy init reads the saved draft once, on mount. No effect needed, so no
  // setState inside one.
  const [chosen, setChannel] = useState<Channel>(() =>
    typeof window === "undefined" ? "text" : readDraft(contactId).channel);
  const channel: Channel = only ?? chosen;
  const [text, setText] = useState(() =>
    typeof window === "undefined" ? "" : readDraft(contactId).text);
  // @email (Coy, 2026-10-20): the box becomes an email draft — To / Cc / Subject over the words, sent from the
  // org's inbox on two taps through /api/emails/send, like the email composer.
  const [mail, setMail] = useState<MailBlock | null>(() => (typeof window === "undefined" ? null : readDraft(contactId).mail));
  const [mailInfo, setMailInfo] = useState<{ can_send: boolean; signature: string; customer_id: string | null } | null>(null);
  const [mailConfirm, setMailConfirm] = useState(false);
  const [mailBusy, setMailBusy] = useState<"send" | "draft" | null>(null);
  const [mailMsg, setMailMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
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
  // "/" lists blocks first (Claude Design "Contact Thread"); Proposal and the files open their own list.
  const [slashView, setSlashView] = useState<"blocks" | "proposal" | "files">("blocks");
  const [slashSel, setSlashSel] = useState(0);
  const [theirFiles, setTheirFiles] = useState<Array<FileLite & { kind?: string | null }> | null>(null);
  const [filesKind, setFilesKind] = useState<"document" | "file">("file");
  const blocks = slashBlocks(slash?.[1] ?? "");
  // Closing the menu sends it back to the blocks list (set while rendering, not in an effect).
  const [slashWas, setSlashWas] = useState(slashOpen);
  if (slashWas !== slashOpen) { setSlashWas(slashOpen); if (!slashOpen) { setSlashView("blocks"); setSlashSel(0); } }
  useEffect(() => {
    if (slashView !== "files" || theirFiles) return;
    let off = false;
    fetch(`/api/files/search?contact=${contactId}`).then((r) => r.json()).then((b) => {
      if (!off) setTheirFiles(((b.files ?? []) as Array<FileLite & { kind?: string | null }>).slice(0, 60));
    }).catch(() => { if (!off) setTheirFiles([]); });
    return () => { off = true; };
  }, [slashView, theirFiles, contactId]);
  const shownFiles = (theirFiles ?? []).filter((f) => filesKind === "file" || f.kind !== "image");
  function openEmail(seed: EmailSeed) {
    const words = withoutSlash(text);
    if (onEmail) { setText(""); onEmail({ body: words || undefined, ...seed }); return; }
    setText(words);
    setMail((m) => m ?? { to: [], cc: [], subject: seed.subject ?? "", showCc: false });
  }
  function askDustyDraft() {
    const words = withoutSlash(text);
    setText(words);
    setDustyUse({ label: "in the text box", apply: (t) => { const v = t.trim(); if (!v) return false; setText(v); return true; } });
    const q = `Write my next text to ${name ?? "them"} from this thread — what they last said and what we owe them. Short, in my voice.`
      + (words ? ` Start from what I have so far: "${words}".` : "") + ` Give me only the text.\n\n${USE_ASK}`;
    window.dispatchEvent(new Event("sc:dusty-open"));
    setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: q, send: true } })), 250);
  }
  function pickBlock(k: SlashKey) {
    if (k === "email") openEmail({});
    else if (k === "proposal") setSlashView("proposal");
    else if (k === "document" || k === "file") { setFilesKind(k); setSlashView("files"); }
    else if (k === "note") { setText(withoutSlash(text)); if (onNote) onNote(); else setChannel("note"); }
    else if (k === "dusty") askDustyDraft();
  }
  function slashKey(e: React.KeyboardEvent): boolean {
    if (!slashOpen) return false;
    if (e.key === "Escape") { e.preventDefault(); if (slashView !== "blocks") setSlashView("blocks"); else setSlashOff(text); return true; }
    if (slashView !== "blocks" || !blocks.length) return false;
    const live = blocks.map((b, i) => (b.soon ? -1 : i)).filter((i) => i >= 0);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = live.indexOf(slashSel);
      const next = e.key === "ArrowDown" ? live[(at + 1) % live.length] : live[(at - 1 + live.length) % live.length];
      setSlashSel(next ?? 0); return true;
    }
    if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
      const b = blocks[slashSel] ?? blocks.find((x) => !x.soon);
      if (b && !b.soon) { e.preventDefault(); pickBlock(b.key); return true; }
    }
    return false;
  }
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

  useEffect(() => { writeDraft(contactId, channel, text, mail); }, [contactId, channel, text, mail]);
  // What a new email to them starts from: their address in To, whether sending is on, the signature.
  useEffect(() => {
    if (!mail || mailInfo) return;
    let off = false;
    fetch(`/api/emails/compose?contact=${encodeURIComponent(contactId)}`).then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (off) return;
        if (!ok) { setMailInfo({ can_send: false, signature: "", customer_id: null }); setMailMsg({ ok: false, text: b?.error ?? "Email isn't set up here." }); return; }
        setMailInfo({ can_send: !!b.can_send, signature: b.signature ?? "", customer_id: b.filing?.customer_id ?? null });
        const first = (b.to as string[] | undefined)?.[0];
        if (first) setMail((m) => (m && !m.to.length ? { ...m, to: [first] } : m));
      }).catch(() => { if (!off) setMailInfo({ can_send: false, signature: "", customer_id: null }); });
    return () => { off = true; };
  }, [mail, mailInfo, contactId]);
  function onType(v: string) {
    const rest = channel !== "note" ? atEmail(v) : null;
    if (rest === null) { setText(v); setSlashSel(0); return; }
    if (onEmail) { setText(""); onEmail({ body: rest.trim() || undefined }); return; }
    setText(rest);
    setMail((m) => m ?? { to: [], cc: [], subject: "", showCc: false });
    setMailConfirm(false); setMailMsg(null);
  }
  function closeMail() { setMail(null); setMailConfirm(false); setMailMsg(null); }
  async function sendMail() {
    if (!mail || mailBusy) return;
    setMailBusy("send"); setMailMsg(null);
    try {
      const b = await postJson("/api/emails/send", {
        to: mail.to, cc: mail.cc, subject: mail.subject, body: text.trim(),
        contact_id: contactId, customer_id: mailInfo?.customer_id ?? undefined,
      });
      setText(""); setMail(null); setMailConfirm(false);
      setMailMsg({ ok: true, text: b.recorded === false ? b.error : `Emailed ${mail.to.join(", ")}. It's in their Email channel.`,
        href: b.conversation ? `/dashboard/messages/email/${encodeURIComponent(b.conversation)}` : undefined });
      onSent?.();
    } catch (e) {
      setMailMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setMailBusy(null); }
  }
  async function saveMailDraft() {
    if (!mail || mailBusy) return;
    setMailBusy("draft"); setMailMsg(null);
    try {
      const b = await postJson("/api/emails/drafts", {
        mode: "new", to: mail.to, cc: mail.cc, subject: mail.subject, body: text.trim(),
        contact_id: contactId, customer_id: mailInfo?.customer_id ?? undefined,
      });
      setText(""); setMail(null); setMailConfirm(false);
      setMailMsg({ ok: true, text: "Saved in your email drafts.", href: `/dashboard/messages/email/new?draft=${b.draft.id}` });
    } catch (e) {
      setMailMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setMailBusy(null); }
  }
  // The box grows with what's in it, a typed message or a filled-in proposal text, up to
  // about eight lines or 40% of the screen, then scrolls (Coy, 2026-10-13: "does not allow me to
  // view everything I've typed out").
  const box = useRef<HTMLTextAreaElement | null>(null);
  const send = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = Math.min(window.innerHeight * 0.4, 200);
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

  const roundBtn: React.CSSProperties = {
    width: 30, height: 30, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, borderRadius: 15,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer",
  };
  const sendLook = (off: boolean): React.CSSProperties => ({
    border: 0, background: off ? T.hair : T.hiviz, color: off ? T.ink3 : T.onHiviz, cursor: off ? "default" : "pointer",
  });
  const arrow = (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13.5V3M3.5 7.2 8 2.7l4.5 4.5" />
    </svg>
  );

  return (
    <div style={{ background: compact ? T.card : "transparent", borderTop: compact ? "none" : `1px solid ${T.hair}` }}
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
        <div role="listbox" aria-label="Insert a block" className="rounded-lg mb-1.5"
          style={{ border: `1px solid ${T.hair}`, background: T.card, boxShadow: "0 6px 20px rgba(0,0,0,.12)", maxHeight: 300, overflowY: "auto" }}>
          <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ ...eyebrow, fontSize: 9, color: T.ink3, borderBottom: `1px solid ${T.hairSoft}` }}>
            {slashView !== "blocks" && <button type="button" onClick={() => setSlashView("blocks")} aria-label="Back to the blocks"
              style={{ border: 0, background: "transparent", color: T.ink2, cursor: "pointer", fontSize: 13 }}>‹</button>}
            <span className="flex-1">{slashView === "proposal" ? "Put a proposal's link in" : slashView === "files" ? (filesKind === "document" ? "A document — attached to an email" : "A photo or file — attached to an email") : "Insert a block"}</span>
            {slashView === "blocks" && <span className="hidden md:inline" style={{ textTransform: "none", letterSpacing: 0 }}>↑↓ move · Enter picks · Esc closes</span>}
            <button type="button" onClick={() => setSlashOff(text)} aria-label="Close" style={{ border: 0, background: "transparent", color: T.ink3, cursor: "pointer", fontSize: 13 }}>×</button>
          </div>
          {slashView === "blocks" ? (
            blocks.length === 0 ? <div className="px-2.5 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>No block by that name — keep typing, or Esc.</div>
            : blocks.map((b, i) => (
              <button key={b.key} type="button" role="option" aria-selected={i === slashSel} disabled={b.soon}
                onMouseEnter={() => !b.soon && setSlashSel(i)} onClick={() => pickBlock(b.key)}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2"
                style={{ border: 0, borderBottom: `1px solid ${T.hairSoft}`, background: i === slashSel && !b.soon ? T.hivizDim : "transparent", cursor: b.soon ? "default" : "pointer", opacity: b.soon ? 0.5 : 1 }}>
                <span className="min-w-0 flex-1">
                  <span style={{ display: "block", fontSize: F.sm, color: T.ink, fontWeight: 600 }}>{b.label}</span>
                  <span style={{ display: "block", fontSize: F.xs, color: T.ink3, ...clip }}>{b.hint}</span>
                </span>
                {b.more && <span aria-hidden="true" style={{ color: T.ink3 }}>›</span>}
              </button>
            ))
          ) : slashView === "files" ? (
            theirFiles === null ? <div className="px-2.5 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>Looking…</div>
            : shownFiles.length === 0 ? <div className="px-2.5 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>Nothing on their Files yet.</div>
            : shownFiles.map((f) => (
              <button key={f.id} type="button" role="option" aria-selected={false} onClick={() => openEmail({ files: [f] })}
                className="w-full text-left px-2.5 py-1.5" style={{ border: 0, borderBottom: `1px solid ${T.hairSoft}`, background: "transparent", cursor: "pointer", display: "block" }}>
                <div style={{ fontSize: F.sm, color: T.ink, ...clip }}>{f.name}</div>
              </button>
            ))
          ) : (
            finals === null ? <div className="px-2.5 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>Looking…</div>
            : slashList.length === 0 ? <div className="px-2.5 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>No final proposal on their jobs yet — open the proposal and Preview it to make one.</div>
            : slashList.map((x) => (
              <button key={x.job_id} type="button" role="option" aria-selected={false} disabled={slashBusy} onClick={() => void insertProposal(x)}
                className="w-full text-left px-2.5 py-1.5" style={{ border: 0, borderBottom: `1px solid ${T.hairSoft}`, background: "transparent", cursor: "pointer", display: "block" }}>
                <div style={{ fontSize: F.sm, color: T.ink, ...clip }}>{x.number} · {x.job_title ?? "Untitled job"}</div>
                <div style={{ fontSize: F.xs, color: T.ink3 }}>v{x.version}{x.total != null ? ` · $${Math.round(x.total).toLocaleString()}` : ""}{x.link ? ` · ${x.link.views}` : " · makes its link"}</div>
              </button>
            ))
          )}
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
      {/* The box, laid out like Dusty's (Coy, 2026-10-13: "more like the design of the dusty text box"): the words in a
          card with no border of their own, then + on the left and the mic and a round send on the right. Enter is a new
          line; Ctrl (⌘) + Enter sends, as the round arrow does. The line it goes from is picked in the thread's toolbar. */}
      <div style={{ padding: compact ? "8px 8px 6px" : "10px 10px 8px", background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 8 }}>
        {mail && (
          <div style={{ marginBottom: 8 }}>
            <div className="flex items-center gap-2" style={{ paddingBottom: 4, borderBottom: `1px solid ${T.hairSoft}` }}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: T.ink2 }}>
                <rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="m2 4 6 5 6-5" />
              </svg>
              <span style={{ ...eyebrow, fontSize: 10, color: T.ink2 }}>Email draft</span>
              <span className="flex-1" />
              {!mail.showCc && <button type="button" onClick={() => setMail({ ...mail, showCc: true })}
                style={{ border: 0, background: "transparent", color: T.ink3, fontSize: 11.5, cursor: "pointer" }}>Cc</button>}
              <button type="button" onClick={closeMail} aria-label="Back to a text — keeps the words" title="Back to a text — keeps the words"
                style={{ border: 0, background: "transparent", color: T.ink3, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
            <AddressField label="To" list={mail.to} onChange={(l) => { setMail({ ...mail, to: l }); setMailConfirm(false); }} />
            {mail.showCc && <AddressField label="Cc" list={mail.cc} onChange={(l) => { setMail({ ...mail, cc: l }); setMailConfirm(false); }} />}
            <input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} aria-label="Subject" placeholder="Subject"
              style={{ width: "100%", height: 32, border: "none", borderBottom: `1px solid ${T.hairSoft}`, outline: "none", background: "transparent", color: T.ink, fontSize: F.sm, fontWeight: 600 }} />
          </div>
        )}
        <div className="flex items-start gap-2">
          <textarea ref={box} value={text} onChange={(e) => onType(e.target.value)} rows={2}
            // An empty box, no words in it (Coy, 2026-10-05: "I know what to do with message box").
            aria-label={mail ? "Email body" : channel === "note" ? "Internal note" : channel === "email" ? "Email" : "Text message"}
            onKeyDown={(e) => {
              if (slashKey(e)) return;
              if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
              e.preventDefault();
              send.current?.click();
            }}
            className="flex-1 outline-none resize-none block"
            style={{ border: "none", background: "transparent", color: T.ink, fontSize: F.sm, padding: 0, minHeight: 40,
                     lineHeight: 1.4, fontFamily: body, minWidth: 0 }} />
          {!compact && channel !== "note" && (
            <span className="shrink-0 hidden lg:inline" style={{ fontSize: 10.5, color: T.ink3, paddingTop: 3 }}>Ctrl + Enter to send</span>
          )}
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
          {!compact && (
            <>
              <button type="button" onClick={() => pick.current?.click()} aria-label="Attach photos or files"
                title="Attach photos or files — saved on their Files" style={{ ...roundBtn, fontSize: 18 }}>+</button>
              <input ref={pick} type="file" multiple hidden onChange={(e) => { void attach(e.target.files); e.target.value = ""; }} />
            </>
          )}
          {/* No "From <line> ▾" under the box (Coy, 2026-10-24: "remove the 'from quo Batonrougeconcreters'
              label in the footer of every thread"); the line is picked in the thread's ⋯. */}
          <span className="flex-1" />

          {!compact && (
            <button type="button" onClick={dictate} disabled={!canDictate}
              aria-label={!canDictate ? "Dictation isn't available in this browser" : listening ? "Stop listening" : "Talk — the words land in the box"}
              aria-pressed={listening}
              title={!canDictate ? "This browser has no speech recognition" : listening ? "Listening — tap to stop" : "Tap and talk"}
              className={listening ? "sc-rec" : undefined}
              style={{ ...roundBtn, opacity: canDictate ? 1 : 0.45, cursor: canDictate ? "pointer" : "not-allowed",
                       background: listening ? T.red : T.card, borderColor: listening ? T.red : T.hair, color: listening ? T.card : T.ink2 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" stroke="none" />
                <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2.2" />
              </svg>
            </button>
          )}

          {mail && (
            <button type="button" onClick={() => void saveMailDraft()} disabled={!!mailBusy || (!has && !mail.to.length && !mail.subject.trim())}
              style={{ height: 30, padding: "0 10px", borderRadius: 15, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, fontSize: F.xs, cursor: "pointer" }}>
              {mailBusy === "draft" ? "Saving…" : "Save draft"}
            </button>
          )}
          {mail && (() => {
            const off = !!mailBusy || !has || !mail.to.length || !mailInfo?.can_send;
            return (
              <button ref={send} type="button" onClick={() => setMailConfirm(true)} disabled={off}
                aria-label={mail.to.length ? `Send the email to ${mail.to.join(", ")}` : "Add someone in To"}
                title={!mailInfo?.can_send ? "Sending email is off here — Save draft keeps it" : !mail.to.length ? "Add someone in To" : "Send the email"}
                style={{ ...roundBtn, ...sendLook(off) }}>{mailBusy === "send" ? "…" : arrow}</button>
            );
          })()}
          {!mail && channel === "note" && (() => {
            const off = !has || saving;
            return (
              <button ref={send} type="button" onClick={() => void saveNote()} disabled={off} aria-label="Save note" title="Save note"
                style={{ ...roundBtn, ...sendLook(off) }}>{arrow}</button>
            );
          })()}
          {!mail && channel === "text" && (() => {
            // Always there, far right (Coy, 2026-10-09: "I need a send button"); off until there is something to send.
            const files = attached.length > 0;
            const off = sending || !phone || (!has && !files) || attached.some((a) => a.state === "up");
            return (
              <button ref={send} type="button" onClick={() => void (files ? shareOut() : sendText())} disabled={off}
                aria-label={files ? "Send with the files — opens your phone's share sheet" : phone ? `Send the text to ${formatPhone(phone)}` : "No number to text"}
                title={files ? "Quo sends words only from here — the share sheet hands the files to the Quo app" : phone ? `Send through Quo to ${formatPhone(phone)}` : "They have no number to text"}
                style={{ ...roundBtn, ...sendLook(off) }}>{sending ? "…" : arrow}</button>
            );
          })()}
          {!mail && channel === "email" && (
            // Email goes through the email composer (migration 100): the words carry over, Send is two taps there.
            has ? (
              <a href={`/dashboard/messages/email/new?contact=${encodeURIComponent(contactId)}&body=${encodeURIComponent(text.trim().slice(0, 1500))}`}
                ref={send as unknown as React.Ref<HTMLAnchorElement>}
                aria-label="Write this as an email" title="Open in the email composer" style={{ ...roundBtn, ...sendLook(false) }}>{arrow}</a>
            ) : <span aria-hidden="true" style={{ ...roundBtn, ...sendLook(true) }}>{arrow}</span>
          )}
        </div>
      </div>

      {mail && mailConfirm && (
        <div className="flex items-center gap-2 flex-wrap rounded-md" style={{ marginTop: 6, padding: "6px 8px", background: T.hairSoft }}>
          <span style={{ fontSize: F.xs, color: T.ink, flex: "1 1 180px" }}>
            Send to {mail.to.join(", ")}{mail.cc.length ? `, cc ${mail.cc.join(", ")}` : ""}?{mailInfo?.signature ? " Your signature goes under it." : ""}
          </span>
          <button type="button" onClick={() => void sendMail()} disabled={!!mailBusy}
            style={{ height: 28, padding: "0 12px", borderRadius: 4, border: 0, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", cursor: "pointer" }}>
            {mailBusy === "send" ? "Sending…" : "Yes, send it"}
          </button>
          <button type="button" onClick={() => setMailConfirm(false)}
            style={{ height: 28, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, fontSize: F.xs, cursor: "pointer" }}>Not yet</button>
        </div>
      )}
      {(mail || mailMsg) && !mailConfirm && (
        <div style={{ marginTop: 6, fontSize: F.xs, lineHeight: 1.3, color: mailMsg ? (mailMsg.ok ? T.green : T.red) : T.ink3 }}>
          {mailMsg ? <>{mailMsg.text}{mailMsg.href && <> <a href={mailMsg.href} style={{ color: T.chalk, textDecoration: "underline" }}>Open it ›</a></>}</>
            : mailInfo && !mailInfo.can_send ? "Sending email is off here — Save draft keeps it for later."
            : "Goes from your intake inbox. The words in the box are the email. × goes back to a text."}
        </div>
      )}
      {/* Copy, and what Send does (or why it can't). Only while there is something to say: the Proposal button and the
          idle "Drafts stay on this device" line are gone (Coy, 2026-10-09: he asks Dusty to send a proposal). */}
      {!mail && (has || attached.length > 0 || micError || listening || sending || sendMsg || noteMsg) && (
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

