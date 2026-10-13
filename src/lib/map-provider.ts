/**
 * Which tiles the Map page draws (Coy, 2026-10-13: "set google maps as the
 * default … a maps page in the settings where I can choose which one i want
 * to use"). Saved per account as the `map_provider` pref; Google unless Coy
 * picks Mapbox. Google's tiles need the Map Tiles API on a server key; when it
 * can't be reached the page falls back to Mapbox and says why. Clip for
 * takeoff always uses Mapbox satellite: Google's terms don't allow keeping or
 * tracing its imagery. Pure — tested in tests/map-provider.test.mjs.
 */

export type MapProvider = "google" | "mapbox";
export const DEFAULT_MAP_PROVIDER: MapProvider = "google";

export function readMapProvider(v: unknown): MapProvider {
  return v === "mapbox" ? "mapbox" : DEFAULT_MAP_PROVIDER;
}

/** The provider the map draws: the pick, unless Google isn't working (then Mapbox), and Mapbox while clipping. */
export function drawnProvider(pick: MapProvider, googleOn: boolean, clipping: boolean): MapProvider {
  if (clipping) return "mapbox";
  return pick === "google" && googleOn ? "google" : "mapbox";
}

/** The tile route's `p` for a provider and a view. */
export function tileParam(provider: MapProvider, mode: "map" | "sat"): "google-map" | "google-sat" | "mapbox" | "streets" {
  if (provider === "google") return mode === "sat" ? "google-sat" : "google-map";
  return mode === "sat" ? "mapbox" : "streets";
}

/** The line in the map's corner. Google's own copyright (from its viewport call) when there is one. */
export function attribution(provider: MapProvider, mode: "map" | "sat", googleCopyright?: string | null): string {
  if (provider === "google") {
    const c = (googleCopyright ?? "").trim();
    return c ? `Google · ${c}` : mode === "sat" ? "Google · Imagery ©Google" : "Google · Map data ©Google";
  }
  return `© Mapbox © OpenStreetMap${mode === "sat" ? " © Maxar" : ""}`;
}
