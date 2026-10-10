/**
 * Proposal numbers — SE-26-0001-A (Coy, 2026-10-10: "company-year-proposal
 * number-project letter").
 *
 *   SE   the org's initials from orgs.name (first letter of each word,
 *        letters only, LLC / Inc and the like left out, up to 4, uppercase)
 *   26   the year (Central time) the job's FIRST proposal was made
 *   0001 the job's place among the org's jobs that had their first proposal
 *        that year, in the order those first proposals were made
 *   A    the version: v1 = A … v26 = Z, v27 = AA
 *
 * Worked out on read from job_proposals (no column): proposals are never
 * deleted (a job is archived, its proposals stay), so a job's place never
 * moves. A final freezes the number it was sent under in its snapshot; the
 * customer's link shows that frozen one.
 */

export interface NumberBase { initials: string; year: number; seq: number }

const SUFFIXES = new Set(["LLC", "LLP", "LP", "INC", "CO", "CORP", "CORPORATION", "LTD", "PLLC", "PC", "THE", "AND", "OF"]);

/** "Sacco Enterprises" → "SE"; "Sacco Enterprises, LLC" → "SE"; none → "P". */
export function orgInitials(name: string | null | undefined): string {
  const words = String(name ?? "").split(/[\s\-/&,.]+/).map((w) => w.replace(/[^A-Za-z]/g, "")).filter(Boolean);
  const kept = words.filter((w) => !SUFFIXES.has(w.toUpperCase()));
  const use = kept.length ? kept : words;
  const out = use.map((w) => w[0].toUpperCase()).join("").slice(0, 4);
  return out || "P";
}

/** 1 → A, 26 → Z, 27 → AA, 28 → AB, 52 → AZ, 53 → BA. */
export function versionLetter(version: number): string {
  let n = Math.floor(Number(version));
  if (!Number.isFinite(n) || n < 1) return "A";
  let s = "";
  while (n > 0) { n -= 1; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

/** The year in Central time. */
export function centralYear(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric" }).format(d));
}

export function formatProposalNumber(base: NumberBase, version: number): string {
  return `${base.initials}-${String(base.year % 100).padStart(2, "0")}-${String(base.seq).padStart(4, "0")}-${versionLetter(version)}`;
}

/**
 * Every job's year and place, from the org's proposal rows (any version,
 * any status). Ties on the same instant go by job id, so the order is fixed.
 */
export function jobSequences(rows: Array<{ job_id: string; created_at: string }>): Map<string, { year: number; seq: number }> {
  const first = new Map<string, string>();
  for (const r of rows) {
    if (!r?.job_id || !r.created_at) continue;
    const had = first.get(r.job_id);
    if (!had || Date.parse(r.created_at) < Date.parse(had)) first.set(r.job_id, r.created_at);
  }
  const order = [...first.entries()].sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const perYear = new Map<number, number>();
  const out = new Map<string, { year: number; seq: number }>();
  for (const [job, at] of order) {
    const year = centralYear(at);
    const seq = (perYear.get(year) ?? 0) + 1;
    perYear.set(year, seq);
    out.set(job, { year, seq });
  }
  return out;
}

/**
 * The numbering for one org: `base(jobId)` is the job's initials, year and
 * place; a job with no proposal yet gets the next place this year (what its
 * first proposal will be). `number(jobId, version)` formats it.
 */
export function numberer(orgName: string | null | undefined, rows: Array<{ job_id: string; created_at: string }>, now: Date = new Date()) {
  const initials = orgInitials(orgName);
  const seqs = jobSequences(rows);
  const thisYear = centralYear(now);
  const next = [...seqs.values()].filter((s) => s.year === thisYear).length + 1;
  const base = (jobId: string): NumberBase => {
    const s = seqs.get(jobId);
    return s ? { initials, ...s } : { initials, year: thisYear, seq: next };
  };
  return { base, number: (jobId: string, version: number) => formatProposalNumber(base(jobId), version) };
}

/** True for a number in the new shape (a frozen "P-3" is not). */
export const isNewNumber = (s: unknown): boolean => typeof s === "string" && /^[A-Z]{1,4}-\d{2}-\d{4,}-[A-Z]+$/.test(s);
