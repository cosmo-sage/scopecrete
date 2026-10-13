"use client";

/**
 * Settings → Maps: which map the Map page draws (Coy, 2026-10-13: "set google
 * maps as the default … a maps page in the settings where I can choose which
 * one i want to use"). Saved on the account (`map_provider`, no migration).
 * Google needs the Map Tiles API on the server's Google key; until then the
 * Map page uses Mapbox and this page says why. Clip for takeoff is always
 * Mapbox satellite — Google's imagery may be looked at, never saved.
 */

import React, { useEffect, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { usePref } from "@/lib/v34/prefs";
import { DEFAULT_MAP_PROVIDER, readMapProvider, type MapProvider } from "@/lib/map-provider";
import { SettingsBlock, SettingsTitle } from "@/components/v34/settings/parts";

const CHOICES: Array<{ k: MapProvider; label: string; note: string }> = [
  { k: "google", label: "Google Maps", note: "Google's map and satellite — the default." },
  { k: "mapbox", label: "Mapbox", note: "Mapbox Streets and Mapbox satellite (Maxar)." },
];

export function MapsSettings() {
  const [pref, setPref] = usePref<string>("map_provider", DEFAULT_MAP_PROVIDER);
  const pick = readMapProvider(pref);
  const [google, setGoogle] = useState<{ on: boolean; why?: string } | null>(null);
  useEffect(() => {
    fetch("/api/map/provider").then((r) => (r.ok ? r.json() : null)).then((b) => setGoogle(b?.google ?? { on: false, why: "Couldn't check." })).catch(() => setGoogle({ on: false, why: "Couldn't check." }));
  }, []);
  return (
    <div>
      <SettingsTitle title="Maps" note="The map the Map page draws, for its Map and Satellite views." />
      <SettingsBlock title="Map provider"
        note="Clip for takeoff always uses Mapbox satellite: Google's terms don't allow saving or tracing its imagery. Street view is Google's either way.">
        <div role="radiogroup" aria-label="Map provider">
          {CHOICES.map((c) => {
            const on = pick === c.k;
            return (
              <button key={c.k} type="button" role="radio" aria-checked={on} onClick={() => setPref(c.k)}
                className="flex items-start gap-3 w-full text-left rounded"
                style={{ padding: "8px 10px", marginBottom: 6, border: `1px solid ${on ? T.ink : T.hair}`, background: on ? T.sunk : T.card, cursor: "pointer" }}>
                <span aria-hidden style={{ width: 16, height: 16, borderRadius: 999, border: `2px solid ${on ? T.ink : T.hairStrong}`, marginTop: 2, flex: "0 0 auto", display: "grid", placeItems: "center" }}>
                  {on && <span style={{ width: 8, height: 8, borderRadius: 999, background: T.ink }} />}
                </span>
                <span className="min-w-0">
                  <span style={{ display: "block", fontSize: F.sm, fontWeight: 600, color: T.ink }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: F.xs, color: T.ink3 }}>{c.note}</span>
                </span>
              </button>
            );
          })}
        </div>
        {pick === "google" && google && (
          <div style={{ fontSize: F.xs, marginTop: 4, color: google.on ? T.green : T.ink2, lineHeight: 1.45 }}>
            {google.on ? "● Google's map is working." : `● Not working yet, so the Map page shows Mapbox: ${google.why ?? ""}`}
          </div>
        )}
      </SettingsBlock>
    </div>
  );
}
