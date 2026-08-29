"use client";

/**
 * Cash — wired to /api/dashboard/cashflow.
 *
 * Every figure on this screen comes from that route. Where the underlying
 * tables are empty the row says so and prints nothing.
 *
 * The full v34 treatment — the month RIBBON, the week BAND, the green cash-
 * position line (DECISIONS.md §5) — is a large port that only means anything
 * once there are jobs, invoices and payments to plot. `jobs`, `invoices` and
 * `payments` are all at zero today, so a ribbon here would be an empty axis
 * with a fabricated shape. The numbers that ARE real — the monthly nut from
 * `overhead_items`, the off-the-top percentage and the pay-yourself mode from
 * `org_cost_settings`, the balance anchor — are shown, because those exist.
 */

import React, { useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums, money0 } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";

interface Overhead { id: string; label: string; amount: number; cadence: string | null; active: boolean }
interface CashFlow {
  today: string;
  anchor: { as_of: string; balance: number; expected: number };
  jobs: unknown[];
  invoices: unknown[];
  payments: { amount: number }[];
  receipts: { amount: number }[];
  overhead: Overhead[];
  comp: { mode: string; monthly_draw: number; profit_pct: number };
  offTopPct: number;
  close: { rate: number; sample: number };
}

function Row({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="px-3 py-2.5 flex items-baseline gap-3"
      style={{ background: T.card, borderTop: `1px solid ${T.hair}` }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: F.sm, color: T.ink }}>{label}</div>
        {sub && <div style={{ fontSize: F.xs, color: T.ink3 }}>{sub}</div>}
      </div>
      <div style={{
        fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums,
        color: value === null ? T.ink3 : T.ink,
      }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function CashScreen() {
  const [d, setD] = useState<CashFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/cashflow")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (b?.code === "no_org") { if (!cancelled) setNoOrg(true); return null; }
          throw new Error(b?.error || `HTTP ${r.status}`);
        }
        return b;
      })
      .then((b) => { if (!cancelled && b) setD(b); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  if (noOrg) {
    return <EmptyState tone="warn" title="This account isn't a member of any organisation"
      detail="You are signed in, but nothing is shared with this account yet." />;
  }
  if (error) return <EmptyState tone="warn" title="Couldn't load cash" detail={error} />;
  if (!d) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded animate-pulse" style={{ height: 48, background: T.hairSoft }} />
        ))}
      </div>
    );
  }

  const activeOverhead = (d.overhead ?? []).filter((o) => o.active);
  const monthlyNut = activeOverhead
    .filter((o) => (o.cadence ?? "monthly") === "monthly")
    .reduce((s, o) => s + o.amount, 0);
  const collected = (d.payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const spent = (d.receipts ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);

  // Runway needs a burn rate. With no overhead recorded there is no denominator,
  // and a runway printed from a zero burn would be infinity dressed as safety.
  const runway = monthlyNut > 0 ? d.anchor.balance / monthlyNut : null;

  return (
    <div>
      <div className="px-3 pt-3 pb-2" style={{ background: T.card }}>
        <div style={eyebrow}>Cash position</div>
        <div style={{ fontFamily: disp, fontSize: F.xxl, fontWeight: 700, lineHeight: 1, ...nums }}>
          {money0(d.anchor.balance)}
        </div>
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>
          Balance checkpoint {d.anchor.as_of === d.today ? "not yet set" : `as of ${d.anchor.as_of}`}
        </div>
      </div>

      <Row label="Runway"
        value={runway === null ? null : `${runway.toFixed(1)} mo`}
        sub={runway === null ? "No monthly overhead recorded, so there is no burn rate to divide by." : undefined} />

      <Row label="Monthly nut"
        value={monthlyNut > 0 ? money0(monthlyNut) : null}
        sub={monthlyNut > 0 ? `${activeOverhead.length} active item(s)` : "No overhead items recorded."} />

      <Row label="Off the top" value={`${d.offTopPct}%`}
        sub="Owner fee + estimator fee + tax reserve. The bid floor divides by what is left." />

      <Row label="Pay yourself"
        value={d.comp.mode === "fixed_draw"
          ? (d.comp.monthly_draw > 0 ? money0(d.comp.monthly_draw) : null)
          : `${d.comp.profit_pct}%`}
        sub={d.comp.mode === "fixed_draw"
          ? "Fixed draw — the bid floor must cover this."
          : "Percent of profit — taken after a job clears, does not raise the floor."} />

      <Row label="Collected" value={collected > 0 ? money0(collected) : null}
        sub={collected > 0 ? undefined : "No payments recorded."} />

      <Row label="Spent" value={spent > 0 ? money0(spent) : null}
        sub={spent > 0 ? undefined : "No receipts filed."} />

      <Row label="Close rate"
        value={d.close.sample > 0 ? `${d.close.rate}%` : null}
        sub={d.close.sample > 0
          ? `From ${d.close.sample} decided job(s).`
          : "No won or lost jobs yet, so there is nothing to compute a close rate from."} />

      {(d.jobs?.length ?? 0) === 0 && (
        <EmptyState title="No won jobs yet"
          detail="The month ribbon and the weekly band plot money against jobs. Once a job is won and invoiced they will have something to show." />
      )}
    </div>
  );
}
