/**
 * A vendor's bid used on the budget (Coy, 2026-10-24: Luis priced the Wiggins
 * labor as one number — "i would add his labor price to the job labor total and
 * remove the individual labor items in the sections. And I would want his bid
 * linked as a reference in the budget").
 *
 * Using a one-number bid puts ONE whole-job line on the budget at the bid's total,
 * of the cost type the bid covered, and takes off the lines the bid priced. The
 * line remembers the bid in its description — "Bid — Luis, answered Oct 23
 * [bid:<request>:<recipient>]" — which the budget draws as a link to the request
 * and the proposal never shows. No migration: the description is where a line's
 * note already lives (as Dusty's estimate mark, estimate-flag.ts). Pure —
 * tests/bid-ref.test.mjs runs it.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MARK_RE = new RegExp(`(?:^|\\s·\\s)Bid — ([^\\[]{1,160}?)\\s*\\[bid:(${UUID}):(${UUID})\\]`, "i");

export interface BidRef { label: string; request: string; recipient: string }

/** The bid a line was priced from, read off its description; null when there is none. */
export function bidRef(description: string | null | undefined): BidRef | null {
  const m = description ? MARK_RE.exec(description) : null;
  return m ? { label: m[1].trim(), request: m[2].toLowerCase(), recipient: m[3].toLowerCase() } : null;
}

/** The description without the bid mark — what the proposal shows and the note box edits. */
export function unmarkBid(description: string | null | undefined): string | null {
  if (!description) return null;
  const t = description.replace(MARK_RE, "").trim();
  return t || null;
}

/** A description carrying the bid mark after any note (one mark only), 500 characters at most. */
export function markBid(description: string | null | undefined, ref: BidRef): string {
  const label = ref.label.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "Vendor's bid";
  const mark = `Bid — ${label} [bid:${ref.request}:${ref.recipient}]`;
  const note = unmarkBid(description);
  return note ? `${note.slice(0, 500 - mark.length - 3)} · ${mark}` : mark;
}

/** Where a bid opens: the job's Summary with the request open. */
export function bidHref(jobId: string, request: string): string {
  return `/dashboard/scope/${jobId}/summary?bid=${request}`;
}

type Group = "labor" | "materials" | "equipment" | "other";
interface Line { key: string; supplied: boolean; group?: Group | null }

/**
 * What using a one-number bid does to the budget: the lines it priced (not the ones the org supplies)
 * and the cost type its one line gets — the group the lines were in when they were all one, else
 * subcontract (a sub pricing labor and material together).
 */
export function bidCovers(scopes: Array<{ lines: Line[] }>): { keys: string[]; cost_type: "labor" | "materials" | "equipment" | "other" | "subcontract" } {
  const lines = scopes.flatMap((s) => s.lines).filter((l) => !l.supplied);
  const keys = [...new Set(lines.map((l) => l.key))];
  const groups = [...new Set(lines.map((l) => l.group ?? "other"))];
  return { keys, cost_type: groups.length === 1 ? groups[0] : "subcontract" };
}

const TYPE_WORD: Record<string, string> = { labor: "Labor", materials: "Materials", equipment: "Equipment", other: "Other", subcontract: "Subcontract" };

/** The line's name: "Labor — Luis's bid". */
export function bidLineName(vendor: string, costType: string): string {
  const who = vendor.trim() || "Vendor";
  return `${TYPE_WORD[costType] ?? "Subcontract"} — ${who}'s bid`.slice(0, 120);
}

interface AnswerLine { name: string; unit: string | null; qty?: number | null; price: number }
export interface BidForDusty {
  id: string; created_at: string; price_mode: string | null; price_by: string | null; note: string | null;
  scopes: Array<{ title: string; lines: Array<Line & { name: string; qty: number | null; unit: string | null }> }>;
  recipients: Array<{ id: string; name: string; sent_at: string | null; opened_at: string | null; view_count: number | null; answered_at: string | null;
    price_total: number | null; price_lines: AnswerLine[] | null; answer_note: string | null; revoked_at: string | null }>;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }) : "");
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Dusty's lines for the bids on a job (Coy, 2026-10-24: Luis answered and Dusty "can't see the bid request
 * page itself"): each request, what it asked for, and each vendor's answer — their total or lines and note —
 * with the full recipient id a use_bid plan step names, and whether a budget line already carries that bid.
 */
export function bidAnswerLines(reqs: BidForDusty[], usedBy: Map<string, string>): string[] {
  const out: string[] = [];
  for (const r of reqs) {
    const asked = r.scopes.flatMap((s) => s.lines.filter((l) => !l.supplied).map((l) => `${s.title}: ${l.name}${l.qty !== null ? ` ${l.qty} ${l.unit ?? ""}`.trimEnd() : ""}`));
    out.push(`Bid request sent ${day(r.created_at)}${r.price_by ? ` · price by ${r.price_by}` : ""} · priced as ${r.price_mode === "per_item" ? "a price per line" : r.price_mode === "their_rates" ? "their rates" : "one lump sum"} · asked for: ${asked.slice(0, 20).join("; ") || "nothing listed"}${asked.length > 20 ? ` (+${asked.length - 20} more)` : ""}${r.note ? ` · note sent: ${r.note.slice(0, 200)}` : ""}`);
    for (const x of r.recipients) {
      const lines = x.price_lines ?? [];
      const sum = lines.reduce((t, l) => t + (l.qty ?? 1) * l.price, 0);
      const total = x.price_total !== null ? Number(x.price_total) : lines.length ? sum : null;
      const state = x.revoked_at ? "link turned off" : x.answered_at ? `ANSWERED ${day(x.answered_at)}: ${total !== null ? usd(total) : "no price"}${lines.length ? ` by line (${lines.slice(0, 12).map((l) => `${l.name} ${usd(l.price)}${l.unit ? `/${l.unit}` : ""}`).join("; ")})` : " as one total"}${x.answer_note ? ` · their note: "${x.answer_note.slice(0, 300)}"` : ""}`
        : x.opened_at ? `opened ${x.view_count ?? 1}× — no price yet` : x.sent_at ? "sent, not opened" : "not sent";
      const used = usedBy.get(x.id);
      out.push(`- ${x.name} (recipient ${x.id}): ${state}${used ? ` · ALREADY ON THE BUDGET as "${used}"` : ""}`);
    }
  }
  return out;
}
