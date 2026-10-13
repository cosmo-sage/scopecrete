import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";

/** Delete one version of a job's proposal (Coy, 2026-10-12: "How do I delete proposals?").
 *  `?version=N`. A proposal's number counts every row (src/lib/proposal-number.ts), so:
 *  - a draft with an earlier version under it is deleted outright (the job keeps its place);
 *  - a job's only draft is not — Start over resets it, since taking it out renumbers later jobs;
 *  - a final (sent) version is marked deleted (migration 104) and left out of every list, and its
 *    customer link is turned off (it reads "replaced"); a version the customer signed stays. */

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  const version = Number(req.nextUrl.searchParams.get("version"));
  if (!Number.isInteger(version) || version < 1) return bad("Which version?");
  const { data: row } = await supabase.from("job_proposals").select("id, status").eq("org_id", orgId).eq("job_id", id).eq("version", version).maybeSingle();
  if (!row) return bad("No such version.", 404);
  const pid = (row as { id: string }).id;

  if ((row as { status: string }).status === "draft") {
    const { data: under } = await supabase.from("job_proposals").select("id").eq("org_id", orgId).eq("job_id", id).lt("version", version).limit(1);
    if (!(under ?? []).length) return bad("This is the job's only proposal, so it isn't deleted (that would change other jobs' proposal numbers). Start over gives you a blank one.", 409);
    const { error } = await supabase.from("job_proposals").delete().eq("org_id", orgId).eq("id", pid);
    if (error) return bad(error.message, 500);
    return applyCookies(NextResponse.json({ ok: true, deleted: "draft" }));
  }

  const { data: docs } = await supabase.from("documents").select("id, signed_at, revoked_at").eq("org_id", orgId).eq("proposal_id", pid);
  const list = (docs ?? []) as Array<{ id: string; signed_at: string | null; revoked_at: string | null }>;
  if (list.some((d) => d.signed_at)) return bad("The customer signed this version, so it stays.", 409);
  const { error } = await supabase.from("job_proposals").update({ deleted_at: new Date().toISOString(), deleted_by: userId }).eq("org_id", orgId).eq("id", pid);
  if (error) {
    if (/deleted_at/.test(error.message)) return bad("Deleting a sent version waits for migration 104.", 409);
    return bad(error.message, 500);
  }
  const live = list.filter((d) => !d.revoked_at).map((d) => d.id);
  if (live.length) await supabase.from("documents").update({ revoked_at: new Date().toISOString() }).eq("org_id", orgId).in("id", live);
  return applyCookies(NextResponse.json({ ok: true, deleted: "final", links_off: live.length }));
}
