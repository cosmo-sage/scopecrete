/**
 * Feedback and the Roadmap (migration 084; Coy, 2026-10-05: "a place for
 * internal users and other orgs to give feedback … a pipeline page … where
 * people can see what features are recommended and then people can vote on
 * those recommended features and comment on them and see what's being worked
 * on similar to how JobTread does it"). Pure — tested in tests/roadmap.test.mjs.
 *
 * Platform data, the same for every org. Feedback lands as 'new' — seen only
 * by its writer and Coy — and goes on the board when Coy publishes it.
 */

export const STATUSES = [
  { k: "new", label: "New feedback", note: "Only you and the ScopeCrete team see this until it's published", public: false },
  { k: "considering", label: "Under consideration", note: "Vote for what you want most", public: true },
  { k: "planned", label: "Planned", note: "On the list to build", public: true },
  { k: "in_progress", label: "In progress", note: "Being built now", public: true },
  { k: "released", label: "Released", note: "In the app", public: true },
  { k: "declined", label: "Not planned", note: "Hidden from the board", public: false },
] as const;
export type RoadmapStatus = (typeof STATUSES)[number]["k"];
export const statusLabel = (s: string) => STATUSES.find((x) => x.k === s)?.label ?? s;
export const isPublic = (s: string) => STATUSES.some((x) => x.k === s && x.public);
/** Votes are for what isn't built yet. */
export const canVote = (s: string) => s === "considering" || s === "planned" || s === "in_progress";
/** The board's columns, left to right. */
export const BOARD: RoadmapStatus[] = ["considering", "planned", "in_progress", "released"];

export const KINDS = [
  { k: "idea", label: "Idea" },
  { k: "bug", label: "Something's wrong" },
  { k: "other", label: "Other" },
] as const;
export type RoadmapKind = (typeof KINDS)[number]["k"];

export interface RoadmapItem {
  id: string; title: string; body: string; kind: RoadmapKind; status: RoadmapStatus; admin_note: string | null;
  author_name: string | null; org_name: string | null; mine: boolean;
  votes: number; voted: boolean; comments: number;
  created_at: string; status_at: string; published_at: string | null;
  page: string | null; original_title: string | null; original_body: string | null;
}

export type RoadmapSort = "top" | "new";
export function sortItems<T extends Pick<RoadmapItem, "votes" | "status_at" | "created_at">>(items: T[], sort: RoadmapSort): T[] {
  const t = (s: string) => Date.parse(s) || 0;
  return [...items].sort((a, b) => sort === "top"
    ? b.votes - a.votes || t(b.status_at) - t(a.status_at)
    : t(b.created_at) - t(a.created_at));
}

export function matchesItem(i: Pick<RoadmapItem, "title" | "body" | "admin_note">, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${i.title} ${i.body} ${i.admin_note ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Feedback from the browser, cleaned. A title of 3+ characters (else the first line of the body). */
export function readFeedback(b: unknown):
  { ok: true; feedback: { title: string; body: string; kind: RoadmapKind; page: string | null } } | { ok: false; error: string } {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  let body = str(o.body, 4000);
  let title = str(o.title, 140);
  if (!title && body) {
    const first = body.split(/\n/)[0].trim();
    title = first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first;
    if (first === body) body = "";
  }
  if (title.length < 3) return { ok: false, error: "Say what it's about (3 characters or more)." };
  const kind = KINDS.some((k) => k.k === o.kind) ? (o.kind as RoadmapKind) : "idea";
  const page = str(o.page, 200);
  return { ok: true, feedback: { title, body, kind, page: page.startsWith("/") ? page : null } };
}

/** Coy's change to an item: a known status, a title, a body, a note. Undefined = leave it. */
export function readAdmin(b: unknown): { status?: RoadmapStatus; title?: string; body?: string; note?: string } {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const out: { status?: RoadmapStatus; title?: string; body?: string; note?: string } = {};
  if (typeof o.status === "string" && STATUSES.some((s) => s.k === o.status)) out.status = o.status as RoadmapStatus;
  if (typeof o.title === "string" && o.title.trim().length >= 3) out.title = o.title.trim().slice(0, 140);
  if (typeof o.body === "string") out.body = o.body.trim().slice(0, 4000);
  if (typeof o.note === "string") out.note = o.note.trim().slice(0, 1000);
  return out;
}

/** True when the error is the database saying 084 isn't applied yet. */
export function missing084(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "PGRST202" || e.code === "42883" ||
    (/sc_roadmap|sc_is_platform_admin/.test(e.message ?? "") && /not find|does not exist/i.test(e.message ?? ""));
}
