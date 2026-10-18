/**
 * The Spaces navigation (Claude Design "Dusty Home", 2026-10-16; Coy, 2026-10-17:
 * "map the new design to the live feedback site"). Pure — tests/spaces.test.mjs runs
 * it under node --test.
 *
 * Step 1, no migration: a Space is worked out from what is already stored.
 *   - Home: Dusty, the app's pages, every thread by bucket.
 *   - A job Space: every open job (not complete, closed, lost or archived), with the
 *     Scope Builder tree as its pages and its people's numbers, emails and notes as
 *     its Phone · Email · Internal threads (one thread per number — Coy, 2026-10-16).
 *   - A collection: a thread Coy made (migration 073), opened in Threads.
 *   - A customer or vendor Space: one Coy pinned to the rail (New Space, or "Add to the
 *     rail" on its drawer), kept on his account (`spaces_pins`); its drawer is the record
 *     page's tabs as shelves (Account · Supply) and a Toolbox.
 * Deliverables come later.
 */

import { WON_STATUSES, stageOf } from "../jobs/stages.ts";

/** Statuses whose job is not on the rail. */
const CLOSED = new Set(["complete", "closed", "lost"]);
export function isOpenJob(status: string | null | undefined): boolean {
  return !CLOSED.has(status ?? "");
}

/** The stage's colour on a rail tile, as a theme variable (the Jobs board's palette). */
const STAGE_VAR: Record<string, string> = {
  new: "--sc-hiviz", consult: "--sc-violet", estimating: "--sc-chalk", follow: "--sc-hiviz-text",
  won: "--sc-green", wip: "--sc-teal", complete: "--sc-ink3", lost: "--sc-red",
};
export function stageColor(status: string | null | undefined): string {
  return `var(${STAGE_VAR[stageOf(status).k] ?? "--sc-ink3"})`;
}
export function stageLabel(status: string | null | undefined): string {
  return stageOf(status).label;
}

