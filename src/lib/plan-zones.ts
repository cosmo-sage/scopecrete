/**
 * Find zones — Dusty looks at a sheet and points at each paving zone (Coy, 2026-10-15: "dusty is
 * smart enough to know what sheet i need to find to measure the different thicknesses. But not
 * smart enough to measure himself?").
 *
 * Two parts, each doing what it is good at:
 *  - a vision model is shown the whole sheet and its printed words, matches each hatch to its
 *    legend entry (5" light duty, 6" standard duty …) and points at a spot inside every zone, with
 *    a rough outline;
 *  - Fill (src/lib/plan-fill.ts) traces the real outline round each spot off the PDF, because a
 *    model can say which area is which but can't draw an exact edge. Where Fill can't close an
 *    outline, or what it closes is nothing like the zone, the model's rough outline is shown,
 *    marked rough.
 * Every zone is a draft — Dusty's estimate — until Coy keeps it; nothing is saved before that.
 * Points travel as thousandths of the sheet's width and height (0–1000), so the image's size
 * doesn't matter. Pure functions, tested in tests/plan-zones.test.mjs.
 */
import { polygonArea, pointInPolygon, type Pt } from "./takeoff.ts";

export const ZONES_SYSTEM = `You read construction plan sheets for a concrete contractor. You are shown one whole sheet as an image (and the words printed on it, when it has a text layer).

Find the concrete paving or slab ZONES that the sheet's legend tells apart — usually by thickness (5" light duty, 6" standard duty, 7" heavy duty …) or by type (sidewalk, curb pad, dumpster pad). Match each legend entry's hatch or shading to the places it is drawn on the plan.

Return ONLY JSON:
{
  "legend": [ { "key": "A", "label": "Light duty concrete pavement", "thickness_in": 5, "pattern": "sparse dot stipple" } ],
  "zones": [ { "legend": "A", "seed": [x, y], "outline": [[x, y], ...], "confidence": "high" | "medium" | "low", "note": "north drive aisle" } ],
  "notes": "anything Coy should check"
}

Rules:
- Coordinates are in thousandths of the image: x from 0 (left edge) to 1000 (right edge), y from 0 (top) to 1000 (bottom).
- One zone per separate patch of a pattern. A patch split by a building, an island or another pattern is two zones.
- "seed" is a point well INSIDE the patch, away from its edges, joint lines, text and symbols — the middle of an open stretch of the hatch.
- "outline" is a rough polygon round the patch, 4 to 24 corners, following its edge as best you can.
- Use only legend entries that are printed on the sheet. thickness_in only as printed (a number of inches), else null.
- Leave out the legend's own sample boxes, the title block, details, sections and the key map.
- Areas that are asphalt, landscape, building or anything not concrete are not zones.
- If you can't match a pattern to the drawing with any confidence, say so in notes and leave it out. Never invent a zone.`;

export interface ZoneLegend { key: string; label: string; thickness_in: number | null; pattern: string | null }
export interface ZoneGuess { legend: string; seed: Pt; outline: Pt[]; confidence: "high" | "medium" | "low"; note: string | null }
export interface ZonesRead { legend: ZoneLegend[]; zones: ZoneGuess[]; notes: string | null }

const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
const coord = (v: unknown): Pt | null => {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = Number(v[0]), y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 1000 || y > 1000) return null;
  return [x, y];
};

/** What the model said, kept only where it is the shape asked for: legend entries with a name,
 *  zones on a known entry with a seed inside the sheet. Points stay in thousandths. */
