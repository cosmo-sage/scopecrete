"use client";

/**
 * The customer page's Location box (Coy, 2026-10-06: "the location box should
 * have an actual street view and an aerial satellite view that pops up. Along
 * with a link of the address below it that I can copy").
 *
 * The satellite is drawn from the same tiles as the Plan Room's aerial
 * (`/api/aerial/tile`, Mapbox — Esri's grey "no data" tiles are off since
 * 2026-10-07, Coy: "it doesn't work") — keys stay on the server. Street view in the page needs Google's
 * embed key (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`); without it the pop-up says
 * so and opens street view in Google Maps instead (never the keyless embed).
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { lbl } from "@/components/v34/record-page";
import { ATTRIBUTION, windowTiles } from "@/lib/aerial";

type Point = { lat: number; lng: number };
type Provider = "mapbox";

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
      setFound({ addr, provider: "mapbox", point: typeof f?.lat === "number" ? { lat: f.lat, lng: f.lng } : null });
    }).catch(() => { if (live) setFound({ addr, provider: "mapbox", point: null }); });
    return () => { live = false; };
  }, [addr]);
  const mine = found && found.addr === addr ? found : null;
  const point = stored ?? mine?.point ?? null;
  return { point, provider: "mapbox", state: point ? "idle" : !addr ? "none" : mine ? "none" : "finding" };
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

/** Satellite | Street view, one box with a toggle (Coy, 2026-10-13: "street
 *  maps should be a toggle"). The pick is kept on the device. Satellite opens
 *  full size on a tap; street view is Google's in the page with the embed key,
 *  else a link to Google Maps. */
const VIEW_KEY = "sc:site-view";
export function SiteViews({ addr, stored }: { addr: string; stored: Point | null }) {
  const { point, provider, state } = usePoint(addr, stored);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"sat" | "street">(() => {
    try { return typeof window !== "undefined" && localStorage.getItem(VIEW_KEY) === "street" ? "street" : "sat"; } catch { return "sat"; }
  });
  const pick = (v: "sat" | "street") => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* none */ } };
  const tab = (v: "sat" | "street", label: string) => (
    <button key={v} onClick={() => pick(v)} aria-pressed={view === v}
      style={{ padding: "3px 10px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 3, cursor: "pointer",
        background: view === v ? T.card : "transparent", color: view === v ? T.ink : T.ink3, boxShadow: view === v ? `0 0 0 1px ${T.hair}` : "none" }}>
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {point && (
        <div role="group" aria-label="Map view" className="flex gap-0.5 self-start" style={{ padding: 2, borderRadius: 4, background: T.sunk }}>
          {tab("sat", "Satellite")}{tab("street", "Street view")}
        </div>
      )}
      {view === "street" && point
        ? <StreetFrame point={point} height={200} />
        : <button onClick={() => setOpen(true)} disabled={!point} aria-label="Open the satellite view" className="text-left"
            style={{ position: "relative", display: "block", width: "100%", padding: 0, border: `1px solid ${T.hair}`, borderRadius: 4, overflow: "hidden", cursor: point ? "zoom-in" : "default", background: T.sunk }}>
            {point
              ? <Satellite point={point} z={19} provider={provider} height={170} />
              : <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", fontSize: F.sm, color: T.ink3 }}>
                  {state === "finding" ? "Finding it on the map…" : "The map couldn't place this address."}
                </div>}
          </button>}
      {open && point && <SitePopup point={point} provider={provider} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SitePopup({ point, provider, onClose }: { point: Point; provider: Provider; onClose: () => void }) {
  const [z, setZ] = useState(19);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const zb: React.CSSProperties = { width: 36, height: 36, borderRadius: 4, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: 20, cursor: "pointer" };
  return (
    <div role="dialog" aria-modal="true" aria-label="Satellite view" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(10,10,10,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "max(12px, env(safe-area-inset-top)) 12px 12px" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", width: "min(920px, 100%)", height: "min(720px, 100%)", background: T.card, borderRadius: 6, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,.35)" }}>
        <Satellite point={point} z={z} provider={provider} height="100%" />
        <div className="flex flex-col gap-1.5" style={{ position: "absolute", right: 10, top: 10 }}>
          <button onClick={onClose} aria-label="Close" style={zb}>×</button>
          <button onClick={() => setZ((v) => Math.min(MAX_Z, v + 1))} disabled={z >= MAX_Z} aria-label="Zoom in" style={zb}>+</button>
          <button onClick={() => setZ((v) => Math.max(MIN_Z, v - 1))} disabled={z <= MIN_Z} aria-label="Zoom out" style={zb}>−</button>
        </div>
      </div>
    </div>
  );
}

/** The address as a Google Maps link. */
export function AddressLink({ addr }: { addr: string }) {
  return (
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`} target="_blank" rel="noopener noreferrer"
      style={{ fontSize: 13.5, fontWeight: 500, color: T.chalk, textDecoration: "underline", textUnderlineOffset: 3, overflowWrap: "anywhere" }}>{addr}</a>
  );
}

/**
 * Street view of the address (Coy, 2026-10-13: "google street view on the
 * customer and job pages"). With Google's browser key
 * (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`, the Maps Embed API — free, no usage
 * charge) it is Google's own Street View in the page; without it, a link that
 * opens street view in Google Maps (no key). Never the keyless embed.
 */
const EMBED_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? "";

export function streetViewUrl(p: Point): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}`;
}

function StreetFrame({ point, height }: { point: Point; height: number }) {
  const link = (
    <a href={streetViewUrl(point)} target="_blank" rel="noopener noreferrer"
      style={{ fontSize: 12, fontWeight: 600, color: T.chalk, textDecoration: "none" }}>
      {EMBED_KEY ? "Open in Google Maps ↗" : "Open street view in Google Maps ↗"}
    </a>
  );
  if (!EMBED_KEY) return <div style={{ padding: "18px 0", textAlign: "center", border: `1px solid ${T.hair}`, borderRadius: 4, background: T.sunk }}>{link}</div>;
  const src = `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(EMBED_KEY)}&location=${point.lat},${point.lng}&fov=80`;
  return (
    <div className="flex flex-col gap-1">
      <iframe title="Street view" src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen
        style={{ width: "100%", height, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.sunk }} />
      <div style={{ textAlign: "right" }}>{link}</div>
    </div>
  );
}
