/**
 * The partner's commission on a job (Coy, 2026-10-10: "Commission cost: 0% / 20% / 30% / 40% /
 * 50% … 0% default … the % represents the commission given to the partner"). A share of the
 * profit, kept on the proposal draft's display as `commission_pct`; never on the document and
 * never in the price. It replaced the 20/80 · 30/70 "profit split with a sub", which gave the
 * sub the larger part — an old split reads as 20% or 30%.
 */
export const COMMISSION_STEPS = [0, 20, 30, 40, 50] as const;

export function commissionOf(display: unknown, split?: unknown): number {
  const c = Number((display as { commission_pct?: unknown } | null | undefined)?.commission_pct);
  if (Number.isFinite(c) && c >= 0 && c <= 100) return c;
  return split === "20_80" ? 20 : split === "30_70" ? 30 : 0;
}

/** What the partner gets and what is kept, from the profit. */
export function commissionSplit(profit: number, pct: number): { partner: number; kept: number } {
  const partner = Math.round(profit * pct) / 100;
  return { partner, kept: Math.round((profit - partner) * 100) / 100 };
}
