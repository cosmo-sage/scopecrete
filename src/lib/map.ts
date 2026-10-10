/**
 * The Map page (Claude Design 11, design/map: "every job, lead, customer and
 * vendor as a pin; clip satellite into the Plan Room"). Pure — no imports from
 * the app — so tests/map.test.mjs runs it under node --test.
 *
 * Pins are worked out from what is already stored: a job's layer from its
 * status (src/lib/jobs/stages.ts) and whether a proposal link was sent; a
 * vendor is always the vendor layer. Nothing about a layer is stored.
 */

export type LayerId = "active" | "lead" | "est" | "sent" | "bid" | "done" | "lost" | "vendor";

export interface MapLayer { id: LayerId; label: string; sub: string; color: string; defaultOn: boolean; square?: boolean }

/** Colours are the theme's own (--sc-*), the bucket and stage colours already in use. */
export const LAYERS: MapLayer[] = [
  { id: "active", label: "Active jobs", sub: "Won, scheduled, in progress", color: "var(--sc-green)", defaultOn: true },
  { id: "lead", label: "New leads", sub: "New lead · Consultation", color: "var(--sc-hiviz-soft)", defaultOn: true },
  { id: "est", label: "Estimating / Follow up", sub: "Being priced, or priced and waiting", color: "var(--sc-work-dot-reply)", defaultOn: true },
  { id: "sent", label: "Proposals sent", sub: "Opened or not opened", color: "var(--sc-violet)", defaultOn: true },
  { id: "bid", label: "Bid invites", sub: "Commercial bids, with the due date", color: "var(--sc-teal)", defaultOn: true },
  { id: "done", label: "Complete", sub: "Finished jobs", color: "var(--sc-ink3)", defaultOn: false },
  { id: "lost", label: "Lost customers", sub: "Jobs marked lost", color: "var(--sc-red)", defaultOn: false },
  { id: "vendor", label: "Vendors", sub: "Suppliers, subs, equipment", color: "var(--sc-chalk)", defaultOn: true, square: true },
];
export const LAYER = new Map(LAYERS.map((l) => [l.id, l]));

/** A job's layer: its status, and a proposal sent moves Estimating / Follow up to "Proposals sent". */
export function layerForJob(status: string | null | undefined, proposalSent: boolean): LayerId {
  switch (status) {
    case "won": case "scheduled": case "in_progress": return "active";
    case "invited": return "bid";
    case "scoping": case "quoted": return proposalSent ? "sent" : "est";
    case "complete": case "closed": return "done";
    case "lost": return "lost";
    default: return "lead"; // lead, consultation, unknown
  }
}

export interface MapPin {
  id: string;
  kind: "job" | "vendor";
  layer: LayerId;
  lat: number; lng: number;
  name: string;
  addr: string;
  city?: string | null;
  // job
  customer?: string | null;
  customerId?: string | null;
  type?: string | null;          // residential | commercial | public
  stage?: string;                // display label
  note?: string | null;          // "Opened 3 times", "Due in 36 h"
  urgent?: boolean;
  createdAt?: string | null;
  phone?: string | null;
  // vendor
  vendorKind?: string | null;
  email?: string | null;
  deliverLabel?: string | null;
}

/** A job for the clip's "Which job?" list — every open job, with its point when it has one. */
export interface PickJob { id: string; title: string; customer: string | null; addr: string | null; stage: string; lat: number | null; lng: number | null }

export interface MapPinsResponse {
  pins: MapPin[];
  jobs: PickJob[];
  unmapped: { customers: number; jobs: number; vendors: number; notFound: number };
  /** False until migration 090 is applied: points are looked up on each visit and not kept. */
  stored: boolean;
}

export type Created = "any" | "30d" | "90d" | "1y";
export interface MapFilters { layers: LayerId[]; jobTypes: string[]; city: string; created: Created }
export const DEFAULT_FILTERS: MapFilters = { layers: LAYERS.filter((l) => l.defaultOn).map((l) => l.id), jobTypes: [], city: "", created: "any" };

/** A saved filter (localStorage), made whole: unknown layers and types dropped. */
export function cleanFilters(f: unknown): MapFilters {
  const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
  const ids = new Set<string>(LAYERS.map((l) => l.id));
  const layers = Array.isArray(o.layers) ? (o.layers as unknown[]).filter((x): x is LayerId => typeof x === "string" && ids.has(x)) : DEFAULT_FILTERS.layers;
  const jobTypes = Array.isArray(o.jobTypes) ? (o.jobTypes as unknown[]).filter((x): x is string => x === "residential" || x === "commercial" || x === "public") : [];
  const created = o.created === "30d" || o.created === "90d" || o.created === "1y" ? o.created : "any";
  return { layers: [...new Set(layers)], jobTypes, city: typeof o.city === "string" ? o.city.slice(0, 80) : "", created };
}

const DAYS: Record<Created, number> = { any: 0, "30d": 30, "90d": 90, "1y": 365 };

