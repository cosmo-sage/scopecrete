/**
 * The proposal's maths (migration 060; Claude Design, design/proposal) — pure,
 * tested in tests/proposal.test.mjs.
 *
 * A proposal is the job's budget made presentable; it never prices anything
 * itself. budget() in src/lib/engine prices every line; this file only:
 *   - rounds the customer's price UP to the next whole dollar (Coy,
 *     2026-10-22: "round up to the nearest dollar, but that's it" — it was
 *     $50); the proposal total only, the budget, the Dashboard and Dusty keep
 *     the exact number; the extra is profit;
 *   - spreads that rounded price over the lines in proportion to their own
 *     prices, so the visible items add up to the total exactly, to the cent;
 *   - applies what Coy hides: a hidden line or group drops out of the total, a
 *     hidden price shows "—" but still counts, an add-on is listed apart;
 *   - shows the pass-through tax as its own line, or folds it into the groups
 *     (the customer's total is the same either way);
 *   - checks the draw schedule against the total.
 */

import { unmark } from "./estimate-flag.ts";
import type { IfFindLine, ProposalPage } from "./proposal-pages.ts";
import { budget, quantities, type BudgetLine, type BudgetResult, type BudgetSettings, type SectionInput, type TakeoffTotal, type TierTotal } from "./engine/index.ts";

export interface ProposalDisplay {
  /** Sections of the document switched off: cover, header, scope, pricing, pay, warranty, terms, sign. */
  off?: Record<string, boolean>;
  /** Pricing groups (an area's id, or "job") left out of the proposal and its total. */
  groupsOff?: Record<string, boolean>;
  /** Lines left out of the proposal and its total. */
  linesOff?: Record<string, boolean>;
  /** Group or line keys whose price shows "—" (still counted in the total). */
  pricesOff?: Record<string, boolean>;
  /** Lines offered as optional add-ons — priced, listed, never in the total. */
  addons?: string[];
  show_item_prices?: boolean;
  show_qty?: boolean;
  show_tax_line?: boolean;
  /** Areas whose map and photos are left off the Scope (Coy, 2026-10-03: "the map view + photos for that map area"). */
  picsOff?: Record<string, boolean>;
  /** Every area's map and photos off at once. */
  hide_area_pics?: boolean;
  /** Offer every good / better / best option and let the customer pick (Coy, 2026-10-03: "send option and multiple quotes to the customer"). */
  all_options?: boolean;
  /** Marked a preliminary estimate: the band, the quote's name and a line above the price say so (Coy, 2026-10-07). */
  preliminary?: boolean;
  /** The cover page (Coy, 2026-10-22: "the cover to be built into the proposal itself and fill a full sheet of paper"). */
  cover?: ProposalCover;
  /** The proposal's pages, in order (Proposal Builder v2, 2026-10-23; src/lib/proposal-pages.ts). None → the old sections. */
  pages?: ProposalPage[];
  /** "If we find…" — unit prices for what can't be seen yet, never in the total. */
  ifind?: IfFindLine[];
  /** The date the price holds to, YYYY-MM-DD (blank → "valid 30 days"). */
  valid_until?: string;
}

/** How the cover is drawn: a full letter-size sheet (Field or Pour) or the old photo strip. */
export interface ProposalCover {
  style?: "field" | "pour" | "strip";
  /** The sheet's dark colour and its accent, as #rrggbb. */
  dark?: string;
  accent?: string;
  /** Field's line by the logo — a license number, "Licensed & insured" (blank = none). */
  tag?: string;
  /** Pour's three short lines along the foot (blank ones left out). */
  lines?: string[];
  /** The camera stamp on the cover photo — its date and where it was taken (on unless switched off). */
  stamp?: boolean;
}

export const COVER_STYLES: Array<[NonNullable<ProposalCover["style"]>, string]> = [["field", "Field"], ["pour", "Pour"], ["strip", "Photo strip"]];
/** Colour pairs offered on the cover; the first is the default (Sacco's navy and orange, from the logo). */
export const COVER_COLORS: Array<{ name: string; dark: string; accent: string }> = [
  { name: "Navy & orange", dark: "#01224B", accent: "#DC5509" },
  { name: "Charcoal & terracotta", dark: "#2A2A2A", accent: "#D97757" },
  { name: "Forest & gold", dark: "#173B2C", accent: "#D19A2A" },
  { name: "Steel & red", dark: "#26313D", accent: "#C8372D" },
  { name: "Black & yellow", dark: "#151515", accent: "#F2B705" },
];
const HEX = /^#[0-9a-fA-F]{6}$/;
// Line breaks and tabs become spaces; spaces are kept, so a word can still be typed after one.
const clip = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\r\n\t]+/g, " ").slice(0, max) : "");

