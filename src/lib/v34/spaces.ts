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

import { stageOf } from "../jobs/stages.ts";

/** Statuses whose job is not on the rail. */
const CLOSED = new Set(["complete", "closed", "lost"]);
export function isOpenJob(status: string | null | undefined): boolean {
  return !CLOSED.has(status ?? "");
}

/**
 * Customers with an open job are Work Spaces of their own (Coy, 2026-10-21: "Only customer with open
 * jobs gets a space"): one per customer, named, in the order their newest open job came in. Every
 * customer stays in the Customers collection either way.
 */
export function openJobCustomers(jobs: Array<{ status: string | null; customer_id?: string | null; customer?: string | null }>): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  for (const j of jobs) {
    const id = j.customer_id ?? "";
    const name = (j.customer ?? "").trim();
    if (!id || !name || seen.has(id) || !isOpenJob(j.status)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out;
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

export type SpaceRef = { kind: "home" } | { kind: "job"; id: string } | { kind: "customer"; id: string } | { kind: "vendor"; id: string } | { kind: "collection"; id: string };

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
export interface SpacePin { kind: "customer" | "vendor" | "job"; id: string; name: string; /** In your own Work Space: the shelf it sits on. */ shelf?: string }
export const MAX_PINS = 40;
const UUID_RE = /^[0-9a-f-]{36}$/i;

const SHELF_ID_RE = /^[a-z0-9-]{1,40}$/;
export function cleanPins(v: unknown, max = MAX_PINS): SpacePin[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: SpacePin[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const kind = r.kind === "customer" || r.kind === "vendor" || r.kind === "job" ? r.kind : null;
    const id = typeof r.id === "string" && UUID_RE.test(r.id) ? r.id : null;
    if (!kind || !id || seen.has(`${kind}:${id}`)) continue;
    seen.add(`${kind}:${id}`);
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 120) : kind === "customer" ? "Customer" : kind === "job" ? "Job" : "Vendor";
    const shelf = typeof r.shelf === "string" && SHELF_ID_RE.test(r.shelf) ? r.shelf : undefined;
    out.push(shelf ? { kind, id, name, shelf } : { kind, id, name });
    if (out.length >= max) break;
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

/**
 * What a collection holds besides its people (Coy, 2026-10-18: "Collections aren't allowing me
 * to actually pick tools/channels to add to the collection. it should be done inside the Space
 * creator"): the tools (pages) and channels ticked in New Space, or later on its drawer's gear.
 * Kept on the account (`spaces_collections`: thread id → picks), no migration.
 */
export type CollectionPicks = Record<string, string[]>;
export const MAX_PICKS = 30;
export function cleanCollectionPicks(v: unknown): CollectionPicks {
  const out: CollectionPicks = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  let n = 0;
  for (const [id, list] of Object.entries(v as Record<string, unknown>)) {
    if (!UUID_RE.test(id) || !Array.isArray(list)) continue;
    const seen = new Set<string>();
    out[id] = list.filter((k): k is string => typeof k === "string" && k.length <= 40 && !seen.has(k) && !!seen.add(k)).slice(0, MAX_PICKS);
    if (++n >= 200) break;
  }
  return out;
}
/** A collection's picks set (or cleared when empty). */
export function setPicks(all: CollectionPicks, id: string, picks: string[]): CollectionPicks {
  const next = { ...all };
  if (picks.length) next[id] = [...new Set(picks)].slice(0, MAX_PICKS); else delete next[id];
  return next;
}
/** A pick ticked on or off, keeping the order it was ticked in. */
export function togglePick(picks: string[], k: string, on: boolean): string[] {
  return on ? (picks.includes(k) ? picks : [...picks, k]) : picks.filter((x) => x !== k);
}

/**
 * The jobs, customers and vendors a collection holds (Coy, 2026-10-18: "when I select to create
 * a 'Collection' Space, it should allow me to select from any number of Jobs, Customers,
 * Vendors"). Kept on the account (`spaces_col_members`: thread id → items), no migration; the
 * collection's thread also gets their people.
 */
export type CollectionMembers = Record<string, SpacePin[]>;
export const MAX_MEMBERS = 120;
export function cleanMembers(v: unknown): CollectionMembers {
  const out: CollectionMembers = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  let n = 0;
  for (const [id, list] of Object.entries(v as Record<string, unknown>)) {
    if (!UUID_RE.test(id)) continue;
    const items = cleanPins(list, MAX_MEMBERS);
    if (items.length) out[id] = items;
    if (++n >= 200) break;
  }
  return out;
}
export function setMembers(all: CollectionMembers, id: string, items: SpacePin[]): CollectionMembers {
  const next = { ...all };
  const clean = cleanPins(items, MAX_MEMBERS);
  if (clean.length) next[id] = clean; else delete next[id];
  return next;
}
/** An item ticked on or off a list of picked items, in the order picked. */
export function toggleItem(items: SpacePin[], item: SpacePin, on: boolean): SpacePin[] {
  const has = items.some((p) => p.kind === item.kind && p.id === item.id);
  if (on) return has ? items : [...items, item];
  return items.filter((p) => !(p.kind === item.kind && p.id === item.id));
}

/**
 * Shelves of your own inside a Work Space (Coy, 2026-10-22: "I might create a space. Name it
 * Customers, and put specific customers in a geographic area inside that space"). Each holds
 * some of its jobs, customers and vendors (their `shelf`); one on none sits at the top. Kept on
 * the account (`spaces_col_shelves`: thread id → shelves), no migration.
 */
export interface ColShelf { id: string; name: string }
export type ColShelves = Record<string, ColShelf[]>;
export const MAX_COL_SHELVES = 20;
export function cleanColShelves(v: unknown): ColShelves {
  const out: ColShelves = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  let n = 0;
  for (const [id, list] of Object.entries(v as Record<string, unknown>)) {
    if (!UUID_RE.test(id) || !Array.isArray(list)) continue;
    const seen = new Set<string>();
    const shelves: ColShelf[] = [];
    for (const x of list) {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const sid = typeof r.id === "string" && SHELF_ID_RE.test(r.id) ? r.id : null;
      const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : "";
      if (!sid || !name || seen.has(sid)) continue;
      seen.add(sid);
      shelves.push({ id: sid, name });
      if (shelves.length >= MAX_COL_SHELVES) break;
    }
    if (shelves.length) out[id] = shelves;
    if (++n >= 200) break;
  }
  return out;
}
/** A new shelf in a Work Space, and its id; unchanged when full or the name is blank. */
export function addColShelf(all: ColShelves, col: string, name: string, id: string): ColShelves {
  const list = all[col] ?? [];
  const nm = name.trim().slice(0, 40);
  if (!nm || list.length >= MAX_COL_SHELVES || !SHELF_ID_RE.test(id) || list.some((s) => s.id === id)) return all;
  return { ...all, [col]: [...list, { id, name: nm }] };
}
export function renameColShelf(all: ColShelves, col: string, id: string, name: string): ColShelves {
  const nm = name.trim().slice(0, 40);
  if (!nm) return all;
  return { ...all, [col]: (all[col] ?? []).map((s) => (s.id === id ? { ...s, name: nm } : s)) };
}
/** A shelf moved up (-1) or down (+1). */
export function moveColShelf(all: ColShelves, col: string, id: string, by: -1 | 1): ColShelves {
  const list = [...(all[col] ?? [])];
  const i = list.findIndex((s) => s.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return all;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...all, [col]: list };
}
/** A shelf removed; what was on it goes back to the top. */
export function removeColShelf(all: ColShelves, members: CollectionMembers, col: string, id: string): { shelves: ColShelves; members: CollectionMembers } {
  const list = (all[col] ?? []).filter((s) => s.id !== id);
  const shelves = { ...all };
  if (list.length) shelves[col] = list; else delete shelves[col];
  const items = (members[col] ?? []).map((m) => (m.shelf === id ? { kind: m.kind, id: m.id, name: m.name } : m));
  return { shelves, members: setMembers(members, col, items) };
}
/** A job, customer or vendor put on a shelf (or none). */
export function setMemberShelf(items: SpacePin[], kind: SpacePin["kind"], id: string, shelf: string | null): SpacePin[] {
  return items.map((m) => {
    if (m.kind !== kind || m.id !== id) return m;
    const { shelf: _old, ...rest } = m;
    void _old;
    return shelf ? { ...rest, shelf } : rest;
  });
}
/** A Work Space's members by shelf: the loose ones, then each shelf's (members on a shelf that is gone are loose). */
export function membersByShelf(items: SpacePin[], shelves: ColShelf[]): { loose: SpacePin[]; shelves: Array<ColShelf & { items: SpacePin[] }> } {
  const ids = new Set(shelves.map((s) => s.id));
  return {
    loose: items.filter((m) => !m.shelf || !ids.has(m.shelf)),
    shelves: shelves.map((s) => ({ ...s, items: items.filter((m) => m.shelf === s.id) })),
  };
}

/** A shelf of a customer or vendor Space: rows that open the record page's tabs. */
export interface SpaceShelf { id: string; name: string; rows: TreeRow[] }

/** A customer Space: Account (Summary, Contacts, Jobs, Threads, Payments, Schedule) and a Toolbox (Files, Timeline). */
export function customerShelves(id: string): SpaceShelf[] {
  const t = (k: string, label: string) => ({ k, label, href: `/dashboard/customers/${id}?tab=${k}` });
  return [
    { id: "account", name: "Customer Account", rows: [t("overview", "Summary"), t("contacts", "Contacts"), t("jobs", "Jobs"), t("threads", "Threads"), t("payments", "Payments"), t("schedule", "Schedule")] },
    { id: "toolbox", name: "Toolbox", rows: [t("files", "Files"), t("timeline", "Timeline")] },
  ];
}

/** A vendor Space: Supply (Summary, Cost book, Receipts & quotes, Bid requests, Jobs) and a Toolbox (Files, Timeline). */
export function vendorShelves(id: string): SpaceShelf[] {
  const t = (k: string, label: string) => ({ k, label, href: `/dashboard/vendors/${id}?tab=${k}` });
  return [
    { id: "supply", name: "Supply", rows: [t("overview", "Summary"), t("prices", "Cost book"), t("receipts", "Receipts & quotes"), t("bids", "Bid requests"), t("jobs", "Jobs"), t("threads", "Threads")] },
    { id: "toolbox", name: "Toolbox", rows: [t("files", "Files"), t("timeline", "Timeline")] },
  ];
}

/**
 * A job's, customer's or vendor's drawer, edited (Coy, 2026-10-22: "Everything on the rail is
 * supposed to be a kind of 'workspace' that has an editable drawer"): its shelves renamed, moved,
 * added or removed, any page moved to another shelf or taken out of the drawer. One layout per
 * kind, so every job's drawer reads the same; kept on the account as `space_layouts` (and shared
 * from the org's layout like Home's shelves). The Channels shelf is a shelf of its own
 * (id "channels") that holds no pages. A page that is neither on a shelf nor taken out (one added
 * to the app later) goes on the first shelf.
 */
export type LayoutKind = "job" | "customer" | "vendor";
export interface KindShelf { id: string; name: string; rows: string[] }
export interface KindLayout { shelves: KindShelf[]; hidden: string[] }
export type SpaceLayouts = Partial<Record<LayoutKind, KindLayout>>;
export const CHANNELS_SHELF = "channels";

/** The pages a kind of Space can show, in their usual order. */
export function kindRows(kind: LayoutKind, id: string): TreeRow[] {
  if (kind === "job") return jobTree(id);
  return (kind === "customer" ? customerShelves(id) : vendorShelves(id)).flatMap((sh) => sh.rows);
}

/** The drawer a kind of Space starts with: a job's Job shelf (Coy, 2026-10-22: "it's really a job right?"), then Channels. */
export function defaultLayout(kind: LayoutKind): KindLayout {
  const ch: KindShelf = { id: CHANNELS_SHELF, name: "Channels", rows: [] };
  if (kind === "job") return { shelves: [{ id: "job", name: "Job", rows: jobTree("x").map((r) => r.k) }, ch], hidden: [] };
  const [first, ...rest] = (kind === "customer" ? customerShelves("x") : vendorShelves("x")).map((sh) => ({ id: sh.id, name: sh.name, rows: sh.rows.map((r) => r.k) }));
  return { shelves: [first, ch, ...rest], hidden: [] };
}

/** A saved layout made safe for its kind: known pages once each, shelf ids unique, else the default. */
/**
 * A tool or list from Home put on a job's, customer's or vendor's shelf (Coy, 2026-10-22: "There
 * is no + button to add a tool, or channel or page or collection"): "p:<page>", the app's own page.
 */
const TOOL_ROW_RE = /^p:[a-z_]{1,30}$/;
export const isToolRow = (k: string) => TOOL_ROW_RE.test(k);
export function cleanLayout(kind: LayoutKind, v: unknown): KindLayout {
  if (!v || typeof v !== "object" || !Array.isArray((v as { shelves?: unknown }).shelves)) return defaultLayout(kind);
  const known = new Set(kindRows(kind, "x").map((r) => r.k));
  const seen = new Set<string>();
  const ids = new Set<string>();
  const shelves: KindShelf[] = [];
  for (const s of ((v as { shelves: unknown[] }).shelves).slice(0, MAX_SHELVES)) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.slice(0, 40) : "";
    const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_SHELF_NAME) : "";
    if (!id || !name || ids.has(id)) continue;
    ids.add(id);
    const rows: string[] = [];
    if (id !== CHANNELS_SHELF) for (const k of Array.isArray(r.rows) ? r.rows : []) {
      if (typeof k !== "string" || !(known.has(k) || TOOL_ROW_RE.test(k)) || seen.has(k)) continue;
      seen.add(k);
      rows.push(k);
    }
    shelves.push({ id, name, rows });
  }
  const rawHidden = (v as { hidden?: unknown }).hidden;
  const hidden = (Array.isArray(rawHidden) ? rawHidden : []).filter((k): k is string => typeof k === "string" && (known.has(k) || k === CHANNELS_SHELF) && !seen.has(k));
  const hasCh = shelves.some((s) => s.id === CHANNELS_SHELF);
  const missing = [...known].filter((k) => !seen.has(k) && !hidden.includes(k));
  if (missing.length) {
    const first = shelves.find((s) => s.id !== CHANNELS_SHELF);
    if (first) first.rows.push(...missing);
    else shelves.unshift({ id: kind, name: defaultLayout(kind).shelves[0].name, rows: missing });
  }
  if (!hasCh && !hidden.includes(CHANNELS_SHELF)) shelves.push({ id: CHANNELS_SHELF, name: "Channels", rows: [] });
  return { shelves, hidden: [...new Set(hidden)] };
}

export function cleanSpaceLayouts(v: unknown): SpaceLayouts {
  const out: SpaceLayouts = {};
  if (!v || typeof v !== "object") return out;
  for (const k of ["job", "customer", "vendor"] as const) {
    const x = (v as Record<string, unknown>)[k];
    if (x) out[k] = cleanLayout(k, x);
  }
  return out;
}

/** A page moved to a shelf (or out of the drawer when `to` is null). */
export function placeRow(l: KindLayout, k: string, to: string | null): KindLayout {
  const shelves = l.shelves.map((s) => ({ ...s, rows: s.rows.filter((x) => x !== k) }));
  const hidden = l.hidden.filter((x) => x !== k);
  if (to === null) return { shelves, hidden: isToolRow(k) ? hidden : [...hidden, k] };
  return { shelves: shelves.map((s) => (s.id === to ? { ...s, rows: [...s.rows, k] } : s)), hidden };
}

/** A shelf removed: its pages leave the drawer with it (put back from "Not in the drawer"). */
export function removeKindShelf(l: KindLayout, id: string): KindLayout {
  const sh = l.shelves.find((s) => s.id === id);
  if (!sh) return l;
  return { shelves: l.shelves.filter((s) => s.id !== id), hidden: [...l.hidden, ...(id === CHANNELS_SHELF ? [CHANNELS_SHELF] : sh.rows.filter((k) => !isToolRow(k)))] };
}

/** The tab a customer or vendor page is on (its ?tab=, else Summary). */
export function activeTab(search: string): string {
  return new URLSearchParams(search).get("tab") || "overview";
}

/** The four kinds of Space New Space makes, with the shelves each one gets (frame 18). */
export const SPACE_KINDS: Array<{ kind: "job" | "customer" | "vendor" | "collection"; label: string; shelves: string; blurb: string }> = [
  { kind: "job", label: "Job", shelves: "Job · Channels", blurb: "Work to price and win — opens the New job form." },
  { kind: "customer", label: "Customer", shelves: "Account · Channels · Toolbox", blurb: "A household, business or school, with its people and jobs." },
  { kind: "vendor", label: "Vendor", shelves: "Supply · Channels · Toolbox", blurb: "A supplier or sub, with their prices and bid requests." },
  { kind: "collection", label: "Your own", shelves: "Jobs · Customers · Vendors · Channels", blurb: "A Work Space you make, like Fort Polk: any jobs, customers and vendors kept together." },
];

export interface TreeRow { k: string; label: string; href: string; sub?: boolean }

/**
 * A job's pages — its Job shelf (Coy, 2026-10-18 called it Customer Account; 2026-10-22: "Its
 * confusing for this shelf to say 'customer account' when it's really a job"). Budget's own tabs are rows of their own; Actual costs shows on every
 * job, as its tab always did; Schedule and Locations are pages of their own (same day).
 */
export function jobTree(id: string): TreeRow[] {
  const base = `/dashboard/scope/${id}`;
  const rows: TreeRow[] = [
    { k: "summary", label: "Summary", href: `${base}/summary` },
    { k: "plans", label: "Takeoffs", href: `${base}/plans` },
    // Coy, 2026-10-18: Market rate, Proposed budget and Actual costs are tools of their own on
    // the shelf, "accessible the same way as the budget tool", not views nested inside Budget.
    { k: "market", label: "Market rate", href: `${base}?tab=market` },
    { k: "proposed", label: "Proposed budget", href: base },
    { k: "tracker", label: "Actual costs", href: `${base}?tab=actuals` },
  ];
  rows.push(
    { k: "proposal", label: "Proposal", href: `${base}/proposal` },
    { k: "schedule", label: "Schedule", href: `${base}/schedule` },
    { k: "locations", label: "Locations", href: `${base}/locations` },
    { k: "files", label: "Files", href: `${base}/files` },
  );
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
  if (tail === "/schedule") return "schedule";
  if (tail === "/locations") return "locations";
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "market") return "market";
  if (tab === "actuals") return "tracker";
  return "proposed";
}

