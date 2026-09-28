import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Tick, reopen, dismiss or edit one next step.
 *
 * PATCH { status?: 'open'|'done'|'dismissed', title?, due_on?: 'YYYY-MM-DD'|null } → { task }
 *
 * Dismissing one of Dusty's suggestions is permanent in effect: the reader
 * never adds an item with the same title_key again (migration 038).
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const body = (await req.json().catch(() => ({}))) as { status?: unknown; title?: unknown; due_on?: unknown };
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!["open", "done", "dismissed"].includes(body.status as string)) {
      return applyCookies(NextResponse.json({ error: "status must be open, done or dismissed." }, { status: 400 }));
    }
    patch.status = body.status;
    patch.done_at = body.status === "done" ? new Date().toISOString() : null;
  }
  if (typeof body.title === "string") {
    const t = body.title.replace(/\s+/g, " ").trim();
    if (!t || t.length > 200) return applyCookies(NextResponse.json({ error: "Title must be 1–200 characters." }, { status: 400 }));
    patch.title = t;
  }
  if (body.due_on === null) patch.due_on = null;
  else if (typeof body.due_on === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due_on)) return applyCookies(NextResponse.json({ error: "due_on must be YYYY-MM-DD." }, { status: 400 }));
    patch.due_on = body.due_on;
  }
  if (!Object.keys(patch).length) return applyCookies(NextResponse.json({ error: "Nothing to change." }, { status: 400 }));

  const { data: task, error } = await supabase.from("contact_tasks").update(patch)
    .eq("org_id", orgId).eq("id", id)
    .select("id, title, due_on, source, status, evidence_quote, job_id, created_at, done_at").maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: `contact_tasks: ${error.message}` }, { status: 500 }));
  if (!task) return applyCookies(NextResponse.json({ error: "Task not found." }, { status: 404 }));
  return applyCookies(NextResponse.json({ task }));
}
