import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { listBudgets, openBudget, renameBudget, startBudget } from "@/lib/budgets-server";

/**
 * A job's budgets (migration 088). Session client, org from the session.
 *   GET   every budget on the job (the open one first) with its lines and
 *         total, and the names to suggest ("Draft 1", "Draft 2").
 *   POST  { action: "rename", id, name }
 *         { action: "open", id, park_name? }  open a saved one; the open one
 *                                             is kept (named if it had none)
 *         { action: "new", name?, park_name? } a new, empty budget
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, applyCookies } = r.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  return applyCookies(NextResponse.json(await listBudgets(supabase, orgId, id)));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, applyCookies } = r.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Body must be JSON."); }
  const target = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  let res: { ok: boolean; status?: number; error?: string };
  if (body.action === "rename") res = target ? await renameBudget(supabase, orgId, id, target, body.name) : { ok: false, status: 400, error: "Which budget?" };
  else if (body.action === "open") res = target ? await openBudget(supabase, orgId, id, target, body.park_name) : { ok: false, status: 400, error: "Which budget?" };
  else if (body.action === "new") res = await startBudget(supabase, orgId, id, body.name, body.park_name);
  else return bad("Unknown action.");
  if (!res.ok) return bad(res.error ?? "Couldn't do that.", res.status ?? 500);
  return applyCookies(NextResponse.json(await listBudgets(supabase, orgId, id)));
}
