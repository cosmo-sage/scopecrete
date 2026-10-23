/**
 * Bid requests to subs and suppliers (migration 091; Claude Design, Vendors
 * v2). Pure helpers, tested in tests/bids.test.mjs:
 *  - trades: a vendor's trades, cleaned; the list the Vendors page filters by;
 *  - shownScopes(): the vendor's copy of the scopes Coy ticked — names, sizes,
 *    lines with quantity and unit, and whether the org supplies the material.
 *    Built field by field, so a cost, price or margin can never ride along;
 *  - bidStats(): "4 of 5 answered · median 2h", from their rows;
 *  - bidText() / bidEmail(): the words that go with each vendor's link;
 *  - priorRates(): "their rates" — the price per unit they gave last time for
 *    a line of the same name and unit;
 *  - answerTotal(): what a price per line adds up to;
 *  - groupLines() / groupOf(): a section's lines as Labor · Materials · Equipment, like the Budget;
 *  - cleanRequirements(): what they're asked to send with the bid (insurance, W-9 …);
 *  - compareBids(): the answers side by side — missing and low prices, each section's cheapest;
 *  - budgetUnitCost(): a vendor's price as the budget line's unit cost.
 */

export const TRADES = [
  "Labor", "Flatwork", "Finishing", "Stamping", "Curb & gutter", "Foundations", "Rebar & steel", "Ready-mix", "Pumping",
  "Excavation & grading", "Demolition", "Disposal", "Lumber & forms", "Equipment rental",
] as const;

/** A vendor's trades as typed or picked: trimmed, one space, 40 characters, no repeats (case aside), 12 at most. */
export function cleanTrades(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!t || seen.has(t.toLowerCase())) continue;
    // A known trade keeps its own spelling.
    const known = TRADES.find((k) => k.toLowerCase() === t.toLowerCase());
    seen.add(t.toLowerCase());
    out.push(known ?? t);
    if (out.length >= 12) break;
  }
  return out;
}

/** Every trade to filter by: the known ones, then any the org's vendors carry, with counts. */
export function tradeCounts(vendors: Array<{ trades?: string[] | null }>): Array<{ trade: string; n: number }> {
  const n = new Map<string, number>();
  const spelled = new Map<string, string>();
  for (const v of vendors) for (const t of v.trades ?? []) {
    const k = t.toLowerCase();
    n.set(k, (n.get(k) ?? 0) + 1);
    if (!spelled.has(k)) spelled.set(k, t);
  }
  const known = TRADES.map((t) => ({ trade: t as string, n: n.get(t.toLowerCase()) ?? 0 }));
  const extra = [...spelled].filter(([k]) => !TRADES.some((t) => t.toLowerCase() === k))
    .map(([k, t]) => ({ trade: t, n: n.get(k) ?? 0 })).sort((a, b) => a.trade.localeCompare(b.trade));
  return [...known, ...extra];
}

export const hasTrade = (v: { trades?: string[] | null }, trade: string) => (v.trades ?? []).some((t) => t.toLowerCase() === trade.toLowerCase());

/** A sub who prices labor: filed under the Labor trade, or as a subcontractor / looking for work (Coy, 2026-10-15: Luis). */
export const laborVendor = (v: { trades?: string[] | null; subtype?: string | null }) =>
  hasTrade(v, "Labor") || v.subtype === "subcontractor" || v.subtype === "looking_for_work";

// ---------------------------------------------------------------- scopes

/** A scope as the composer reads it (Coy's side: the line's type comes along, never its cost). */
export interface ComposeLine { id: string; name: string; unit: string | null; qty: number | null; cost_type: string | null }
/**
 * A section's measurements, from its takeoffs or its typed size (the engine's quantities()):
 * the area in SF (SY is SF ÷ 9), a length in LF, or a count, and the thickness. `concrete` is a pour —
 * the job's total area counts pours only when there are any, so the base under them isn't counted twice.
 */
export interface Measure { sf: number | null; lf: number | null; count: number | null; count_unit: string | null; depth_in: number | null; concrete: boolean }
export interface ComposeScope { key: string; title: string; size: string | null; measure?: Measure | null; lines: ComposeLine[] }

