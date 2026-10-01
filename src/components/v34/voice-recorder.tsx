"use client";

/**
 * A voice message to Dusty, Telegram / Discord style (Coy, 2026-10-01: "so I
 * can tell that it's receiving my audio message"): it starts recording at
 * once and shows that it hears you — a pulsing red dot, the running time and
 * a live level meter drawn from the microphone. × throws it away; ➤ sends it
 * to /api/dusty/transcribe (Groq Whisper) and the words go to Dusty.
 *
 * Three minutes at most. Nothing is kept: the audio goes to Groq once and the
 * words come back. Reduced motion stills the pulse.
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F, nums } from "@/lib/v34/tokens";

const MAX_MS = 3 * 60_000;
const BARS = 36;

export function VoiceRecorder({ onSend, onCancel }: { onSend: (b: Blob) => void; onCancel: () => void }) {
  const [ms, setMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.04));
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const sending = useRef(false);
  const cb = useRef({ onSend, onCancel });
  useEffect(() => { cb.current = { onSend, onCancel }; }, [onSend, onCancel]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let tick: ReturnType<typeof setInterval> | null = null;
    let gone = false;
    (async () => {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) { setErr("This browser can't record audio."); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { setErr("Microphone blocked — allow it for this site."); return; }
      if (gone) { stream.getTracks().forEach((t) => t.stop()); return; }
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop());
        if (sending.current && chunks.length) cb.current.onSend(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
      };
      rec.current = r;
      r.start(250);
      // The level meter: what the microphone hears, ten times a second.
      try {
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const t0 = Date.now();
        tick = setInterval(() => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 4);
          setLevels((a) => [...a.slice(1), Math.max(0.04, lvl)]);
          const el = Date.now() - t0;
          setMs(el);
          if (el >= MAX_MS && r.state === "recording") { sending.current = true; r.stop(); }
        }, 100);
      } catch { /* no meter — it still records */ }
    })();
    return () => {
      gone = true;
      if (tick) clearInterval(tick);
      void ctx?.close().catch(() => {});
      if (rec.current?.state === "recording") rec.current.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = (send: boolean) => {
    sending.current = send;
    if (rec.current?.state === "recording") rec.current.stop();
    if (!send) cb.current.onCancel();
  };
  const s = Math.floor(ms / 1000);

  if (err) {
    return (
      <div className="flex-1 flex items-center gap-2" style={{ minHeight: 38, fontSize: F.sm, color: T.red }}>
        <span style={{ flex: 1 }}>{err}</span>
        <button type="button" onClick={onCancel} style={{ color: T.ink2, cursor: "pointer" }}>OK</button>
      </div>
    );
  }
  return (
    <div className="flex-1 flex items-center gap-2" role="status" aria-label={`Recording, ${s} seconds`} style={{ minHeight: 38, minWidth: 0 }}>
      <button type="button" onClick={() => stop(false)} aria-label="Throw this recording away" title="Cancel"
        className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 38, height: 38, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, cursor: "pointer" }}>
        <svg width="12" height="12" viewBox="0 0 13 13" aria-hidden="true"><path d="M1 1 L12 12 M12 1 L1 12" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      <span className="sc-rec-dot shrink-0" aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: T.red }} />
      <span className="shrink-0" style={{ ...nums, fontSize: F.sm, color: T.ink, width: 38 }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>
      <div className="flex-1 flex items-center gap-[2px] overflow-hidden" aria-hidden="true" style={{ height: 30, minWidth: 0 }}>
        {levels.map((l, i) => (
          <span key={i} style={{ flex: "1 1 0", minWidth: 2, maxWidth: 4, height: `${Math.round(l * 100)}%`, background: T.hiviz, borderRadius: 2, opacity: 0.45 + l * 0.55 }} />
        ))}
      </div>
      <button type="button" onClick={() => stop(true)} disabled={ms < 400} aria-label="Send the voice message" title="Send"
        className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 38, height: 38, background: T.hiviz, color: T.onHiviz, cursor: "pointer", opacity: ms < 400 ? 0.5 : 1 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8 L14 2 L10 14 L8 9 Z" fill="currentColor" /></svg>
      </button>
    </div>
  );
}