/** The last call or text on a number, for the drawer's preview (Threads v3, 2026-10-19). */
export interface SpaceLast { text: string; at: string; out: boolean }
export interface SpacePhone { phone: string; label: string | null; last?: SpaceLast | null }
export interface SpacePerson { id: string; name: string | null; phones: SpacePhone[]; email: string | null; emails?: string[] }
/** An email conversation filed on the Space, with the outside address it is with. */
export interface SpaceEmail { key: string; subject: string; at: string | null; address?: string | null }

/** "(225) 555-0118" from +12255550118; anything else as it is. */
export function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw;
}

export interface ThreadRow { key: string; title: string; sub: string; href: string; avatar: string; when?: string | null }

/** "3:41 PM" today, "Mon" this week, else "Oct 17" — Central time, like the rest of the app. */
export function shortWhen(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = "America/Chicago";
  const day = (x: Date) => x.toLocaleDateString("en-US", { timeZone: tz });
  if (day(d) === day(now)) return d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const ms = now.getTime() - d.getTime();
  if (ms >= 0 && ms < 6 * 864e5) return d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
  return d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
}

/** A job Space's Phone threads: one row per number of each person on it. */
export function phoneThreads(people: SpacePerson[]): ThreadRow[] {
  const out: ThreadRow[] = [];
  for (const p of people) {
    p.phones.forEach((ph, i) => {
      const label = ph.label?.trim() || (i === 0 ? "Cell" : `Phone ${i + 1}`);
      const who = p.name?.trim() || fmtPhone(ph.phone);
      // The last call or text under it, as a messages app does (Threads v3); the number when there is none.
      const last = ph.last ? `${ph.last.out ? "You: " : ""}${ph.last.text}` : null;
      out.push({ key: `${p.id}:${ph.phone}`, title: p.name?.trim() ? `${who} · ${label}` : who, sub: last ?? fmtPhone(ph.phone), when: shortWhen(ph.last?.at),
        href: `/dashboard/messages/${p.id}?channel=${encodeURIComponent(`phone:${ph.phone}`)}`, avatar: monogram(p.name ?? "") });
    });
  }
  return out;
}

