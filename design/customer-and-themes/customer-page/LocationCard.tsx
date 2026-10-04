"use client";

/** Customer location: Map | Street view toggle, address under it (click = copy), Open in Maps. */

import React, { useState } from "react";
import type { Address } from "./types";

const lbl: React.CSSProperties = { fontFamily: "var(--sc-font-label, 'Barlow Condensed')", fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" };

export function LocationCard({ address, mapsKey }: { address: Address; mapsKey: string }) {
  const [view, setView] = useState<"map" | "street">("map");
  const [copied, setCopied] = useState(false);
  const q = encodeURIComponent(address.formatted);
  const hasLatLng = address.lat != null && address.lng != null;

  // Maps Embed API (key restricted to the app's domain). Street view needs lat/lng.
  const src = view === "map"
    ? `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${q}&zoom=16`
    : `https://www.google.com/maps/embed/v1/streetview?key=${mapsKey}&location=${address.lat},${address.lng}&fov=80`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(address.formatted); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };

  const seg = (on: boolean): React.CSSProperties => ({ ...lbl, padding: "4px 10px", cursor: "pointer", border: "none",
    background: on ? "var(--sc-ink)" : "transparent", color: on ? "var(--sc-slab)" : "var(--sc-ink2)" });

  return (
    <section style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--sc-hair)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ flex: 1, margin: 0, fontFamily: "var(--sc-font-light, 'Inter')", fontWeight: 300, fontSize: 20 }}>Location</h3>
        <div role="tablist" style={{ display: "flex", border: "1px solid var(--sc-hair-strong)", borderRadius: 3, overflow: "hidden" }}>
          <button role="tab" aria-selected={view === "map"} onClick={() => setView("map")} style={seg(view === "map")}>Map</button>
          <button role="tab" aria-selected={view === "street"} disabled={!hasLatLng} onClick={() => setView("street")}
            style={{ ...seg(view === "street"), borderLeft: "1px solid var(--sc-hair-strong)", opacity: hasLatLng ? 1 : 0.45 }}>Street view</button>
        </div>
      </div>
      <div style={{ height: 190, border: "1px solid var(--sc-hair)", borderRadius: 4, overflow: "hidden", background: "var(--sc-sunk)" }}>
        <iframe key={view} title={view === "map" ? "Map" : "Street view"} src={src} width="100%" height="100%" style={{ border: 0, display: "block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={copy} title="Copy address" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
          border: "1px dashed var(--sc-hair-strong)", borderRadius: 3, background: "transparent", cursor: "pointer", textAlign: "left", color: "var(--sc-ink)" }}>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{address.formatted}</span>
          <span style={{ ...lbl, fontSize: 11, color: copied ? "var(--sc-green)" : "var(--sc-ink3)" }}>{copied ? "Copied ✓" : "Copy"}</span>
        </button>
        <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer"
          style={{ ...lbl, height: 33, padding: "0 10px", borderRadius: 3, border: "1px solid var(--sc-hair-strong)", display: "flex", alignItems: "center", color: "var(--sc-chalk)", textDecoration: "none" }}>
          Open in Maps ↗
        </a>
      </div>
      <span style={{ fontSize: 11, color: "var(--sc-ink3)" }}>The customer&apos;s address. Each job can have its own site address.</span>
    </section>
  );
}
