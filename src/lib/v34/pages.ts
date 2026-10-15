/**
 * Every page on the menus (Coy, 2026-09-30): one list the phone footer, the
 * Toolbox drawer, the desktop rail and the menu editor all read. `dusty` is
 * not a page — it opens the chat — but it has a place on the rail and the
 * footer's centre.
 */

/** `soon`: built in part and kept at its address, but off every menu until it's
 *  finished — a Planned card on the Roadmap says what it will do (Cash, Coy,
 *  2026-10-06: "remove the cash page from the menu since it's not complete"). */
/** `admin`: only for the people who run ScopeCrete itself (platform admins) — Coy, 2026-10-10. */
export interface PageDef { k: string; label: string; href: string; match: (path: string, search: string) => boolean; soon?: boolean; admin?: boolean }

export const PAGES: PageDef[] = [
  { k: "dashboard", label: "Dashboard", href: "/dashboard", match: (p) => p === "/dashboard" },
  { k: "threads", label: "Threads", href: "/dashboard/messages", match: (p) => p.startsWith("/dashboard/messages") },
  // The Scope Builder (Coy, 2026-10-09): every scope's flow, Files → Takeoffs → Budget → Proposal.
  { k: "scopebuilder", label: "Scope Builder", href: "/dashboard/scope-builder", match: (p) => p.startsWith("/dashboard/scope-builder") },
  { k: "scope", label: "Jobs", href: "/dashboard/scope", match: (p) => p === "/dashboard/scope" || p.startsWith("/dashboard/scope/") },
  // The Map (Claude Design 11; Coy, 2026-10-08: "add the map page to the main menu on desktop; toolbox on mobile").
  { k: "map", label: "Map", href: "/dashboard/map", match: (p) => p.startsWith("/dashboard/map") },
  // The site camera (113; Coy, 2026-10-15: "our own little company cam app … take pictures on site really quickly").
  { k: "camera", label: "Camera", href: "/dashboard/camera", match: (p) => p.startsWith("/dashboard/camera") },
  { k: "cash", label: "Cash", href: "/dashboard/cash", match: (p) => p.startsWith("/dashboard/cash"), soon: true },
  { k: "contacts", label: "Contacts", href: "/dashboard/contacts", match: (p) => p.startsWith("/dashboard/contacts") },
  { k: "customers", label: "Customers", href: "/dashboard/customers", match: (p) => p.startsWith("/dashboard/customers") },
  { k: "pricebook", label: "Price book", href: "/dashboard/price-book", match: (p) => p.startsWith("/dashboard/price-book") },
  { k: "vendors", label: "Vendors", href: "/dashboard/vendors", match: (p) => p.startsWith("/dashboard/vendors") },
  { k: "files", label: "Files", href: "/dashboard/files", match: (p) => p.startsWith("/dashboard/files") },
  { k: "logs", label: "Logs", href: "/dashboard/more/logs", match: (p) => p.startsWith("/dashboard/more/logs") },
  // The ScopeCrete admin (092) on the menu (Coy, 2026-10-10: "add it to the main menu and take it out of the settings").
  { k: "admin", label: "Admin", href: "/dashboard/admin", match: (p) => p.startsWith("/dashboard/admin"), admin: true },
  { k: "roadmap", label: "Roadmap", href: "/dashboard/roadmap", match: (p) => p.startsWith("/dashboard/roadmap") },
];
export const PAGE = new Map(PAGES.map((p) => [p.k, p]));

export interface Menus { rail: string[]; footer: string[] }
/** Rail order includes "dusty"; the footer holds 4 pages around Dusty (2 · Dusty · 2 — the last slot is the Toolbox). */
export const DEFAULT_MENUS: Menus = {
  rail: ["dashboard", "threads", "dusty", "scopebuilder", "scope", "map", "camera", "contacts", "customers", "pricebook", "vendors", "files", "logs", "admin", "roadmap"],
  footer: ["dashboard", "threads", "scope"],
};

/** A saved menu, made whole: unknown keys dropped, new pages appended, footer exactly 3.
 *  An admin page is left out unless `admin` (a platform admin is signed in). */
export function cleanMenus(m: Partial<Menus> | null | undefined, opts: { admin?: boolean } = {}): Menus {
  const known = new Set([...PAGES.filter((p) => !p.soon && (!p.admin || opts.admin)).map((p) => p.k), "dusty"]);
  // Documents is Files now (2026-10-03): a saved menu keeps its place for it.
  const renamed = (k: string) => (k === "documents" ? "files" : k);
  const rail = [...new Set((m?.rail ?? []).map(renamed).filter((k) => known.has(k)))];
  // A page new since the menu was saved goes after the page it follows by default (Map after Jobs), else last.
  DEFAULT_MENUS.rail.forEach((k, i) => {
    if (rail.includes(k) || !known.has(k)) return;
    const before = DEFAULT_MENUS.rail.slice(0, i).reverse().find((b) => rail.includes(b));
    rail.splice(before ? rail.indexOf(before) + 1 : rail.length, 0, k);
  });
  const footer = [...new Set((m?.footer ?? []).map(renamed).filter((k) => known.has(k) && k !== "dusty"))].slice(0, 3);
  for (const k of DEFAULT_MENUS.footer) if (footer.length < 3 && !footer.includes(k)) footer.push(k);
  return { rail, footer };
}

export function activePage(path: string, search: string): string {
  return PAGES.find((p) => p.match(path, search))?.k ?? "";
}