/**
 * A line's group on the bid, as on the Budget (Claude Design "Bid requests", 2026-10-23): Labor ·
 * Materials · Equipment, anything else Other. Read from the budget line's cost type.
 */
export type BidGroup = "labor" | "materials" | "equipment" | "other";
export const GROUP_ORDER: BidGroup[] = ["labor", "materials", "equipment", "other"];
export const GROUP_LABEL: Record<BidGroup, string> = { labor: "Labor", materials: "Materials", equipment: "Equipment", other: "Other" };
export const groupOf = (costType: string | null | undefined): BidGroup =>
  costType === "labor" ? "labor" : costType === "material" || costType === "materials" ? "materials" : costType === "equipment" ? "equipment" : "other";

/**
 * A section's lines in their groups, Labor · Materials · Equipment · Other, each group's lines in their
 * own order. Lines sent before groups (no `group`) come back as one group with no name.
 */
export function groupLines<L extends { group?: BidGroup | null }>(lines: L[]): Array<{ group: BidGroup | null; lines: L[] }> {
  if (!lines.some((l) => l.group)) return lines.length ? [{ group: null, lines }] : [];
  return GROUP_ORDER.map((g) => ({ group: g as BidGroup | null, lines: lines.filter((l) => (l.group ?? "other") === g) })).filter((x) => x.lines.length > 0);
}

/** A group's tick from its lines' ticks: all in, some, or none. */
export function groupState(keys: string[], on: (key: string) => boolean): "all" | "some" | "none" {
  const n = keys.filter(on).length;
  return n === 0 ? "none" : n === keys.length ? "all" : "some";
}

/** What the vendor sees. */
export interface ShownLine { key: string; name: string; qty: number | null; unit: string | null; supplied: boolean; group?: BidGroup }
export interface ShownScope { key: string; title: string; size: string | null; measure?: Measure | null; lines: ShownLine[] }

/**
 * A unit of time: days, man-days, hours, weeks. Those quantities are Coy's own estimate of the crew's
 * time, never shown to a vendor (Coy, 2026-10-15: "I don't want to show the estimated amount of days") —
 * the line goes with no quantity or unit, priced as one amount.
 */
export const isTimeUnit = (u: string | null | undefined) =>
  /^\s*(man[\s-]*)?(days?|hrs?|hours?|weeks?|wks?|crew[\s-]*days?)\s*$/i.test(u ?? "") || /^\s*md\s*$/i.test(u ?? "");

const r2 = (n: number) => Math.round(n * 100) / 100;
const cleanMeasure = (m: Measure | null | undefined): Measure | null => {
  if (!m) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? r2(v) : null);
  const out: Measure = { sf: n(m.sf), lf: n(m.lf), count: n(m.count), count_unit: m.count_unit ? String(m.count_unit).slice(0, 12) : null, depth_in: n(m.depth_in), concrete: m.concrete === true };
  return out.sf || out.lf || out.count || out.depth_in ? out : null;
};

