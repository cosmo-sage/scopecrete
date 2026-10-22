/**
 * Work Space icons drawn by Dusty (Coy, 2026-10-21: "generating custom space icons/images for new
 * and existing spaces in the rail" — he picked the mockup's option 1, a small flat SVG per Space).
 * The rail's key names the Space; the model gets a few plain facts about it and answers with one
 * SVG, which goes through Dusty's drawing filter (src/lib/dusty/drawing.ts) before it is kept and
 * again before it is drawn. Pure — tests/space-icons.test.mjs runs it.
 */

import { parseDrawing, drawingSvg } from "./dusty/drawing.ts";

export type IconKind = "job" | "customer" | "vendor" | "col";
export interface SpaceIconRow { key: string; source: "dusty" | "shape"; svg: string | null; about: string | null }

const KEY = /^(job|customer|vendor|col):([0-9a-f-]{36})$/i;

/** "job:<uuid>" → { kind, id }, else null. */
export function readKey(key: unknown): { kind: IconKind; id: string } | null {
  const m = typeof key === "string" ? key.trim().match(KEY) : null;
  return m ? { kind: m[1].toLowerCase() as IconKind, id: m[2].toLowerCase() } : null;
}

export const ICON_SYSTEM = `You draw app icons for a concrete contractor's software. Each icon stands for one "Work Space" on the app's side rail: a job, a customer, a vendor or a folder the contractor made.

Draw ONE flat, bold icon that says what the Space is about at a glance — its trade, its kind of work or its place (a road for a paving company, a trowel for a finishing crew, a house and driveway for a home driveway job, parking stalls for a parking lot, a shield for a military base).

Rules:
- Square SVG, viewBox="0 0 64 64". First element: a full-size rounded background, <rect width="64" height="64" rx="14" fill="..."/>.
- 3 to 12 simple shapes: rect, circle, ellipse, line, polyline, polygon, path, g. Flat fills, 2 to 4 colours, strokes 2 to 3.5 wide. No gradients, filters, images, links, styles or scripts.
- It must read at 32 px: one big subject, filling most of the square, nothing thin or tiny.
- No words. At most one or two capital letters only when the subject is a sign (a P for parking).
- Pick colours that suit the subject; the background a solid colour, not white.
- Never draw a person's face, a real company's logo or trademark.

Answer with JSON only: {"about": "<4 to 8 words on what you drew>", "svg": "<svg ...>...</svg>"}`;

/** The facts the model gets — plain words, no ids, phone numbers or addresses. */
export function iconPrompt(kind: IconKind, f: { name: string; detail?: string[] }): string {
  const what = kind === "job" ? "a job" : kind === "customer" ? "a customer" : kind === "vendor" ? "a vendor (a supplier or sub the contractor buys from)" : "a folder of people the contractor made";
  const lines = [`This Space is ${what}: "${clip(f.name, 120)}".`];
  for (const d of f.detail ?? []) if (d && d.trim()) lines.push(`- ${clip(d, 200)}`);
  return lines.join("\n");
}

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** The model's answer → the cleaned SVG to keep, or null when it isn't a usable icon. */
export function iconFromModel(json: unknown): { svg: string; about: string | null } | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { svg?: unknown; about?: unknown };
  if (typeof j.svg !== "string") return null;
  const d = parseDrawing(j.svg);
  if (!d) return null;
  const vb = d.root.attrs.viewBox.split(/[\s,]+/).map(Number);
  const [, , w, h] = vb;
  if (!(w > 0 && h > 0) || w / h > 1.25 || h / w > 1.25) return null;
  let shapes = 0;
  const walk = (n: (typeof d.root.kids)[number]) => { if (typeof n !== "string") { if (n.tag !== "g" && n.tag !== "tspan") shapes++; n.kids.forEach(walk); } };
  d.root.kids.forEach(walk);
  if (shapes < 1 || shapes > 80) return null;
  const svg = drawingSvg({ ...d, title: typeof j.about === "string" && j.about.trim() ? clip(j.about, 120) : "Work Space icon" });
  if (svg.length > 20000) return null;
  return { svg, about: typeof j.about === "string" && j.about.trim() ? clip(j.about, 200) : null };
}

/** Rows from the API into a map by key; anything odd left out. */
export function iconMap(rows: unknown): Map<string, SpaceIconRow> {
  const out = new Map<string, SpaceIconRow>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows as Array<Record<string, unknown>>) {
    const k = readKey(r?.key);
    if (!k || (r.source !== "dusty" && r.source !== "shape")) continue;
    const key = `${k.kind}:${k.id}`;
    out.set(key, { key, source: r.source, svg: typeof r.svg === "string" ? r.svg : null, about: typeof r.about === "string" ? r.about : null });
  }
  return out;
}

/** Which rail keys still want an icon drawn: not drawn, not set to the shape, not tried this visit. */
export function keysToDraw(keys: string[], icons: Map<string, SpaceIconRow>, tried: Set<string>, max = 2): string[] {
  const out: string[] = [];
  for (const raw of keys) {
    const k = readKey(raw);
    if (!k) continue;
    const key = `${k.kind}:${k.id}`;
    if (icons.has(key) || tried.has(key)) continue;
    out.push(key);
    if (out.length >= max) break;
  }
  return out;
}
