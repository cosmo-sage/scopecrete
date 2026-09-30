/**
 * Every page on the menus (Coy, 2026-09-30): one list the phone footer, the
 * Toolbox drawer, the desktop rail and the menu editor all read. `dusty` is
 * not a page — it opens the chat — but it has a place on the rail and the
 * footer's centre.
 */

export interface PageDef { k: string; label: string; href: string; match: (path: string, search: string) => boolean }

export const PAGES: PageDef[] = [
  { k: "dashboard", label: "Dashboard", href: "/dashboard", match: (p) => p === "/dashboard" },
  { k: "threads", label: "Threads", href: "/dashboard/messages", match: (p) => p.startsWith("/dashboard/messages") },
  { k: "scope", label: "Jobs", href: "/dashboard/scope", match: (p) => p.startsWith("/dashboard/scope") },
  { k: "cash", label: "Cash", href: "/dashboard/cash", match: (p) => p.startsWith("/dashboard/cash") },
  { k: "customers", label: "Customers", href: "/dashboard/customers", match: (p) => p.startsWith("/dashboard/customers") },
  { k: "pricebook", label: "Price book", href: "/dashboard/price-book", match: (p) => p.startsWith("/dashboard/price-book") },
  { k: "vendors", label: "Vendors", href: "/dashboard/vendors", match: (p) => p.startsWith("/dashboard/vendors") },
  { k: "documents", label: "Documents", href: "/dashboard/documents", match: (p) => p.startsWith("/dashboard/documents") },
  { k: "logs", label: "Logs", href: "/dashboard/more/logs", match: (p) => p.startsWith("/dashboard/more/logs") },
];
export const PAGE = new Map(PAGES.map((p) => [p.k, p]));

export interface Menus { rail: string[]; footer: string[] }
/** Rail order includes "dusty"; the footer holds 4 pages around Dusty (2 · Dusty · 2 — the last slot is the Toolbox). */
export const DEFAULT_MENUS: Menus = {
  rail: ["dashboard", "threads", "dusty", "scope", "cash", "customers", "pricebook", "vendors", "documents", "logs"],
  footer: ["dashboard", "threads", "scope"],
};

/** A saved menu, made whole: unknown keys dropped, new pages appended, footer exactly 3. */
export function cleanMenus(m: Partial<Menus> | null | undefined): Menus {
  const known = new Set([...PAGES.map((p) => p.k), "dusty"]);
  const rail = [...new Set((m?.rail ?? []).filter((k) => known.has(k)))];
  for (const k of DEFAULT_MENUS.rail) if (!rail.includes(k)) rail.push(k);
  const footer = [...new Set((m?.footer ?? []).filter((k) => PAGE.has(k)))].slice(0, 3);
  for (const k of DEFAULT_MENUS.footer) if (footer.length < 3 && !footer.includes(k)) footer.push(k);
  return { rail, footer };
}

export function activePage(path: string, search: string): string {
  return PAGES.find((p) => p.match(path, search))?.k ?? "";
}
