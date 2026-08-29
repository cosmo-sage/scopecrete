import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Jobs for the signed-in user's org.
 *
 * Split out of the cashflow route, which Scope was reading through as a
 * side-effect. That dependency worked but was load-bearing by accident: Scope
 * is the spine of the product (DECISIONS.md §1) and it should not be reading
 * its primary table through a cash-flow aggregate that happens to include it.
 *
 * `jobs` is 0 rows today, and — worth stating plainly because it decides what
 * Scope can ever show — NOTHING IN THE SYSTEM CREATES ONE. There is no writer
 * anywhere: not the intake function, not any API route, not the UI. An empty
 * Scope screen is not a wiring gap, it is an empty table with no author.
 *
 * RLS: `jobs.jobs_member_select` gates on `get_user_org_ids()` after migration
 * 024, so a session client reads exactly this caller's org.
 */

export const dynamic = "force-dynamic";

export interface JobRow {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string | null;
  created_at: string | null;
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, title, status, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return applyCookies(NextResponse.json({ error: `jobs: ${error.message}` }, { status: 500 }));
  }

  return applyCookies(NextResponse.json({ jobs: (data ?? []) as JobRow[] }));
}