/** Two letters for a tile: the first letters of the first two words that start with a letter. */
export function monogram(name: string | null | undefined): string {
  const words = (name ?? "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  if (!words.length) return "#";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export type SpaceRef = { kind: "home" } | { kind: "job"; id: string } | { kind: "customer"; id: string } | { kind: "vendor"; id: string };

/** Which Space a page belongs to: a job's, a customer's or a vendor's own pages are its Space, everything else Home. */
export function spaceOf(path: string | null | undefined): SpaceRef {
  const p = path ?? "";
  const m = /^\/dashboard\/scope\/([0-9a-f-]{36})(?:\/|$)/i.exec(p);
  if (m) return { kind: "job", id: m[1] };
  const c = /^\/dashboard\/customers\/([0-9a-f-]{36})(?:\/|$)/i.exec(p);
  if (c) return { kind: "customer", id: c[1] };
  const v = /^\/dashboard\/vendors\/([0-9a-f-]{36})(?:\/|$)/i.exec(p);
  if (v) return { kind: "vendor", id: v[1] };
  return { kind: "home" };
}

/* ------------------------------------------------------------ customer and vendor Spaces */

/**
 * A customer or vendor Space on the rail (Coy, 2026-10-18: "A space can currently be 1 of 4
 * different things. A job is just one"). Pinned by Coy, kept on his account, newest last.
 */
export interface SpacePin { kind: "customer" | "vendor"; id: string; name: string }
export const MAX_PINS = 40;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export function cleanPins(v: unknown): SpacePin[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: SpacePin[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const kind = r.kind === "customer" || r.kind === "vendor" ? r.kind : null;
    const id = typeof r.id === "string" && UUID_RE.test(r.id) ? r.id : null;
    if (!kind || !id || seen.has(`${kind}:${id}`)) continue;
    seen.add(`${kind}:${id}`);
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 120) : kind === "customer" ? "Customer" : "Vendor";
    out.push({ kind, id, name });
    if (out.length >= MAX_PINS) break;
  }
  return out;
}

/** The pin added (or renamed if it is there); unchanged when the list is full. */
export function addPin(pins: SpacePin[], pin: SpacePin): SpacePin[] {
  const i = pins.findIndex((p) => p.kind === pin.kind && p.id === pin.id);
  if (i >= 0) return pins.map((p, j) => (j === i ? { ...p, name: pin.name || p.name } : p));
  return pins.length >= MAX_PINS ? pins : [...pins, pin];
}
export function removePin(pins: SpacePin[], kind: SpacePin["kind"], id: string): SpacePin[] {
  return pins.filter((p) => !(p.kind === kind && p.id === id));
}

/** A shelf of a customer or vendor Space: rows that open the record page's tabs. */
export interface SpaceShelf { id: string; name: string; rows: TreeRow[] }

/** A customer Space: Account (Summary, Contacts, Jobs, Threads, Payments, Schedule) and a Toolbox (Files, Timeline). */
export function customerShelves(id: string): SpaceShelf[] {
  const t = (k: string, label: string) => ({ k, label, href: `/dashboard/customers/${id}?tab=${k}` });
  return [
    { id: "account", name: "Account", rows: [t("overview", "Summary"), t("contacts", "Contacts"), t("jobs", "Jobs"), t("threads", "Threads"), t("payments", "Payments"), t("schedule", "Schedule")] },
    { id: "toolbox", name: "Toolbox", rows: [t("files", "Files"), t("timeline", "Timeline")] },
  ];
}

/** A vendor Space: Supply (Summary, Price sheets, Receipts & quotes, Bid requests, Jobs) and a Toolbox (Files, Timeline). */
export function vendorShelves(id: string): SpaceShelf[] {
  const t = (k: string, label: string) => ({ k, label, href: `/dashboard/vendors/${id}?tab=${k}` });
  return [
    { id: "supply", name: "Supply", rows: [t("overview", "Summary"), t("prices", "Price sheets"), t("receipts", "Receipts & quotes"), t("bids", "Bid requests"), t("jobs", "Jobs")] },
    { id: "toolbox", name: "Toolbox", rows: [t("files", "Files"), t("timeline", "Timeline")] },
  ];
}

/** The tab a customer or vendor page is on (its ?tab=, else Summary). */
export function activeTab(search: string): string {
  return new URLSearchParams(search).get("tab") || "overview";
}

/** The four kinds of Space New Space makes, with the shelves each one gets (frame 18). */
export const SPACE_KINDS: Array<{ kind: "job" | "customer" | "vendor" | "collection"; label: string; shelves: string; blurb: string }> = [
  { kind: "job", label: "Job", shelves: "Scope Builder · Phone · Email · Internal", blurb: "Work to price and win — opens the New job form." },
  { kind: "customer", label: "Customer", shelves: "Account · Toolbox", blurb: "A household, business or school, with its people and jobs." },
  { kind: "vendor", label: "Vendor", shelves: "Supply · Toolbox", blurb: "A supplier or sub, with their prices and bid requests." },
  { kind: "collection", label: "Collection", shelves: "Threads · Files", blurb: "Any set of people kept together, like a thread you make." },
];

export interface TreeRow { k: string; label: string; href: string; sub?: boolean }

/**
 * A job's pages — the Scope Builder tree. Budget's own tabs are rows under it;
 * Actual costs is Scope tracker, its own page, shown once the job is won (the
 * design's assumption; Coy can say otherwise).
 */
export function jobTree(id: string, status: string | null | undefined): TreeRow[] {
  const base = `/dashboard/scope/${id}`;
  const rows: TreeRow[] = [
    { k: "summary", label: "Summary", href: `${base}/summary` },
    { k: "plans", label: "Takeoffs", href: `${base}/plans` },
    { k: "budget", label: "Budget", href: base },
    { k: "market", label: "Market rate", href: `${base}?tab=market`, sub: true },
    { k: "proposed", label: "Proposed budget", href: base, sub: true },
  ];
  if (WON_STATUSES.includes(status ?? "")) rows.push({ k: "tracker", label: "Scope tracker", href: `${base}?tab=actuals` });
  rows.push({ k: "proposal", label: "Proposal", href: `${base}/proposal` }, { k: "files", label: "Files", href: `${base}/files` });
  return rows;
}

/** The tree row a job page is on (Budget's rows by its ?tab=). */
export function activeTreeRow(path: string, search: string): string {
  const m = /^\/dashboard\/scope\/[0-9a-f-]{36}(\/[a-z]+)?/i.exec(path);
  if (!m) return "";
  const tail = m[1] ?? "";
  if (tail === "/summary") return "summary";
  if (tail === "/plans") return "plans";
  if (tail === "/proposal") return "proposal";
  if (tail === "/files") return "files";
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "market") return "market";
  if (tab === "actuals") return "tracker";
  return "proposed";
}

export interface SpacePhone { phone: string; label: string | null }
export interface SpacePerson { id: string; name: string | null; phones: SpacePhone[]; email: string | null }

/** "(225) 555-0118" from +12255550118; anything else as it is. */
export function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw;
}

export interface ThreadRow { key: string; title: string; sub: string; href: string; avatar: string }

/** A job Space's Phone threads: one row per number of each person on it. */
export function phoneThreads(people: SpacePerson[]): ThreadRow[] {
  const out: ThreadRow[] = [];
  for (const p of people) {
    p.phones.forEach((ph, i) => {
      const label = ph.label?.trim() || (i === 0 ? "Cell" : `Phone ${i + 1}`);
      const who = p.name?.trim() || fmtPhone(ph.phone);
      out.push({ key: `${p.id}:${ph.phone}`, title: p.name?.trim() ? `${who} · ${label}` : who, sub: fmtPhone(ph.phone),
        href: `/dashboard/messages/${p.id}?channel=${encodeURIComponent(`phone:${ph.phone}`)}`, avatar: monogram(p.name ?? "") });
    });
  }
  return out;
}

