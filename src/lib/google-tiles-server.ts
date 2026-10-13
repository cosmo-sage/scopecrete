/**
 * Google's 2D map tiles (Map Tiles API) for the Map page — roadmap and
 * satellite. The key stays here: GOOGLE_MAPS_TILES_KEY, else
 * GOOGLE_MAPS_GEOCODE_KEY (with the Map Tiles API added to its allowed APIs).
 * A session is made once per map type and kept until it expires; a refusal
 * (no key, the API not enabled) is remembered for ten minutes, so the page
 * falls back to Mapbox without asking Google on every tile.
 *
 * Look only: nothing here is stored, and Clip for takeoff never uses it.
 */

export type GoogleMapType = "roadmap" | "satellite";

const env = (k: string) => (process.env[k] ?? "").trim();
export const googleTilesKey = () => env("GOOGLE_MAPS_TILES_KEY") || env("GOOGLE_MAPS_GEOCODE_KEY");

const sessions = new Map<GoogleMapType, { token: string; expires: number }>();
let refused: { at: number; why: string } | null = null;

async function session(type: GoogleMapType): Promise<string | null> {
  const key = googleTilesKey();
  if (!key) { refused = { at: Date.now(), why: "No Google key on the server (GOOGLE_MAPS_TILES_KEY)." }; return null; }
  const s = sessions.get(type);
  if (s && s.expires > Date.now() + 60_000) return s.token;
  if (refused && Date.now() - refused.at < 10 * 60_000) return null;
  try {
    const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ mapType: type, language: "en-US", region: "US", scale: "scaleFactor2x", highDpi: true }),
    });
    const b = await r.json().catch(() => null);
    if (!r.ok || typeof b?.session !== "string") {
      const msg = String(b?.error?.message ?? `HTTP ${r.status}`);
      refused = { at: Date.now(), why: /not been used|disabled|not authorized|API_KEY_SERVICE_BLOCKED|blocked/i.test(msg) ? "The Map Tiles API isn't enabled for the Google key." : `Google refused: ${msg.slice(0, 160)}` };
      return null;
    }
    refused = null;
    const exp = Number(b.expiry) * 1000;
    sessions.set(type, { token: b.session, expires: Number.isFinite(exp) && exp > Date.now() ? exp : Date.now() + 12 * 3600_000 });
    return b.session;
  } catch {
    refused = { at: Date.now(), why: "Google's tile service didn't answer." };
    return null;
  }
}

/** Whether Google's tiles work now, and why not. Makes the roadmap session if needed. */
export async function googleTilesStatus(): Promise<{ on: boolean; why?: string }> {
  const t = await session("roadmap");
  return t ? { on: true } : { on: false, why: refused?.why ?? "Google's tiles aren't available." };
}

export async function fetchGoogleTile(type: GoogleMapType, z: number, x: number, y: number): Promise<{ bytes: Uint8Array; type: string; cache: string } | null> {
  const s = await session(type);
  if (!s) return null;
  try {
    const r = await fetch(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${encodeURIComponent(s)}&key=${encodeURIComponent(googleTilesKey())}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (r.status === 401 || r.status === 403) sessions.delete(type);
    if (!r.ok) return null;
    return {
      bytes: new Uint8Array(await r.arrayBuffer()),
      type: r.headers.get("content-type") || (type === "satellite" ? "image/jpeg" : "image/png"),
      cache: r.headers.get("cache-control") || "private, max-age=3600",
    };
  } catch { return null; }
}

/** Google's copyright line for what's on screen (its terms ask for it). */
export async function googleCopyright(type: GoogleMapType, zoom: number, box: { n: number; s: number; e: number; w: number }): Promise<string | null> {
  const s = await session(type);
  if (!s) return null;
  try {
    const q = `session=${encodeURIComponent(s)}&key=${encodeURIComponent(googleTilesKey())}&zoom=${zoom}&north=${box.n}&south=${box.s}&east=${box.e}&west=${box.w}`;
    const r = await fetch(`https://tile.googleapis.com/tile/v1/viewport?${q}`, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
    const b = r.ok ? await r.json() : null;
    return typeof b?.copyright === "string" ? b.copyright : null;
  } catch { return null; }
}
