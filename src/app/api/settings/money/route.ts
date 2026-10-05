import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { moneySettings } from "@/lib/pricing-server";

/**
 * The org's pricing defaults and pay-yourself (migration 057, Coy
 * 2026-09-30): default margin %, default O.H. % (15 on his word), the day
 * minimum, and pay-yourself — plus the recurring overhead items the Cash page
 * turns into a burn rate. Price book → Defaults and the Cash page both edit
 * through here. Session client; org from the session.
 *
 * PATCH any of { default_margin_pct, default_overhead_pct, day_minimum,
 *   comp_mode, comp_monthly_draw, comp_profit_pct } — blank is null (not
 *   recorded), never a default.
 */

export const dynamic = "force-dynamic";

const LIMITS: Record<string, [number, number, string]> = {
  default_margin_pct: [0, 99.9, "Margin is 0 to under 100%."],
  default_overhead_pct: [0, 200, "O.H. is 0 to 200%."],
  day_minimum: [0, 1_000_000, "The day minimum is a dollar amount."],
  comp_monthly_draw: [0, 10_000_000, "The draw is a dollar amount."],
  comp_profit_pct: [0, 100, "Percent of profit is 0 to 100."],
};

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const [money, oh] = await Promise.all([
    moneySettings(supabase, orgId),
    supabase.from("overhead_items").select("id, label, category, amount, cadence, active, notes, due_day").eq("org_id", orgId).order("created_at"),
  ]);
  if (oh.error) return applyCookies(NextResponse.json({ error: `overhead_items: ${oh.error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ settings: money, overhead: oh.data ?? [] }));
}

export async function PATCH(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string) => applyCookies(NextResponse.json({ error: m }, { status: 400 }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const row: Record<string, unknown> = { org_id: orgId, updated_at: new Date().toISOString() };
  for (const [k, [lo, hi, msg]] of Object.entries(LIMITS)) {
    if (!(k in b)) continue;
    if (b[k] === null || b[k] === "") { row[k] = null; continue; }
    const v = Number(b[k]);
    if (!Number.isFinite(v) || v < lo || v > hi) return bad(msg);
    row[k] = v;
  }
  if ("comp_mode" in b) {
    if (b.comp_mode !== null && b.comp_mode !== "fixed_draw" && b.comp_mode !== "pct_profit") return bad("Pay-yourself is a fixed draw or a percent of profit.");
    row.comp_mode = b.comp_mode;
  }
  if (Object.keys(row).length <= 2) return bad("Nothing to change.");
  const { error } = await supabase.from("org_money_settings").upsert(row, { onConflict: "org_id" });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ settings: await moneySettings(supabase, orgId) }));
}
