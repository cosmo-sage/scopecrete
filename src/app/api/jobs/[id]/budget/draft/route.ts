import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg, workingEstimate } from "@/lib/budget-server";
import { buildDraft, draftState, readExclusions, DRAFT_TABLE_MISSING } from "@/lib/draft/build-server";
import { DRIVEWAY_STEPS } from "@/lib/draft/recipe";

/**
 * The job's draft budget (migration 087). Session client, org from the session.
 *   GET    the latest build, the recipe checked against the budget now, what
 *          isn't priced, whether the total is partial, what blocks approval.
 *   POST   build a draft from the job's calls, texts and notes (Coy's tap,
 *          or Retry). The same input returns the draft already made.
 *   PATCH  { step, reason } — leave a recipe step off this job, and why;
 *          reason null puts it back.
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
  if (!DRIVEWAY_STEPS.some((s) => s.key === step)) return bad("No such step.");
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
