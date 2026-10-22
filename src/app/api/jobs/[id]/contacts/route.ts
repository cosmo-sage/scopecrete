import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * A job's own contacts (migration 115, `job_contacts`; Coy, 2026-10-21: "if there is multiple
 * contacts with a customer (in the case of a GC company), i want to be able to select the
 * contacts for that customer/job").
 *
 * POST   { contact_id, side? } → put them on this job (side customer · owner · vendor · other)
 * DELETE ?contact_id=…         → take them off this job (not the job's primary person)
 *
 * Session client, org from the session; the guard trigger checks the job and the person are this org's.
 * Before 115: 409 { error, code: "needs_115" }.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;
const SIDES = new Set(["customer", "owner", "vendor", "other"]);
const missing = (m: string) => /job_contacts/.test(m) && /(does not exist|schema cache|relation)/i.test(m);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400, code?: string) => applyCookies(NextResponse.json({ error: m, ...(code ? { code } : {}) }, { status: s }));
  let b: { contact_id?: unknown; side?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const contactId = typeof b.contact_id === "string" && UUID.test(b.contact_id) ? b.contact_id : null;
  if (!UUID.test(id) || !contactId) return bad("Pick a job and a person.");
  const side = typeof b.side === "string" && SIDES.has(b.side) ? b.side : "customer";
  const { error } = await supabase.from("job_contacts")
    .upsert({ org_id: orgId, job_id: id, contact_id: contactId, side, source: "coy", created_by: userId }, { onConflict: "job_id,contact_id" });
  if (error) return missing(error.message) ? bad("Picking contacts per job waits for migration 115.", 409, "needs_115") : bad(error.message, 500);
  return applyCookies(NextResponse.json({ ok: true }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400, code?: string) => applyCookies(NextResponse.json({ error: m, ...(code ? { code } : {}) }, { status: s }));
  const contactId = req.nextUrl.searchParams.get("contact_id") ?? "";
  if (!UUID.test(id) || !UUID.test(contactId)) return bad("Pick a job and a person.");
  const { data: job } = await supabase.from("jobs").select("contact_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!job) return bad("Job not found.", 404);
  if (job.contact_id === contactId) return bad("They're the job's main person — make someone else primary first.", 409);
  const { error } = await supabase.from("job_contacts").delete().eq("org_id", orgId).eq("job_id", id).eq("contact_id", contactId);
  if (error) return missing(error.message) ? bad("Picking contacts per job waits for migration 115.", 409, "needs_115") : bad(error.message, 500);
  return applyCookies(NextResponse.json({ ok: true }));
}