/** The name a printed or saved proposal gets: its job's title and number, nothing a file name can't hold. */
export function proposalFileName(title: string | null | undefined, number: string | null | undefined): string {
  const clean = (x: string | null | undefined) => (x ?? "").replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return [clean(title) || "Proposal", clean(number)].filter(Boolean).join(" - ").slice(0, 120);
}

/** A cover as it may be saved: known style, real colours, short words. Nothing usable → undefined. */
export function cleanCover(x: unknown): ProposalCover | undefined {
  if (!x || typeof x !== "object") return undefined;
  const r = x as Record<string, unknown>;
  const out: ProposalCover = {};
  if (r.style === "field" || r.style === "pour" || r.style === "strip") out.style = r.style;
  if (typeof r.dark === "string" && HEX.test(r.dark)) out.dark = r.dark.toUpperCase();
  if (typeof r.accent === "string" && HEX.test(r.accent)) out.accent = r.accent.toUpperCase();
  const tag = clip(r.tag, 60);
  if (tag.trim()) out.tag = tag;
  if (Array.isArray(r.lines)) out.lines = r.lines.slice(0, 3).map((l) => clip(l, 48));
  if (typeof r.stamp === "boolean") out.stamp = r.stamp;
  return Object.keys(out).length ? out : undefined;
}

/** The cover to draw: what was saved, else Field in the first colours. */
export function coverOf(d: ProposalDisplay | null | undefined): Required<Omit<ProposalCover, "tag">> & { tag: string } {
  const c = cleanCover(d?.cover) ?? {};
  const lines = [0, 1, 2].map((i) => c.lines?.[i] ?? "");
  return { style: c.style ?? "field", dark: c.dark ?? COVER_COLORS[0].dark, accent: c.accent ?? COVER_COLORS[0].accent, tag: c.tag ?? "", lines, stamp: c.stamp ?? true };
}

export interface ProposalArea { id: string; name: string | null; sqft: number | null }

export interface ProposalItem {
  id: string; name: string; note: string | null;
  qty: number | null; unit: string;
  /** What the customer pays for this line, on the proposal (to the cent). */
  sell: number;
  hidden: boolean; price_hidden: boolean; addon: boolean;
}
export interface ProposalGroup {
  key: string; name: string; sqft: number | null;
  /** Σ of its visible, non-add-on items (+ its share of tax when the tax line is off). */
  sell: number;
  hidden: boolean; price_hidden: boolean;
  items: ProposalItem[];
}
export type ProposalPrice =
  | { ok: false; blocked: string[]; /** When the add-ons are why: each, by name, so the page can put it back. */ addons?: Array<{ id: string; name: string }> }
  | {
    ok: true;
    /** Cost side, before any hiding — what the job costs and earns. */
    cost: number; overhead: number; calc: number; rounded: number; profit: number; margin: number;
    by_type: Record<"material" | "labor" | "equipment" | "other", number>;
    /** Customer side, after hiding. */
    groups: ProposalGroup[];
    subtotal: number; tax: number; tax_shown: boolean; discount: number; total: number;
    addons_total: number;
  };

export const ROUND_TO = 1;
const cents = (n: number) => Math.round(n * 100) / 100;

/** Up to the next whole dollar. A price already on a whole dollar stays. */
export function roundUp(n: number, step = ROUND_TO): number {
  return n > 0 ? Math.ceil(Math.round(n * 100) / 100 / step) * step : 0;
}

function typeOf(t: string): "material" | "labor" | "equipment" | "other" {
  return t === "material" || t === "labor" || t === "equipment" ? t : "other";
}

