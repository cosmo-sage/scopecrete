/**
 * Questions pinned on a plan sheet (Coy, 2026-10-10: "If I want to ask Jeremy a question about
 * these sections I measured … I could tag him and the communications would be pulled into the
 * existing thread for that contact … could open and see the full drawing and zoom into the areas
 * of question"). Pure — tested in tests/plan-pins.test.mjs.
 *
 * No table of its own (first pass, no migration): a pin is an internal note (contact_notes) on the
 * person's own thread, with the job on it, whose last line is a link to the spot —
 *
 *   📍 AERIAL 2 · Curbs 2: @[Jeremy Wright](u:…) Is this curb 6" or 8"?
 *   Open on the sheet: /dashboard/scope/<job>/plans?step=takeoff&sheet=<sheet>&pin=412.5,388&z=3&m=<shape>
 *
 * The link is what puts the pin back on the sheet, opens the sheet zoomed to it, and what a tag's
 * notification (member_notifications, 081) carries to an onsite estimator who can't read the note.
 */

export interface PinSpot { job: string; sheet: string; x: number; y: number; z: number; m: string | null }

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LINK = new RegExp(`/dashboard/scope/(${UUID})/plans\\?step=takeoff&sheet=(${UUID})&pin=(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)(?:&z=(\\d+(?:\\.\\d+)?))?(?:&m=(${UUID}))?`, "i");
export const PIN_LEAD = "Open on the sheet: ";
export const PIN_MARK = "📍 ";

const round = (n: number) => Math.round(n * 10) / 10;
/** Zoom kept to the Takeoff's own range. */
export const pinZoom = (z: number | null | undefined) => (Number.isFinite(z) && (z as number) > 0 ? Math.min(8, Math.max(0.5, Math.round((z as number) * 100) / 100)) : 3);

/** The link to one spot on a sheet (relative to the org's own address). */
export function pinLink(s: PinSpot): string {
  return `/dashboard/scope/${s.job}/plans?step=takeoff&sheet=${s.sheet}&pin=${round(s.x)},${round(s.y)}&z=${pinZoom(s.z)}${s.m ? `&m=${s.m}` : ""}`;
}

/** The spot a note (or a link) points at, if any. */
export function readPin(text: string | null | undefined): PinSpot | null {
  const m = LINK.exec(text ?? "");
  if (!m) return null;
  const x = Number(m[3]), y = Number(m[4]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { job: m[1].toLowerCase(), sheet: m[2].toLowerCase(), x, y, z: pinZoom(m[5] ? Number(m[5]) : null), m: m[6]?.toLowerCase() ?? null };
}

/** The ?pin= of the page's own address ("412.5,388"), with its z and m. */
export function pinFromQuery(pin: string | null, z: string | null, m: string | null): { x: number; y: number; z: number; m: string | null } | null {
  const p = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(pin ?? "");
  if (!p) return null;
  return { x: Number(p[1]), y: Number(p[2]), z: pinZoom(z ? Number(z) : null), m: m && new RegExp(`^${UUID}$`, "i").test(m) ? m.toLowerCase() : null };
}

/** Two pins on the same spot (a reply) — within a couple of points. */
export const sameSpot = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

/** The note written on someone's thread. `tags` are mention tags (@[Name](u:id)) put before the words. */
export function pinNote(where: string, words: string, tags: string[], link: string): string {
  const w = words.replace(/\s+\n/g, "\n").trim();
  return `${PIN_MARK}${where.replace(/\s+/g, " ").trim().slice(0, 120)}: ${tags.length ? `${tags.join(" ")} ` : ""}${w}\n${PIN_LEAD}${link}`;
}

/** A pin note split for showing: the words (without the link line) and the spot. */
export function pinParts(body: string): { words: string; spot: PinSpot; where: string | null } | null {
  const spot = readPin(body);
  if (!spot) return null;
  const lines = body.split("\n").filter((l) => !l.startsWith(PIN_LEAD) && !LINK.test(l));
  let words = lines.join("\n").trim();
  let where: string | null = null;
  if (words.startsWith(PIN_MARK)) {
    const at = words.indexOf(": ");
    if (at > 0) { where = words.slice(PIN_MARK.length, at); words = words.slice(at + 2); }
  }
  return { words, spot, where };
}

/** The text sent to them by Quo: their name, the question as plain words, and the full link. */
export function pinText(first: string | null, where: string, plainWords: string, origin: string, link: string): string {
  const hi = first ? `Hi ${first}, ` : "";
  return `${hi}a question on ${where}: ${plainWords.trim()}\n${origin.replace(/\/$/, "")}${link}`;
}

/** Where the pin is, in words: the sheet, and the shape when it is on one. */
export const pinWhere = (sheet: string, shape: string | null) => (shape ? `${sheet} · ${shape}` : sheet);