/** "2,583.81 SF · 287.09 SY · 7\" thick" — what a section measures, in the words the vendor reads. */
export function measureLabel(m: Measure | null | undefined): string | null {
  if (!m) return null;
  const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const parts: string[] = [];
  if (m.lf) parts.push(`${f(m.lf)} LF`);
  else if (m.sf) parts.push(`${f(m.sf)} SF`, `${f(r2(m.sf / 9))} SY`);
  else if (m.count) parts.push(`${f(m.count)} ${m.count_unit ?? "EA"}`);
  if (m.depth_in) parts.push(`${f(m.depth_in)}" thick`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The job's totals over the sections shown: area (pours only when any section is a pour), SY,
 * linear feet, and each count by its unit. Old requests carry no measure and add nothing.
 */
export function jobTotals(scopes: Array<Pick<ShownScope, "measure">>): { sf: number | null; sy: number | null; lf: number | null; counts: Array<{ unit: string; n: number }> } {
  const ms = scopes.map((s) => s.measure).filter((m): m is Measure => !!m);
  const areas = ms.filter((m) => !m.lf && m.sf);
  const pours = areas.filter((m) => m.concrete);
  const sf = (pours.length ? pours : areas).reduce((a, m) => a + (m.sf ?? 0), 0);
  const lf = ms.reduce((a, m) => a + (m.lf ?? 0), 0);
  const byUnit = new Map<string, number>();
  for (const m of ms) if (!m.lf && !m.sf && m.count) { const u = (m.count_unit ?? "EA").toUpperCase(); byUnit.set(u, (byUnit.get(u) ?? 0) + m.count); }
  return { sf: sf ? r2(sf) : null, sy: sf ? r2(sf / 9) : null, lf: lf ? r2(lf) : null, counts: [...byUnit].map(([unit, n]) => ({ unit, n: r2(n) })) };
}

/**
 * The yards of concrete in a section, worked out from its area and thickness (SF × in ÷ 324), only for
 * a pour with both — a curb in LF has no width here, so it says none rather than guessing.
 */
export function sectionYards(m: Measure | null | undefined): number | null {
  if (!m || !m.concrete || m.lf || !m.sf || !m.depth_in) return null;
  return Math.round((m.sf * m.depth_in) / 324 * 10) / 10;
}

/**
 * A section's size as two short parts for the phone's summary table: the main number ("18,299.64 SF",
 * "1,866.99 LF", "4 EA") and what goes beside it ("6\" · ≈ 338.8 CY", "2,033.29 SY").
 */
export function sizeParts(m: Measure | null | undefined): { main: string; sub: string | null } | null {
  if (!m) return null;
  const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const main = m.lf ? `${f(m.lf)} LF` : m.sf ? `${f(m.sf)} SF` : m.count ? `${f(m.count)} ${m.count_unit ?? "EA"}` : null;
  const yd = sectionYards(m);
  const sub = [m.sf && !m.lf ? `${f(r2(m.sf / 9))} SY` : null, m.depth_in ? `${f(m.depth_in)}"` : null, yd ? `≈ ${f(yd)} CY` : null].filter(Boolean).join(" · ");
  if (!main && !sub) return null;
  return { main: main ?? sub, sub: main ? sub || null : null };
}

/**
 * "Fri, Oct 24 · in 2 days" for a price-by date (a day, read in Central), and whether it is close
 * (2 days or less, or past). `today` is a YYYY-MM-DD in Central.
 */
export function dueLabel(iso: string | null | undefined, today: string): { text: string; soon: boolean } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`), t = Date.parse(`${today.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(t)) return null;
  const days = Math.round((d - t) / 86_400_000);
  const name = new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const rel = days === 0 ? "today" : days === 1 ? "tomorrow" : days > 1 ? `in ${days} days` : days === -1 ? "yesterday" : `${-days} days ago`;
  return { text: `${name} · ${rel}`, soon: days <= 2 };
}

/**
 * What the composer ticks to start: every section that measures something or has a line, every line —
 * or, for a labor sub, only the labor lines (Coy, 2026-10-15: "when sending the bid request to a sub like
 * Luis … it should default to all the Labor cost items"); the sections still show what they measure.
 */
export function defaultPick(scopes: ComposeScope[], laborOnly: boolean): { scopes: Record<string, boolean>; lines: Record<string, boolean> } {
  const sc: Record<string, boolean> = {}, ln: Record<string, boolean> = {};
  for (const s of scopes) {
    const labor = s.lines.filter((l) => l.cost_type === "labor");
    for (const l of s.lines) ln[l.id] = !laborOnly || l.cost_type === "labor";
    sc[s.key] = laborOnly ? !!s.measure || labor.length > 0 : !!s.measure || s.lines.length > 0;
  }
  return { scopes: sc, lines: ln };
}

/** A material line is supplied by the org unless Coy says otherwise (the sub prices labor). */
export const suppliedByDefault = (l: Pick<ComposeLine, "cost_type">) => l.cost_type === "material";

export interface ScopePick {
  /** Scopes ticked. */
  scopes: Record<string, boolean>;
  /** Lines unticked inside a ticked scope (false = left out). */
  lines?: Record<string, boolean>;
  /** Lines whose material the org supplies (overrides suppliedByDefault). */
  supplied?: Record<string, boolean>;
  /** Packet: quantities shown or not. */
  quantities?: boolean;
}

export function shownScopes(scopes: ComposeScope[], pick: ScopePick): ShownScope[] {
  const out: ShownScope[] = [];
  for (const s of scopes) {
    if (!pick.scopes[s.key]) continue;
    const lines: ShownLine[] = [];
    for (const l of s.lines) {
      if (pick.lines?.[l.id] === false) continue;
      const time = isTimeUnit(l.unit);
      lines.push({
        key: String(l.id).slice(0, 80),
        name: String(l.name ?? "").slice(0, 200),
        qty: time || pick.quantities === false || l.qty === null || !Number.isFinite(Number(l.qty)) ? null : Math.round(Number(l.qty) * 100) / 100,
        unit: time || !l.unit ? null : String(l.unit).slice(0, 20),
        supplied: pick.supplied?.[l.id] ?? suppliedByDefault(l),
        group: groupOf(l.cost_type),
      });
    }
    const measure = pick.quantities === false ? null : cleanMeasure(s.measure);
    // A section shows with what it measures even with none of its lines ticked (a labor sub prices the slab).
    if (lines.length || measure) out.push({ key: s.key.slice(0, 80), title: s.title.slice(0, 120), size: pick.quantities === false ? null : s.size ? s.size.slice(0, 80) : null, measure, lines });
  }
  return out;
}

// ---------------------------------------------------------------- what to send with it

/** The requirements offered as chips (the design's "With your bid"). Coy may type his own. */
export const REQUIREMENTS = ["Insurance certificate", "W-9", "1-year workmanship warranty", "Price good for 30 days"] as const;

/** What the vendor is asked to send with their bid: trimmed, 80 characters, no repeats, 8 at most. */
export function cleanRequirements(v: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(v) ? v : []) {
    if (typeof x !== "string") continue;
    const t = x.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

// ---------------------------------------------------------------- stats

export interface BidRow { sent_at: string | null; answered_at: string | null; opened_at?: string | null; revoked_at?: string | null }

export function hoursLabel(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 36) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)} days`;
}

/** Answered of sent, and how long a price usually takes (median, sent → answered). */
export function bidStats(rows: BidRow[]): { sent: number; answered: number; median_hours: number | null; label: string; speed: string | null } {
  const sent = rows.filter((r) => r.sent_at && !r.revoked_at);
  const answered = sent.filter((r) => r.answered_at);
  const hrs = answered.map((r) => (Date.parse(r.answered_at!) - Date.parse(r.sent_at!)) / 3_600_000).filter((h) => Number.isFinite(h) && h >= 0).sort((a, b) => a - b);
  const median = hrs.length ? (hrs.length % 2 ? hrs[(hrs.length - 1) / 2] : (hrs[hrs.length / 2 - 1] + hrs[hrs.length / 2]) / 2) : null;
  return {
    sent: sent.length, answered: answered.length, median_hours: median,
    label: sent.length ? `${answered.length} of ${sent.length} answered` : "No requests yet",
    speed: median === null ? null : `median ${hoursLabel(median)}`,
  };
}

// ---------------------------------------------------------------- words

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "";
const shortDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

export interface BidWords {
  name: string | null; org: string | null; job: string | null; scopes: string[];
  size?: string | null; street?: string | null; pour?: string | null; priceBy?: string | null; url: string;
}

/** The text that goes with one vendor's link. */
export function bidText(w: BidWords): string {
  const hi = firstName(w.name);
  const what = w.scopes.length ? w.scopes.map((s) => s.toLowerCase()).join(" and ").replace(/^./, (c) => c.toUpperCase()) : "Work";
  const parts = [
    `${hi ? `${hi} — ` : ""}${w.org ?? "We"} ${w.org ? "has" : "have"} ${w.job ? `a job for you: ${w.job}` : "a job for you"}.`,
    `${what}${w.size ? `, ${w.size}` : ""}${w.street ? ` at ${w.street}` : ""}${shortDate(w.pour) ? `, pour ${shortDate(w.pour)}` : ""}.`,
    `Photos, plans and quantities: ${w.url}`,
    `— tap, look, send a price${shortDate(w.priceBy) ? ` by ${shortDate(w.priceBy)}` : ""}. No login.`,
  ];
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The text to a vendor already on a request that was edited (migration 124): their link is the same,
 * the page shows the new version. Said plainly that it changed, and when an answer they sent needs a look.
 */
export function bidUpdateText(w: BidWords & { answered?: boolean }): string {
  const hi = firstName(w.name);
  return [
    `${hi ? `${hi} — ` : ""}${w.org ?? "We"} updated the bid request${w.job ? ` for ${w.job}` : ""}.`,
    w.answered ? "Please check your price against the changes and send it again." : "",
    shortDate(w.priceBy) ? `Price by ${shortDate(w.priceBy)}.` : "",
    `Same link: ${w.url}`,
  ].join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The composer's ticks for a request already sent: which of the job's sections and lines are on it
 * and who supplies each, read off the vendor's copy. A line added to the budget since is left to the
 * starting pick; a section no longer on the job simply drops.
 */
export function pickFromShown(jobScopes: ComposeScope[], shown: ShownScope[]): { scopes: Record<string, boolean>; lines: Record<string, boolean>; supplied: Record<string, boolean> } {
  const byKey = new Map(shown.map((s) => [s.key, s]));
  const out = { scopes: {} as Record<string, boolean>, lines: {} as Record<string, boolean>, supplied: {} as Record<string, boolean> };
  for (const s of jobScopes) {
    const was = byKey.get(s.key);
    out.scopes[s.key] = !!was;
    if (!was) continue;
    const ls = new Map(was.lines.map((l) => [l.key, l]));
    for (const l of s.lines) {
      const hit = ls.get(String(l.id).slice(0, 80));
      out.lines[l.id] = !!hit;
      if (hit) out.supplied[l.id] = !!hit.supplied;
    }
  }
  return out;
}

/** An answer sent before the request was last edited — it priced an older version. */
export const answeredBeforeEdit = (answeredAt: string | null | undefined, editedAt: string | null | undefined) =>
  !!answeredAt && !!editedAt && Date.parse(answeredAt) < Date.parse(editedAt);

export function bidEmail(w: BidWords): { subject: string; body: string } {
  return {
    subject: `Bid request${w.job ? ` — ${w.job}` : ""}${w.org ? ` (${w.org})` : ""}`,
    body: `${bidText(w)}\n\nYou can send your price from the page — a total, or a price per line. Thanks.`,
  };
}

// ---------------------------------------------------------------- prices

export interface PriceLine { key?: string | null; name: string; unit: string | null; qty?: number | null; price: number }

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Their last price per unit for each line of the same name and unit (newest answer first wins). */
export function priorRates(lines: ShownLine[], past: Array<{ at: string; lines: PriceLine[] }>): Record<string, number> {
  const out: Record<string, number> = {};
  const sorted = [...past].sort((a, b) => b.at.localeCompare(a.at));
  for (const l of lines) {
    if (l.supplied) continue;
    for (const p of sorted) {
      const hit = p.lines.find((x) => norm(x.name) === norm(l.name) && norm(x.unit) === norm(l.unit) && Number.isFinite(x.price));
      if (hit) { out[l.key] = hit.price; break; }
    }
  }
  return out;
}

/** A price per line, added up: qty × price on each line they price; a line with no quantity (or one in days, whose quantity isn't shown) counts its price once. */
export function answerTotal(lines: ShownLine[], prices: Record<string, number | null | undefined>): number | null {
  let t = 0, any = false;
  for (const l of lines) {
    const p = prices[l.key];
    if (p === null || p === undefined || !Number.isFinite(p) || l.supplied) continue;
    any = true;
    t += (isTimeUnit(l.unit) ? 1 : l.qty ?? 1) * p;
  }
  return any ? Math.round(t * 100) / 100 : null;
}

/** What one priced line comes to: qty × price, or the price once when no quantity was shown (days, one price). */
export const lineExt = (l: Pick<ShownLine, "qty" | "unit">, price: number) => Math.round((isTimeUnit(l.unit) || l.qty === null ? 1 : l.qty) * price * 100) / 100;

// ---------------------------------------------------------------- compare

export interface CompareInput { id: string; name: string; lines: PriceLine[] | null; total: number | null }
export interface CompareCell { unit: number | null; ext: number | null; missing: boolean; low: boolean }
export interface CompareLine { key: string; name: string; qty: number | null; unit: string | null; group: BidGroup | null; supplied: boolean; cells: CompareCell[] }
export interface CompareSection { key: string; title: string; size: string | null; lines: CompareLine[]; totals: Array<number | null>; full: boolean[]; low: number | null }
export interface Comparison { vendors: CompareInput[]; sections: CompareSection[]; totals: Array<number | null>; low: number | null; perLine: boolean[] }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/**
 * The bids side by side (Claude Design "Bid requests" 1f): for each line every vendor's price per unit
 * and what it comes to; a line nobody of theirs priced is **missing** (only for a vendor who priced by
 * line); a price under 60% of the median of the others' on that line is **low**. Each section's total
 * per vendor and whether they priced all of it; the whole bid per vendor (their lines added up, else the
 * one number they sent). `low` is the index of the cheapest complete total.
 */
export function compareBids(scopes: ShownScope[], vendors: CompareInput[]): Comparison {
  const perLine = vendors.map((v) => !!v.lines?.length);
  const priceOf = vendors.map((v) => new Map((v.lines ?? []).filter((x) => x.key && Number.isFinite(x.price)).map((x) => [x.key as string, Number(x.price)])));
  const cheapest = (vals: Array<number | null>, ok: boolean[]) => {
    let best: number | null = null;
    vals.forEach((t, i) => { if (t !== null && ok[i] && (best === null || t < (vals[best] as number))) best = i; });
    return best;
  };
  const sections: CompareSection[] = scopes.map((s) => {
    const lines: CompareLine[] = s.lines.map((l) => {
      const units = priceOf.map((m) => (l.supplied ? null : m.get(l.key) ?? null));
      const cells = units.map((u, i) => {
        const others = units.filter((x, j) => j !== i && x !== null) as number[];
        const med = median(others);
        return { unit: u, ext: u === null ? null : lineExt(l, u), missing: !l.supplied && perLine[i] && u === null, low: u !== null && med !== null && med > 0 && u < 0.6 * med };
      });
      return { key: l.key, name: l.name, qty: l.qty, unit: l.unit, group: l.group ?? null, supplied: l.supplied, cells };
    });
    const totals = vendors.map((_, i) => {
      if (!perLine[i]) return null;
      const xs = lines.map((l) => l.cells[i].ext).filter((x): x is number => x !== null);
      return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100 : null;
    });
    const full = vendors.map((_, i) => perLine[i] && lines.every((l) => l.supplied || l.cells[i].unit !== null));
    return { key: s.key, title: s.title, size: s.size, lines, totals, full, low: cheapest(totals, full) };
  });
  const totals = vendors.map((v, i) => {
    if (perLine[i]) {
      const xs = sections.map((s) => s.totals[i]).filter((x): x is number => x !== null);
      return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100 : v.total;
    }
    return v.total;
  });
  const whole = vendors.map((_, i) => !perLine[i] || sections.every((s) => s.full[i]));
  return { vendors, sections, totals, low: cheapest(totals, whole), perLine };
}

/**
 * The budget's unit cost from a vendor's price on a line: their price per unit as it is, or — for a line
 * sent with no quantity (days, one price) — their one price spread over the budget line's own quantity.
 */
export function budgetUnitCost(l: Pick<ShownLine, "qty" | "unit">, price: number, budgetQty: number | null): number {
  if (!isTimeUnit(l.unit) && l.qty !== null) return price;
  return budgetQty && budgetQty > 0 ? Math.round((price / budgetQty) * 10000) / 10000 : price;
}
