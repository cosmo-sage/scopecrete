/**
 * View as a teammate (Coy, 2026-10-12: "a button … that lets me view the dashboard as that user
 * to make sure that what they're viewing is what I want them to be able to view … like JobTread").
 *
 * An owner's preview, not a sign-in as them: the cookie names who is being looked at, and
 * /api/session/me answers with THEIR role and access (only when the caller is an owner of the
 * org and they are a member of it — access-server's viewAsFor), so the menus, the pages they
 * may open and the job lists follow. The data still comes through the owner's own session
 * under RLS. Nothing can be changed while the cookie is on: getApiSession refuses every write
 * but switching back (writeBlocked). Pure — tested in tests/view-as.test.mjs.
 */
export const VIEW_AS_COOKIE = "sc_view_as";
/** Eight hours: a forgotten preview ends by itself. */
export const VIEW_AS_MAX_AGE = 60 * 60 * 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The user id in the cookie, or null when there is none or it isn't an id. */
export function readViewAs(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return UUID.test(s) ? s.toLowerCase() : null;
}

/** Writes allowed while viewing: switching back, and the owner's own display preferences. */
const OPEN = ["/api/view-as", "/api/prefs"];

/** True when this request must be refused because a preview is on. Reads are always fine. */
export function writeBlocked(method: string, path: string, viewing: boolean): boolean {
  if (!viewing) return false;
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  const p = path.replace(/\/+$/, "");
  return !OPEN.some((o) => p === o || p.startsWith(`${o}/`));
}

/** The banner's words: "Viewing as Jeremy Wright · Onsite estimator". */
export function viewAsLine(name: string | null | undefined, roleLabel: string): string {
  const who = (name ?? "").trim() || "a teammate";
  return `Viewing as ${who}${roleLabel ? ` · ${roleLabel}` : ""}`;
}

/** Keep only the listed jobs (an estimator given some jobs); every job when not limited or all_jobs. */
export function jobsFor<T extends { id: string }>(rows: T[], a: { limited: boolean; all_jobs: boolean; job_ids: string[] } | null): T[] {
  if (!a || !a.limited || a.all_jobs) return rows;
  const ok = new Set(a.job_ids);
  return rows.filter((r) => ok.has(r.id));
}
