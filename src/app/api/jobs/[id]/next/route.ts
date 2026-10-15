import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { marketOf, scopeProgress, stepHref } from "@/lib/scope-builder";
import { scopeFacts } from "@/lib/scope-builder-server";
import { dedupeTasks, repeatsStep, shortTask } from "@/lib/next-tasks";

/**
 * What is left to scope and price one job (Coy, 2026-10-13: a new job should
 * "prompt me for what was next to finish scoping and estimating the job") — the
 * job's Summary reads it.
 *
 * GET → { progress: { next, done, line }, href, contact_id, tasks }
 *
 * tasks (Coy, 2026-10-15: "a lot of redundant repeat items … less words"): the
 * open next steps of the job's person (else its customer's primary) filed on this
 * job — and those filed on no job only while this is their one open job, since
 * Dusty's steps carry no job and a GC's person has many. Coy's own first, then
 * soonest due, newest; one of each ask however it was worded (`dedupeTasks`), no
 * "Finish scoping …" when the Scope Builder step is shown, each in fewer words
 * (`short`; `title` keeps the whole). contact_id is who + Add to-do files on.
 *
 * Counts only; nothing is written. Session client, org from the session.
 */

export const dynamic = "force-dynamic";

type Task = { id: string; title: string; due_on: string | null; source: string; job_id: string | null; created_at: string };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: job } = await supabase.from("jobs").select("id, contact_id, customer_id, job_type").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!job) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));

  let contactId = (job.contact_id as string | null) ?? null;
  if (!contactId && job.customer_id) {
    const { data: c } = await supabase.from("customers").select("primary_contact_id").eq("org_id", orgId).eq("id", job.customer_id as string).maybeSingle();
    contactId = (c?.primary_contact_id as string | null) ?? null;
  }

  const [facts, tasks, others] = await Promise.all([
    scopeFacts(supabase, orgId, [id]),
    contactId
      ? supabase.from("contact_tasks").select("id, title, due_on, source, job_id, created_at")
          .eq("org_id", orgId).eq("contact_id", contactId).eq("status", "open")
          .or(`job_id.eq.${id},job_id.is.null`).limit(60)
      : Promise.resolve({ data: [] }),
    contactId
      ? supabase.from("jobs").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("contact_id", contactId)
          .neq("id", id).is("archived_at", null).not("status", "in", "(complete,lost)")
      : Promise.resolve({ count: 0 }),
  ]);
  const progress = scopeProgress(facts.get(id)!, marketOf(job.job_type as string | null));
  const onlyJob = (others.count ?? 0) === 0;
  const stepShown = progress.next !== "sent";
  const rows = ((tasks.data ?? []) as Task[])
    .filter((t) => t.job_id === id || onlyJob)
    .filter((t) => !(stepShown && repeatsStep(t.title)))
    .sort((a, b) => (a.source === "coy" ? 0 : 1) - (b.source === "coy" ? 0 : 1)
      || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999")
      || b.created_at.localeCompare(a.created_at));
  return applyCookies(NextResponse.json({
    progress, href: stepHref(id, progress.next), contact_id: contactId,
    tasks: dedupeTasks(rows).map((t) => ({ id: t.id, title: t.title, short: shortTask(t.title), due_on: t.due_on, source: t.source })),
  }));
}