export function cleanZones(raw: unknown): ZonesRead | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const legend: ZoneLegend[] = [];
  for (const l of Array.isArray(r.legend) ? r.legend.slice(0, 12) : []) {
    const o = (l ?? {}) as Record<string, unknown>;
    const key = str(o.key, 12), label = str(o.label, 120);
    if (!key || !label || legend.some((x) => x.key === key)) continue;
    const t = Number(o.thickness_in);
    legend.push({ key, label, thickness_in: Number.isFinite(t) && t > 0 && t <= 48 ? Math.round(t * 100) / 100 : null, pattern: str(o.pattern, 80) });
  }
  const keys = new Set(legend.map((l) => l.key));
  const zones: ZoneGuess[] = [];
  for (const z of Array.isArray(r.zones) ? r.zones.slice(0, 60) : []) {
    const o = (z ?? {}) as Record<string, unknown>;
    const lg = str(o.legend, 12), seed = coord(o.seed);
    if (!lg || !keys.has(lg) || !seed) continue;
    const outline = (Array.isArray(o.outline) ? o.outline.slice(0, 40) : []).map(coord).filter((p): p is Pt => !!p);
    const c = o.confidence === "high" || o.confidence === "low" ? o.confidence : "medium";
    zones.push({ legend: lg, seed, outline: outline.length >= 3 ? outline : [], confidence: c, note: str(o.note, 120) });
  }
  if (!legend.length && !zones.length && !str(r.notes, 10)) return null;
  return { legend, zones, notes: str(r.notes, 600) };
}

/** Thousandths of the sheet → the sheet's own points (y down, as Takeoffs draws). */
export const toPage = (p: Pt, w: number, h: number): Pt => [(p[0] / 1000) * w, (p[1] / 1000) * h];

/** Spots to try a trace from: the seed, then a ring round it, in case the seed sits on a hatch
 *  line or a joint (Fill says "that's on a line"). `step` is in page points. */
export function seedTries(seed: Pt, step: number): Pt[] {
  const out: Pt[] = [seed];
  for (const k of [1, 2]) for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    out.push([seed[0] + Math.cos(t) * step * k, seed[1] + Math.sin(t) * step * k]);
  }
  return out;
}

export type TraceVerdict = "traced" | "rough";

/**
 * Is what Fill traced the zone? With no rough outline to compare, anything over a sliver is.
 * With one, the traced area must be within a factor of the rough one (the model's edges are
 * loose, so it's generous) — a trace that stopped at a hatch line, or ran out over the whole lot,
 * isn't the zone, and the rough outline stands in.
 */
export function judgeTrace(traced: Pt[] | null, rough: Pt[], minArea: number): TraceVerdict | null {
  const t = traced && traced.length >= 3 ? polygonArea(traced) : 0;
  const r = rough.length >= 3 ? polygonArea(rough) : 0;
  if (t >= minArea && (!r || (t >= r * 0.35 && t <= r * 2.8))) return "traced";
  return r >= minArea ? "rough" : null;
}

const centroid = (pts: Pt[]): Pt => {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
};

/** Two seeds that traced the same patch: keep the first. Same patch = each one's middle inside
 *  the other and areas within 10%. */
export function sameZone(a: Pt[], b: Pt[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  const aa = polygonArea(a), ab = polygonArea(b);
  if (!aa || !ab || Math.abs(aa - ab) / Math.max(aa, ab) > 0.1) return false;
  return pointInPolygon(centroid(a), b) && pointInPolygon(centroid(b), a);
}

/** The takeoff group a legend entry becomes: `5" Light duty concrete pavement`, its thickness
 *  as the group's depth. An existing area group whose name is the same (case and spacing aside),
 *  or starts with the same thickness and shares a word, is used instead of a new one. */
export function groupNameFor(l: ZoneLegend): string {
  const t = l.thickness_in;
  const lab = l.label.replace(/^\s*\d+(\.\d+)?\s*("|in\.?|inch(es)?)\s*(thick\s*)?/i, "").trim() || l.label;
  return (t ? `${t}" ${lab}` : lab).slice(0, 80);
}

export function matchGroup<G extends { id: string; name: string; kind: string; depth_in: number | null }>(l: ZoneLegend, groups: G[]): G | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9"]+/g, " ").trim();
  const want = norm(groupNameFor(l));
  const areas = groups.filter((g) => g.kind === "area");
  const exact = areas.find((g) => norm(g.name) === want);
  if (exact) return exact;
  if (l.thickness_in == null) return null;
  const words = new Set(norm(l.label).split(" ").filter((w) => w.length > 3 && !["concrete", "pavement", "thick"].includes(w)));
  return areas.find((g) => g.depth_in === l.thickness_in && norm(g.name).split(" ").some((w) => words.has(w))) ?? null;
}
