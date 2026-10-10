"use client";
/**
 * Approve and sign, on the customer's proposal link (migration 097; Coy, 2026-10-09: "an approval
 * button and the ability to do digital signatures on proposals"). Their full name, a signature
 * drawn with a finger or mouse, and a tick agreeing to sign electronically — then POST
 * /api/p/[token], which records it and wins the job. Always white paper, like the document.
 */
import React, { useEffect, useRef, useState } from "react";
import { SIGN_CONSENT } from "@/lib/proposal-links";

const W = 720, H = 220;

export function SignSheet({ token, total, addons = [], onClose, onSigned }: {
  token: string; total: string | null; addons?: string[]; onClose: () => void; onSigned: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(0);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const ctx = () => {
    const c = canvas.current?.getContext("2d");
    if (c) { c.lineWidth = 3.2; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#1B2A4A"; }
    return c ?? null;
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e); last.current = p;
    const c = ctx(); if (!c) return;
    c.beginPath(); c.arc(p.x, p.y, 1.6, 0, Math.PI * 2); c.fillStyle = "#1B2A4A"; c.fill();
    setInk((n) => n + 1);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = point(e), c = ctx(); if (!c) return;
    c.beginPath(); c.moveTo(last.current.x, last.current.y); c.lineTo(p.x, p.y); c.stroke();
    last.current = p;
    setInk((n) => n + 1);
  };
  const up = () => { drawing.current = false; last.current = null; };
  const clear = () => { canvas.current?.getContext("2d")?.clearRect(0, 0, W, H); setInk(0); };

  const ready = name.trim().length >= 2 && ink >= 8 && agree && !busy;
  const sign = async () => {
    if (!canvas.current) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/p/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), signature: canvas.current.toDataURL("image/png"), agree, addons }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error ?? "Couldn't save your signature. Try again.");
      onSigned();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#5E5A52", letterSpacing: ".04em", textTransform: "uppercase" };
  return (
    <div className="sc-no-print" role="dialog" aria-modal="true" aria-label="Approve and sign"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(30,26,20,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 620, background: "#fff", color: "#2A2A2A", borderRadius: "10px 10px 0 0", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))", maxHeight: "100dvh", overflowY: "auto", fontSize: 14.5, lineHeight: 1.45 }}>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div style={{ fontSize: 19, fontWeight: 700 }}>Approve and sign</div>
            <div style={{ fontSize: 13, color: "#5E5A52" }}>
              You&apos;re accepting the scope, prices{total ? ` (${total}${addons.length ? `, with ${addons.length} add-on${addons.length === 1 ? "" : "s"}` : ""})` : ""}, payment schedule and terms in this proposal.
            </div>
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose}
            style={{ width: 32, height: 32, border: 0, background: "transparent", fontSize: 22, color: "#5E5A52", cursor: "pointer" }}>×</button>
        </div>

        <label className="block mt-3">
          <span style={label}>Your full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120}
            style={{ display: "block", width: "100%", height: 42, marginTop: 4, padding: "0 10px", border: "1px solid #C9BDA6", borderRadius: 4, fontSize: 16, color: "#2A2A2A", background: "#fff" }} />
        </label>

        <div className="mt-3">
          <div className="flex items-baseline">
            <span className="flex-1" style={label}>Sign here</span>
            <button type="button" onClick={clear} disabled={!ink || busy} style={{ border: 0, background: "transparent", color: "#9A4527", fontSize: 13, cursor: "pointer", opacity: ink ? 1 : 0.4 }}>Clear</button>
          </div>
          <canvas ref={canvas} width={W} height={H} aria-label="Draw your signature with your finger or mouse"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
            style={{ display: "block", width: "100%", aspectRatio: `${W} / ${H}`, marginTop: 4, border: "1px solid #C9BDA6", borderRadius: 4, background: "#FBF8F2", touchAction: "none", cursor: "crosshair" }} />
          <div style={{ fontSize: 12, color: "#8C8578", marginTop: 3 }}>Draw with your finger, or the mouse on a computer.</div>
        </div>

        <label className="flex items-start gap-2 mt-3" style={{ fontSize: 13.5, cursor: "pointer" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
          <span>{SIGN_CONSENT}</span>
        </label>

        {err && <div className="mt-2" style={{ fontSize: 13, color: "#B5412C" }}>{err}</div>}
        <button type="button" disabled={!ready} onClick={() => void sign()} className="mt-3"
          style={{ display: "block", width: "100%", height: 48, border: 0, borderRadius: 6, background: ready ? "#2F8A5B" : "#B9C9BE", color: "#fff", fontSize: 16, fontWeight: 700, cursor: ready ? "pointer" : "default" }}>
          {busy ? "Signing…" : "Approve and sign"}
        </button>
        {!ready && !busy && (
          <div style={{ fontSize: 12, color: "#8C8578", marginTop: 6, textAlign: "center" }}>
            {name.trim().length < 2 ? "Type your name" : ink < 8 ? "Draw your signature" : "Tick the box"} to sign.
          </div>
        )}
      </div>
    </div>
  );
}
