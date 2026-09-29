import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Add a next step for one person — Coy's own to-do (source 'coy'). Dusty's
 * suggestions are written by the background reader, never through here.
 *
 * POST { title, due_on?: 'YYYY-MM-DD', job_id? } → { task }
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  const body = (await req.json().catch(() => ({}))) as { title?: unknown; due_on?: unknown; job_id?: unknown };
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
  if (!title || title.length > 200) {
    return applyCookies(NextResponse.json({ error: "A next step needs a title (up to 200 characters)." }, { status: 400 }));
  }
  const due = typeof body.due_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_on) ? body.due_on : null;

  // The contact (and job) must be this org's — RLS would refuse the insert
  // anyway, but a clear 404 beats a policy error.
  const { data: c } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", contactId).maybeSingle();
  if (!c) return applyCookies(NextResponse.json({ error: "Contact not found." }, { status: 404 }));
  let jobId: string | null = null;
  if (typeof body.job_id === "string") {
    const { data: j } = await supabase.from("jobs").select("id").eq("org_id", orgId).eq("id", body.job_id).maybeSingle();
    if (!j) return applyCookies(NextResponse.json({ error: "Job not found." }, { status: 404 }));
    jobId = j.id as string;
  }

  const { data: task, error } = await supabase.from("contact_tasks")
    .insert({ org_id: orgId, contact_id: contactId, job_id: jobId, title, due_on: due, source: "coy", created_by: userId })
    .select("id, title, due_on, source, status, evidence_quote, job_id, created_at, done_at").single();
  if (error) return applyCookies(NextResponse.json({ error: `contact_tasks: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ task }, { status: 201 }));
}
