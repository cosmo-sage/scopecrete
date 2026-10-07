import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { draftState, DRAFT_TABLE_MISSING } from "@/lib/draft/build-server";

/**
 * Approve the job's budget — internally (migration 087). Refused while any
 * line is unpriced, an area has no size or a recipe step is open. Saves a
 * frozen copy (lines, prices, totals, the steps and why any were left off) in
 * budget_approvals; the working budget stays editable, and a later approval is
 * a new copy beside this one. It sends nothing, to anyone: a proposal is still
 * Coy's own step (Preview → Text it / Email it).
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, userId, applyCookies } = r.session;
  const bad = (m: string, s = 400, extra: Record<string, unknown> = {}) => applyCookies(NextResponse.json({ error: m, ...extra }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  const s = await draftState(supabase, orgId, id);
  if (!s.ready) return bad(s.error, 503);
  if (s.blocks.length) return bad("Not ready to approve yet.", 409, { blocks: s.blocks });
  if (!s.estimate_id || !s.totals) return bad("The budget couldn't be read.", 500);
  const snapshot = {
    lines: s._lines.map((l) => ({ ...l, result: s._res?.lines[l.id] ?? null })),
    totals: s.totals, steps: s.steps, exclusions: s.exclusions, run_id: s.run?.id ?? null,
  };
  const { data, error } = await supabase.from("budget_approvals").insert({
    org_id: orgId, job_id: id, estimate_id: s.estimate_id, run_id: (s.run?.id as string | undefined) ?? null,
    snapshot, total: s.totals.total, cost: s.totals.cost, approved_by: userId,
  }).select("id, total, cost, approved_at, approved_by").single();
  if (error) return bad(/budget_approvals/.test(error.message) ? DRAFT_TABLE_MISSING : error.message, 500);
  return applyCookies(NextResponse.json({ approval: data }));
}
