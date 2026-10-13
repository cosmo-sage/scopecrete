import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { marketOf, scopeProgress, stepHref } from "@/lib/scope-builder";
import { scopeFacts } from "@/lib/scope-builder-server";

/**
 * What is left to scope and price one job (Coy, 2026-10-13: a new job should
 * "prompt me for what was next to finish scoping and estimating the job") — the
 * job's Summary reads it.
 *
 * GET → { progress: { next, done, line }, href, tasks: [open next steps on the
 *         job's person, for this job or for no job, soonest due first] }
 *
 * Counts only; nothing is written. Session client, org from the session.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: job } = await supabase.from("jobs").select("id, contact_id, job_type").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!job) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));

  const [facts, tasks] = await Promise.all([
    scopeFacts(supabase, orgId, [id]),
    job.contact_id
      ? supabase.from("contact_tasks").select("id, title, due_on, source, job_id, evidence_quote")
          .eq("org_id", orgId).eq("contact_id", job.contact_id as string).eq("status", "open")
          .or(`job_id.eq.${id},job_id.is.null`)
          .order("due_on", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
  ]);
  const progress = scopeProgress(facts.get(id)!, marketOf(job.job_type as string | null));
  return applyCookies(NextResponse.json({
    progress, href: stepHref(id, progress.next), contact_id: job.contact_id ?? null, tasks: tasks.data ?? [],
  }));
}
