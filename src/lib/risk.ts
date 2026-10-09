/**
 * Risk on a job (migration 096; Coy, 2026-10-09: "scope creep pricing as a
 * tool needs to factor in the risk associated with both of these types of
 * markets" — residential vs commercial and government).
 *
 * A project type carries its risk settings (Price book → Defaults); a new
 * budget copies them, then the budget's own are changed on that job alone,
 * like O.H. and margin. Nothing is assumed: a blank is none, and none changes
 * no price.
 *
 *   contingency %       on cost, like O.H. — surprises under the old slab,
 *                       scope gaps between the plans and the specs
 *   risk items          the job's checklist (a bond, prevailing wage,
 *                       testing, liquidated damages, night work …): each
 *                       ticked one adds its % on cost
 *   carrying cost       the money you wait for: the whole price for
 *                       `pay_days`, and `retainage_pct` of it for
 *                       `retainage_days` more, at `carry_rate_pct` a year —
 *                       a slice of the price, like margin
 *
 *   price = (cost + O.H. + contingency + risk items) ÷ (1 − margin − carry)
 *
 * so the margin you set is still the margin you keep, after carrying cost.
 * Pure — tested in tests/risk.test.mjs.
 */

export interface RiskItem { label: string; pct: number | null; on: boolean }

export interface RiskSettings {
  contingency_pct: number | null;
  pay_days: number | null;
  retainage_pct: number | null;
  retainage_days: number | null;
  carry_rate_pct: number | null;
  items: RiskItem[];
}

export const NO_RISK: RiskSettings = { contingency_pct: null, pay_days: null, retainage_pct: null, retainage_days: null, carry_rate_pct: null, items: [] };

/** Names offered for the checklist — Coy types each one's %; none is filled in for him. */
export const RISK_SUGGESTIONS: Record<string, string[]> = {
  residential: ["Tear-out unknown (old slab thickness)", "Tight access", "Soft base", "Customer changes"],
  commercial: ["Performance & payment bond", "Testing & inspections", "Liquidated damages", "Night or weekend work", "Addenda after bid", "Tight schedule"],
  public: ["Bid bond", "Performance & payment bond", "Prevailing wage", "Certified payroll", "DOTD testing", "Liquidated damages"],
};
export const riskSuggestions = (jobType: string | null | undefined) => RISK_SUGGESTIONS[jobType ?? ""] ?? [...new Set(Object.values(RISK_SUGGESTIONS).flat())];

const num = (v: unknown, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/** Read stored or sent risk settings; anything off the shape is dropped, never guessed. */
export function readRisk(raw: unknown): RiskSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...NO_RISK, items: [] };
  const r = raw as Record<string, unknown>;
  const items: RiskItem[] = [];
  if (Array.isArray(r.items)) {
    for (const it of r.items.slice(0, 20)) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.replace(/\s+/g, " ").trim().slice(0, 60) : "";
      if (!label) continue;
      items.push({ label, pct: num(o.pct, 50), on: o.on === true });
    }
  }
  return {
    contingency_pct: num(r.contingency_pct, 50),
    pay_days: num(r.pay_days, 365) === null ? null : Math.round(num(r.pay_days, 365) as number),
    retainage_pct: num(r.retainage_pct, 50),
    retainage_days: num(r.retainage_days, 730) === null ? null : Math.round(num(r.retainage_days, 730) as number),
    carry_rate_pct: num(r.carry_rate_pct, 50),
    items,
  };
}

export interface RiskPart { label: string; pct: number; on: "cost" | "price" }

export interface RiskResult {
  /** % added on cost, beside O.H.: contingency + ticked items. */
  cost_pct: number;
  /** % of the price set aside for carrying cost, beside margin. */
  carry_pct: number;
  parts: RiskPart[];
  /** Ticked items with no % — named, so a ticked box never silently prices nothing. */
  missing: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The job's risk as two percentages, and what each is made of, said plainly. */
export function riskOf(r: RiskSettings | null | undefined): RiskResult {
  const s = r ?? NO_RISK;
  const parts: RiskPart[] = [];
  const missing: string[] = [];
  if (s.contingency_pct) parts.push({ label: "Contingency", pct: s.contingency_pct, on: "cost" });
  for (const it of s.items) {
    if (!it.on) continue;
    if (it.pct === null) missing.push(`${it.label}: %`);
    else if (it.pct > 0) parts.push({ label: it.label, pct: it.pct, on: "cost" });
  }
  const rate = s.carry_rate_pct ?? 0;
  if (rate > 0) {
    const wait = (s.pay_days ?? 0) / 365;
    const held = ((s.retainage_pct ?? 0) / 100) * ((s.retainage_days ?? 0) / 365);
    const carry = round2(rate * (wait + held));
    if (carry > 0) {
      const bits = [s.pay_days ? `${s.pay_days} days to get paid` : null,
        s.retainage_pct && s.retainage_days ? `${s.retainage_pct}% held ${s.retainage_days} days more` : null].filter(Boolean);
      parts.push({ label: `Carrying cost (${bits.join(", ")} at ${rate}% a year)`, pct: carry, on: "price" });
    }
  }
  const cost_pct = round2(parts.filter((p) => p.on === "cost").reduce((a, p) => a + p.pct, 0));
  const carry_pct = round2(parts.filter((p) => p.on === "price").reduce((a, p) => a + p.pct, 0));
  return { cost_pct, carry_pct, parts, missing };
}

/** True when the settings would change no price and ask nothing. */
export const riskEmpty = (r: RiskSettings | null | undefined) => {
  const x = riskOf(r);
  return x.cost_pct === 0 && x.carry_pct === 0 && x.missing.length === 0;
};
