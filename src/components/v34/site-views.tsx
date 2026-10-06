"use client";

/**
 * The customer page's Location box (Coy, 2026-10-06: "the location box should
 * have an actual street view and an aerial satellite view that pops up. Along
 * with a link of the address below it that I can copy").
 *
 * The satellite is drawn from the same tiles as the Plan Room's aerial
 * (`/api/aerial/tile`, Mapbox when its token is set, else Esri's public
 * imagery) — keys stay on the server. Street view in the page needs Google's
 * embed key (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`); without it the pop-up says
 * so and opens street view in Google Maps instead (never the keyless embed).
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { lbl } from "@/components/v34/record-page";
import { ATTRIBUTION, windowTiles } from "@/lib/aerial";

type Point = { lat: number; lng: number };
type Provider = "esri" | "mapbox";

const MIN_Z = 16, MAX_Z = 20;

/** Where the address is: the customer's stored point, else looked up (not stored). */
function usePoint(addr: string | null, stored: Point | null): { point: Point | null; provider: Provider; state: "idle" | "finding" | "none" } {
  const [found, setFound] = useState<{ point: Point | null; provider: Provider; addr: string } | null>(null);
  useEffect(() => {
    if (!addr) return;
    let live = true;
    void fetch(`/api/aerial/suggest?find=${encodeURIComponent(addr)}`).then((r) => r.ok ? r.json() : null).then((b) => {
      if (!live) return;
      const f = b?.found;
      setFound({ addr, provider: b?.provider === "mapbox" ? "mapbox" : "esri", point: typeof f?.lat === "number" ? { lat: f.lat, lng: f.lng } : null });
    }).catch(() => { if (live) setFound({ addr, provider: "esri", point: null }); });
    return () => { live = false; };
  }, [addr]);
  const mine = found && found.addr === addr ? found : null;
  const point = stored ?? mine?.point ?? null;
  return { point, provider: mine?.provider ?? "esri", state: point ? "idle" : !addr ? "none" : mine ? "none" : "finding" };
}

