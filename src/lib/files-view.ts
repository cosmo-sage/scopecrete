/**
 * The Files page laid out like OneDrive (Coy, 2026-10-05: "toggle between
 * photos and files … a left column as a type of file menu for folders … show
 * the amount of remaining storage"). Pure — tests/files-view.test.mjs.
 *
 * Folders are not stored anywhere: each is a setting of the page's filter
 * (`files-filter.ts`), so the address still says what is open. A folder sets
 * where to look (category, job, customer, vendor, person, or the last 30 days)
 * and clears the other "where" keys; the words, the type, the way in and a
 * date range are kept.
 */

import type { FileFilter } from "./files-filter.ts";

/** The folder menu's fixed folders: [category key, label]. "" is All files. */
export const CATEGORY_FOLDERS: Array<[string, string]> = [
  ["plan", "Plans"], ["spec", "Specs"], ["bid", "Bid invites"], ["vendor_quote", "Vendor quotes"], ["receipt", "Receipts"],
  ["contract", "Contracts"], ["w9", "W-9"], ["photo", "Photos (filed)"], ["proposal", "Proposals"], ["email", "Emails"], ["other", "Other"], ["unfiled", "Unfiled"],
];

export type Folder =
  | { kind: "all" } | { kind: "recent" } | { kind: "cat"; cat: string }
  | { kind: "job" | "customer" | "vendor" | "contact"; id: string };

const WHERE = ["cat", "job", "customer", "vendor", "contact"] as const;

/** The filter change that opens a folder. */
export function folderPatch(folder: Folder): Partial<FileFilter> {
  const p: Partial<FileFilter> = {};
  for (const k of WHERE) p[k] = "";
  if (folder.kind === "recent") Object.assign(p, { since: "30", from: "", to: "" });
  else if (folder.kind === "all") p.since = "";
  else if (folder.kind === "cat") p.cat = folder.cat;
  else p[folder.kind] = folder.id;
  // Emails and proposals have no photos: opening one goes back to the Files view.
  if (folder.kind === "cat" && (folder.cat === "email" || folder.cat === "proposal")) p.kind = "";
  return p;
}

/** Which folder a filter is showing — the menu's highlighted row. `fixed` keys (the customer page's) don't count. */
export function activeFolder(f: FileFilter, fixed: Partial<FileFilter> = {}): Folder {
  const own = (k: keyof FileFilter) => (f[k] && f[k] !== fixed[k] ? f[k] : "");
  if (own("cat")) return { kind: "cat", cat: f.cat };
  for (const k of ["job", "customer", "vendor", "contact"] as const) if (own(k)) return { kind: k, id: f[k] };
  if (f.since === "30" && !f.from && !f.to) return { kind: "recent" };
  return { kind: "all" };
}

export const sameFolder = (a: Folder, b: Folder) => JSON.stringify(a) === JSON.stringify(b);

/** Photos is the Files filter with kind = image; anything else is the Files view. */
export const isPhotosView = (f: Pick<FileFilter, "kind">) => f.kind === "image";

/**
 * Pictures grouped by the month they arrived, newest month first, as OneDrive
 * Photos does. Months in Central time (the business's clock), labelled
 * "October 2026".
 */
export function byMonth<R extends { created_at: string }>(rows: R[], tz = "America/Chicago"): Array<{ key: string; label: string; items: R[] }> {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" });
  const lab = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "long" });
  const out = new Map<string, { key: string; label: string; items: R[] }>();
  for (const r of rows) {
    const d = new Date(r.created_at);
    if (!Number.isFinite(d.getTime())) continue;
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
    const key = `${parts.year}-${parts.month}`;
    if (!out.has(key)) out.set(key, { key, label: lab.format(d), items: [] });
    out.get(key)!.items.push(r);
  }
  return [...out.values()].sort((a, b) => b.key.localeCompare(a.key));
}

const GB = 1024 ** 3, MB = 1024 ** 2;
/** Bytes in plain words: 512 KB, 37.4 MB, 1.2 GB. */
export function bytesLabel(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(n >= 10 * GB ? 0 : 1).replace(/\.0$/, "")} GB`;
  if (n >= MB) return `${(n / MB).toFixed(n >= 100 * MB ? 0 : 1).replace(/\.0$/, "")} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.max(0, Math.round(n))} B`;
}

/** "37.4 MB used of 1 GB", "987 MB left", the bar's fill (0–1) and how worried to be. */
export function storageLabel(used: number, limit: number): { used: string; left: string; pct: number; tone: "ok" | "warn" | "full" } {
  const pct = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 1;
  const left = Math.max(0, limit - used);
  return {
    used: `${bytesLabel(used)} used of ${bytesLabel(limit)}`,
    left: left > 0 ? `${bytesLabel(left)} left` : "Full",
    pct,
    tone: pct >= 1 ? "full" : pct >= 0.8 ? "warn" : "ok",
  };
}

/** The storage limit from the server's STORAGE_LIMIT_GB (Supabase's free plan: 1 GB). */
export function storageLimitBytes(env: string | undefined): number {
  const n = Number(env);
  return (Number.isFinite(n) && n > 0 ? n : 1) * GB;
}