/**
 * Email threads by address (Coy, 2026-10-18: "under each channel type will be the individual threads
 * shown by the phone number, email address …"): each address of each person opens their Email channel;
 * an address on a filed conversation that is no one's opens that conversation, newest first.
 */
export function emailThreads(people: SpacePerson[], emails: SpaceEmail[]): ThreadRow[] {
  const out: ThreadRow[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    const list = [...new Set([...(p.email ? [p.email] : []), ...(p.emails ?? [])].map((e) => e.trim().toLowerCase()).filter(Boolean))];
    for (const e of list) {
      if (seen.has(e)) continue;
      seen.add(e);
      const n = emails.filter((m) => (m.address ?? "").toLowerCase() === e).length;
      out.push({ key: `${p.id}:${e}`, title: e, sub: [p.name?.trim(), n ? `${n} conversation${n === 1 ? "" : "s"}` : null].filter(Boolean).join(" · "),
        href: `/dashboard/messages/${p.id}?channel=${encodeURIComponent(`email:${e}`)}`, avatar: monogram(p.name ?? e) });
    }
  }
  for (const m of emails) {
    const e = (m.address ?? "").trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    const n = emails.filter((x) => (x.address ?? "").toLowerCase() === e).length;
    out.push({ key: `addr:${e}`, title: e, sub: n > 1 ? `${n} conversations` : m.subject,
      href: `/dashboard/messages/email/${encodeURIComponent(m.key)}`, avatar: monogram(e) });
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
  { id: "buckets", name: "Collections", pages: ["customers", "contacts", "vendors", "scope"] },
  { id: "toolbox", name: "Toolbox", pages: ["map", "camera", "pricebook", "files"] },
];
/**
 * Channels a shelf can hold besides pages (Coy, 2026-10-18: "add/remove whatever tools /
 * channels into the group i want"): Home's thread buckets, and More (Spam, Archived). A
 * channel on no shelf shows under the shelves as before.
 */
export const CHANNELS: Array<{ key: string; label: string }> = [
  { key: "ch:customer", label: "Customer threads" },
  { key: "ch:vendor", label: "Vendor threads" },
  { key: "ch:personal", label: "Personal threads" },
  { key: "ch:unsorted", label: "Unsorted threads" },
  { key: "ch:more", label: "Spam and Archived" },
];
/**
 * The four list pages (Coy, 2026-10-22: "I want to call customers: customers, and the same for
 * each of the different collections of lists") — shown once in a picker, as Collections, apart
 * from the tools.
 */
export const COLLECTION_PAGES = ["customers", "contacts", "vendors", "scope"];
/** A picker's sections: Collections, Tools, then the thread lists by how people are filed. */
export function pickSections(pages: string[]): Array<{ title: string; keys: string[] }> {
  return [
    { title: "Collections", keys: COLLECTION_PAGES.filter((k) => pages.includes(k)) },
    // Logs and Roadmap live in Settings, and the Scope Builder is Jobs, under Spaces.
    { title: "Tools", keys: pages.filter((k) => !COLLECTION_PAGES.includes(k) && !SETTINGS_PAGES.includes(k) && !MERGED_PAGES.includes(k)) },
    { title: "Threads", keys: CHANNELS.map((c) => c.key) },
  ].filter((x) => x.keys.length > 0);
}
export const isChannel = (k: string) => k.startsWith("ch:");

/** Pages that live in Settings under Spaces, not on a shelf. */
export const SETTINGS_PAGES = ["logs", "roadmap"];
/**
 * Pages folded into another under Spaces (Coy, 2026-10-18: "replace the job's bucket with this
 * Scopebuilder page layout"): Jobs on the Buckets shelf opens the Scope Builder's layout, so the
 * Scope Builder isn't a row of its own.
 */
export const MERGED_PAGES = ["scopebuilder"];
/** Where a page's row goes under Spaces, when it isn't its own address. */
export const SPACES_HREF: Record<string, string> = { scope: "/dashboard/scope-builder" };
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
    let name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_SHELF_NAME) : "";
    // The list pages' shelf is Collections (Coy, 2026-10-21); a shelf saved under the old default name follows.
    if (id === "buckets" && name === "Buckets") name = "Collections";
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
  const allowed = pages.filter((k) => !SETTINGS_PAGES.includes(k) && !MERGED_PAGES.includes(k));
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