/** Satellite tiles around a point, filling the box, with a pin at the address. */
function Satellite({ point, z, provider, height }: { point: Point; z: number; provider: Provider; height: number | string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const win = size && size.w > 0 && size.h > 0 ? windowTiles(point.lat, point.lng, z, size.w, size.h) : null;
  return (
    <div ref={box} style={{ position: "relative", height, overflow: "hidden", background: "#1d2420" }}>
      {win?.tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${z}/${t.x}/${t.y}/${t.dx}`} alt="" draggable={false} src={`/api/aerial/tile?p=${provider}&z=${z}&x=${t.x}&y=${t.y}`}
          style={{ position: "absolute", left: t.dx, top: t.dy, width: 256, height: 256, maxWidth: "none", userSelect: "none" }} />
      ))}
      <svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-100%)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))" }}>
        <path d="M13 1C6.4 1 1 6.3 1 12.8 1 21.6 13 33 13 33s12-11.4 12-20.2C25 6.3 19.6 1 13 1z" fill="#D9452B" stroke="#fff" strokeWidth="2" />
        <circle cx="13" cy="12.5" r="4.2" fill="#fff" />
      </svg>
      <span style={{ position: "absolute", right: 4, bottom: 3, fontSize: 9, color: "rgba(255,255,255,.85)", textShadow: "0 1px 2px rgba(0,0,0,.8)" }}>{ATTRIBUTION[provider]}</span>
    </div>
  );
}

const panoUrl = (p: Point | null, addr: string) => p
  ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

/** The satellite preview in the Location box, and the buttons that open the pop-up. */
export function SiteViews({ addr, stored }: { addr: string; stored: Point | null }) {
  const { point, provider, state } = usePoint(addr, stored);
  const [open, setOpen] = useState<null | "sat" | "street">(null);
  const pill: React.CSSProperties = { ...lbl, fontSize: 11, height: 30, padding: "0 10px", borderRadius: 3, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 };
  return (
    <>
      <button onClick={() => setOpen("sat")} disabled={!point} aria-label="Open the satellite view" className="text-left"
        style={{ display: "block", width: "100%", padding: 0, border: `1px solid ${T.hair}`, borderRadius: 4, overflow: "hidden", cursor: point ? "zoom-in" : "default", background: T.sunk }}>
        {point
          ? <Satellite point={point} z={19} provider={provider} height={170} />
          : <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", fontSize: F.sm, color: T.ink3 }}>
              {state === "finding" ? "Finding it on the map…" : "The map couldn't place this address."}
            </div>}
      </button>
      <div className="flex gap-1.5">
        <button onClick={() => setOpen("sat")} disabled={!point} style={{ ...pill, opacity: point ? 1 : 0.5 }}>🛰 Satellite</button>
        <button onClick={() => setOpen("street")} style={pill}>🚶 Street view</button>
      </div>
      {open && <SitePopup addr={addr} point={point} provider={provider} view={open} onView={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function SitePopup({ addr, point, provider, view, onView, onClose }: {
  addr: string; point: Point | null; provider: Provider; view: "sat" | "street"; onView: (v: "sat" | "street") => void; onClose: () => void;
}) {
  const [z, setZ] = useState(19);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? "";
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const seg = (on: boolean): React.CSSProperties => ({ ...lbl, fontSize: 11, padding: "6px 12px", cursor: "pointer", border: "none", background: on ? T.ink : "transparent", color: on ? T.slab : T.ink2 });
  const zb: React.CSSProperties = { width: 36, height: 36, borderRadius: 4, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: 20, cursor: "pointer" };
  return (
    <div role="dialog" aria-modal="true" aria-label="Location" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(10,10,10,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "max(12px, env(safe-area-inset-top)) 12px 12px" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col"
        style={{ width: "min(920px, 100%)", height: "min(720px, 100%)", background: T.card, borderRadius: 6, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,.35)" }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
          <div role="tablist" className="flex overflow-hidden" style={{ border: `1px solid ${T.hairStrong}`, borderRadius: 3 }}>
            <button role="tab" aria-selected={view === "sat"} onClick={() => onView("sat")} style={seg(view === "sat")}>Satellite</button>
            <button role="tab" aria-selected={view === "street"} onClick={() => onView("street")} style={{ ...seg(view === "street"), borderLeft: `1px solid ${T.hairStrong}` }}>Street view</button>
          </div>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" style={{ ...zb, width: 32, height: 32, fontSize: 18 }}>×</button>
        </div>
        <div className="flex-1 min-h-0" style={{ position: "relative" }}>
          {view === "sat" ? (
            point ? (
              <>
                <Satellite point={point} z={z} provider={provider} height="100%" />
                <div className="flex flex-col gap-1.5" style={{ position: "absolute", right: 10, top: 10 }}>
                  <button onClick={() => setZ((v) => Math.min(MAX_Z, v + 1))} disabled={z >= MAX_Z} aria-label="Zoom in" style={zb}>+</button>
                  <button onClick={() => setZ((v) => Math.max(MIN_Z, v - 1))} disabled={z <= MIN_Z} aria-label="Zoom out" style={zb}>−</button>
                </div>
              </>
            ) : <Note text="The map couldn't place this address." />
          ) : key && point ? (
            <iframe title="Street view" src={`https://www.google.com/maps/embed/v1/streetview?key=${key}&location=${point.lat},${point.lng}&fov=80`}
              width="100%" height="100%" style={{ border: 0, display: "block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          ) : (
            <Note text="Street view inside ScopeCrete needs a Google Maps embed key (NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY in Vercel). Until then it opens in Google Maps.">
              <a href={panoUrl(point, addr)} target="_blank" rel="noopener noreferrer"
                style={{ ...lbl, fontSize: 12, height: 36, padding: "0 14px", borderRadius: 3, background: T.hiviz, color: T.onHiviz, display: "inline-flex", alignItems: "center" }}>
                Open street view in Google Maps ↗
              </a>
            </Note>
          )}
        </div>
        <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hair}` }}><CopyAddress addr={addr} /></div>
      </div>
    </div>
  );
}

function Note({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ background: T.sunk, color: T.ink2, fontSize: F.sm }}>
      <div style={{ maxWidth: 420 }}>{text}</div>
      {children}
    </div>
  );
}

/** The address as a Google Maps link, with Copy beside it. */
export function CopyAddress({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };
  return (
    <div className="flex items-center gap-2">
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`} target="_blank" rel="noopener noreferrer"
        style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, color: T.chalk, textDecoration: "underline", textUnderlineOffset: 3, overflowWrap: "anywhere" }}>{addr}</a>
      <button onClick={() => void copy()} style={{ ...lbl, fontSize: 11, height: 30, padding: "0 10px", borderRadius: 3, border: `1px solid ${T.hairStrong}`, background: T.card, color: copied ? T.green : T.ink, cursor: "pointer", flexShrink: 0 }}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
