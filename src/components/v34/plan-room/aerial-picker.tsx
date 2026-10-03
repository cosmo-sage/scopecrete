"use client";
/**
 * Aerial of the site (src/lib/aerial.ts): find the job's address, look at it on
 * Esri, Mapbox or Google, frame it, and put it in the Plan Room as a sheet with
 * the map's scale. Esri and Mapbox are kept; Google is a look only — its terms
 * don't allow keeping or tracing its imagery.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { T, F, disp, clip } from "@/lib/v34/tokens";
import { Drawer } from "@/components/v34/primitives";
import { MAX_ZOOM, MIN_ZOOM, PROVIDER_LABEL, WIN_H, WIN_W, ftPerPt, project, unproject, windowTiles, type AddressSuggestion, type AerialProvider } from "@/lib/aerial";
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

export function AerialPicker({ jobId, open, onClose, onSaved }: { jobId: string; open: boolean; onClose: () => void; onSaved: (sheetId: string) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<AerialProvider>("esri");
  const [c, setC] = useState<{ lat: number; lng: number } | null>(null);
  const [z, setZ] = useState(20);
  const [settled, setSettled] = useState<{ lat: number; lng: number } | null>(null);
  // What the map is on now — the drawer's subtitle and the saved sheet's name.
  const [place, setPlace] = useState<{ label: string; by: string } | null>(null);
  const [sugg, setSugg] = useState<AddressSuggestion[]>([]);
  const [hi, setHi] = useState(-1);
  const typed = useRef(false);
  const cRef = useRef(c);
  useEffect(() => { cRef.current = c; }, [c]);

  const goTo = (f: { lat: number; lng: number; label: string; by: string }) => {
    setC({ lat: f.lat, lng: f.lng }); setSettled({ lat: f.lat, lng: f.lng }); setPlace({ label: f.label, by: f.by }); setErr(null);
  };

  const look = useCallback(async (query?: string) => {
    setBusy("Finding the address…"); setErr(null);
    try {
      const d = (await call(`/api/jobs/${jobId}/aerial${query ? `?q=${encodeURIComponent(query)}` : ""}`, "GET")) as Info;
      setInfo(d);
      if (!query) setQ(d.query ?? "");
      if (d.found) { const f = d.found; setC({ lat: f.lat, lng: f.lng }); setSettled({ lat: f.lat, lng: f.lng }); setPlace({ label: f.label, by: f.by }); }
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
    if (!open || info) return;
    const t = setTimeout(() => void look(), 0);
    return () => clearTimeout(t);
  }, [open, info, look]);

  // Drag to move the frame. Everything is in tile pixels at the current zoom.
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!c) return;
    const w = project(c.lat, c.lng, z);
    drag.current = { x: e.clientX, y: e.clientY, cx: w.x, cy: w.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, el = box.current;
    if (!d || !el) return;
    const k = WIN_W / el.clientWidth;
    setC(unproject(d.cx - (e.clientX - d.x) * k, d.cy - (e.clientY - d.y) * k, z));
  };
  const onUp = () => { if (drag.current && c) setSettled(c); drag.current = null; };
  const zoom = (dz: number) => { setZ(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM[p], z + dz))); if (c) setSettled(c); };
  const pick = (k: AerialProvider) => { setP(k); setZ(Math.min(z, MAX_ZOOM[k])); if (c) setSettled(c); };

  const save = async () => {
    if (!c || p === "google") return;
    setBusy(`Saving the ${PROVIDER_LABEL[p]} aerial…`); setErr(null);
    try {
      const label = place?.label?.split(",")[0] ?? "";
      const r = await call(`/api/jobs/${jobId}/aerial`, "POST", { provider: p, lat: c.lat, lng: c.lng, z, label });
      onSaved((r as { sheet: { id: string } }).sheet.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const win = c ? windowTiles(c.lat, c.lng, z) : null;
  const prov = info?.providers;
  const feet = c ? Math.round(WIN_W * ftPerPt(c.lat, z)) : null;
  return (
    <Drawer open={open} onClose={onClose} wide title="Aerial of the site" sub={place ? `${place.label} · found by ${place.by}` : info?.address ?? undefined}>
      <div className="p-3 flex flex-col gap-2">
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
          {(["esri", "mapbox", "google"] as AerialProvider[]).map((k) => (
            <button key={k} disabled={!prov?.[k].on} title={prov?.[k].why} onClick={() => pick(k)}
              style={{ ...btn(p === k), opacity: prov?.[k].on ? 1 : 0.45, cursor: prov?.[k].on ? "pointer" : "not-allowed" }}>
              {PROVIDER_LABEL[k]}{k === "google" ? " · look only" : ""}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={() => zoom(-1)} disabled={z <= MIN_ZOOM} style={btn(false)} aria-label="Zoom out">−</button>
          <span style={{ fontSize: F.xs, color: T.ink2, minWidth: 54, textAlign: "center" }}>zoom {z}</span>
          <button onClick={() => zoom(1)} disabled={z >= MAX_ZOOM[p]} style={btn(false)} aria-label="Zoom in">+</button>
        </div>
        {prov && (["mapbox", "google"] as AerialProvider[]).filter((k) => !prov[k].on).map((k) => (
          <div key={k} style={{ fontSize: 11, color: T.ink3 }}>{PROVIDER_LABEL[k]}: {prov[k].why}</div>
        ))}

        <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className="relative overflow-hidden rounded select-none"
          style={{ width: `min(100%, calc((100dvh - 340px) * ${WIN_W / WIN_H}))`, alignSelf: "center", aspectRatio: `${WIN_W} / ${WIN_H}`, background: T.sunk, border: `1px solid ${T.hair}`, touchAction: "none", cursor: c ? "grab" : "default" }}>
          {win && p !== "google" && win.tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${p}/${z}/${t.x}/${t.y}`} src={`/api/aerial/tile?p=${p}&z=${z}&x=${t.x}&y=${t.y}`} alt="" draggable={false}
              style={{ position: "absolute", left: `${(t.dx / WIN_W) * 100}%`, top: `${(t.dy / WIN_H) * 100}%`, width: `${(256 / WIN_W) * 100}%`, height: `${(256 / WIN_H) * 100}%`, pointerEvents: "none" }} />
          ))}
          {settled && p === "google" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/aerial/google?lat=${settled.lat}&lng=${settled.lng}&z=${z}`} alt="Google satellite view" draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          )}
          {c && <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: 18, height: 18, marginLeft: -9, marginTop: -9, border: "2px solid #fff", borderRadius: 999, boxShadow: "0 0 0 1px rgba(0,0,0,.5)", pointerEvents: "none" }} />}
          {!c && <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: F.sm, color: T.ink3 }}>{busy ?? "No address found yet."}</div>}
        </div>
        <div style={{ fontSize: F.xs, color: T.ink3 }}>
          Drag to frame the work. {feet ? `The frame is about ${feet} ft across.` : ""} What you see is what is saved.
          {p === "google" ? " Google is shown to compare — its terms don't allow keeping it, so switch to Esri or Mapbox to save." : ""}
        </div>
        {err && <div style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
        <div className="flex items-center gap-2">
          <span className="flex-1" style={{ fontSize: 11, color: T.ink3, ...clip }}>
            The date of the photo isn&apos;t known — check it matches what&apos;s there now.
          </span>
          <button onClick={() => void save()} disabled={!c || p === "google" || !!busy}
            style={{ height: 36, padding: "0 14px", borderRadius: 3, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", opacity: !c || p === "google" || busy ? 0.5 : 1 }}>
            {busy && c ? busy : "Put it in the Plan Room"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
