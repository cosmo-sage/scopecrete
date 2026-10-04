/**
 * The Files page's filters (Coy, 2026-10-03: "one place for documents and
 * files and there is a badass search filter system to get anything anytime" —
 * "start with the search items you mentioned, including just whatever name I
 * type in"). Pure — tests/files-filter.test.mjs.
 *
 * One state, written into the page's address so a filtered view can be
 * bookmarked or linked, and read back by /api/files/search:
 *   q        words in the file (name, note, Dusty's read, its text) — AND any
 *            name typed: a person, vendor, customer or job whose name matches
 *            brings in every file filed on them
 *   cat      what it is (photo, plan, spec, bid, vendor quote, receipt …)
 *   kind     photo · pdf · other (the file itself)
 *   source   upload · email · text (how it arrived)
 *   job / customer / contact / vendor   one of each
 *   since    7 · 30 · 365 days — or from / to (YYYY-MM-DD)
 */

export const FILE_KINDS = [["image", "Photos"], ["pdf", "PDFs"], ["other", "Other files"]] as const;
export const FILE_SOURCES = [["upload", "Uploaded"], ["email", "From email"], ["text", "Texted"]] as const;
export const SINCE_DAYS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["365", "This year"]] as const;

export interface FileFilter {
  q: string; cat: string; kind: string; source: string;
  job: string; customer: string; contact: string; vendor: string;
  since: string; from: string; to: string;
}
export const EMPTY_FILTER: FileFilter = { q: "", cat: "", kind: "", source: "", job: "", customer: "", contact: "", vendor: "", since: "", from: "", to: "" };
const KEYS = Object.keys(EMPTY_FILTER) as Array<keyof FileFilter>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Read a filter from an address's query, keeping only values that make sense. */
export function readFilter(sp: URLSearchParams): FileFilter {
  const f = { ...EMPTY_FILTER };
  for (const k of KEYS) f[k] = (sp.get(k) ?? "").trim();
  f.q = f.q.slice(0, 200);
  for (const k of ["job", "customer", "contact", "vendor"] as const) if (f[k] && !UUID.test(f[k])) f[k] = "";
  if (f.kind && !FILE_KINDS.some(([k]) => k === f.kind)) f.kind = "";
  if (f.source && !FILE_SOURCES.some(([k]) => k === f.source)) f.source = "";
  if (f.since && !SINCE_DAYS.some(([k]) => k === f.since)) f.since = "";
  if (f.from && !DAY.test(f.from)) f.from = "";
  if (f.to && !DAY.test(f.to)) f.to = "";
  if (f.from || f.to) f.since = "";
  return f;
}

/** The filter as a query string — only what's set. */
export function filterQuery(f: FileFilter): string {
  const u = new URLSearchParams();
  for (const k of KEYS) if (f[k]) u.set(k, f[k]);
  return u.toString();
}

/** The date window a filter means: [from, to) in ISO, either open. A `to` day counts through its end. */
export function dateWindow(f: Pick<FileFilter, "since" | "from" | "to">, now = Date.now()): { from: string | null; to: string | null } {
  if (f.since) return { from: new Date(now - Number(f.since) * 86400_000).toISOString(), to: null };
  const from = f.from ? new Date(`${f.from}T00:00:00`).toISOString() : null;
  const to = f.to ? new Date(new Date(`${f.to}T00:00:00`).getTime() + 86400_000).toISOString() : null;
  return { from, to };
}

/** A typed name made safe for an ilike pattern: no wildcards or list punctuation of the caller's. */
export function namePattern(q: string): string | null {
  const s = q.replace(/[%_*,()\\"']/g, " ").replace(/\s+/g, " ").trim();
  return s.length >= 2 ? `%${s}%` : null;
}

/** The chips over the results: one per filter that is set, with what clears it. */
export function activeChips(f: FileFilter, names: Record<string, string>, catLabel: (c: string) => string): Array<{ key: keyof FileFilter | "date"; label: string }> {
  const out: Array<{ key: keyof FileFilter | "date"; label: string }> = [];
  if (f.q) out.push({ key: "q", label: `“${f.q}”` });
  if (f.cat) out.push({ key: "cat", label: catLabel(f.cat) });
  if (f.kind) out.push({ key: "kind", label: FILE_KINDS.find(([k]) => k === f.kind)?.[1] ?? f.kind });
  if (f.source) out.push({ key: "source", label: FILE_SOURCES.find(([k]) => k === f.source)?.[1] ?? f.source });
  if (f.job) out.push({ key: "job", label: `Job: ${names[f.job] ?? "a job"}` });
  if (f.customer) out.push({ key: "customer", label: `Customer: ${names[f.customer] ?? "a customer"}` });
  if (f.vendor) out.push({ key: "vendor", label: `Vendor: ${names[f.vendor] ?? "a vendor"}` });
  if (f.contact) out.push({ key: "contact", label: `Person: ${names[f.contact] ?? "a person"}` });
  if (f.since) out.push({ key: "since", label: SINCE_DAYS.find(([k]) => k === f.since)?.[1] ?? "" });
  if (f.from || f.to) out.push({ key: "date", label: f.from && f.to ? `${f.from} – ${f.to}` : f.from ? `Since ${f.from}` : `Until ${f.to}` });
  return out;
}

/** A file's "other" kind: anything that is neither a photo nor a PDF. */
export const isOtherKind = (kind: string | null | undefined) => kind !== "image" && kind !== "pdf";