export function priceProposal(
  lines: Array<BudgetLine & { description?: string | null }>,
  res: BudgetResult, tier: TierTotal, areas: ProposalArea[], d: ProposalDisplay,
): ProposalPrice {
  const addons = new Set(d.addons ?? []);
  const inTier = lines.filter((l) => tier.line_ids.includes(l.id));
  const counted = inTier.filter((l) => !addons.has(l.id));
  const blocked = [...new Set(inTier.flatMap((l) => res.lines[l.id]?.blocked ?? []))];
  if (!counted.length) return { ok: false, blocked: [inTier.length
    ? `Every line is marked an optional add-on — mark at least one as part of the price (${inTier.length} add-on${inTier.length === 1 ? "" : "s"})`
    : "Nothing on the budget for this option yet"], addons: inTier.map((l) => ({ id: l.id, name: l.name })) };
  if (blocked.length) return { ok: false, blocked };

  const r = (l: BudgetLine) => res.lines[l.id];
  const cost = counted.reduce((a, l) => a + (r(l).ext_cost ?? 0), 0);
  const overhead = counted.reduce((a, l) => a + (r(l).overhead ?? 0), 0);
  const calc = counted.reduce((a, l) => a + (r(l).ext_price ?? 0), 0);
  const rounded = roundUp(calc);
  const profit = rounded - cost - overhead;
  const factor = calc > 0 ? rounded / calc : 0;
  const by_type = { material: 0, labor: 0, equipment: 0, other: 0 };
  for (const l of counted) by_type[typeOf(String(l.cost_type))] += r(l).ext_cost ?? 0;

  // Sell prices: in proportion, to the cent; the largest line takes the remainder so they add to `rounded`.
  const sell = new Map<string, number>();
  for (const l of inTier) sell.set(l.id, cents((r(l).ext_price ?? 0) * factor));
  const diff = cents(rounded - counted.reduce((a, l) => a + (sell.get(l.id) ?? 0), 0));
  if (diff !== 0) {
    const big = counted.reduce((m, l) => ((r(l).ext_price ?? 0) > (r(m).ext_price ?? 0) ? l : m), counted[0]);
    sell.set(big.id, cents((sell.get(big.id) ?? 0) + diff));
  }

  const groupOf = (l: BudgetLine) => l.section_id && areas.some((a) => a.id === l.section_id) ? l.section_id : "job";
  const keys = [...areas.map((a) => a.id), "job"];
  const groups: ProposalGroup[] = [];
  for (const key of keys) {
    const mine = inTier.filter((l) => groupOf(l) === key);
    if (!mine.length) continue;
    const area = areas.find((a) => a.id === key);
    const gHidden = d.groupsOff?.[key] === true;
    const items: ProposalItem[] = mine.map((l) => ({
      id: l.id, name: l.name, note: unmark(l.description), // Dusty's estimate mark is Coy's, never the customer's
      qty: r(l).qty, unit: l.unit, sell: sell.get(l.id) ?? 0,
      hidden: d.linesOff?.[l.id] === true, price_hidden: d.pricesOff?.[l.id] === true, addon: addons.has(l.id),
    }));
    const gsell = items.filter((i) => !i.hidden && !i.addon).reduce((a, i) => a + i.sell, 0);
    groups.push({ key, name: area ? area.name || "An area" : "Whole job", sqft: area?.sqft ?? null, sell: cents(gsell), hidden: gHidden, price_hidden: d.pricesOff?.[key] === true, items });
  }

  // Tax: the pass-through on the lines still in the proposal.
  const live = (g: ProposalGroup) => !g.hidden;
  const taxOf = (g: ProposalGroup) => g.items.filter((i) => !i.hidden && !i.addon).reduce((a, i) => a + (res.lines[i.id]?.tax ?? 0), 0);
  const tax = cents(groups.filter(live).reduce((a, g) => a + taxOf(g), 0));
  const tax_shown = d.show_tax_line === true;
  if (!tax_shown && tax > 0) {
    // Folded in: each taxed line carries its own tax, so the lines still add up to their group and nothing moves between groups.
    for (const g of groups) {
      if (!live(g)) continue;
      for (const i of g.items) if (!i.hidden && !i.addon) i.sell = cents(i.sell + (res.lines[i.id]?.tax ?? 0));
      g.sell = cents(g.sell + taxOf(g));
    }
  }
  const subtotal = cents(groups.filter(live).reduce((a, g) => a + g.sell, 0));
  const discount = tier.discount > 0 ? cents(tier.discount) : 0;
  const total = cents(subtotal + (tax_shown ? tax : 0) - discount);
  const addons_total = cents(groups.filter(live).reduce((a, g) => a + g.items.filter((i) => i.addon && !i.hidden).reduce((x, i) => x + i.sell, 0), 0));
  return {
    ok: true, cost: cents(cost), overhead: cents(overhead), calc: cents(calc), rounded, profit: cents(profit),
    margin: rounded > 0 ? profit / rounded : 0, by_type, groups, subtotal, tax, tax_shown, discount, total, addons_total,
  };
}

