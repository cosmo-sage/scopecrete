/**
 * Who may open what (migration 081; Coy, 2026-10-05: onsite estimators who
 * "upload photos and plans and take measurements" — access to specific jobs
 * and pages, set up as a vendor first). Pure — tested in tests/access.test.mjs.
 *
 * The database is the lock: an estimator ('field') reads only their jobs and
 * the pages below under RLS. This module only decides what the app SHOWS, so
 * nobody is offered a page that would come back empty.
 */

/** The pages an owner can give an estimator. The job page itself (its areas) always comes with a job. */
export const FIELD_PAGES = [
  { k: "files", label: "Photos & files", note: "See and add photos, plans and files on their jobs" },
  { k: "plan_room", label: "Takeoffs", note: "Plan sheets, scales and takeoff measurements" },
  { k: "budget", label: "Budget", note: "The job's budget, with costs and margins, and the Price book to pick from" },
] as const;
export type FieldPage = (typeof FIELD_PAGES)[number]["k"];

export const ROLES = [
  { k: "owner", label: "Owner", note: "Everything, and runs the organisation" },
  { k: "member", label: "Member", note: "Sees and does everything except organisation settings" },
  { k: "field", label: "Onsite estimator", note: "Only the jobs and pages you pick — must be a vendor first" },
] as const;
export const roleLabel = (r: string | null | undefined) => ROLES.find((x) => x.k === r)?.label ?? (r === "billing" ? "Billing" : r ?? "");

export interface Access {
  /** True for an onsite estimator — limited to `pages` on `job_ids` (or every job). */
  limited: boolean;
  pages: string[];
  all_jobs: boolean;
  job_ids: string[];
}
export const FULL_ACCESS: Access = { limited: false, pages: [], all_jobs: true, job_ids: [] };

export function accessFrom(row: { role?: string | null; pages?: string[] | null; all_jobs?: boolean | null; job_ids?: string[] | null } | null | undefined): Access {
  if (!row || row.role !== "field") return FULL_ACCESS;
  const known = new Set<string>(FIELD_PAGES.map((p) => p.k));
  return { limited: true, pages: (row.pages ?? []).filter((p) => known.has(p)), all_jobs: !!row.all_jobs, job_ids: row.job_ids ?? [] };
}

export const can = (a: Access, page: FieldPage) => !a.limited || a.pages.includes(page);

/** Menu pages (src/lib/v34/pages.ts keys) an estimator sees: Jobs, and Files when given. */
export function menuPages(a: Access): string[] | null {
  if (!a.limited) return null;
  return ["scope", ...(a.pages.includes("files") ? ["files"] : []), "roadmap"];
}

/**
 * Where an estimator lands if they open a page they don't have: the Jobs
 * board. Null when the path is fine (or they aren't limited).
 */
export function redirectFor(a: Access, path: string): string | null {
  if (!a.limited) return null;
  const p = path.replace(/\/+$/, "");
  if (p === "/dashboard/scope") return null;
  // The Roadmap is the platform's, not the org's: feedback and votes from anyone signed in (084).
  if (p === "/dashboard/roadmap") return null;
  if (p === "/dashboard/files") return a.pages.includes("files") ? null : "/dashboard/scope";
  const job = /^\/dashboard\/scope\/([0-9a-f-]{36})(?:\/(plans|proposal|summary))?$/.exec(p);
  if (job) {
    if (!a.all_jobs && !a.job_ids.includes(job[1])) return "/dashboard/scope";
    // The summary carries the job's money and its customer — never an estimator's (2026-10-05).
    if (job[2] === "proposal" || job[2] === "summary") return `/dashboard/scope/${job[1]}`;
    if (job[2] === "plans" && !a.pages.includes("plan_room")) return `/dashboard/scope/${job[1]}`;
    return null;
  }
  return "/dashboard/scope";
}

/** One line describing an estimator's access, for Settings → People. */
export function accessSummary(a: { pages: string[]; all_jobs: boolean; job_ids: string[] }): string {
  const pages = FIELD_PAGES.filter((p) => a.pages.includes(p.k)).map((p) => p.label);
  const jobs = a.all_jobs ? "every job" : a.job_ids.length === 1 ? "1 job" : `${a.job_ids.length} jobs`;
  return `${jobs} · ${pages.length ? pages.join(", ") : "the job page only"}`;
}

/** An access request from the browser, cleaned: a known role, known pages, uuid jobs. Pure. */
export function readAccess(b: unknown): { role: string | null; contact_id: string | null; pages: string[]; all_jobs: boolean; job_ids: string[] } {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const role = typeof o.role === "string" && ROLES.some((r) => r.k === o.role) ? o.role : null;
  const known = new Set<string>(FIELD_PAGES.map((p) => p.k));
  const pages = Array.isArray(o.pages) ? [...new Set(o.pages.filter((p): p is string => typeof p === "string" && known.has(p)))] : [];
  const job_ids = Array.isArray(o.job_ids) ? [...new Set(o.job_ids.filter((j): j is string => typeof j === "string" && uuid.test(j)))].slice(0, 500) : [];
  const contact_id = typeof o.contact_id === "string" && uuid.test(o.contact_id) ? o.contact_id : null;
  return { role, contact_id, pages, all_jobs: o.all_jobs === true, job_ids };
}
