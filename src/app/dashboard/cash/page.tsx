"use client";

/**
 * Cash — wired to /api/dashboard/cashflow.
 *
 * THE RULE THIS SCREEN NOW OBEYS: a hardcoded fallback is not a live value. If
 * the route can produce a number with the database empty, it is a placeholder
 * and it renders as one.
 *
 * Three figures here failed that test and were reported as LIVE:
 *  - off the top printed 11% from a `: 11` fallback with no org_cost_settings
 *    row. It is the number the bid floor divides by.
 *  - cash position printed "$0" from an anchor default, asserting an empty
 *    account when nobody had recorded a balance.
 *  - pay yourself printed the "fixed draw" explanation from a defaulted mode.
 *
 * All three now come back null from the route and print "—" with the reason.
 */

import React, { useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums, money0 } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";
import { CostSettingsEditor } from "@/components/v34/cost-settings";

interface Overhead { id: string; label: string; amount: number; cadence: string | null; active: boolean }
interface CashFlow {
  today: string;
  anchor: { as_of: string; balance: number; expected: number } | null;
  jobs: unknown[];
  invoices: unknown[];
  payments: { amount: number }[];
  receipts: { amount: number }[];
  overhead: Overhead[];
  comp: { mode: string; monthly_draw: number; profit_pct: number } | null;
  offTopPct: number | null;
  close: { rate: number; sample: number };
}

function Row({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="px-3 py-2.5 flex items-baseline gap-3"
      style={{ background: T.card, borderTop: `1px solid ${T.hair}` }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: F.sm, color: T.ink }}>{label}</div>
        {sub && <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.4 }}>{sub}</div>}
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
  // Bumped when cost settings save, so the rows above re-read what was written.
  const [rev, setRev] = useState(0);

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
  }, [rev]);

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

  // Runway needs both a balance and a burn rate. Either one missing makes the
  // division meaningless, not zero.
  const runway = d.anchor && monthlyNut > 0 ? d.anchor.balance / monthlyNut : null;

  return (
    <div>
      <div className="px-3 pt-3 pb-2" style={{ background: T.card }}>
        <div style={eyebrow}>Cash position</div>
        <div style={{
          fontFamily: disp, fontSize: F.xxl, fontWeight: 700, lineHeight: 1, ...nums,
          color: d.anchor ? T.ink : T.ink3,
        }}>
          {d.anchor ? money0(d.anchor.balance) : "—"}
        </div>
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2, lineHeight: 1.4 }}>
          {d.anchor
            ? `Balance checkpoint as of ${d.anchor.as_of}`
            : "No balance checkpoint recorded. Starting cash is entered by hand — this is not zero, it is unknown."}
        </div>
      </div>

      <Row label="Runway"
        value={runway === null ? null : `${runway.toFixed(1)} mo`}
        sub={runway === null
          ? (!d.anchor ? "Needs a balance checkpoint and a monthly burn rate." : "No monthly overhead recorded, so there is no burn rate to divide by.")
          : undefined} />

      <Row label="Monthly nut"
        value={monthlyNut > 0 ? money0(monthlyNut) : null}
        sub={monthlyNut > 0 ? `${activeOverhead.length} active item(s)` : "No overhead items recorded."} />

      <Row label="Off the top"
        value={d.offTopPct === null ? null : `${d.offTopPct}%`}
        sub={d.offTopPct === null
          ? "No cost settings recorded. The bid floor divides by what is left after this, so it is not guessed."
          : "Owner fee + estimator fee + tax reserve."} />

      <Row label="Pay yourself"
        value={
          d.comp === null ? null
            : d.comp.mode === "fixed_draw"
              ? (d.comp.monthly_draw > 0 ? money0(d.comp.monthly_draw) : null)
              : `${d.comp.profit_pct}%`
        }
        sub={
          d.comp === null ? "No cost settings recorded, so no pay-yourself mode has been chosen."
            : d.comp.mode === "fixed_draw"
              ? "Fixed draw — the bid floor must cover this."
              : "Percent of profit — taken after a job clears, does not raise the floor."
        } />

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

      {/* The settings every price and the bid floor stand on. One editor;
          DECISIONS §6 wants it reachable from Settings too — that door comes
          with the Settings sheet. */}
      <CostSettingsEditor onSaved={() => setRev((r) => r + 1)} />
    </div>
  );
}
