/**
 * Use a vendor's one-number bid on the Proposed budget (Coy, 2026-10-24; src/lib/bid-ref.ts):
 * one whole-job line at the bid's total, marked with the bid, then — when asked — the lines
 * the bid priced taken off. Through the budget's own routes under Coy's session, on his tap
 * (the request sheet's Use this bid, or Dusty's use_bid step). Nothing is written twice: a
 * budget already carrying this vendor's bid says so.
 */

import { call } from "@/components/v34/cost-cards";
import { bidCovers, bidLineName, bidRef, markBid } from "@/lib/bid-ref";

interface ShownLine { key: string; supplied: boolean; group?: "labor" | "materials" | "equipment" | "other" | null }
export interface BidToBudget {
  jobId: string; requestId: string; recipientId: string;
  vendor: string; answeredAt: string | null; total: number;
  scopes: Array<{ lines: ShownLine[] }>;
  /** Take off the budget lines the bid priced. */
  replace: boolean;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }) : null);

export async function applyBidToBudget(x: BidToBudget): Promise<{ ok: boolean; text: string }> {
  if (!(x.total > 0)) return { ok: false, text: "That bid has no total to use." };
  const { keys, cost_type } = bidCovers(x.scopes);
  const bud = await call(`/api/jobs/${x.jobId}/budget`, "GET");
  const lines = (bud.lines ?? []) as Array<{ id: string; description: string | null }>;
  if (lines.some((l) => bidRef(l.description)?.recipient === x.recipientId)) {
    return { ok: false, text: `${x.vendor}'s bid is already on the budget — nothing changed.` };
  }
  const on = new Set(lines.map((l) => l.id));
  const covered = keys.filter((k) => on.has(k));
  const label = `${x.vendor}, answered ${day(x.answeredAt) ?? "—"}`;
  await call(`/api/jobs/${x.jobId}/budget/lines`, "POST", {
    name: bidLineName(x.vendor, cost_type), cost_type, unit: "Lump Sum", qty_rule: "per_job",
    unit_cost: Math.round(x.total * 100) / 100, taxable: false,
    description: markBid(null, { label, request: x.requestId, recipient: x.recipientId }),
  });
  let gone = 0;
  if (x.replace) {
    for (const id of covered) {
      try { await call(`/api/jobs/${x.jobId}/budget/lines/${id}`, "DELETE"); gone += 1; } catch { /* taken off since */ }
    }
  }
  const money = `$${x.total.toLocaleString("en-US", { minimumFractionDigits: x.total % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return { ok: true, text: `Added ${bidLineName(x.vendor, cost_type)} at ${money} to the whole-job costs${x.replace ? ` and took off the ${gone} line${gone === 1 ? "" : "s"} it covers` : ""}. It links back to the bid.` };
}
