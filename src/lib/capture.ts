/**
 * Site photo capture (migration 113; Coy, 2026-10-15: "our own little company
 * cam … take pictures on site really quickly and then pull those projects or
 * jobs into Scopecrete"). Pure rules, tested in tests/capture.test.mjs:
 * how far a shot is from a job or site, which one it goes on, how big the
 * saved picture and its thumbnail are, and what a shot's upload may say.
 */

export interface Point { lat: number; lng: number }

/** Metres between two points (haversine). */
export function distanceM(a: Point, b: Point): number {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A shot is "at" a place inside 150 m, or twice the GPS's own error when that is bigger (capped at 500 m). */
export const NEAR_M = 150;
export function nearRadius(accuracyM: number | null | undefined): number {
  const acc = Number(accuracyM);
  return Math.min(500, Math.max(NEAR_M, Number.isFinite(acc) && acc > 0 ? acc * 2 : 0));
}

export interface Place extends Point { kind: "job" | "site"; id: string; label: string; job_id?: string | null }
export interface Placed extends Place { dist_m: number }

/**
 * Where a shot taken here goes. A site that became a job counts as that job.
 * `pick` only when exactly one place is in range (or the nearest is clearly
 * nearer — under half the next one's distance); otherwise the ones in range,
 * nearest first, for a tap.
 */
export function matchPlace(here: Point, accuracyM: number | null | undefined, places: Place[]): { pick: Placed | null; near: Placed[] } {
  const r = nearRadius(accuracyM);
  const seen = new Set<string>();
  const near = places
    .map((p) => ({ ...p, dist_m: Math.round(distanceM(here, p)) }))
    .filter((p) => p.dist_m <= r)
    .sort((a, b) => a.dist_m - b.dist_m)
    // A site already made into a job is that job.
    .map((p) => (p.kind === "site" && p.job_id ? { ...p, kind: "job" as const, id: p.job_id } : p))
    .filter((p) => { const k = `${p.kind}:${p.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const pick = near.length === 1 || (near.length > 1 && near[0].dist_m * 2 < near[1].dist_m) ? near[0] : null;
  return { pick, near };
}

/** The saved picture's size: the long edge at most `max`, never enlarged. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}
export const PHOTO_MAX = 2048;
export const THUMB_MAX = 400;
export const VIDEO_MAX_SECONDS = 60;

export const TAGS = ["before", "during", "after", "issue"] as const;
export type Tag = (typeof TAGS)[number];
export const TAG_LABEL: Record<Tag, string> = { before: "Before", during: "During", after: "After", issue: "Issue" };

/** A shot's file name: "Site photo · Oct 15 2.31 PM.jpg" (Central time). */
export function shotName(takenAt: string, kind: "image" | "video", ext: string): string {
  const d = new Date(takenAt);
  const when = Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
    .replace(",", "").replace(":", ".");
  return `Site ${kind === "video" ? "video" : "photo"}${when ? ` · ${when}` : ""}.${ext}`;
}

/** A site's name to show: its own, else the street of its address, else its point. */
export function siteLabel(s: { name?: string | null; address?: string | null; lat: number; lng: number }): string {
  if (s.name?.trim()) return s.name.trim();
  const street = s.address?.split(",")[0]?.trim();
  return street || `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO_MIME = /^video\/(mp4|webm|quicktime)$/;
const IMAGE_MIME = /^image\/(jpeg|png|webp)$/;
export const MAX_CAPTURE_BYTES = 100 * 1024 * 1024;

export interface CaptureBody {
  client_id: string; kind: "image" | "video"; mime: string; size: number; thumb_size: number | null;
  taken_at: string; lat: number | null; lng: number | null; accuracy: number | null;
  job_id: string | null; section_id: string | null; site_id: string | null; tag: Tag | null; note: string | null;
}

/** What a shot's upload may say, or why not. */
export function cleanCapture(b: Record<string, unknown>, now = Date.now()): CaptureBody | string {
  const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
  const client_id = id(b.client_id);
  if (!client_id) return "A shot needs its id.";
  const mime = typeof b.mime === "string" ? b.mime.toLowerCase() : "";
  const kind = VIDEO_MIME.test(mime.split(";")[0]) ? "video" : IMAGE_MIME.test(mime) ? "image" : null;
  if (!kind) return "Only photos (JPEG, PNG, WebP) and videos (MP4, WebM, MOV).";
  const size = Number(b.size);
  if (!(size > 0)) return "Empty file.";
  if (size > MAX_CAPTURE_BYTES) return "That file is over 100 MB.";
  const ts = Number(b.thumb_size);
  const thumb_size = ts > 0 && ts <= 2 * 1024 * 1024 ? Math.round(ts) : null;
  const t = new Date(typeof b.taken_at === "string" ? b.taken_at : NaN);
  // A phone's clock can be off; a time in the future or over a year old is the upload's time.
  const taken_at = !Number.isNaN(t.getTime()) && t.getTime() <= now + 5 * 60_000 && t.getTime() > now - 366 * 86_400_000 ? t.toISOString() : new Date(now).toISOString();
  const lat = Number(b.lat), lng = Number(b.lng);
  const point = b.lat != null && b.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const acc = Number(b.accuracy);
  const tag = (TAGS as readonly string[]).includes(String(b.tag)) ? (b.tag as Tag) : null;
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null;
  return {
    client_id, kind, mime: mime.split(";")[0], size: Math.round(size), thumb_size, taken_at,
    lat: point ? lat : null, lng: point ? lng : null, accuracy: point && acc > 0 && acc < 100_000 ? Math.round(acc) : null,
    job_id: id(b.job_id), section_id: id(b.section_id), site_id: id(b.site_id), tag, note,
  };
}

export function extFor(mime: string): string {
  return mime === "video/webm" ? "webm" : mime === "video/quicktime" ? "mov" : mime === "video/mp4" ? "mp4" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}
