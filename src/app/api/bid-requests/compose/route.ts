import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { composeFor } from "@/lib/bids-server";

/**
 * What the bid request composer needs (migration 091).
 * GET            → { jobs } — open jobs, newest first, for "Which job".
 * GET ?job=<id>  → { job } — its scopes (lines with quantities, never costs),
 *                  the photos, plans and aerials it can send, the address.
 * Session client, org from the session (§7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const jobId = req.nextUrl.searchParams.get("job");
  if (jobId) {
    if (!UUID.test(jobId)) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
    const job = await composeFor(supabase, orgId, jobId);
    if (!job) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
    // Storage paths stay on the server; the composer picks files by id.
    return applyCookies(NextResponse.json({ job: { ...job, files: job.files.map((f) => ({ id: f.id, name: f.name, kind: f.kind })) } }));
  }
  const { data, error } = await supabase.from("jobs").select("id, title, address, status, created_at")
    .eq("org_id", orgId).is("archived_at", null).not("status", "in", "(complete,closed,lost)")
    .order("created_at", { ascending: false }).limit(40);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ jobs: data ?? [] }));
}
