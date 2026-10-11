import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg, workingEstimate } from "@/lib/budget-server";
import { addStepItem, buildDraft, draftState, readExclusions, DRAFT_TABLE_MISSING } from "@/lib/draft/build-server";
import { cleanCard, defaultTaxable, type CostType } from "@/lib/cost-cards";
import { STEP_NEW } from "@/lib/draft/fill";
import { DRIVEWAY_STEPS } from "@/lib/draft/recipe";
import { renameBudget, startBudget } from "@/lib/budgets-server";

/**
 * The job's draft budget (migration 087). Session client, org from the session.
 *   GET    the latest build, the recipe checked against the budget now, what
 *          isn't priced, whether the total is partial, what blocks approval.
 *   POST   build a draft from the job's calls, texts and notes (Coy's tap,
 *          or Retry). The same input returns the draft already made.
 *          { new_budget: true, name, park_name } (migration 088): keep the
 *          open budget (named park_name if it has no name) and build into a
 *          new one called name — the open one is never written over.
 *   PATCH  { step, reason } — leave a recipe step off this job, and why;
 *          reason null puts it back.
 *          { step, item_id } — put that Price book item on for the step
 *          (every area, or the whole job for mobilization and equipment).
 *          { step, make: { name, unit, unit_cost, cost_type } } — make the
 *          item in the Price book (Coy's own price, or none) and put it on.
 * Nothing here sends anything to anyone.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function view(sb: Parameters<typeof draftState>[0], orgId: string, id: string) {
  const s = await draftState(sb, orgId, id);
  if (!s.ready) return { ready: false, error: s.error };
  const { _lines, _res, ...rest } = s;
  void _lines; void _res;
  return rest;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, applyCookies } = r.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  return applyCookies(NextResponse.json(await view(supabase, orgId, id)));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, userId, applyCookies } = r.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.new_budget === true) {
    const cur = await workingEstimate(supabase, orgId, id, false);
    const { count } = cur ? await supabase.from("estimate_line_items").select("id", { count: "exact", head: true }).eq("estimate_id", cur.id as string) : { count: 0 };
    // An empty open budget is simply used (and named); one with lines is kept.
    const s = cur && !(count ?? 0)
      ? await renameBudget(supabase, orgId, id, cur.id as string, body.name)
      : await startBudget(supabase, orgId, id, body.name, body.park_name);
    if (!s.ok && !(cur && !(count ?? 0) && s.status === 400)) return applyCookies(NextResponse.json({ error: s.error }, { status: s.status }));
  }
  const b = await buildDraft(supabase, orgId, userId, id, "manual");
  if (!b.ok) return applyCookies(NextResponse.json({ error: b.error }, { status: b.status }));
  return applyCookies(NextResponse.json({ again: b.again, ...(await view(supabase, orgId, id)) }));
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, applyCookies } = r.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Body must be JSON."); }
  const step = typeof body.step === "string" ? body.step : "";
  // A driveway recipe step, or one of the job's own sections (a scope draft).
  const sectionStep = /^s:[0-9a-f-]{36}$/i.test(step);
  if (!sectionStep && !DRIVEWAY_STEPS.some((s) => s.key === step)) return bad("No such step.");
  const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  if (uuid(body.item_id) || (body.make && typeof body.make === "object")) {
    let itemId = body.item_id as string | undefined;
    if (!uuid(itemId)) {
      const m = body.make as Record<string, unknown>;
      const d = STEP_NEW[step] ?? { name: "", unit: "Each", cost_type: "other", qty_rule: "manual" };
      const cost = m.unit_cost === null || m.unit_cost === undefined || m.unit_cost === "" ? null : Number(m.unit_cost);
      if (cost !== null && !(Number.isFinite(cost) && cost >= 0)) return bad("The price must be a number.");
      const c = cleanCard({
        name: m.name ?? d.name, unit: m.unit ?? d.unit, cost_type: m.cost_type ?? d.cost_type,
        qty_rule: typeof m.qty_rule === "string" ? m.qty_rule : d.qty_rule, unit_cost: cost,
        price_source: cost === null ? null : "typed", price_as_of: cost === null ? null : new Date().toISOString().slice(0, 10),
        description: typeof m.description === "string" ? m.description : null,
      });
      if (!c.ok) return bad(c.error);
      const card = c.card;
      if (card.taxable === undefined) card.taxable = defaultTaxable(card.cost_type as CostType);
      const { data, error } = await supabase.from("cost_items").insert({ ...card, org_id: orgId }).select("id").single();
      if (error || !data) return bad(`Couldn't make the item: ${error?.message ?? "no row"}`, 500);
      itemId = data.id as string;
    }
    const a = await addStepItem(supabase, orgId, id, step, itemId as string);
    if (!a.ok) return bad(a.error, a.status);
    return applyCookies(NextResponse.json(await view(supabase, orgId, id)));
  }
  const reason = typeof body.reason === "string" ? body.reason.replace(/\s+/g, " ").trim().slice(0, 200) : null;
  if (body.reason !== null && !reason) return bad("Say why it's not on this job.");
  const est = await workingEstimate(supabase, orgId, id, true);
  if (!est) return bad("Couldn't open the budget.", 500);
  const cur = await readExclusions(supabase, orgId, est.id as string);
  if (reason) cur[step] = reason; else delete cur[step];
  const { error } = await supabase.from("estimates").update({ recipe_exclusions: cur, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("id", est.id as string);
  if (error) return bad(/recipe_exclusions/.test(error.message) ? DRAFT_TABLE_MISSING : error.message, /recipe_exclusions/.test(error.message) ? 503 : 500);
  return applyCookies(NextResponse.json(await view(supabase, orgId, id)));
}
