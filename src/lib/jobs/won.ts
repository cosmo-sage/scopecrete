/**
 * A won job's win date and contract (Coy, 2026-10-09: "a way to change the status of a project
 * that was quoted to active or won"). Pure — tested in tests/job-won.test.mjs.
 *
 * The contract is the proposal the customer said yes to: the newest FINAL version frozen at or
 * before the job was won. A final can't change (sc_job_proposal_guard), so the price is locked by
 * being read this way — no copy is stored. A version frozen after the win (a revision) is named
 * but never replaces it; work added after the yes is a change order (migration 094), and signed
 * change orders add to the contract.
 */

export interface FinalProposal {
  id: string; version: number; finalized_at: string | null;
  number: string | null; total: number | null;
}
export interface ChangeOrderRow { price: number | null; signed_at: string | null }
export interface Contract {
  proposal_id: string; version: number; number: string | null; finalized_at: string | null;
  /** The proposal's total as the customer saw it (rounded, tax included). */
  total: number | null;
  /** Signed change orders' price added to it, and how many. */
  change_orders: number; change_order_count: number;
  /** total + change_orders, or null when the proposal has no total. */
  contract_total: number | null;
  /** A final version made after the win — shown, never taken as the contract. */
  later_version: number | null;
}

/** "2026-10-08" → noon Central that day as ISO, if it is a real day no later than `now`. */
export function wonAtFromDay(day: string, now: Date): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 17, 0, 0));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  // Noon Central is 17:00 or 18:00 UTC; a day after today (Central) is refused.
  const todayCentral = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const today = Date.UTC(todayCentral.getFullYear(), todayCentral.getMonth(), todayCentral.getDate());
  if (Date.UTC(+m[1], +m[2] - 1, +m[3]) > today) return null;
  if (+m[1] < 2000) return null;
  return d.toISOString();
}

/** The proposal a job was won on, and its price with signed change orders. Null when there is none. */
export function contractFor(finals: FinalProposal[], wonAt: string | null, changeOrders: ChangeOrderRow[] = []): Contract | null {
  const ordered = finals.filter((f) => f.finalized_at).sort((a, b) => (a.finalized_at! < b.finalized_at! ? 1 : -1));
  if (!ordered.length) return null;
  const won = wonAt ? Date.parse(wonAt) : null;
  const pick = won == null ? ordered[0] : ordered.find((f) => Date.parse(f.finalized_at!) <= won) ?? null;
  if (!pick) return null;
  const later = ordered.find((f) => f.version > pick.version) ?? null;
  const signed = changeOrders.filter((c) => c.signed_at && c.price != null);
  const co = Math.round(signed.reduce((s, c) => s + Number(c.price), 0) * 100) / 100;
  return {
    proposal_id: pick.id, version: pick.version, number: pick.number, finalized_at: pick.finalized_at,
    total: pick.total, change_orders: co, change_order_count: signed.length,
    contract_total: pick.total == null ? null : Math.round((pick.total + co) * 100) / 100,
    later_version: later?.version ?? null,
  };
}