// --- the draw schedule -------------------------------------------------------

export interface Draw { pct?: number | null; amt?: number | null; when: string }

/** What a draw comes to: its $ when set, else its % of the total. */
export const drawAmount = (d: Draw, total: number) => (d.amt !== null && d.amt !== undefined ? d.amt : total * (d.pct ?? 0) / 100);

/** Draws must add up to the total within $1 before the proposal is printed or made final. */
export function drawsCheck(draws: Draw[], total: number): { sum: number; gap: number; ok: boolean; pct: number } {
  const sum = cents(draws.reduce((a, d) => a + drawAmount(d, total), 0));
  const gap = cents(sum - total);
  return { sum, gap, ok: Math.abs(gap) < 1, pct: total ? (sum / total) * 100 : 0 };
}

/** "Put the difference on the last draw": the last draw becomes whatever makes them add up. */
export function fixLastDraw(draws: Draw[], total: number): Draw[] {
  if (!draws.length) return [{ pct: 100, when: "On completion" }];
  const others = draws.slice(0, -1);
  // All the others in %: the last stays a % too, so it still fits when the price moves.
  const pctLeft = 100 - others.reduce((a, d) => a + (d.pct ?? 0), 0);
  if (others.every((d) => d.amt === null || d.amt === undefined) && pctLeft >= 0) {
    return [...others, { ...draws[draws.length - 1], pct: Math.round(pctLeft * 1e6) / 1e6, amt: null }];
  }
  const rest = others.reduce((a, d) => a + drawAmount(d, total), 0);
  const last = { ...draws[draws.length - 1], pct: null, amt: cents(Math.max(0, total - rest)) };
  return [...draws.slice(0, -1), last];
}

/** The org's name where a template says "Sacco Builders & Co" (the handoff's text came from Coy's quotes). */
export function fillOrg(text: string, orgName: string): string {
  return text.replace(/\{org\}/g, orgName);
}

// --- one call that prices a draft, on the page and on the server alike -------

export interface DraftInput {
  lines: Array<BudgetLine & { description?: string | null }>;
  optionIds: string[];
  settings: BudgetSettings;
  sections: Array<SectionInput & { id: string; name?: string | null }>;
  days: number | null;
  tax_on: boolean;
  discount: number;
  takeoff?: Record<string, TakeoffTotal>;
  option_id: string | null;
  display: ProposalDisplay;
  draws: Draw[];
}

/** The budget priced by the engine, the chosen tier, the proposal on top of it, and the draws checked. */
export function priceDraft(i: DraftInput) {
  const res = budget(i.lines, i.optionIds, i.settings, i.sections, i.days, { tax_on: i.tax_on, discount: i.discount, takeoff: i.takeoff });
  const tier = (i.option_id ? res.tiers.find((t) => t.option_id === i.option_id) : null) ?? res.tiers[0];
  const areas: ProposalArea[] = i.sections.map((s) => ({ id: s.id, name: s.name ?? null, sqft: quantities(s).sqft }));
  const priced = priceProposal(i.lines, res, tier, areas, i.display ?? {});
  const check = priced.ok ? drawsCheck(i.draws ?? [], priced.total) : null;
  return { res, tier, priced, check, areas };
}

// --- the customer picks: every option priced, side by side -------------------

export interface ProposalChoice {
  id: string; label: string;
  /** The option's proposal total (rounded, as priceProposal makes it), or why it can't be priced. */
  total: number | null; blocked: string | null;
  /** The lines only this option has, by name. */
  own: string[];
}

/**
 * "Let the customer choose" (display.all_options): each option priced the way
 * its own proposal would be, what each one adds, and the lines every option
 * shares. With more than one total the draws can only be percentages — a $
 * draw can't fit two totals — and must come to 100%.
 */