/** Internal: one note stream per person on the job (their Internal notes). */
export function internalThreads(people: SpacePerson[]): ThreadRow[] {
  return people.map((p) => ({ key: `${p.id}:notes`, title: p.name?.trim() || (p.phones[0] ? fmtPhone(p.phones[0].phone) : "No name"),
    sub: "Internal notes", href: `/dashboard/messages/${p.id}?channel=notes`, avatar: monogram(p.name ?? "") }));
}

/* ------------------------------------------------------------ shelves */

/**
 * Shelves (Coy, 2026-10-18): the groups in a Space's drawer, like Discord's categories —
 * renamed, added, removed, and any page put on any one. Home's are kept on Coy's account
 * (`user_preferences.prefs.shelves`, no migration). Logs and Roadmap left the drawer for
 * Settings; a page on no shelf lands on a last shelf, More, so nothing is ever lost.
 */
export interface Shelf { id: string; name: string; pages: string[] }

export const DEFAULT_SHELVES: Shelf[] = [
  { id: "buckets", name: "Buckets", pages: ["customers", "contacts", "vendors", "scope"] },
  { id: "scope-builder", name: "Scope Builder", pages: ["scopebuilder"] },
  { id: "toolbox", name: "Toolbox", pages: ["map", "camera", "pricebook", "files"] },
];
/**
 * Channels a shelf can hold besides pages (Coy, 2026-10-18: "add/remove whatever tools /
 * channels into the group i want"): Home's thread buckets, and More (Spam, Archived). A
 * channel on no shelf shows under the shelves as before.
 */
export const CHANNELS: Array<{ key: string; label: string }> = [
  { key: "ch:customer", label: "Customers threads" },
  { key: "ch:vendor", label: "Vendors threads" },
  { key: "ch:personal", label: "Personal threads" },
  { key: "ch:unsorted", label: "Unsorted threads" },
  { key: "ch:more", label: "Spam and Archived" },
];
export const isChannel = (k: string) => k.startsWith("ch:");

/** Pages that live in Settings under Spaces, not on a shelf. */
export const SETTINGS_PAGES = ["logs", "roadmap"];
export const MAX_SHELVES = 20;
export const MAX_SHELF_NAME = 40;

/** A saved value made safe: shelves with an id, a name and unique pages; else null. */
export function cleanShelves(v: unknown): Shelf[] | null {
  if (!Array.isArray(v)) return null;
  const seenIds = new Set<string>();
  const seenPages = new Set<string>();
  const out: Shelf[] = [];
  for (const s of v.slice(0, MAX_SHELVES)) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.slice(0, 40) : "";
    const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_SHELF_NAME) : "";
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);
    const pages: string[] = [];
    for (const p of Array.isArray(r.pages) ? r.pages : []) {
      if (typeof p !== "string" || seenPages.has(p)) continue;
      seenPages.add(p);
      pages.push(p);
    }
    out.push({ id, name, pages });
  }
  return out;
}

/** Home's shelves for these pages: Coy's (else the defaults), each page once, the rest on More. */
export function homeShelves(saved: unknown, pages: string[]): Shelf[] {
  const allowed = pages.filter((k) => !SETTINGS_PAGES.includes(k));
  const base = cleanShelves(saved) ?? DEFAULT_SHELVES;
  const placed = new Set<string>();
  const shelves = base.map((s) => {
    const mine = s.pages.filter((k) => (allowed.includes(k) || CHANNELS.some((c) => c.key === k)) && !placed.has(k));
    mine.forEach((k) => placed.add(k));
    return { ...s, pages: mine };
  });
  const rest = allowed.filter((k) => !placed.has(k));
  if (rest.length) {
    const more = shelves.find((s) => s.id === "more");
    if (more) more.pages.push(...rest);
    else shelves.push({ id: "more", name: "More", pages: rest });
  }
  return shelves;
}

/** Channels on no shelf, in their usual order (shown under the shelves). */
export function looseChannels(shelves: Shelf[]): string[] {
  const on = new Set(shelves.flatMap((s) => s.pages));
  return CHANNELS.map((c) => c.key).filter((k) => !on.has(k));
}

/** A page or channel taken off a shelf (a page then lands on More through homeShelves). */
export function offShelf(shelves: Shelf[], item: string): Shelf[] {
  return shelves.map((s) => ({ ...s, pages: s.pages.filter((k) => k !== item) }));
}

/** A page moved onto a shelf (at its end), off any other. */
export function moveToShelf(shelves: Shelf[], page: string, to: string): Shelf[] {
  return shelves.map((s) => ({
    ...s,
    pages: s.id === to ? [...s.pages.filter((k) => k !== page), page] : s.pages.filter((k) => k !== page),
  }));
}

/** Swap an item with its neighbour (dir −1 up, +1 down); out of range changes nothing. */
export function nudge<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const n = list.slice();
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}
