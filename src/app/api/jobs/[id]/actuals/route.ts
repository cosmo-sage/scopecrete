import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { ACTUALS_MISSING, actualsView, missing094 } from "@/lib/budget-v3-server";

/**
 * The Actual costs tab — job costing (Budget v3, migration 094). Session client,
 * org from the session; a guard in the database keeps every line and file on
 * this job. Every write is Coy's tap.
 *   GET     budget against actual, the job's receipts, change orders, the crew.
 *   POST    { cost: { line_id?, file_id?, kind, vendor?, amount, man_hours?, rate?, note?, spent_on? } }
 *           { change_order: { name, note?, price, cost, signed? } }
 *   PATCH   { cost_id, line_id? | paid? | amount? | note? }
 *           { change_order_id, name? | note? | price? | cost? | signed? }
 *           { crew: { days?, size?, hours? } }   how the crew actually ran
 *   DELETE  ?cost=<id> | ?change_order=<id>
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

function money(v: unknown, label: string, lo = -1_000_000, hi = 10_000_000): number | Error {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN;
  if (!Number.isFinite(n) || n <= lo || n >= hi) return new Error(`${label} must be a number.`);
  return Math.round(n * 100) / 100;
}
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const optNum = (v: unknown, lo: number, hi: number): number | null | Error => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : new Error("out of range");
};

async function session(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return { response: r.response } as const;
  const s = r.session;
  if (!(await jobInOrg(s.supabase, s.orgId, id))) return { response: s.applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 })) } as const;
  return { id, ...s } as const;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const s = await session(req, ctx);
  if ("response" in s) return s.response;
  return s.applyCookies(NextResponse.json(await actualsView(s.supabase, s.orgId, s.id)));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const s = await session(req, ctx);
  if ("response" in s) return s.response;
  const { supabase, orgId, userId, applyCookies, id } = s;
  const bad = (m: string, st = 400) => applyCookies(NextResponse.json({ error: m }, { status: st }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if (b.cost && typeof b.cost === "object") {
    const c = b.cost as Record<string, unknown>;
    const kind = typeof c.kind === "string" && ["receipt", "bill", "time_log", "typed"].includes(c.kind) ? c.kind : "typed";
    const mh = optNum(c.man_hours, 0.01, 99_999), rate = optNum(c.rate, 0, 99_999);
    if (mh instanceof Error || rate instanceof Error) return bad("Man-hours and rate must be numbers.");
    // Crew time: man-hours × rate, unless an amount is given.
    const amt = c.amount === undefined && mh !== null && rate !== null ? Math.round(mh * rate * 100) / 100 : money(c.amount, "Amount");
    if (amt instanceof Error) return bad(amt.message);
    const line = typeof c.line_id === "string" && UUID.test(c.line_id) ? c.line_id : null;
    const file = typeof c.file_id === "string" && UUID.test(c.file_id) ? c.file_id : null;
    const spent = typeof c.spent_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.spent_on) ? c.spent_on : null;
    const { data, error } = await supabase.from("job_costs").insert({
      org_id: orgId, job_id: id, line_id: line, file_id: file, kind, vendor: text(c.vendor, 120), amount: amt,
      man_hours: mh, rate, note: text(c.note, 500), spent_on: spent, created_by: userId,
    }).select("id").single();
    if (missing094(error)) return bad(ACTUALS_MISSING, 503);
    if (error) return bad(/job_costs_one_file/.test(error.message) ? "That receipt is already filed on this job." : error.message);
    return applyCookies(NextResponse.json({ id: data.id, ...(await actualsView(supabase, orgId, id)) }));
  }
  if (b.change_order && typeof b.change_order === "object") {
    const c = b.change_order as Record<string, unknown>;
    const name = text(c.name, 120);
    if (!name) return bad("Name the change.");
    const price = money(c.price ?? 0, "Price"), cost = money(c.cost ?? 0, "Cost");
    if (price instanceof Error) return bad(price.message);
    if (cost instanceof Error) return bad(cost.message);
    const { error } = await supabase.from("change_orders").insert({ org_id: orgId, job_id: id, name, note: text(c.note, 500), price, cost,
      signed_at: c.signed === true ? new Date().toISOString() : null, created_by: userId });
    if (missing094(error)) return bad(ACTUALS_MISSING, 503);
    if (error) return bad(error.message);
    return applyCookies(NextResponse.json(await actualsView(supabase, orgId, id)));
  }
  return bad("Nothing to add.");
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const s = await session(req, ctx);
  if ("response" in s) return s.response;
  const { supabase, orgId, applyCookies, id } = s;
  const bad = (m: string, st = 400) => applyCookies(NextResponse.json({ error: m }, { status: st }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  let error: { message?: string; code?: string } | null = null;
  if (typeof b.cost_id === "string" && UUID.test(b.cost_id)) {
    const p: Record<string, unknown> = {};
    if ("line_id" in b) p.line_id = typeof b.line_id === "string" && UUID.test(b.line_id) ? b.line_id : null;
    if ("paid" in b) p.paid_at = b.paid === true ? new Date().toISOString() : null;
    if ("amount" in b) { const a = money(b.amount, "Amount"); if (a instanceof Error) return bad(a.message); p.amount = a; }
    if ("note" in b) p.note = text(b.note, 500);
    if (!Object.keys(p).length) return bad("Nothing to change.");
    ({ error } = await supabase.from("job_costs").update(p).eq("org_id", orgId).eq("job_id", id).eq("id", b.cost_id));
  } else if (typeof b.change_order_id === "string" && UUID.test(b.change_order_id)) {
    const p: Record<string, unknown> = {};
    if ("name" in b) { const n = text(b.name, 120); if (!n) return bad("Name the change."); p.name = n; }
    if ("note" in b) p.note = text(b.note, 500);
    for (const k of ["price", "cost"] as const) if (k in b) { const v = money(b[k], k === "price" ? "Price" : "Cost"); if (v instanceof Error) return bad(v.message); p[k] = v; }
    if ("signed" in b) p.signed_at = b.signed === true ? new Date().toISOString() : null;
    if (!Object.keys(p).length) return bad("Nothing to change.");
    ({ error } = await supabase.from("change_orders").update(p).eq("org_id", orgId).eq("job_id", id).eq("id", b.change_order_id));
  } else if (b.crew && typeof b.crew === "object") {
    const c = b.crew as Record<string, unknown>;
    const p: Record<string, unknown> = {};
    const days = optNum(c.days, 0.1, 999), size = optNum(c.size, 1, 99), hours = optNum(c.hours, 0.1, 24);
    if (days instanceof Error || size instanceof Error || hours instanceof Error) return bad("Days 0.1–999, crew 1–99, hours 0.1–24.");
    if ("days" in c) p.actual_days = days;
    if ("size" in c) p.actual_crew_size = size === null ? null : Math.round(size);
    if ("hours" in c) p.actual_hours = hours;
    if (!Object.keys(p).length) return bad("Nothing to change.");
    ({ error } = await supabase.from("jobs").update(p).eq("org_id", orgId).eq("id", id));
  } else return bad("Nothing to change.");
  if (missing094(error)) return bad(ACTUALS_MISSING, 503);
  if (error) return bad(error.message ?? "Couldn't save.");
  return applyCookies(NextResponse.json(await actualsView(supabase, orgId, id)));
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const s = await session(req, ctx);
  if ("response" in s) return s.response;
  const { supabase, orgId, applyCookies, id } = s;
  const u = new URL(req.url);
  const cost = u.searchParams.get("cost"), co = u.searchParams.get("change_order");
  const { error } = cost && UUID.test(cost)
    ? await supabase.from("job_costs").delete().eq("org_id", orgId).eq("job_id", id).eq("id", cost)
    : co && UUID.test(co)
      ? await supabase.from("change_orders").delete().eq("org_id", orgId).eq("job_id", id).eq("id", co)
      : { error: { message: "Nothing to remove." } };
  if (missing094(error)) return applyCookies(NextResponse.json({ error: ACTUALS_MISSING }, { status: 503 }));
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  return applyCookies(NextResponse.json(await actualsView(supabase, orgId, id)));
}
