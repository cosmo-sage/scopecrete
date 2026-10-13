/**
 * Google's 2D map tiles (Map Tiles API) for the Map page — roadmap and
 * satellite. The key stays here: GOOGLE_MAPS_TILES_KEY, else
 * GOOGLE_MAPS_GEOCODE_KEY (with the Map Tiles API added to its allowed APIs).
 * A session is made once per map type and kept until it expires; a refusal
 * (no key, the API not enabled) is remembered for two minutes (Settings asks afresh), so the page
 * falls back to Mapbox without asking Google on every tile.
 *
 * Look only: nothing here is stored, and Clip for takeoff never uses it.
 */

export type GoogleMapType = "roadmap" | "satellite";

const env = (k: string) => (process.env[k] ?? "").trim();
export const googleTilesKey = () => env("GOOGLE_MAPS_TILES_KEY") || env("GOOGLE_MAPS_GEOCODE_KEY");

const sessions = new Map<GoogleMapType, { token: string; expires: number }>();
let refused: { at: number; why: string } | null = null;

async function session(type: GoogleMapType, fresh = false): Promise<string | null> {
  const key = googleTilesKey();
  if (!key) { refused = { at: Date.now(), why: "No Google key on the server (GOOGLE_MAPS_TILES_KEY)." }; return null; }
  const s = sessions.get(type);
  if (s && s.expires > Date.now() + 60_000) return s.token;
  if (!fresh && refused && Date.now() - refused.at < 2 * 60_000) return null;
  try {
    const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ mapType: type, language: "en-US", region: "US", scale: "scaleFactor2x", highDpi: true }),
    });
    const b = await r.json().catch(() => null);
    if (!r.ok || typeof b?.session !== "string") {
      const why = refusalWhy(r.status, b);
      console.warn("google tiles createSession refused", r.status, why.raw);
      refused = { at: Date.now(), why: why.text };
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

/** Google's own reason, in words saying what to change in Google Cloud. Never carries the key. */
export function refusalWhy(status: number, body: unknown): { text: string; raw: string } {
  const e = (body as { error?: { status?: string; message?: string; details?: { reason?: string }[] } } | null)?.error;
  const reason = (e?.details ?? []).map((d) => d?.reason).find((x) => typeof x === "string") ?? "";
  const msg = String(e?.message ?? "").replace(/key=[^&\s]+/g, "key=…").slice(0, 220);
  const raw = [`HTTP ${status}`, e?.status, reason, msg].filter(Boolean).join(" · ");
  const all = `${reason} ${e?.status ?? ""} ${msg}`;
  let fix: string;
  if (/HTTP_REFERRER_BLOCKED|referer/i.test(all)) fix = "The key only allows websites (HTTP referrers), and the server isn't a website. In Google Cloud → Credentials → the key → Application restrictions, pick None.";
  else if (/IP_ADDRESS_BLOCKED|IP address/i.test(all)) fix = "The key only allows certain IP addresses, and Vercel's change. In Google Cloud → Credentials → the key → Application restrictions, pick None.";
  else if (/SERVICE_DISABLED|has not been used|is disabled/i.test(all)) fix = "The Map Tiles API isn't turned on in the key's Google Cloud project. APIs & Services → Library → Map Tiles API → Enable (in that same project).";
  else if (/API_KEY_SERVICE_BLOCKED|are blocked/i.test(all)) fix = "The key's API restrictions don't list the Map Tiles API. Google Cloud → Credentials → the key → API restrictions → tick Map Tiles API → Save.";
  else if (/BILLING|billing/i.test(all)) fix = "Billing isn't on for the key's Google Cloud project. Google Cloud → Billing → link a billing account.";
  else if (/API_KEY_INVALID|not valid/i.test(all)) fix = "Google says the key isn't valid — check the value saved in Vercel.";
  else fix = "Google refused the key.";
  return { text: `${fix} (Google: ${raw})`, raw };
}

/** Whether Google's tiles work now, and why not. Makes the roadmap session if needed. */
export async function googleTilesStatus(fresh = false): Promise<{ on: boolean; why?: string }> {
  const t = await session("roadmap", fresh);
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
