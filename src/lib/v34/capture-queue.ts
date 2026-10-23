"use client";

/**
 * The Camera page's upload queue (migration 113). Every shot is kept on the
 * phone (IndexedDB) the moment the shutter is pressed, then sent in the
 * background while the app is open: POST /api/capture/files (the shot's own
 * id makes a retry safe) → the file and its thumbnail straight to storage →
 * /api/files/[id]/done. A shot leaves the phone only once the server has it.
 *
 * One loop per tab, outside React, so moving around the dashboard doesn't stop
 * it. It runs again when the phone comes back online or the app is opened.
 * iOS has no background sync: with the app closed nothing is sent, and the
 * shots wait here for next time.
 */

export type ShotState = "waiting" | "sending" | "failed" | "held" | "done";
export interface Shot {
  client_id: string;
  kind: "image" | "video";
  mime: string;
  blob: Blob | null;
  thumb: Blob | null;
  taken_at: string;
  lat: number | null; lng: number | null; accuracy: number | null;
  job_id: string | null; section_id: string | null; site_id: string | null;
  /** What the picker said, for the list ("Wilson Driveway"). */
  place: string | null;
  tag: string | null; note: string | null;
  state: ShotState;
  error: string | null;
  tries: number;
  next_at: number;
  file_id: string | null;
  created: number;
}

const DB = "sc-capture", STORE = "shots";
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "client_id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const q = f(t.objectStore(STORE));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
const put = (s: Shot) => tx("readwrite", (st) => st.put(s));
const del = (id: string) => tx("readwrite", (st) => st.delete(id));
const all = () => tx<Shot[]>("readonly", (st) => st.getAll() as IDBRequest<Shot[]>);

const listeners = new Set<(shots: Shot[]) => void>();
let last: Shot[] = [];
async function emit() {
  try { last = (await all()).sort((a, b) => b.created - a.created); } catch { /* storage closed */ }
  listeners.forEach((l) => l(last));
}
/** Shots on this phone, newest first, as they change. */
export function watchShots(l: (shots: Shot[]) => void): () => void {
  listeners.add(l);
  l(last);
  void emit();
  start();
  return () => { listeners.delete(l); };
}

/** Keep a shot and start sending it. */
export async function addShot(s: Omit<Shot, "state" | "error" | "tries" | "next_at" | "file_id" | "created">): Promise<void> {
  // Ask the browser not to clear this site's storage when space runs low (the queue lives there).
  try { void navigator.storage?.persist?.(); } catch { /* not offered */ }
  await put({ ...s, state: "waiting", error: null, tries: 0, next_at: 0, file_id: null, created: Date.now() });
  await emit();
  kick();
}
/** Drop a shot that hasn't gone yet (× in the list). */
export async function dropShot(id: string) { await del(id); await emit(); }
/** Send failed or held shots again now. */
export async function retryAll() {
  for (const s of await all()) if (s.state === "failed" || s.state === "held") await put({ ...s, state: "waiting", next_at: 0 });
  await emit();
  kick();
}

async function call(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, b: b as Record<string, unknown> };
}
async function sendTo(signedUrl: string, blob: Blob, name: string) {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", new File([blob], name, { type: blob.type || "application/octet-stream" }));
  const r = await fetch(signedUrl, { method: "PUT", headers: { "x-upsert": "true" }, body });
  if (!r.ok) throw new Error(`upload failed (${r.status})`);
}

async function sendOne(s: Shot): Promise<void> {
  await put({ ...s, state: "sending", error: null });
  await emit();
  const r = await call("/api/capture/files", {
    client_id: s.client_id, mime: s.mime, size: s.blob?.size ?? 0, thumb_size: s.thumb?.size ?? null, taken_at: s.taken_at,
    lat: s.lat, lng: s.lng, accuracy: s.accuracy, job_id: s.job_id, section_id: s.section_id, site_id: s.site_id, tag: s.tag, note: s.note,
  });
  if (!r.ok) {
    // Before migration 113 the server says so; wait, and keep the shot.
    if (r.b.waiting) { await put({ ...s, state: "held", error: String(r.b.error ?? "Waiting"), next_at: Date.now() + 5 * 60_000 }); return; }
    throw Object.assign(new Error(String(r.b.error ?? `HTTP ${r.status}`)), { final: r.status === 400 || r.status === 404 });
  }
  const file = r.b.file as { id: string; name: string };
  if (!r.b.done) {
    const up = r.b.upload as { signed_url: string };
    const tu = r.b.thumb_upload as { signed_url: string } | null;
    if (s.blob) await sendTo(up.signed_url, s.blob, file.name);
    // The thumbnail is a nicety: one storage refuses (an estimator's) never holds the shot back.
    if (tu && s.thumb) await sendTo(tu.signed_url, s.thumb, "thumb.jpg").catch(() => {});
    const d = await call(`/api/files/${file.id}/done`, {});
    if (!d.ok) throw new Error(String(d.b.error ?? `HTTP ${d.status}`));
  }
  // The server has it: drop the full file, keep the thumbnail a week for the list.
  await put({ ...s, blob: null, state: "done", error: null, file_id: file.id });
}

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
function kick() { if (timer) { clearTimeout(timer); timer = null; } void loop(); }

async function loop() {
  if (running || typeof indexedDB === "undefined") return;
  running = true;
  try {
    for (;;) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      const now = Date.now();
      const shots = await all();
      // A week of sent shots is enough for the list.
      for (const s of shots) if (s.state === "done" && now - s.created > 7 * 86_400_000) await del(s.client_id);
      // One that was "sending" when the tab closed starts again.
      const due = shots.filter((s) => (s.state === "waiting" || s.state === "failed" || s.state === "held" || s.state === "sending") && s.next_at <= now && s.blob)
        .sort((a, b) => a.created - b.created)[0];
      if (!due) {
        const soon = shots.filter((s) => s.state !== "done" && s.blob).map((s) => s.next_at).sort((a, b) => a - b)[0];
        if (soon) timer = setTimeout(kick, Math.max(2_000, soon - now));
        break;
      }
      try { await sendOne(due); }
      catch (e) {
        const tries = due.tries + 1;
        const final = (e as { final?: boolean }).final;
        await put({ ...due, state: "failed", error: (e as Error).message, tries,
          // 10 s, 30 s, 1.5 min … up to 10 min between tries; a refused shot waits for a tap.
          next_at: final ? Number.MAX_SAFE_INTEGER : Date.now() + Math.min(600_000, 10_000 * 3 ** Math.min(tries - 1, 4)) });
      }
      await emit();
    }
  } finally {
    running = false;
    await emit();
  }
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(); });
  kick();
}