/* ------------------------------------------------------------ the rail's order */

/**
 * Coy's order and hidden tiles on the rail (Coy, 2026-10-18: "I need a way to remove and
 * rearrange the Rail items"). Keys are "job:<id>", "col:<id>", "customer:<id>", "vendor:<id>".
 * Hiding a job or a collection only takes it off the rail; the job and thread are untouched.
 */
export interface RailPrefs { order: string[]; hidden: string[] }
const RAIL_KEY_RE = /^(job|col|customer|vendor):[0-9a-f-]{36}$/i;
const MAX_RAIL_KEYS = 300;

export function cleanRail(v: unknown): RailPrefs {
  const r = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const list = (x: unknown) => {
    if (!Array.isArray(x)) return [];
    const out: string[] = [];
    for (const k of x) if (typeof k === "string" && RAIL_KEY_RE.test(k) && !out.includes(k)) out.push(k);
    return out.slice(0, MAX_RAIL_KEYS);
  };
  return { order: list(r.order), hidden: list(r.hidden) };
}

/**
 * The rail's tiles in Coy's order, hidden ones left out. A tile he never moved keeps its
 * default place: right after the default tile before it (so a new job lands among the jobs).
 */
export function orderTiles(keys: string[], prefs: RailPrefs): string[] {
  const live = new Set(keys);
  const out = prefs.order.filter((k) => live.has(k));
  const placed = new Set(out);
  keys.forEach((k, i) => {
    if (placed.has(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = out.indexOf(keys[j]);
      if (p >= 0) { at = p + 1; break; }
    }
    out.splice(at, 0, k);
    placed.add(k);
  });
  const hidden = new Set(prefs.hidden);
  return out.filter((k) => !hidden.has(k));
}

/** Move a tile to another tile's place in the order shown; the whole order is saved. */
export function moveTile(prefs: RailPrefs, shown: string[], key: string, to: number): RailPrefs {
  const from = shown.indexOf(key);
  if (from < 0) return prefs;
  const next = shown.filter((k) => k !== key);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, key);
  const rest = prefs.order.filter((k) => !next.includes(k));
  return { order: [...next, ...rest].slice(0, MAX_RAIL_KEYS), hidden: prefs.hidden };
}

export function hideTile(prefs: RailPrefs, key: string): RailPrefs {
  return prefs.hidden.includes(key) ? prefs : { order: prefs.order, hidden: [...prefs.hidden, key].slice(-MAX_RAIL_KEYS) };
}
export function showTile(prefs: RailPrefs, key: string): RailPrefs {
  return { order: prefs.order, hidden: prefs.hidden.filter((k) => k !== key) };
}

/**
 * Whether a Work Space of your own holds a job, customer or vendor (Coy, 2026-10-22: "adding a
 * customer to a space should not be attaching a link to the customer space, but referencing that
 * customer"): while you work in one of its members' pages from its drawer, the drawer stays yours.
 */
export function holdsSpace(members: SpacePin[], ref: SpaceRef): boolean {
  return ref.kind !== "home" && ref.kind !== "collection" && members.some((m) => m.kind === ref.kind && m.id === ref.id);
}
