/**
 * Who may open what (migration 081; Coy, 2026-10-05: onsite estimators who
 * "upload photos and plans and take measurements" — access to specific jobs
 * and pages, set up as a vendor first; since 095 a customer's contact too). Pure — tested in tests/access.test.mjs.
 *
 * The database is the lock: an estimator ('field') reads only their jobs and
 * the pages below under RLS. This module only decides what the app SHOWS, so
 * nobody is offered a page that would come back empty.
 */

/**
 * The pages an owner can give an estimator. `group` "job" is what they see inside their jobs
 * (081); "page" the menu's own pages and "dusty" Dusty (120 — Coy, 2026-10-22: "allow selections
 * for Jobs, Customers, Contacts, Vendors, and allow/deny access to Dusty"). Customers, Contacts and
 * Vendors are read only.
 */
export const FIELD_PAGES = [
  { k: "jobs", group: "page", label: "Jobs", note: "The Jobs board and their jobs' pages" },
  { k: "customers", group: "page", label: "Customers", note: "Every customer and its people — names, numbers, address. Read only; not their texts or calls" },
  { k: "contacts", group: "page", label: "Contacts", note: "The contacts book — everyone's numbers and emails. Read only" },
  { k: "vendors", group: "page", label: "Vendors", note: "Every vendor and their prices on file. Read only" },
  { k: "files", group: "job", label: "Photos & files", note: "See and add photos, plans and files on their jobs" },
  { k: "plan_room", group: "job", label: "Takeoffs", note: "Plan sheets, scales and takeoff measurements" },
  { k: "budget", group: "job", label: "Budget", note: "The job's budget, with costs and margins, and the Price book to pick from" },
  { k: "dusty", group: "dusty", label: "Dusty", note: "Chat with Dusty. He sees only what these pages let them see" },
] as const;
/** Pages migration 120 added; before it the database refuses them. */
export const PAGES_120 = ["jobs", "customers", "contacts", "vendors", "dusty"];
/**
 * The pages that are somewhere to land besides Jobs. Files isn't one: it existed before 120, when
 * Jobs was always on, so an estimator with Files and no "jobs" saved is one set up before it.
 */
const LANDINGS = [["customers", "/dashboard/customers"], ["contacts", "/dashboard/contacts"], ["vendors", "/dashboard/vendors"]] as const;
/**
 * Jobs shows when ticked — and whenever there is nowhere else to land (an estimator with no
 * Customers, Contacts or Vendors), which also covers everyone set up before 120.
 */
export const jobsOn = (pages: string[]) => pages.includes("jobs") || !LANDINGS.some(([k]) => pages.includes(k));
/** Where an estimator starts: the Jobs board, else the first page they have. */
export function homeFor(a: Access): string {
  if (!a.limited || jobsOn(a.pages)) return "/dashboard/scope";
  return LANDINGS.find(([k]) => a.pages.includes(k))?.[1] ?? (a.pages.includes("files") ? "/dashboard/files" : "/dashboard/scope");
}
export type FieldPage = (typeof FIELD_PAGES)[number]["k"];

