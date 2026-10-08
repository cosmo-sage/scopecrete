"use client";
/**
 * Satellite of the site (src/lib/aerial.ts): find the job's address, frame it
 * on Mapbox, and put it in Takeoffs as a sheet with the map's scale. Since
 * 2026-10-07 (Coy) it is the Takeoffs page's Satellite tab, not a drawer, and
 * Mapbox alone — Esri didn't work and Google needs a key (a Planned card on the
 * Roadmap). Zoom goes in quarter steps, by the wheel, or by pinching; between
 * whole zoom levels the tiles of the next level are drawn smaller, and the
 * dashed box is the frame that is saved (at that next level, whose scale is
 * the sheet's).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { T, F, disp, clip } from "@/lib/v34/tokens";
import { MAX_ZOOM, MIN_ZOOM, WIN_H, WIN_W, ftPerPt, project, unproject, windowTiles, type AddressSuggestion, type AerialProvider } from "@/lib/aerial";
import { call } from "./shared";

interface Info {
  address: string | null; from: "job" | "customer" | null; query: string | null;
  found: { lat: number; lng: number; label: string; by: string } | null;
  providers: Record<AerialProvider, { on: boolean; why?: string; savable: boolean }>;
}

const btn = (on: boolean): React.CSSProperties => ({
  height: 30, padding: "0 10px", borderRadius: 3, fontSize: F.xs, fontWeight: 600, cursor: "pointer",
  background: on ? T.ink : T.card, color: on ? T.card : T.ink, border: `1px solid ${on ? T.ink : T.hairStrong}`,
});

const P: AerialProvider = "mapbox";
const ZMAX = MAX_ZOOM[P];
const STEP = 0.25;
const clampZ = (v: number) => Math.max(MIN_ZOOM, Math.min(ZMAX, v));

export function AerialPicker({ jobId, onSaved }: { jobId: string; onSaved: (sheetId: string) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [c, setC] = useState<{ lat: number; lng: number } | null>(null);
  // The zoom as seen (quarter steps, the wheel or a pinch), and the whole level whose tiles are drawn and saved.
  const [vz, setVz] = useState(20);
  const tz = Math.min(ZMAX, Math.ceil(vz - 1e-6));
  const s = 2 ** (tz - vz);
  // What the map is on now — the drawer's subtitle and the saved sheet's name.
  const [place, setPlace] = useState<{ label: string; by: string } | null>(null);
  const [sugg, setSugg] = useState<AddressSuggestion[]>([]);
  const [hi, setHi] = useState(-1);
  const typed = useRef(false);
  const cRef = useRef(c);
  useEffect(() => { cRef.current = c; }, [c]);

  const goTo = (f: { lat: number; lng: number; label: string; by: string }) => {
    setC({ lat: f.lat, lng: f.lng }); setPlace({ label: f.label, by: f.by }); setErr(null);
  };

  const look = useCallback(async (query?: string) => {
    setBusy("Finding the address…"); setErr(null);
    try {
      const d = (await call(`/api/jobs/${jobId}/aerial${query ? `?q=${encodeURIComponent(query)}` : ""}`, "GET")) as Info;
      setInfo(d);
      if (!query) setQ(d.query ?? "");
      if (d.found) { const f = d.found; setC({ lat: f.lat, lng: f.lng }); setPlace({ label: f.label, by: f.by }); }
      else setErr(d.query ? `Couldn't find "${d.query}". Type it the way you'd put it in a map.` : "This job has no address yet — type one.");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, [jobId]);
  // Suggestions as Coy types (not when a pick fills the box), a quarter second after the last key.
  useEffect(() => {
    if (!typed.current) return;
    const text = q.trim();
    const t = setTimeout(async () => {
      if (text.length < 3) { setSugg([]); return; }
      const near = cRef.current;
      try {
        const r = await fetch(`/api/aerial/suggest?q=${encodeURIComponent(text)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ""}`);
        const b = r.ok ? await r.json() : null;
        setSugg(Array.isArray(b?.suggestions) ? b.suggestions : []); setHi(-1);
      } catch { setSugg([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const choose = async (s: AddressSuggestion) => {
    typed.current = false; setQ(s.label); setSugg([]); setHi(-1);
    if (typeof s.lat === "number" && typeof s.lng === "number") { goTo({ lat: s.lat, lng: s.lng, label: s.label, by: "Mapbox" }); return; }
    if (!s.key) return;
    setBusy("Finding the address…");
    try {
      const r = await fetch(`/api/aerial/suggest?text=${encodeURIComponent(s.label)}&key=${encodeURIComponent(s.key)}`);
      const b = r.ok ? await r.json() : null;
      if (b?.found) goTo(b.found); else void look(s.label);
    } finally { setBusy(null); }
  };

  useEffect(() => {
    if (info) return;
    const t = setTimeout(() => void look(), 0);
    return () => clearTimeout(t);
  }, [info, look]);

  // Drag to move the frame; two fingers pinch to zoom; the wheel zooms. Positions are tile pixels at tz.
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; vz: number } | null>(null);
  const span = () => { const [a, b] = [...pts.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const onDown = (e: React.PointerEvent) => {
    if (!c) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) { drag.current = null; pinch.current = { d: span(), vz }; return; }
    const w = project(c.lat, c.lng, tz);
    drag.current = { x: e.clientX, y: e.clientY, cx: w.x, cy: w.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pts.current.size === 2) { const p0 = pinch.current; setVz(clampZ(p0.vz + Math.log2(span() / p0.d))); return; }
    const d = drag.current, el = box.current;
    if (!d || !el) return;
    const k = (WIN_W * s) / el.clientWidth;
    setC(unproject(d.cx - (e.clientX - d.x) * k, d.cy - (e.clientY - d.y) * k, tz));
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    drag.current = null;
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = (e: WheelEvent) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      setVz((v) => clampZ(v - px / 400));
    };
    el.addEventListener("wheel", w, { passive: false });
    return () => el.removeEventListener("wheel", w);
  }, [c]);
  const zoom = (dz: number) => setVz((v) => clampZ(Math.round((v + dz) / STEP) * STEP));

  const save = async () => {
    if (!c) return;
    setBusy("Saving the satellite view…"); setErr(null);
    try {
      const label = place?.label?.split(",")[0] ?? "";
      const r = await call(`/api/jobs/${jobId}/aerial`, "POST", { provider: P, lat: c.lat, lng: c.lng, z: tz, label });
      onSaved((r as { sheet: { id: string } }).sheet.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const W = WIN_W * s, H = WIN_H * s;
  const win = c ? windowTiles(c.lat, c.lng, tz, W, H) : null;
  const off = info?.providers?.[P] && !info.providers[P].on ? info.providers[P].why ?? "Mapbox isn't set up." : null;
  const feet = c ? Math.round(WIN_W * ftPerPt(c.lat, tz)) : null;
  return (
      <div className="p-3 flex flex-col gap-2 w-full" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{place ? `${place.label} · found by ${place.by}` : info?.address ?? ""}</div>
        <form className="flex gap-2 relative" onSubmit={(e) => {
          e.preventDefault();
          if (hi >= 0 && sugg[hi]) { void choose(sugg[hi]); return; }
          typed.current = false; setSugg([]);
          if (q.trim()) void look(q.trim());
        }}>
          <input value={q} onChange={(e) => { typed.current = true; setQ(e.target.value); }} placeholder="Address of the site" aria-label="Address of the site"
            role="combobox" aria-controls="sc-aerial-sugg" aria-expanded={sugg.length > 0} aria-autocomplete="list" autoComplete="off"
            onKeyDown={(e) => {
              if (!sugg.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(sugg.length - 1, h + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)); }
              else if (e.key === "Escape") { e.preventDefault(); setSugg([]); }
            }}
            onBlur={() => setTimeout(() => setSugg([]), 150)}
            className="flex-1" style={{ height: 34, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 8px", background: T.card, color: T.ink, fontSize: F.sm, minWidth: 0 }} />
          <button type="submit" style={btn(false)}>Find</button>
          {sugg.length > 0 && (
            <div id="sc-aerial-sugg" role="listbox" className="absolute left-0 rounded" style={{ top: 36, right: 52, zIndex: 5, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 6px 18px rgba(0,0,0,.18)" }}>
              {sugg.map((s, i) => (
                <button key={`${s.label}-${i}`} type="button" role="option" aria-selected={i === hi}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => void choose(s)}
                  className="block w-full text-left px-2"
                  style={{ minHeight: 34, fontSize: F.sm, color: T.ink, background: i === hi ? T.sunk : "transparent", borderTop: i ? `1px solid ${T.hair}` : "none", cursor: "pointer" }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </form>
        {info?.from === "customer" && <div style={{ fontSize: F.xs, color: T.ink3 }}>The job has no address of its own — this is the customer&apos;s.</div>}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span style={{ fontSize: F.xs, fontWeight: 600, color: T.ink2 }}>Mapbox satellite</span>
          <span className="flex-1" />
          <button onClick={() => zoom(-STEP)} disabled={vz <= MIN_ZOOM} style={btn(false)} aria-label="Zoom out">−</button>
          <span style={{ fontSize: F.xs, color: T.ink2, minWidth: 70, textAlign: "center" }}>zoom {vz.toFixed(2).replace(/\.?0+$/, "")}</span>
          <button onClick={() => zoom(STEP)} disabled={vz >= ZMAX} style={btn(false)} aria-label="Zoom in">+</button>
        </div>
        {off && <div style={{ fontSize: 11, color: T.ink3 }}>{off}</div>}

        <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className="relative overflow-hidden rounded select-none"
          style={{ width: `min(100%, calc((100dvh - var(--sc-head) - 300px) * ${WIN_W / WIN_H}))`, alignSelf: "center", aspectRatio: `${WIN_W} / ${WIN_H}`, background: T.sunk, border: `1px solid ${T.hair}`, touchAction: "none", cursor: c ? "grab" : "default" }}>
          {win && !off && win.tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${P}/${tz}/${t.x}/${t.y}`} src={`/api/aerial/tile?p=${P}&z=${tz}&x=${t.x}&y=${t.y}`} alt="" draggable={false}
              style={{ position: "absolute", left: `${(t.dx / W) * 100}%`, top: `${(t.dy / H) * 100}%`, width: `${(256 / W) * 100}%`, height: `${(256 / H) * 100}%`, pointerEvents: "none" }} />
          ))}
          {c && s > 1.001 && (
            <div aria-hidden style={{ position: "absolute", left: `${50 - 50 / s}%`, top: `${50 - 50 / s}%`, width: `${100 / s}%`, height: `${100 / s}%`, border: "2px dashed #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.45)", pointerEvents: "none" }} />
          )}
          {c && <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: 18, height: 18, marginLeft: -9, marginTop: -9, border: "2px solid #fff", borderRadius: 999, boxShadow: "0 0 0 1px rgba(0,0,0,.5)", pointerEvents: "none" }} />}
          {!c && <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: F.sm, color: T.ink3 }}>{busy ?? "No address found yet."}</div>}
        </div>
        <div style={{ fontSize: F.xs, color: T.ink3 }}>
          Drag to frame the work; scroll or pinch to zoom. {feet ? `The saved frame is about ${feet} ft across.` : ""}
          {s > 1.001 ? " The dashed box is what is saved." : " What you see is what is saved."}
        </div>
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <div className="flex items-center gap-2">
          <span className="flex-1" style={{ fontSize: 11, color: T.ink3, ...clip }}>
            The date of the photo isn&apos;t known — check it matches what&apos;s there now.
          </span>
          <button onClick={() => void save()} disabled={!c || !!off || !!busy}
            style={{ height: 36, padding: "0 14px", borderRadius: 3, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", opacity: !c || off || busy ? 0.5 : 1 }}>
            {busy && c ? busy : "Put it in Takeoffs"}
          </button>
        </div>
      </div>
  );
}