export function priceChoices(i: DraftInput, options: Array<{ id: string; label: string }>): {
  choices: ProposalChoice[]; shared: string[]; check: { sum: number; gap: number; ok: boolean; pct: number };
} {
  const hidden = (id: string) => i.display.linesOff?.[id] === true || (i.display.addons ?? []).includes(id);
  const choices = options.map((o) => {
    const { priced } = priceDraft({ ...i, option_id: o.id });
    const own = i.lines.filter((l) => l.option_id === o.id && !hidden(l.id)).map((l) => l.name);
    return { id: o.id, label: o.label, total: priced.ok ? priced.total : null, blocked: priced.ok ? null : priced.blocked[0] ?? "Not priced", own };
  });
  const shared = i.lines.filter((l) => l.option_id === null && !hidden(l.id)).map((l) => l.name);
  const draws = i.draws ?? [];
  const pct = Math.round(draws.reduce((a, d) => a + (d.pct ?? 0), 0) * 100) / 100;
  const dollars = draws.some((d) => d.amt !== null && d.amt !== undefined);
  return { choices, shared, check: { sum: pct, gap: pct - 100, ok: !dollars && Math.abs(pct - 100) < 0.05, pct } };
}

// --- warranty and terms: the template, or the proposal's own edit -------------

export interface DocTemplate {
  id: string; kind: "warranty" | "terms"; name: string; project_types: string[];
  title: string | null; body: string | null; clauses: Clause[] | null; starter: boolean;
}
export interface Clause { h: string; b: string }

/** The warranty as the proposal shows it: its own edit, else the template's text, with the org's name filled in. */
export function warrantyText(w: { template_id?: string | null; title?: string; body?: string } | null | undefined, templates: DocTemplate[], org: string) {
  const t = templates.find((x) => x.id === w?.template_id && x.kind === "warranty") ?? null;
  const edited = typeof w?.title === "string" || typeof w?.body === "string";
  return {
    template: t, edited, starter: !!t?.starter && !edited,
    title: fillOrg(w?.title ?? t?.title ?? "Warranty", org),
    body: fillOrg(w?.body ?? t?.body ?? "", org),
  };
}

export function termsText(x: { template_id?: string | null; clauses?: Clause[] } | null | undefined, templates: DocTemplate[], org: string) {
  const t = templates.find((y) => y.id === x?.template_id && y.kind === "terms") ?? null;
  const edited = Array.isArray(x?.clauses);
  return {
    template: t, edited, starter: !!t?.starter && !edited,
    title: t?.title ?? "Terms & conditions",
    clauses: (x?.clauses ?? t?.clauses ?? []).map((c) => ({ h: fillOrg(c.h, org), b: fillOrg(c.b, org) })),
  };
}

// --- Dusty's words, brought into the document by Coy's tap ------------------

/** Markdown from a Dusty answer as plain text for the document: no **, #, list bullets or code ticks. */
export function plainText(md: string): string {
  return md.replace(/\r/g, "")
    .split("\n").map((l) => l.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]*)`/g, "$1"))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * A Dusty answer as contract clauses: one clause per paragraph or list item;
 * a heading is a bold lead ("**Payment** …" / "**Payment:**"), a "Heading:"
 * lead, or a markdown heading line above the text.
 */
export function parseClauses(md: string): Clause[] {
  const out: Clause[] = [];
  let pending: string | null = null;
  const blocks = md.replace(/\r/g, "").split(/\n\s*\n|\n(?=\s*(?:[-*+]|\d+[.)])\s)/);
  for (const raw of blocks) {
    let t = raw.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, "");
    if (!t) continue;
    const head = /^#{1,6}\s+(.+)$/.exec(t.split("\n")[0]);
    if (head && !t.includes("\n")) { pending = plainText(head[1]); continue; }
    if (head) { pending = plainText(head[1]); t = t.slice(t.indexOf("\n") + 1); }
    let h = pending ?? "";
    pending = null;
    const bold = /^\*\*(.+?)\*\*[:.]?\s*([\s\S]*)$/.exec(t);
    const colon = /^([A-Z][^:\n]{1,60}):\s+([\s\S]+)$/.exec(t);
    if (!h && bold) { h = bold[1].replace(/[:.]$/, ""); t = bold[2]; }
    else if (!h && colon) { h = colon[1]; t = colon[2]; }
    out.push({ h: plainText(h), b: plainText(t) });
  }
  return out.filter((c) => c.h || c.b).slice(0, 60);
}
