"use client";

/**
 * A call on the customer timeline, in this order:
 *   header (Call · In/Out · duration · who · time)
 *   Dusty's summary (FIRST) → next steps
 *   Recording row — play/pause, progress, clock
 *   Transcript row — one line, expands to the full transcript
 *   Notes row — this call's notes, or "+ Add a note to this call"
 * Nothing on the card places a call; calling is the phone button on the contact.
 */

import React, { useEffect, useRef, useState } from "react";
import type { CallItem } from "./types";

const lbl: React.CSSProperties = { fontFamily: "var(--sc-font-label, 'Barlow Condensed')", fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase" };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function CallCard({ call, who, onAddNote }: { call: CallItem; who: string; onAddNote: (callId: string, body: string) => Promise<void> }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [txOpen, setTxOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const a = audio.current; if (!a) return;
    const t = () => setPos(a.currentTime), e = () => setPlaying(false);
    a.addEventListener("timeupdate", t); a.addEventListener("ended", e);
    return () => { a.removeEventListener("timeupdate", t); a.removeEventListener("ended", e); };
  }, []);

  const toggle = () => { const a = audio.current; if (!a) return; if (playing) a.pause(); else void a.play(); setPlaying(!playing); };
  const head = `Call · ${call.direction === "out" ? "Out" : "In"} · ${call.voicemail ? "Voicemail · " : ""}${fmt(call.duration_s)}`;
  const row: React.CSSProperties = { minHeight: 36, display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--sc-hair-soft)" };

  return (
    <article style={{ maxWidth: 600, background: "var(--sc-card)", border: "1px solid var(--sc-hair)", borderRadius: 5, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={lbl}>{head}</span>
        <span style={{ fontFamily: "var(--sc-font-strong, 'Lexend')", fontSize: 12, fontWeight: 600 }}>{call.direction === "out" ? `to ${who}` : who}</span>
        <span style={{ flex: 1 }} />
        <time style={{ ...lbl, fontWeight: 400, letterSpacing: ".06em", color: "var(--sc-ink3)" }}>{new Date(call.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>
      </header>

      {call.summary && (
        <div>
          <div style={{ ...lbl, fontSize: 11, color: "var(--sc-hiviz-text)" }}>Summary · Dusty</div>
          <p style={{ margin: "3px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>{call.summary}</p>
        </div>
      )}
      {call.next_steps.length > 0 && (
        <div style={{ background: "var(--sc-dusty-tint)", borderRadius: 3, padding: "7px 11px" }}>
          <div style={{ ...lbl, fontSize: 11, color: "var(--sc-dusty-text)" }}>Next steps</div>
          {call.next_steps.map((s) => <div key={s} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}><span style={{ width: 13, height: 13, borderRadius: 2, border: "1.5px solid var(--sc-dusty-edge)" }} />{s}</div>)}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--sc-hair-soft)" }}>
        <div style={row}>
          {call.recording_url && <audio ref={audio} src={call.recording_url} preload="none" />}
          <button onClick={toggle} disabled={!call.recording_url} aria-label={playing ? "Pause recording" : "Play recording"}
            style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: "var(--sc-ink)", color: "var(--sc-slab)", cursor: "pointer", opacity: call.recording_url ? 1 : 0.35 }}>
            {playing ? "❚❚" : "▶"}
          </button>
          <span style={{ ...lbl, width: 70 }}>Recording</span>
          <span style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--sc-hair-soft)", position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", inset: "0 auto 0 0", width: `${(pos / Math.max(1, call.duration_s)) * 100}%`, background: "var(--sc-hiviz-soft)" }} />
          </span>
          <span style={{ ...lbl, fontWeight: 400, letterSpacing: ".06em", color: "var(--sc-ink3)", fontVariantNumeric: "tabular-nums" }}>{call.recording_url ? `${fmt(pos)} / ${fmt(call.duration_s)}` : "No recording"}</span>
        </div>

        <button onClick={() => setTxOpen((o) => !o)} aria-expanded={txOpen} disabled={!call.transcript}
          style={{ ...row, width: "100%", border: "none", borderBottom: "1px solid var(--sc-hair-soft)", background: "transparent", cursor: "pointer", textAlign: "left", color: "var(--sc-ink)" }}>
          <span style={{ width: 26, textAlign: "center", transform: txOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
          <span style={lbl}>Transcript</span>
          <span style={{ fontSize: 12, color: "var(--sc-ink3)" }}>{!call.transcript ? "Not transcribed" : txOpen ? "Hide" : `${call.transcript.length} lines · tap to read`}</span>
        </button>
        {txOpen && call.transcript && (
          <div style={{ padding: "8px 0 10px 36px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--sc-hair-soft)" }}>
            {call.transcript.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, lineHeight: 1.45 }}>
                <span style={{ width: 44, fontSize: 11, color: "var(--sc-ink3)" }}>{fmt(l.t)}</span>
                <span style={{ width: 52, fontWeight: 600, color: l.speaker === "you" ? "var(--sc-hiviz-text)" : "var(--sc-chalk)" }}>{l.speaker === "you" ? "You" : who.split(" ")[0]}</span>
                <span style={{ flex: 1 }}>{l.text}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ ...row, borderBottom: "none", alignItems: "flex-start", paddingTop: 8 }}>
          <span style={{ width: 26 }} />
          <span style={lbl}>Notes</span>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {call.notes.map((n) => <span key={n.id} style={{ fontSize: 13 }}>{n.body}</span>)}
            {adding ? (
              <form onSubmit={async (e) => { e.preventDefault(); if (!draft.trim()) return; await onAddNote(call.id, draft.trim()); setDraft(""); setAdding(false); }} style={{ display: "flex", gap: 6 }}>
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Note on this call" style={{ flex: 1, height: 28, padding: "0 8px", border: "1px solid var(--sc-hair-strong)", borderRadius: 3, background: "var(--sc-slab)", color: "var(--sc-ink)" }} />
                <button type="submit" style={{ ...lbl, height: 28, padding: "0 10px", border: "none", borderRadius: 3, background: "var(--sc-hiviz)", color: "var(--sc-on-hiviz)" }}>Save</button>
              </form>
            ) : (
              <button onClick={() => setAdding(true)} style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, fontSize: 13, color: "var(--sc-chalk)", cursor: "pointer" }}>+ Add a note to this call</button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
