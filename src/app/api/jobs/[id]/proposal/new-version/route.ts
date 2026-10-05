import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { PROPOSAL_COLS } from "@/lib/proposal-server";

/** Start the next draft from the latest final one — same choices, a new number; the final stays as it was. */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  const { data: draft } = await supabase.from("job_proposals").select("id").eq("org_id", orgId).eq("job_id", id).eq("status", "draft").maybeSingle();
  if (draft) return bad("There is already a draft.", 409);
  const { data: last } = await supabase.from("job_proposals").select(PROPOSAL_COLS).eq("org_id", orgId).eq("job_id", id)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (!last) return bad("No proposal to copy.", 404);
  const l = last as Record<string, unknown>;
  const { data, error } = await supabase.from("job_proposals").insert({
    org_id: orgId, job_id: id, version: (l.version as number) + 1, option_id: l.option_id, project_type: l.project_type,
    display: l.display, draws: l.draws, warranty: l.warranty, terms: l.terms, scope_intro: l.scope_intro, cover_file_id: l.cover_file_id, split: l.split,
  }).select(PROPOSAL_COLS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ proposal: data }, { status: 201 }));
}
