import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { settleCallNotes } from "@/lib/call-notes-server";
import { quoteQuestion } from "@/lib/call-notes";

/**
 * "Draft the quote" on a call (Coy, 2026-10-03). Finds the job the call is
 * about — the call's own job, else the newest live job of the caller or their
 * customer — and returns it with the question for Dusty's box. Coy sends the
 * question; Dusty answers with a budget plan that Coy applies (§3). With no
 * job, says so; { create: true } then starts one for the caller (Coy's tap,
 * the same as + Start a job). Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE = ["complete", "completed", "lost", "paid", "closed"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await ctx.params;
  if (!UUID.test(messageId)) return NextResponse.json({ error: "Not a message id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, userId, applyCookies } = result.session;
  const b = (await req.json().catch(() => ({}))) as { create?: unknown };

  const { data: m } = await sb.from("messages").select("id, contact_id, job_id, channel, occurred_at").eq("org_id", orgId).eq("id", messageId).maybeSingle();
  if (!m?.contact_id || m.channel !== "call") return applyCookies(NextResponse.json({ error: "Call not found." }, { status: 404 }));
  const { data: c } = await sb.from("contacts").select("id, name, phone, customer_id").eq("org_id", orgId).eq("id", m.contact_id as string).maybeSingle();
  if (!c) return applyCookies(NextResponse.json({ error: "Caller not found." }, { status: 404 }));
  await settleCallNotes(sb, orgId, [c.id as string]);

  let jobId: string | null = null;
  if (m.job_id) {
    const { data: j } = await sb.from("jobs").select("id").eq("org_id", orgId).eq("id", m.job_id as string).is("archived_at", null).maybeSingle();
    jobId = (j?.id as string | undefined) ?? null;
  }
  if (!jobId) {
    let q = sb.from("jobs").select("id, status").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(10);
    q = c.customer_id ? q.or(`contact_id.eq.${c.id},customer_id.eq.${c.customer_id}`) : q.eq("contact_id", c.id as string);
    const { data: js } = await q;
    jobId = ((js ?? []) as Array<{ id: string; status: string | null }>).find((j) => !DONE.includes(String(j.status)))?.id ?? null;
  }
  if (!jobId && b.create === true) {
    const now = new Date().toISOString();
    const { data: j, error } = await sb.from("jobs").insert({
      org_id: orgId, contact_id: c.id, customer_id: c.customer_id ?? null, origin: "manual", status: "lead",
      stage_changed_at: now, confirmed_at: now, confirmed_by: userId,
    }).select("id").single();
    if (error) return applyCookies(NextResponse.json({ error: `Couldn't start a job: ${error.message}` }, { status: 500 }));
    jobId = j.id as string;
  }
  const who = (c.name as string | null)?.trim() || (c.phone as string | null) || "this caller";
  if (!jobId) return applyCookies(NextResponse.json({ job_id: null, needs_job: true, who }));
  return applyCookies(NextResponse.json({ job_id: jobId, question: quoteQuestion(who, m.occurred_at as string | null) }));
}
