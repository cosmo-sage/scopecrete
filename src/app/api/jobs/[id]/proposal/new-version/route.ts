import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { PROPOSAL_COLS, TYPE_COLS, typeDefaults, typeRow } from "@/lib/proposal-server";

/** Start the next draft from the latest final one — same choices, a new number; the final stays as it was.
 *  `{fresh: true}` starts over (Coy, 2026-10-11: "delete or void proposals and start from scratch"): a
 *  blank draft from the job's type defaults (an open draft is reset instead), and every customer link on
 *  the job that wasn't signed is turned off, so it reads "replaced". Nothing is deleted: a final can't
 *  change and proposal numbers count on every version being kept. */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  const body = (await req.json().catch(() => ({}))) as { fresh?: unknown };
  const { data: draft } = await supabase.from("job_proposals").select("id").eq("org_id", orgId).eq("job_id", id).eq("status", "draft").maybeSingle();
  if (body.fresh === true) {
    const { data: job } = await supabase.from("jobs").select("job_type").eq("org_id", orgId).eq("id", id).maybeSingle();
    const jt = (job as { job_type?: string | null } | null)?.job_type ?? null;
    const { data: t } = jt ? await supabase.from("org_project_types").select(TYPE_COLS).eq("org_id", orgId).eq("key", jt).maybeSingle() : { data: null };
    const blank = { ...typeDefaults(t ? typeRow(t as Record<string, unknown>) : null), scope_intro: null, cover_file_id: null, option_id: null };
    const { data: live } = await supabase.from("documents").select("id").eq("org_id", orgId).eq("job_id", id)
      .not("proposal_id", "is", null).is("revoked_at", null).neq("status", "accepted");
    const liveIds = ((live ?? []) as Array<{ id: string }>).map((d) => d.id);
    if (liveIds.length) {
      const { error: rErr } = await supabase.from("documents").update({ revoked_at: new Date().toISOString() }).eq("org_id", orgId).in("id", liveIds);
      if (rErr) return bad(rErr.message, 500);
    }
    if (draft) {
      const { data, error } = await supabase.from("job_proposals").update(blank).eq("org_id", orgId).eq("id", (draft as { id: string }).id).select(PROPOSAL_COLS).single();
      if (error || !data) return bad(error?.message ?? "not saved", 500);
      return applyCookies(NextResponse.json({ proposal: data, links_off: liveIds.length }));
    }
    const { data: top } = await supabase.from("job_proposals").select("version").eq("org_id", orgId).eq("job_id", id).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from("job_proposals")
      .insert({ org_id: orgId, job_id: id, version: (((top as { version?: number } | null)?.version) ?? 0) + 1, ...blank })
      .select(PROPOSAL_COLS).single();
    if (error || !data) return bad(error?.message ?? "not saved", 500);
    return applyCookies(NextResponse.json({ proposal: data, links_off: liveIds.length }, { status: 201 }));
  }
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
