/**
 * Fetching a file Quo holds, server-side only. Used by the routes that copy a
 * text's photos (/api/messages/[id]/media) and a call's audio
 * (/api/messages/[id]/audio) into private storage the first time Coy opens
 * them. QUO_API_KEY lives in the Vercel env and never reaches a browser.
 */

const FETCH_TIMEOUT_MS = 20_000;
export const MAX_BYTES = 25 * 1024 * 1024; // matches the buckets' file_size_limit
const API_BASE = "https://api.openphone.com/v1";

async function timed(url: string, headers?: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

/** Fetch the provider copy. Bare link first; the API key only if Quo refuses it. */
export async function fetchFromProvider(url: string): Promise<{ bytes: ArrayBuffer; type: string | null } | { error: string }> {
  let res: Response;
  try {
    res = await timed(url);
    const key = process.env.QUO_API_KEY;
    if ((res.status === 401 || res.status === 403) && key) {
      res = await timed(url, { Authorization: key });
    }
  } catch (e) {
    return { error: e instanceof Error && e.name === "AbortError" ? "provider timed out" : `fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!res.ok) {
    // 401/403 with no key configured means the link is not enough on its own.
    // Say that, because the fix is a setting, not a code change.
    if ((res.status === 401 || res.status === 403) && !process.env.QUO_API_KEY) {
      return { error: `Quo refused the link (${res.status}) — it may need QUO_API_KEY set on the server` };
    }
    if (res.status === 404 || res.status === 410) {
      return { error: `Quo no longer has this file (${res.status}) — the link has likely expired` };
    }
    return { error: `Quo answered ${res.status}` };
  }

  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return { error: `file is ${Math.round(len / 1048576)} MB, over the 25 MB limit` };
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return { error: "file is over the 25 MB limit" };
  return { bytes, type: res.headers.get("content-type") };
}

/**
 * A fresh link to a call's audio from the Quo API — the stored share links can
 * expire; the API is authoritative (see supabase/functions/backfill-call-media).
 * Null when there is no key, no such recording, or the API is unhappy: the
 * caller then falls back to the link on record.
 */
export async function freshAudioUrl(callId: string, kind: "recording" | "voicemail"): Promise<string | null> {
  const key = process.env.QUO_API_KEY;
  if (!key || !callId) return null;
  const path = kind === "voicemail" ? `/call-voicemails/${encodeURIComponent(callId)}` : `/call-recordings/${encodeURIComponent(callId)}`;
  // Quo takes the raw key; Bearer is tried second, as the backfill does.
  for (const auth of [key, `Bearer ${key}`]) {
    try {
      const res = await timed(`${API_BASE}${path}`, { Authorization: auth, Accept: "application/json" });
      if (res.status === 401 || res.status === 403) continue;
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
      const data = body?.data;
      const first = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
      const url = first && (first.url ?? first.mediaUrl ?? first.recordingUrl);
      return typeof url === "string" && url ? url : null;
    } catch {
      return null;
    }
  }
  return null;
}
