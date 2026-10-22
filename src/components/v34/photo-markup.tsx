"use client";

/**
 * Draw on and comment on a photo (Coy, 2026-10-22: "annotation and drawing
 * tools on the photos both here in the budget and in files anywhere files can
 * be viewed … both on phone and desktop"). Front and centre over the page: a
 * pen in four colours, a note placed with a tap, Undo and Clear, and a
 * comment. Save keeps the photo as it was and adds a marked-up copy beside it
 * (same job, section or person), its comment as the copy's note.
 */
import React, { useEffect, useRef, useState } from "react";
import { T, F, eyebrow } from "@/lib/v34/tokens";
import { sendBytes, type FileRow } from "@/components/v34/files-panel";

type Pt = { x: number; y: number };
type Mark = { kind: "pen"; color: string; pts: Pt[] } | { kind: "note"; color: string; at: Pt; text: string };
const COLORS = ["#E5372B", "#F5B400", "#1E6FD9", "#FFFFFF"];

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

/** Draws the marks onto a 2D context of width w (points are 0–1 of the photo). */
function paint(ctx: CanvasRenderingContext2D, marks: Mark[], w: number, h: number) {
  const lw = Math.max(2, w / 220);
  for (const m of marks) {
    if (m.kind === "pen") {
      ctx.strokeStyle = m.color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      m.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
      if (m.pts.length === 1) ctx.lineTo(m.pts[0].x * w + 0.1, m.pts[0].y * h);
      ctx.stroke();
    } else {
      const fs = Math.max(13, w / 45);
      ctx.font = `600 ${fs}px sans-serif`;
      const tw = ctx.measureText(m.text).width;
      const x = m.at.x * w, y = m.at.y * h, pad = fs * 0.35;
      ctx.fillStyle = "rgba(0,0,0,.72)";
      ctx.fillRect(x, y - fs - pad, tw + pad * 2, fs + pad * 2);
      ctx.fillStyle = m.color; ctx.fillRect(x, y - fs - pad, pad * 0.6, fs + pad * 2);
      ctx.fillStyle = "#fff"; ctx.fillText(m.text, x + pad, y);
    }
  }
}