/** Which pins show. Job type, city and created date filter jobs; vendors follow only their layer. */
export function visiblePins(pins: MapPin[], f: MapFilters, now = Date.now()): MapPin[] {
  const on = new Set(f.layers);
  const city = f.city.trim().toLowerCase();
  const since = DAYS[f.created] ? now - DAYS[f.created] * 86_400_000 : 0;
  return pins.filter((p) => {
    if (!on.has(p.layer)) return false;
    if (p.kind === "vendor") return true;
    if (f.jobTypes.length && !f.jobTypes.includes(p.type ?? "")) return false;
    if (city && (p.city ?? "").trim().toLowerCase() !== city) return false;
    if (since && (!p.createdAt || Date.parse(p.createdAt) < since)) return false;
    return true;
  });
}

/** A count per layer, after the job filters (so the switch says what turning it on would add). */
export function layerCounts(pins: MapPin[], f: MapFilters, now = Date.now()): Record<LayerId, number> {
  const all = visiblePins(pins, { ...f, layers: LAYERS.map((l) => l.id) }, now);
  const out = Object.fromEntries(LAYERS.map((l) => [l.id, 0])) as Record<LayerId, number>;
  for (const p of all) out[p.layer]++;
  return out;
}

/** The cities jobs are in, most jobs first. */
export function cities(pins: MapPin[]): string[] {
  const n = new Map<string, number>();
  for (const p of pins) if (p.kind === "job" && p.city?.trim()) n.set(p.city.trim(), (n.get(p.city.trim()) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/* ---------------------------------------------------------- map maths */

export const TILE = 256;
export function worldPx(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export function fromWorldPx(x: number, y: number, z: number): { lat: number; lng: number } {
  const n = TILE * 2 ** z;
  return { lng: (x / n) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI };
}

/** Feet on the ground per screen pixel at this latitude and (fractional) zoom. */
export function feetPerPixel(lat: number, zoom: number): number {
  return ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom) * 3.280839895;
}
/** "1 in ≈ 41 ft · zoom 20" — 96 CSS px to the inch. */
export function scaleReadout(lat: number, zoom: number): string {
  return `1 in ≈ ${Math.round(feetPerPixel(lat, zoom) * 96)} ft · zoom ${Math.round(zoom * 4) / 4}`;
}

/** Miles between two points (haversine). */
export function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 3958.8, k = Math.PI / 180;
  const dl = (b.lat - a.lat) * k, dg = (b.lng - a.lng) * k;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dg / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** "at this spot" under ~150 ft, else "0.1 mi". */
export function distanceLabel(mi: number): string {
  if (mi < 0.03) return "at this spot";
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** The clip's job list: nearest first, jobs with no point after them by name. */
export function nearestJobs(jobs: PickJob[], at: { lat: number; lng: number }): Array<PickJob & { mi: number | null }> {
  return jobs
    .map((j) => ({ ...j, mi: j.lat != null && j.lng != null ? miles(at, { lat: j.lat, lng: j.lng }) : null }))
    .sort((a, b) => (a.mi == null ? 1 : 0) - (b.mi == null ? 1 : 0) || (a.mi ?? 0) - (b.mi ?? 0) || a.title.localeCompare(b.title));
}

/* -------------------------------------------------------- clustering */

export interface Cluster { key: string; x: number; y: number; pins: MapPin[] }

/**
 * Below zoom 11 nearby pins fold into one circle with a count (64-px cells in
 * world pixels at that zoom, so a cell doesn't jump as the map pans). At 11 and
 * over every pin is its own.
 */
export function clusterPins(pins: MapPin[], zoom: number, cell = 64): Cluster[] {
  const z = Math.round(zoom);
  if (zoom >= 11) return pins.map((p) => { const w = worldPx(p.lat, p.lng, zoom); return { key: `${p.kind}:${p.id}`, x: w.x, y: w.y, pins: [p] }; });
  const cells = new Map<string, MapPin[]>();
  for (const p of pins) {
    const w = worldPx(p.lat, p.lng, z);
    const k = `${Math.floor(w.x / cell)}:${Math.floor(w.y / cell)}`;
    const l = cells.get(k);
    if (l) l.push(p); else cells.set(k, [p]);
  }
  return [...cells.entries()].map(([k, l]) => {
    let x = 0, y = 0;
    for (const p of l) { const w = worldPx(p.lat, p.lng, zoom); x += w.x; y += w.y; }
    return { key: l.length === 1 ? `${l[0].kind}:${l[0].id}` : `c${z}:${k}`, x: x / l.length, y: y / l.length, pins: l };
  });
}

/** A cluster's circle: 30 + 3 px a pin, up to 8. */
export const clusterSize = (n: number) => 30 + Math.min(n, 8) * 3;

/* ------------------------------------------------------------ the clip */

/** The sheet the clip becomes is a drawing (longest side ≥ 1,150 pt, isDrawing()) and no bigger than this. */
export const CLIP_MIN = 1150;
export const CLIP_MAX = 2560;
export const CLIP_MIN_ZOOM = 16;
export const CLIP_MAX_ZOOM = 22;

/**
 * The whole zoom a frame is saved at, and its size in that zoom's tile pixels
 * (= sheet points). Starts at the zoom on screen rounded up (never less sharp
 * than what Coy sees), goes closer while the sheet would be smaller than a
 * drawing, back out while it is over CLIP_MAX, and if it is still under a
 * drawing at the closest zoom, takes more ground around the same centre.
 * Null when the map is too far out to clip (under zoom 16 on screen).
 */
export function clipPlan(frameW: number, frameH: number, zoom: number): { z: number; w: number; h: number } | null {
  if (!(frameW > 0 && frameH > 0) || zoom < CLIP_MIN_ZOOM - 1e-6) return null;
  let z = Math.max(CLIP_MIN_ZOOM, Math.min(CLIP_MAX_ZOOM, Math.ceil(zoom - 1e-6)));
  const size = (zz: number) => ({ w: frameW * 2 ** (zz - zoom), h: frameH * 2 ** (zz - zoom) });
  while (Math.max(size(z).w, size(z).h) < CLIP_MIN && z < CLIP_MAX_ZOOM) z++;
  while (Math.max(size(z).w, size(z).h) > CLIP_MAX && z > CLIP_MIN_ZOOM) z--;
  let { w, h } = size(z);
  const long = Math.max(w, h);
  if (long < CLIP_MIN) { w *= CLIP_MIN / long; h *= CLIP_MIN / long; }
  if (Math.max(w, h) > CLIP_MAX) { const k = CLIP_MAX / Math.max(w, h); w *= k; h *= k; }
  return { z, w: Math.round(w), h: Math.round(h) };
}

/** A clip's size from the browser, checked on the server. */
export function validClipSize(w: unknown, h: unknown): { w: number; h: number } | null {
  const a = Number(w), b = Number(h);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (a < 200 || b < 200 || a > CLIP_MAX || b > CLIP_MAX || Math.max(a, b) < CLIP_MIN) return null;
  return { w: a, h: b };
}

/** "Due in 36 h" / "Due 2 days ago" for a bid; urgent under 48 h. */
export function bidNote(dueIso: string | null | undefined, now = Date.now()): { note: string; urgent: boolean } | null {
  if (!dueIso) return null;
  const h = (Date.parse(dueIso) - now) / 3_600_000;
  if (!Number.isFinite(h)) return null;
  if (h < 0) return { note: "Bid due date passed", urgent: false };
  return { note: h < 48 ? `Due in ${Math.max(1, Math.round(h))} h` : `Due in ${Math.round(h / 24)} days`, urgent: h < 48 };
}

/* ---------------------------------------------------------- the office (migration 098) */

/** The org's office and the radius it works in (Settings → Organisation → Office). */
export interface Office { address: string; lat: number; lng: number; radius_mi: number | null }

export const RADIUS_MAX_MI = 1000;

/** A radius typed in Settings: blank is none; otherwise over 0 and up to 1,000 miles, to a tenth. */
export function cleanRadius(v: unknown): { ok: true; mi: number | null } | { ok: false; error: string } {
  if (v == null || (typeof v === "string" && !v.trim())) return { ok: true, mi: null };
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").replace(/\s*(mi|miles?)\s*$/i, "").trim());
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "The radius is a number of miles over 0." };
  if (n > RADIUS_MAX_MI) return { ok: false, error: `The radius is at most ${RADIUS_MAX_MI.toLocaleString()} miles.` };
  return { ok: true, mi: Math.round(n * 10) / 10 };
}

/** A row from org_office as the app reads it, or null when it isn't a whole one. */
export function readOffice(row: unknown): Office | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.lat == null || r.lng == null) return null;
  const lat = Number(r.lat), lng = Number(r.lng);
  if (typeof r.address !== "string" || !r.address.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rad = r.radius_mi == null ? null : Number(r.radius_mi);
  return { address: r.address.trim(), lat, lng, radius_mi: rad != null && Number.isFinite(rad) && rad > 0 ? rad : null };
}

/** The four points due north, south, east and west of the office at the radius — fitView() fits the ring through them. */
export function ringPoints(o: { lat: number; lng: number }, mi: number): Array<{ lat: number; lng: number }> {
  const dLat = mi / 69.0;
  const dLng = mi / (69.17 * Math.max(0.01, Math.cos((o.lat * Math.PI) / 180)));
  return [{ lat: o.lat + dLat, lng: o.lng }, { lat: o.lat - dLat, lng: o.lng }, { lat: o.lat, lng: o.lng + dLng }, { lat: o.lat, lng: o.lng - dLng }];
}

/** The ring's radius in screen pixels at this zoom (Web Mercator's scale at the office's latitude). */
export function ringPx(o: { lat: number }, mi: number, zoom: number): number {
  return (mi * 5280) / feetPerPixel(o.lat, zoom);
}

/** "80 mi" / "12.5 mi". */
export const radiusLabel = (mi: number) => `${Number.isInteger(mi) ? mi.toLocaleString() : mi.toFixed(1)} mi`;
