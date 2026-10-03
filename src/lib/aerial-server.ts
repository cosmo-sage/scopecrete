import { ESRI_PLACEHOLDER_BYTES, esriSuggestions, mapboxSuggestions, tileBbox, type AddressSuggestion, type AerialProvider } from "@/lib/aerial";

/**
 * Server side of the aerial sheet (src/lib/aerial.ts): where each provider's
 * tiles come from, and finding the job's address. Keys stay here — the browser
 * only ever sees our own /api/aerial links.
 *
 *   MAPBOX_TOKEN              Mapbox Satellite tiles and geocoding.
 *   ESRI_API_KEY (optional)   Esri's keyed basemap service; without it the public
 *                             World Imagery tiles are used.
 *   GOOGLE_MAPS_GEOCODE_KEY   geocoding, and Google's Static Maps for a look only
 *                             (the Maps Static API must be enabled on the key).
 */

const env = (k: string) => (process.env[k] ?? "").trim();

export function aerialProviders(): Record<AerialProvider, { on: boolean; why?: string; savable: boolean }> {
  return {
    esri: { on: true, savable: true },
    mapbox: env("MAPBOX_TOKEN") ? { on: true, savable: true } : { on: false, savable: true, why: "Needs MAPBOX_TOKEN in Vercel" },
    google: env("GOOGLE_MAPS_GEOCODE_KEY")
      ? { on: true, savable: false, why: "A look only: Google's terms don't allow keeping or tracing its imagery" }
      : { on: false, savable: false, why: "Needs GOOGLE_MAPS_GEOCODE_KEY in Vercel (with the Maps Static API on)" },
  };
}

export function tileUrl(p: "esri" | "mapbox", z: number, x: number, y: number): string | null {
  if (p === "mapbox") {
    const t = env("MAPBOX_TOKEN");
    return t ? `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg90?access_token=${encodeURIComponent(t)}` : null;
  }
  const k = env("ESRI_API_KEY");
  return k
    ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?token=${encodeURIComponent(k)}`
    : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

/** Google Static Maps over the same window: zoom z−1 at scale 2 covers 1,280 × 1,024 tile pixels of zoom z. */
export function googleStaticUrl(lat: number, lng: number, z: number, w: number, h: number): string | null {
  const k = env("GOOGLE_MAPS_GEOCODE_KEY");
  if (!k) return null;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${z - 1}&size=${Math.round(w / 2)}x${Math.round(h / 2)}&scale=2&maptype=satellite&format=jpg&key=${encodeURIComponent(k)}`;
}

const isJpeg = (b: Uint8Array) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8;

async function getBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

/**
 * Esri's map export for one tile's box: drawn from the sharpest imagery Esri has
 * there, so where its tiles stop (often zoom 19) the next zoom still shows the
 * photo, enlarged, instead of "Map data not yet available".
 */
function esriExportUrl(z: number, x: number, y: number): string {
  const [a, b, c, d] = tileBbox(z, x, y);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${a},${b},${c},${d}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image`;
}

export async function fetchTile(p: "esri" | "mapbox", z: number, x: number, y: number): Promise<Uint8Array | null> {
  const url = tileUrl(p, z, x, y);
  if (!url) return null;
  // blankTile=false asks Esri for a 404 instead of its grey placeholder; the size check catches it when ignored.
  const b = await getBytes(p === "esri" ? `${url}${url.includes("?") ? "&" : "?"}blankTile=false` : url);
  if (p !== "esri" || (b && isJpeg(b) && b.length >= ESRI_PLACEHOLDER_BYTES)) return b;
  const e = await getBytes(esriExportUrl(z, x, y));
  if (e && isJpeg(e) && e.length >= ESRI_PLACEHOLDER_BYTES) return e;
  return b && isJpeg(b) ? b : e && isJpeg(e) ? e : null;
}

export interface Found { lat: number; lng: number; label: string; by: string }

/** Finds an address: Google if its key is set, else Mapbox, else Esri's public geocoder. Not stored. */
export async function findAddress(q: string): Promise<Found | null> {
  const query = q.trim().slice(0, 200);
  if (!query) return null;
  const get = async (url: string) => {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return r.ok ? r.json() : null;
  };
  try {
    const g = env("GOOGLE_MAPS_GEOCODE_KEY");
    if (g) {
      const b = await get(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${encodeURIComponent(g)}`);
      const r = b?.results?.[0];
      if (typeof r?.geometry?.location?.lat === "number") return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, label: String(r.formatted_address ?? query), by: "Google" };
    }
    const m = env("MAPBOX_TOKEN");
    if (m) {
      const b = await get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&country=us&types=address,poi&access_token=${encodeURIComponent(m)}`);
      const f = b?.features?.[0];
      if (Array.isArray(f?.center) && f.center.length === 2) return { lat: f.center[1], lng: f.center[0], label: String(f.place_name ?? query), by: "Mapbox" };
    }
    const e = env("ESRI_API_KEY");
    const b = await get(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&maxLocations=1&outFields=Match_addr&SingleLine=${encodeURIComponent(query)}${e ? `&token=${encodeURIComponent(e)}` : ""}`);
    const c = b?.candidates?.[0];
    if (typeof c?.location?.y === "number" && (c.score ?? 0) >= 80) return { lat: c.location.y, lng: c.location.x, label: String(c.address ?? query), by: "Esri" };
  } catch { /* nothing found */ }
  return null;
}

/**
 * Suggestions while Coy types an address: Mapbox's autocomplete when its token
 * is set, else Esri's public suggest (resolved by its key when picked). Near the
 * map's centre when there is one. Nothing stored.
 */
export async function suggestAddresses(q: string, near?: { lat: number; lng: number }): Promise<AddressSuggestion[]> {
  const text = q.trim().slice(0, 120);
  if (text.length < 3) return [];
  const get = async (url: string) => {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
    return r.ok ? r.json() : null;
  };
  try {
    const m = env("MAPBOX_TOKEN");
    if (m) {
      const prox = near ? `&proximity=${near.lng},${near.lat}` : "";
      const out = mapboxSuggestions(await get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?autocomplete=true&limit=6&country=us&types=address,poi,place${prox}&access_token=${encodeURIComponent(m)}`));
      if (out.length) return out;
    }
    const e = env("ESRI_API_KEY");
    const loc = near ? `&location=${near.lng},${near.lat}` : "";
    return esriSuggestions(await get(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?f=json&maxSuggestions=6&countryCode=USA${loc}&text=${encodeURIComponent(text)}${e ? `&token=${encodeURIComponent(e)}` : ""}`));
  } catch { return []; }
}

/** The point of an Esri suggestion Coy picked. */
export async function resolveSuggestion(text: string, key: string): Promise<Found | null> {
  const e = env("ESRI_API_KEY");
  try {
    const r = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&maxLocations=1&SingleLine=${encodeURIComponent(text.slice(0, 200))}&magicKey=${encodeURIComponent(key.slice(0, 2000))}${e ? `&token=${encodeURIComponent(e)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const c = r.ok ? (await r.json())?.candidates?.[0] : null;
    if (typeof c?.location?.y === "number" && typeof c?.location?.x === "number") return { lat: c.location.y, lng: c.location.x, label: String(c.address ?? text), by: "Esri" };
  } catch { /* not found */ }
  return null;
}