export function PhotoMarkup({ f, onClose, onSaved }: { f: FileRow; onClose: () => void; onSaved?: (file: FileRow) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<"pen" | "note">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<Mark | null>(null);

  useEffect(() => {
    if (!f.url) return;
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.onerror = () => setErr("The photo didn't load.");
    i.src = f.url;
  }, [f.url]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if ((e.ctrlKey || e.metaKey) && e.key === "z") setMarks((m) => m.slice(0, -1)); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Redraw the screen canvas whenever the marks change.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    paint(ctx, drawing.current ? [...marks, drawing.current] : marks, c.width, c.height);
  });
  const fitted = (() => {
    if (!img) return null;
    const maxW = Math.min(1200, typeof window !== "undefined" ? window.innerWidth - 24 : 900);
    const maxH = typeof window !== "undefined" ? window.innerHeight - 230 : 600;
    const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    return { w: Math.round(img.naturalWidth * k), h: Math.round(img.naturalHeight * k) };
  })();
  const at = (e: React.PointerEvent): Pt => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const [, bump] = useState(0);
  const down = (e: React.PointerEvent) => {
    if (tool === "note") {
      const text = window.prompt("Note on the photo")?.trim();
      if (text) setMarks((m) => [...m, { kind: "note", color, at: at(e), text: text.slice(0, 120) }]);
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = { kind: "pen", color, pts: [at(e)] };
    bump((n) => n + 1);
  };
  const move = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (d?.kind !== "pen") return;
    d.pts.push(at(e));
    bump((n) => n + 1);
  };
  const up = () => {
    const d = drawing.current;
    drawing.current = null;
    if (d) setMarks((m) => [...m, d]);
  };

  const save = async () => {
    if (!img) return;
    setBusy(true); setErr(null);
    try {
      const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      paint(ctx, marks, w, h);
      const blob: Blob | null = await new Promise((res) => {
        try { c.toBlob((b) => res(b), "image/jpeg", 0.88); } catch { res(null); }
      });
      if (!blob) throw new Error("This photo can't be copied from here (the browser blocked it).");
      const base = f.name.replace(/\.[^.]+$/, "");
      const name = `${base} · marked up.jpg`.replace(/[\\/:*?"<>|]/g, "-");
      const made = await call("/api/files", "POST", {
        name, mime: "image/jpeg", size: blob.size, category: "photo",
        job_id: f.job_id ?? undefined, contact_id: f.contact_id ?? undefined, section_id: f.section_id ?? undefined,
        note: comment.trim() || undefined,
      });
      await sendBytes(made.upload.signed_url, new File([blob], name, { type: "image/jpeg" }), () => {});
      const fin = await call(`/api/files/${made.file.id}/done`, "POST");
      if (comment.trim()) await call(`/api/files/${made.file.id}`, "PATCH", { note: comment.trim() }).catch(() => null);
      setDone(true);
      onSaved?.(fin.file as FileRow);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const btn = (on: boolean): React.CSSProperties => ({ height: 32, padding: "0 10px", borderRadius: 6, fontSize: F.sm, fontWeight: 600, cursor: "pointer",
    background: on ? T.ink : T.card, color: on ? T.card : T.ink, border: `1px solid ${T.hair}` });
  return (
    <div role="dialog" aria-label={`Mark up ${f.name}`} className="fixed inset-0 flex flex-col items-center" style={{ zIndex: 90, background: "rgba(10,12,14,.88)", padding: "calc(8px + env(safe-area-inset-top)) 12px 12px" }}>
      <div className="w-full flex items-center gap-2 flex-wrap" style={{ maxWidth: 1200, color: "#fff", marginBottom: 8 }}>
        <div style={{ ...eyebrow, color: "#fff", flex: 1, minWidth: 120 }}>Mark up · {f.name}</div>
        <button onClick={() => setTool("pen")} style={btn(tool === "pen")}>✎ Draw</button>
        <button onClick={() => setTool("note")} style={btn(tool === "note")}>T Note</button>
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`}
            style={{ width: 26, height: 26, borderRadius: 13, background: c, border: color === c ? "3px solid #fff" : "1px solid rgba(255,255,255,.4)", cursor: "pointer" }} />
        ))}
        <button onClick={() => setMarks((m) => m.slice(0, -1))} disabled={!marks.length} style={btn(false)}>Undo</button>
        <button onClick={() => setMarks([])} disabled={!marks.length} style={btn(false)}>Clear</button>
        <button onClick={onClose} aria-label="Close" style={{ fontSize: 24, color: "#fff", cursor: "pointer", padding: "0 6px" }}>×</button>
      </div>
      <div className="flex-1 flex items-center justify-center w-full" style={{ minHeight: 0 }}>
        {!img && !err && <div style={{ color: "#fff", fontSize: F.sm }}>Loading the photo…</div>}
        {img && fitted && (
          <canvas ref={canvas} width={fitted.w} height={fitted.h} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            style={{ width: fitted.w, height: fitted.h, touchAction: "none", cursor: tool === "pen" ? "crosshair" : "text", borderRadius: 4, background: "#000" }} />
        )}
      </div>
      <div className="w-full flex items-center gap-2 flex-wrap" style={{ maxWidth: 1200, marginTop: 8 }}>
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment on this photo" aria-label="Comment"
          style={{ flex: 1, minWidth: 180, height: 38, borderRadius: 6, border: "none", padding: "0 10px", fontSize: 16, background: "#fff", color: "#111" }} />
        <button onClick={() => void save()} disabled={busy || !img || (!marks.length && !comment.trim())}
          style={{ height: 38, padding: "0 14px", borderRadius: 6, background: T.hiviz, color: T.onHiviz, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : done ? "Saved ✓ — save again" : "Save a marked-up copy"}
        </button>
      </div>
      {err && <div style={{ color: "#FFB4A8", fontSize: F.sm, marginTop: 6 }}>{err}</div>}
      {done && !err && <div style={{ color: "#B6F2C8", fontSize: F.sm, marginTop: 6 }}>Saved beside the photo as “{f.name.replace(/\.[^.]+$/, "")} · marked up”. The photo itself is unchanged.</div>}
    </div>
  );
}
