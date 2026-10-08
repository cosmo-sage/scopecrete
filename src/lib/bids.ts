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
 *  - answerTotal(): what a price per line adds up to.
 */

export const TRADES = [
  "Flatwork", "Finishing", "Stamping", "Curb & gutter", "Foundations", "Rebar & steel", "Ready-mix", "Pumping",
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

// ---------------------------------------------------------------- scopes

/** A scope as the composer reads it (Coy's side: the line's type comes along, never its cost). */
export interface ComposeLine { id: string; name: string; unit: string | null; qty: number | null; cost_type: string | null }
export interface ComposeScope { key: string; title: string; size: string | null; lines: ComposeLine[] }

/** What the vendor sees. */
export interface ShownLine { key: string; name: string; qty: number | null; unit: string | null; supplied: boolean }
export interface ShownScope { key: string; title: string; size: string | null; lines: ShownLine[] }

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
      lines.push({
        key: String(l.id).slice(0, 80),
        name: String(l.name ?? "").slice(0, 200),
        qty: pick.quantities === false || l.qty === null || !Number.isFinite(Number(l.qty)) ? null : Math.round(Number(l.qty) * 100) / 100,
        unit: l.unit ? String(l.unit).slice(0, 20) : null,
        supplied: pick.supplied?.[l.id] ?? suppliedByDefault(l),
      });
    }
    if (lines.length) out.push({ key: s.key.slice(0, 80), title: s.title.slice(0, 120), size: pick.quantities === false ? null : s.size ? s.size.slice(0, 80) : null, lines });
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

/** A price per line, added up: qty × price on each line they price; a line with no quantity counts its price once. */
export function answerTotal(lines: ShownLine[], prices: Record<string, number | null | undefined>): number | null {
  let t = 0, any = false;
  for (const l of lines) {
    const p = prices[l.key];
    if (p === null || p === undefined || !Number.isFinite(p) || l.supplied) continue;
    any = true;
    t += (l.qty ?? 1) * p;
  }
  return any ? Math.round(t * 100) / 100 : null;
}
