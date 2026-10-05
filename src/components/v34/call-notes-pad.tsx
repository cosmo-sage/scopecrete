"use client";
/**
 * Call notes (Coy, 2026-10-03: "make notes on a live call so that Dusty can
 * finish putting the quote together from aerial imagery afterwards").
 *
 * A big box that saves as Coy types — the first words make a note on the
 * person, every pause after that updates it, and a copy is kept on the device
 * until the server has it, so a dropped signal loses nothing. Quo sends the call
 * only after hang-up; the note then lands on the call it was written during
 * (src/lib/call-notes.ts) and the pad says so, with Draft the quote.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { T, F, disp, body } from "@/lib/v34/tokens";
import { Drawer } from "@/components/v34/primitives";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

const keyFor = (contactId: string) => `sc:callnote:${contactId}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * "Draft the quote" — finds the job the call is about (or, on Coy's yes, starts
 * one), opens it, and puts the question in Dusty's box for Coy to send.
 */
export function useDraftQuote() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (messageId: string) => {
    setBusy(true);
    try {
      let r = await call(`/api/messages/${messageId}/quote`, "POST", {});
      if (!r.job_id && r.needs_job) {
        if (!window.confirm(`${r.who} has no open job. Start one for this call?`)) return;
        r = await call(`/api/messages/${messageId}/quote`, "POST", { create: true });
      }
      if (!r.job_id) return;
      router.push(`/dashboard/scope/${r.job_id}`);
      setTimeout(() => {
        window.dispatchEvent(new Event("sc:dusty-open"));
        setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: r.question } })), 400);
      }, 900);
    } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [router]);
  return { run, busy };
}

export function DraftQuoteButton({ messageId, style }: { messageId: string; style?: React.CSSProperties }) {
  const { run, busy } = useDraftQuote();
  return (
    <button onClick={() => void run(messageId)} disabled={busy} title="Open the job and ask Dusty to draft the quote from this call"
      style={{ fontSize: 12.5, fontWeight: 600, color: T.hiviz, cursor: "pointer", opacity: busy ? 0.5 : 1, ...style }}>
      {busy ? "Opening the job…" : "Draft the quote ›"}
    </button>
  );
}

export function CallNotesPad({ contactId, who, open, onClose }: { contactId: string; who: string; open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [state, setState] = useState<string>("");
  const [onCall, setOnCall] = useState<{ id: string; occurred_at: string } | null>(null);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ text: "", noteId: null as string | null });
  const { run, busy } = useDraftQuote();
  const box = useRef<HTMLTextAreaElement>(null);
  // Ready to type, without scrolling the sheet's title away.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => box.current?.focus({ preventScroll: true }), 50);
    return () => clearTimeout(t);
  }, [open]);

  // A note this device didn't finish sending comes back when the pad opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        const kept = JSON.parse(localStorage.getItem(keyFor(contactId)) ?? "null") as { id: string | null; text: string } | null;
        if (kept?.text) { setText(kept.text); setNoteId(kept.id); latest.current = { text: kept.text, noteId: kept.id }; setState(kept.id ? "Picked up where you left off" : "Not saved yet — saving"); }
      } catch { /* no storage */ }
    }, 0);
    return () => clearTimeout(t);
  }, [open, contactId]);

  async function save() {
    if (saving.current) return;
    const { text: words, noteId: id } = latest.current;
    if (!words.trim()) return;
    saving.current = true; setState("Saving…");
    try {
      if (id) await call(`/api/notes/${id}`, "PATCH", { body: words });
      else {
        const b = await call(`/api/people/${contactId}/notes`, "POST", { body: words });
        latest.current.noteId = b.note.id; setNoteId(b.note.id);
      }
      setState(`Saved ${clock(new Date().toISOString())}`);
      try {
        if (latest.current.text === words) localStorage.removeItem(keyFor(contactId));
        else localStorage.setItem(keyFor(contactId), JSON.stringify(latest.current));
      } catch { /* no storage */ }
    } catch (e) { setState(`Not saved — ${e instanceof Error ? e.message : e}. It's kept on this phone; it saves when you type again.`); }
    finally {
      saving.current = false;
      if (latest.current.text !== words) { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 300); }
    }
  }

  const change = (v: string) => {
    setText(v);
    latest.current.text = v;
    try { localStorage.setItem(keyFor(contactId), JSON.stringify(latest.current)); } catch { /* no storage */ }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 900);
  };

  // Once saved: ask now and then whether the finished call has arrived and taken the note.
  useEffect(() => {
    if (!open || !noteId || onCall) return;
    let off = false;
    const look = async () => {
      try {
        const b = await call(`/api/notes/${noteId}`, "GET");
        if (!off && b.call) setOnCall({ id: b.call.id, occurred_at: b.call.occurred_at });
      } catch { /* try again next tick */ }
    };
    const first = setTimeout(() => void look(), 0);
    const iv = setInterval(() => void look(), 20_000);
    return () => { off = true; clearTimeout(first); clearInterval(iv); };
  }, [open, noteId, onCall]);

  const fresh = () => {
    setText(""); setNoteId(null); setOnCall(null); setState("");
    latest.current = { text: "", noteId: null };
    try { localStorage.removeItem(keyFor(contactId)); } catch { /* no storage */ }
  };
  const close = () => { if (timer.current) { clearTimeout(timer.current); void save(); } onClose(); };

  // Drawn at the page's top level: the person page is a pinned layer, and a sheet inside it
  // slid under the header (its title was hidden on a phone).
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <Drawer open={open} onClose={close} title="Call notes" sub={who}>
      <div className="p-3 flex flex-col gap-2" style={{ fontFamily: body }}>
        <textarea ref={box} value={text} onChange={(e) => change(e.target.value)} aria-label="Call notes"
          placeholder={"What they want, the address, sizes, access, when…\n\nSaves as you type."}
          style={{ height: "34dvh", minHeight: 160, width: "100%", padding: 12, fontSize: 17, lineHeight: 1.45, border: `1px solid ${T.hairStrong}`, borderRadius: 4, background: T.card, color: T.ink, resize: "vertical" }} />
        <div style={{ fontSize: F.xs, color: state.startsWith("Not saved") ? T.red : T.ink3 }}>{state || "Saves as you type."}</div>
        {noteId && (onCall ? (
          <div className="rounded p-2.5 flex items-center gap-2 flex-wrap" style={{ background: T.greenDim, color: T.ink }}>
            <span style={{ fontSize: F.sm, flex: 1 }}>On the {clock(onCall.occurred_at)} call — Dusty has the transcript, the summary and these notes.</span>
            <button onClick={() => void run(onCall.id)} disabled={busy}
              style={{ height: 34, padding: "0 12px", borderRadius: 3, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 13, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
              {busy ? "Opening…" : "Draft the quote"}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45 }}>
            Saved on {who}. Quo sends the call a minute or so after you hang up; these notes then land on it, and you can have Dusty draft the quote.
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={fresh} style={{ fontSize: F.xs, color: T.chalk, cursor: "pointer" }}>New note</button>
        </div>
      </div>
    </Drawer>,
    document.body,
  );
}
