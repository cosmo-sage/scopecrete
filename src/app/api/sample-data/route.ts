import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { isOwner } from "@/lib/org-server";

/**
 * Sample data for a new company (migration 119; Coy, 2026-10-22: "seed a new org with a little
 * sample data … so he's not confused when he first logs in").
 *
 * GET    → { ready, active, job_id, rows, can_edit } — ready false before 119.
 * POST   { action: "add" | "remove" } → owners only, through sc_seed_sample_data /
 *        sc_remove_sample_data (SECURITY DEFINER, owner checked again there). Remove archives
 *        and retires what was put in; nothing is deleted.
 *
 * Session client; the org comes from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

const missing = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205" || e?.code === "42883" || e?.code === "PGRST202";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const [{ data, error }, owner] = await Promise.all([
    supabase.from("sample_records").select("kind, row_id, created_at").eq("org_id", orgId).is("removed_at", null).order("created_at"),
    isOwner(supabase, orgId, userId),
  ]);
  if (missing(error)) return applyCookies(NextResponse.json({ ready: false, active: false, job_id: null, rows: 0, can_edit: owner }));
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const rows = (data ?? []) as { kind: string; row_id: string }[];
  // The driveway job is the one the tour opens (the bid job is the other).
  const jobIds = rows.filter((r) => r.kind === "job").map((r) => r.row_id);
  let jobId: string | null = jobIds[0] ?? null;
  if (jobIds.length > 1) {
    const { data: jobs } = await supabase.from("jobs").select("id, title").in("id", jobIds).is("archived_at", null);
    const list = (jobs ?? []) as { id: string; title: string | null }[];
    jobId = list.find((j) => /driveway/i.test(j.title ?? ""))?.id ?? list[0]?.id ?? jobId;
  }
  return applyCookies(NextResponse.json({ ready: true, active: rows.length > 0, job_id: jobId, rows: rows.length, can_edit: owner }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, status = 400) => applyCookies(NextResponse.json({ error: m }, { status }));
  if (!(await isOwner(supabase, orgId, userId))) return bad("Only an owner can add or remove sample data.", 403);
  const body = await req.json().catch(() => ({}));
  const action = body?.action === "remove" ? "remove" : body?.action === "add" ? "add" : null;
  if (!action) return bad("Say add or remove.");
  const fn = action === "add" ? "sc_seed_sample_data" : "sc_remove_sample_data";
  const { data, error } = await supabase.rpc(fn, { p_org: orgId });
  if (missing(error)) return bad("Sample data waits for migration 119.", 409);
  if (error) return bad(error.message);
  return applyCookies(NextResponse.json({ ok: true, result: data }));
}
