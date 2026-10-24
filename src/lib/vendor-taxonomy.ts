/**
 * Vendor kinds and trades (Coy, 2026-10-24: "I need vendor groups or types; like buckets inside
 * of buckets. Figure out the hierarchy" and "a place to quickly and easily modify, edit,
 * rearrange this lists of groups and kinds … so that dusty can find the correct vendor easily").
 *
 *   Vendor (the bucket) → Kind (org_contact_subtypes: Subcontractor, Supplier …) → Trade
 *   (org_vendor_trades, migration 129: Flatwork, Ready-mix …)
 *
 * A vendor has one kind and any number of trades; a trade sits under one kind, or none. Kinds are
 * the org's rows already; trades were a list in code (TRADES) until 129, and are read from it until
 * then with the kind each sits under here. Pure helpers, tested in tests/vendor-taxonomy.test.mjs.
 */
import { TRADES } from "./bids.ts";

export interface Kind { slug: string; label: string; n?: number }
export interface Trade { id?: string; name: string; kind: string | null; n?: number }

/** The kinds a new org starts with (and what the app shows when an org has none of its own). */
export const DEFAULT_KINDS: Kind[] = [
  { slug: "subcontractor", label: "Subcontractor" }, { slug: "supplier", label: "Supplier" },
  { slug: "equipment", label: "Equipment Rental" }, { slug: "services", label: "Services" },
  { slug: "looking_for_work", label: "Looking for work" }, { slug: "lead_gen", label: "Lead Generation" },
];

/** Where each of the app's own trades sits — the same as migration 129's seed. */
export const TRADE_KIND: Record<string, string> = {
  "Labor": "subcontractor", "Flatwork": "subcontractor", "Finishing": "subcontractor", "Stamping": "subcontractor",
  "Curb & gutter": "subcontractor", "Foundations": "subcontractor", "Pumping": "subcontractor",
  "Excavation & grading": "subcontractor", "Demolition": "subcontractor",
  "Ready-mix": "supplier", "Rebar & steel": "supplier", "Lumber & forms": "supplier",
  "Equipment rental": "equipment", "Disposal": "services",
};

/** The app's own trades, each under its kind — the list until 129 is applied. */
export const defaultTrades = (): Trade[] => TRADES.map((name) => ({ name, kind: TRADE_KIND[name] ?? null }));

const words = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A new kind's slug from its label: "Ready Mix" → "ready_mix"; never one already taken. */
export function kindSlug(label: string, taken: string[] = []): string {
  const base = label.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "kind";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
}

/** Kinds as sent from the editor: a label each, no repeats (case aside), 30 at most, in order. */
export function cleanKinds(v: unknown): Kind[] {
  if (!Array.isArray(v)) return [];
  const out: Kind[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const label = words((x as Kind)?.label, 40);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const slug = words((x as Kind)?.slug, 60);
    out.push({ slug: /^[a-z0-9_]+$/.test(slug) ? slug : kindSlug(label, out.map((k) => k.slug)), label });
    if (out.length >= 30) break;
  }
  return out;
}

/** Trades as sent from the editor: a name each (40 characters), a kind from `kinds` or none, no repeats, 120 at most. */
export function cleanTradeList(v: unknown, kinds: string[]): Trade[] {
  if (!Array.isArray(v)) return [];
  const ok = new Set(kinds);
  const out: Trade[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const name = words((x as Trade)?.name, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const kind = (x as Trade)?.kind;
    const id = typeof (x as Trade)?.id === "string" ? (x as Trade).id : undefined;
    out.push({ ...(id ? { id } : {}), name, kind: typeof kind === "string" && ok.has(kind) ? kind : null });
    if (out.length >= 120) break;
  }
  return out;
}

/** Trades under each kind, in the kinds' order, then "Other trades" for those under none (or a kind gone). */
export function groupTrades<T extends Trade>(kinds: Kind[], trades: T[]): Array<{ kind: Kind | null; trades: T[] }> {
  const known = new Set(kinds.map((k) => k.slug));
  const groups: Array<{ kind: Kind | null; trades: T[] }> = kinds.map((k) => ({ kind: k, trades: trades.filter((t) => t.kind === k.slug) }));
  const loose = trades.filter((t) => !t.kind || !known.has(t.kind));
  if (loose.length) groups.push({ kind: null, trades: loose });
  return groups;
}

/**
 * The org's trades with any a vendor carries that the list doesn't (no kind), so nothing typed
 * on a vendor is lost from the filters. Counts how many vendors carry each.
 */
export function withVendorTrades(list: Trade[], vendors: Array<{ trades?: string[] | null }>): Trade[] {
  const n = new Map<string, number>();
  const spelled = new Map<string, string>();
  for (const v of vendors) for (const t of v.trades ?? []) {
    const k = t.toLowerCase();
    n.set(k, (n.get(k) ?? 0) + 1);
    if (!spelled.has(k)) spelled.set(k, t);
  }
  const out = list.map((t) => ({ ...t, n: n.get(t.name.toLowerCase()) ?? 0 }));
  const have = new Set(list.map((t) => t.name.toLowerCase()));
  for (const [k, name] of [...spelled].sort((a, b) => a[1].localeCompare(b[1]))) if (!have.has(k)) out.push({ name, kind: null, n: n.get(k) ?? 0 });
  return out;
}

/** A trade renamed or removed, as the change to make to every vendor's `trades`. */
export function renameOnVendor(trades: string[] | null | undefined, from: string, to: string | null): string[] {
  const out: string[] = [];
  for (const t of trades ?? []) {
    const v = t.toLowerCase() === from.toLowerCase() ? to : t;
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

/** "Subcontractor › Flatwork, Finishing" — how Dusty is told the org's list. */
export function taxonomyLines(kinds: Kind[], trades: Trade[]): string[] {
  return groupTrades(kinds, trades).filter((g) => g.kind || g.trades.length)
    .map((g) => `${g.kind?.label ?? "Other trades"} › ${g.trades.map((t) => t.name).join(", ") || "(no trades)"}`);
}
