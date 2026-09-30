import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobValues } from "@/lib/job-totals";
import { monthlyNut } from "@/lib/engine";

/**
 * The Dashboard's tiles (Coy, 2026-09-30): calls today, real leads, jobs in
 * progress and quoted (count and $), the work runway, cash and profit this
 * month. Real rows only — a tile with nothing behind it comes back with
 * `value: null` and says why in `detail`; it never shows a 0 it did not count
 * or a $ it did not price. Money comes from each job's budget through the
 * engine (src/lib/job-totals.ts). Days and months are Central time.
 *
 * Session client; org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export interface Tile { value: string | null; detail: string; href: string; tone?: "good" | "bad" }

const TZ = "America/Chicago";
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Midnight Central for a Central calendar date, as an ISO instant. */
function centralMidnight(ymd: string): string {
  const probe = new Date(`${ymd}T12:00:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT-6";
  const m = off.match(/GMT([+-]\d+)/);
  const h = m ? Number(m[1]) : -6;
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - h * 3600_000).toISOString();
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const dayStartIso = centralMidnight(today);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [calls, jobsQ, pays, recs, oh, settings] = await Promise.all([
    sb.from("messages").select("direction").eq("org_id", orgId).eq("channel", "call").gte("occurred_at", dayStartIso),
    sb.from("jobs").select("id, status, origin, confirmed_at, created_at, duration_days, scheduled_start")
      .eq("org_id", orgId).is("archived_at", null),
    sb.from("payments").select("amount, received_on").eq("org_id", orgId).gte("received_on", monthStart).lte("received_on", today),
    sb.from("receipts").select("amount, purchased_on").eq("org_id", orgId).gte("purchased_on", monthStart).lte("purchased_on", today),
    sb.from("overhead_items").select("label, amount, cadence, active").eq("org_id", orgId),
    sb.from("org_cost_settings").select("assumed_billable_days").eq("org_id", orgId).maybeSingle(),
  ]);
  const err = calls.error || jobsQ.error || pays.error || recs.error || oh.error;
  if (err) return applyCookies(NextResponse.json({ error: err.message }, { status: 500 }));

  const tiles: Record<string, Tile> = {};

  // Calls today
  const callRows = (calls.data ?? []) as Array<{ direction: string | null }>;
  const inbound = callRows.filter((c) => c.direction === "inbound").length;
  tiles.calls = {
    value: String(inbound),
    detail: callRows.length ? `came in today · ${plural(callRows.length - inbound, "call")} you placed` : "No calls yet today",
    href: "/dashboard/messages",
  };

  const jobs = (jobsQ.data ?? []) as Array<{ id: string; status: string | null; origin: string | null; confirmed_at: string | null; created_at: string; duration_days: unknown; scheduled_start: string | null }>;
  // Real leads: New lead stage, and counted — a job Dusty made on his own is
  // not counted until Coy accepts it (§2b).
  const newLead = jobs.filter((j) => ["lead", "invited"].includes(j.status ?? "lead"));
  const real = newLead.filter((j) => j.origin !== "classification" || j.confirmed_at);
  const waiting = newLead.length - real.length;
  const thisWeek = real.filter((j) => j.created_at >= weekAgo).length;
  tiles.leads = {
    value: String(real.length),
    detail: [`${thisWeek} this week`, waiting ? `${waiting} of Dusty's waiting for Accept` : null].filter(Boolean).join(" · "),
    href: "/dashboard/scope",
  };

  // Jobs in progress and quoted — count and what the budgets price them at.
  const wip = jobs.filter((j) => ["won", "scheduled", "in_progress"].includes(j.status ?? ""));
  const quoted = jobs.filter((j) => j.status === "quoted");
  const values = await jobValues(sb, orgId, [...wip, ...quoted]);
  const moneyTile = (set: typeof jobs, noun: string): Tile => {
    if (!set.length) return { value: null, detail: `No jobs ${noun}`, href: "/dashboard/scope" };
    const priced = set.map((j) => values.get(j.id)).filter((v) => v?.total != null);
    const sum = priced.reduce((a, v) => a + (v!.total as number), 0);
    const from = priced.some((v) => v!.basis === "lowest");
    const unpriced = set.length - priced.length;
    return {
      value: `${set.length}`,
      detail: priced.length
        ? `${from ? "from " : ""}${money(sum)}${unpriced ? ` · ${unpriced} with no price yet` : ""}`
        : `${plural(set.length, "job")}, none priced yet — a price comes from the job's budget`,
      href: "/dashboard/scope",
    };
  };
  tiles.wip = moneyTile(wip, "in progress");
  tiles.quoted = moneyTile(quoted, "quoted");

  // Work runway — crew days of approved work not yet finished, in months of
  // crew days (Cost settings). Blank until the jobs carry their crew days.
  const perMonth = settings.data?.assumed_billable_days != null ? Number(settings.data.assumed_billable_days) : null;
  const withDays = wip.filter((j) => j.duration_days != null && Number(j.duration_days) > 0);
  const days = withDays.reduce((a, j) => a + Number(j.duration_days), 0);
  if (!wip.length) tiles.runway = { value: null, detail: "No approved work on the books", href: "/dashboard/scope" };
  else if (!withDays.length) tiles.runway = { value: null, detail: `${plural(wip.length, "approved job")}, none with crew days entered`, href: "/dashboard/scope" };
  else {
    const missing = wip.length - withDays.length;
    const span = perMonth && perMonth > 0
      ? (days / perMonth >= 1 ? `${(days / perMonth).toFixed(1)} mo` : `${Math.round((days / perMonth) * 4.33 * 10) / 10} wk`)
      : null;
    tiles.runway = {
      value: span ?? `${days} days`,
      detail: [`${days} crew days`, span ? `at ${perMonth} a month` : "set crew days per month in Markups & overhead", missing ? `${missing} job(s) with no crew days` : null].filter(Boolean).join(" · "),
      href: "/dashboard/scope",
    };
  }

  // Cash and profit this month.
  const collected = ((pays.data ?? []) as Array<{ amount: unknown }>).reduce((a, p) => a + Number(p.amount || 0), 0);
  const spent = ((recs.data ?? []) as Array<{ amount: unknown }>).reduce((a, r) => a + Number(r.amount || 0), 0);
  const nPay = pays.data?.length ?? 0, nRec = recs.data?.length ?? 0;
  tiles.cash = nPay || nRec
    ? { value: money(collected - spent), detail: `${money(collected)} in · ${money(spent)} out on receipts`, href: "/dashboard/cash", tone: collected - spent >= 0 ? "good" : "bad" }
    : { value: null, detail: "No payments or receipts recorded this month", href: "/dashboard/cash" };
  const items = ((oh.data ?? []) as Array<{ label: string; amount: unknown; cadence: string; active: boolean }>).map((i) => ({ ...i, amount: Number(i.amount || 0) }));
  const nut = monthlyNut(items);
  if (!nPay && !nRec) tiles.profit = { value: null, detail: "Nothing collected or spent recorded this month", href: "/dashboard/cash" };
  else if (!items.some((i) => i.active)) tiles.profit = { value: null, detail: "Overhead isn't entered, so profit would be overstated", href: "/dashboard/costs" };
  else {
    const p = collected - spent - nut;
    tiles.profit = { value: money(p), detail: `after receipts and ${money(nut)} overhead`, href: "/dashboard/cash", tone: p >= 0 ? "good" : "bad" };
  }

  return applyCookies(NextResponse.json({ today, tiles }));
}
