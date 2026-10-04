/**
 * The Jobs board's sort and filters (Coy, 2026-10-04: "a sort button that
 * sorts by date and name. And also a filter button that filters for job types
 * and city"). Pure — tested in tests/board-view.test.mjs.
 */

export type BoardSort = "newest" | "oldest" | "moved" | "az";
export const BOARD_SORTS: Array<{ k: BoardSort; label: string }> = [
  { k: "newest", label: "Newest first" },
  { k: "oldest", label: "Oldest first" },
  { k: "moved", label: "Last moved" },
  { k: "az", label: "Name A–Z" },
];

export interface BoardJob {
  title: string | null; contact_name: string | null; address: string | null; city?: string | null;
  job_type: string | null; created_at: string | null; stage_changed_at: string | null;
}

/**
 * The job's city: its own city, else read from the address — the part after
 * the street in "123 Main St, Baton Rouge, LA 70810". A street alone has none.
 */
export function cityOf(j: Pick<BoardJob, "city" | "address">): string | null {
  const own = (j.city ?? "").trim();
  if (own) return titleCase(own);
  const parts = (j.address ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // Drop a trailing "LA 70810" / "LA" / "70810" / "USA"; what's left after the street is the city.
  while (parts.length > 1 && /^(usa|united states|[A-Za-z]{2}(\s+\d{5}(-\d{4})?)?|\d{5}(-\d{4})?)$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length < 2) return null;
  const c = parts[parts.length - 1].replace(/\s+[A-Za-z]{2}\s+\d{5}(-\d{4})?$/, "").trim();
  return c && !/\d/.test(c) ? titleCase(c) : null;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The name a card sorts by: its title, else its customer. */
const nameOf = (j: BoardJob) => (j.title || j.contact_name || "").trim().toLowerCase();
const time = (s: string | null) => (s ? Date.parse(s) || 0 : 0);

export function sortJobs<J extends BoardJob>(jobs: J[], by: BoardSort): J[] {
  const out = [...jobs];
  if (by === "az") return out.sort((a, b) => (nameOf(a) || "￿").localeCompare(nameOf(b) || "￿"));
  if (by === "oldest") return out.sort((a, b) => time(a.created_at) - time(b.created_at));
  if (by === "moved") return out.sort((a, b) => time(b.stage_changed_at ?? b.created_at) - time(a.stage_changed_at ?? a.created_at));
  return out.sort((a, b) => time(b.created_at) - time(a.created_at));
}

export interface BoardFilter { types: string[]; cities: string[] }

/** Jobs of any picked type (or "none" for a job with no type) in any picked city ("none" = no city). */
export function filterJobs<J extends BoardJob>(jobs: J[], f: BoardFilter): J[] {
  return jobs.filter((j) =>
    (!f.types.length || f.types.includes(j.job_type ?? "none")) &&
    (!f.cities.length || f.cities.includes(cityOf(j) ?? "none")));
}

/** The cities on the board with how many jobs each, most first; "none" last. */
export function cityCounts(jobs: BoardJob[]): Array<{ city: string; n: number }> {
  const m = new Map<string, number>();
  for (const j of jobs) { const c = cityOf(j) ?? "none"; m.set(c, (m.get(c) ?? 0) + 1); }
  return [...m].map(([city, n]) => ({ city, n }))
    .sort((a, b) => (a.city === "none" ? 1 : b.city === "none" ? -1 : b.n - a.n || a.city.localeCompare(b.city)));
}