export const ROLES = [
  { k: "owner", label: "Owner", note: "Everything, and runs the organization" },
  { k: "member", label: "Member", note: "Sees and does everything except organization settings" },
  { k: "field", label: "Onsite estimator", note: "Only the jobs and pages you pick — a vendor or a customer's contact" },
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

export const can = (a: Access, page: FieldPage) => !a.limited || (page === "jobs" ? jobsOn(a.pages) : a.pages.includes(page));

/** Menu pages (src/lib/v34/pages.ts keys) an estimator sees, in the rail's order; "dusty" puts him in the footer. */
export function menuPages(a: Access): string[] | null {
  if (!a.limited) return null;
  const has = (k: string) => a.pages.includes(k);
  return [
    ...(jobsOn(a.pages) ? ["scope"] : []), ...(has("customers") ? ["customers"] : []),
    ...(has("dusty") ? ["dusty"] : []),
    ...(has("contacts") ? ["contacts"] : []), ...(has("vendors") ? ["vendors"] : []),
    ...(has("files") ? ["files"] : []), "roadmap",
  ];
}

/**
 * Where an estimator lands if they open a page they don't have: the Jobs
 * board. Null when the path is fine (or they aren't limited).
 */
export function redirectFor(a: Access, path: string): string | null {
  if (!a.limited) return null;
  const p = path.replace(/\/+$/, "");
  const home = homeFor(a);
  if (p === "/dashboard/scope") return jobsOn(a.pages) ? null : home;
  // Customers, Contacts and Vendors (120), read only: the lists and a record's page.
  const uuidTail = /^\/[0-9a-f-]{36}$/;
  for (const [k, base] of [["customers", "/dashboard/customers"], ["contacts", "/dashboard/contacts"], ["vendors", "/dashboard/vendors"]] as const) {
    if (p === base || (p.startsWith(base) && uuidTail.test(p.slice(base.length)))) return a.pages.includes(k) ? null : home;
  }
  // The Roadmap is the platform's, not the org's: feedback and votes from anyone signed in (084).
  if (p === "/dashboard/roadmap") return null;
  // Settings (2026-10-10): their own details and the colors — the Settings sections marked
  // `field` in src/lib/v34/settings-sections.ts. Any other section goes back to Settings.
  if (p === "/dashboard/settings" || p === "/dashboard/settings/account" || p === "/dashboard/settings/appearance" || p === "/dashboard/settings/roadmap") return null;
  if (p.startsWith("/dashboard/settings/")) return "/dashboard/settings";
  if (p === "/dashboard/files") return a.pages.includes("files") ? null : home;
  const job = /^\/dashboard\/scope\/([0-9a-f-]{36})(?:\/(plans|files|proposal|summary|schedule|locations))?$/.exec(p);
  if (job) {
    if (!jobsOn(a.pages)) return home;
    if (!a.all_jobs && !a.job_ids.includes(job[1])) return "/dashboard/scope";
    // The summary carries the job's money and its customer — never an estimator's (2026-10-05).
    if (job[2] === "proposal" || job[2] === "summary" || job[2] === "schedule" || job[2] === "locations") return `/dashboard/scope/${job[1]}`;
    if ((job[2] === "plans" || job[2] === "files") && !a.pages.includes("plan_room")) return `/dashboard/scope/${job[1]}`;
    return null;
  }
  return home;
}

/** One line describing an estimator's access, for Settings → People. */
export function accessSummary(a: { pages: string[]; all_jobs: boolean; job_ids: string[] }): string {
  const inJob = FIELD_PAGES.filter((p) => p.group === "job" && a.pages.includes(p.k)).map((p) => p.label);
  const jobs = a.all_jobs ? "every job" : a.job_ids.length === 1 ? "1 job" : `${a.job_ids.length} jobs`;
  const parts = [jobsOn(a.pages) ? `${jobs} · ${inJob.length ? inJob.join(", ") : "the job page only"}` : inJob.length ? `${jobs} · ${inJob.join(", ")}` : "no jobs board"];
  for (const p of FIELD_PAGES) if (p.group === "page" && p.k !== "jobs" && a.pages.includes(p.k)) parts.push(p.label);
  if (a.pages.includes("dusty")) parts.push("Dusty");
  return parts.join(" · ");
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

/**
 * Before migration 120 the database knows only Photos & files, Takeoffs and Budget. Jobs needs no
 * saving then (an estimator always had the board), so a save that carries only "jobs" of 120's
 * pages is retried without it; any other of them can't be kept yet. Pure.
 */
export function before120(pages: string[]): { pages: string[]; blocked: string[] } {
  const blocked = pages.filter((p) => PAGES_120.includes(p) && p !== "jobs");
  return { pages: pages.filter((p) => !PAGES_120.includes(p)), blocked };
}
export const WAITING_120 = "Jobs, Customers, Contacts, Vendors and Dusty switch on once migration 120 is applied.";
