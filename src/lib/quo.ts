/**
 * Fetching a file Quo holds, server-side only. Used by the routes that copy a
 * text's photos (/api/messages/[id]/media) and a call's audio
 * (/api/messages/[id]/audio) into private storage the first time Coy opens
 * them. QUO_API_KEY lives in the Vercel env and never reaches a browser.
 *
 * The key is ONE company's Quo workspace — Sacco Enterprises' (Coy,
 * 2026-10-12: "my Quo connection is exclusive to Sacco Enterprises"). Every
 * call here names the org it acts for, and the key is used only for that org
 * (`quoKeyFor()`); any other company gets no key, so it can never send or
 * fetch through Sacco's account. QUO_ORG_ID in Vercel names the org; without
 * it, Sacco's id. Migration 107 records the same thing in the database
 * (org_provider_accounts, secrets_from_env); another company's own Quo key
 * will live in vault, read by a server function — never this env var.
 */

/** Sacco Enterprises — the org whose Quo workspace QUO_API_KEY belongs to. */
const SACCO_ORG_ID = "61e26b09-da88-4c9f-bd0c-a47054b86234";
export function quoKeyOrg(): string {
  return process.env.QUO_ORG_ID || SACCO_ORG_ID;
}
/**
 * A line can be marked Quo only by the company whose Quo workspace is
 * connected — another company's "Quo" line would have no account behind it.
 * Null when allowed. Exported for tests.
 */
export function quoLineRefusal(orgId: string, provider: string | null): string | null {
  if (provider !== "quo" || orgId === quoKeyOrg()) return null;
  return "This company's Quo account isn't connected to ScopeCrete yet, so a line can't be marked Quo. Ask ScopeCrete to connect it.";
}

/** The env Quo key, only for the org it belongs to. Exported for tests. */
export function quoKeyFor(orgId: string): string | null {
  const key = process.env.QUO_API_KEY;
  return key && orgId && orgId === quoKeyOrg() ? key : null;
}

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
export async function fetchFromProvider(orgId: string, url: string): Promise<{ bytes: ArrayBuffer; type: string | null } | { error: string }> {
  let res: Response;
  try {
    res = await timed(url);
    const key = quoKeyFor(orgId);
    if ((res.status === 401 || res.status === 403) && key) {
      res = await timed(url, { Authorization: key });
    }
  } catch (e) {
    return { error: e instanceof Error && e.name === "AbortError" ? "provider timed out" : `fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!res.ok) {
    // 401/403 with no key configured means the link is not enough on its own.
    // Say that, because the fix is a setting, not a code change.
    if ((res.status === 401 || res.status === 403) && !quoKeyFor(orgId)) {
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
export async function freshAudioUrl(orgId: string, callId: string, kind: "recording" | "voicemail"): Promise<string | null> {
  const key = quoKeyFor(orgId);
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

/**
 * A voicemail's words and link from the Quo API (GET /v1/call-voicemails/{callId};
 * the shape supabase/functions/backfill-call-media reads). The webhook's
 * call.completed carries only the audio link, never the transcript, so this is
 * the one place the caller's words come from. `transcript` is a flat string;
 * null while Quo is still writing it (status pending) — asked again later.
 */
export async function quoVoicemail(orgId: string, callId: string): Promise<{ transcript: string | null; url: string | null; duration: number | null } | null> {
  const key = quoKeyFor(orgId);
  if (!key || !callId) return null;
  for (const auth of [key, `Bearer ${key}`]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(`${API_BASE}/call-voicemails/${encodeURIComponent(callId)}`, {
        headers: { Authorization: auth, Accept: "application/json" }, signal: ctrl.signal, cache: "no-store",
      }).finally(() => clearTimeout(t));
      if (res.status === 401 || res.status === 403) continue;
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
      return voicemailOf(body?.data);
    } catch {
      return null;
    }
  }
  return null;
}

/** Reads Quo's voicemail object (or a one-item list of them). Exported for tests. */
export function voicemailOf(data: unknown): { transcript: string | null; url: string | null; duration: number | null } | null {
  const o = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object") return null;
  const t = o.transcript;
  const u = o.recordingUrl ?? o.url ?? o.mediaUrl;
  const d = Number(o.duration);
  const transcript = typeof t === "string" && t.trim() ? t.trim() : null;
  const url = typeof u === "string" && u ? u : null;
  if (!transcript && !url) return null;
  return { transcript, url, duration: Number.isFinite(d) && d > 0 ? d : null };
}

/**
 * Send one text through Quo's API (POST /v1/messages; Quo's own docs,
 * "Send your first message"). Server only, on Coy's tap. Quo answers 202 and
 * then sends; the text reaches the thread through the webhook like one sent
 * from the Quo app. Never retried here: a timeout may still have sent it.
 * QUO_API_BASE overrides the host (default Quo's documented api.quo.com).
 */
export async function sendQuoText(orgId: string, from: string, to: string, content: string):
  Promise<{ ok: true; id: string | null } | { ok: false; status: number; message: string | null }> {
  if (orgId !== quoKeyOrg()) return { ok: false, status: 409, message: "This company has no Quo connection of its own yet." };
  const key = quoKeyFor(orgId);
  if (!key) return { ok: false, status: 503, message: "QUO_API_KEY isn't set on the server" };
  const base = process.env.QUO_API_BASE || "https://api.quo.com/v1";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/messages`, {
      method: "POST", cache: "no-store", signal: ctrl.signal,
      headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ content, from, to: [to] }),
    });
    const b = (await res.json().catch(() => null)) as { data?: { id?: unknown }; message?: unknown; errors?: Array<{ message?: unknown }> } | null;
    if (!res.ok) {
      const msg = typeof b?.message === "string" ? b.message : typeof b?.errors?.[0]?.message === "string" ? (b.errors[0].message as string) : null;
      return { ok: false, status: res.status, message: msg };
    }
    return { ok: true, id: typeof b?.data?.id === "string" ? b.data.id : null };
  } catch (e) {
    return { ok: false, status: 0, message: e instanceof Error && e.name === "AbortError"
      ? "Quo didn't answer in time — check the thread before sending again; it may have gone"
      : `couldn't reach Quo: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(t);
  }
}
