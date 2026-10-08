import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";
import { loadTakeoff } from "@/lib/plans-server";

/**
 * The Plan Room's data for one job (migration 059): its files (each with
 * In plan room), the sheets read from the plan files, the takeoff groups and
 * shapes, and each group's measured total — worked out here by the same
 * src/lib/takeoff.ts the page uses, so the two always agree. Session client,
 * org from the session.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const job = await jobInOrg(supabase, orgId, id);
  if (!job) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));

  const [{ data: j }, { data: rows, error }, takeoff, { data: est }] = await Promise.all([
    supabase.from("jobs").select("id, title, address, job_type, status, customer_id").eq("org_id", orgId).eq("id", id).maybeSingle(),
    supabase.from("files").select(FILE_COLUMNS).eq("org_id", orgId).eq("job_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    loadTakeoff(supabase, orgId, [id]),
    supabase.from("estimates").select("id").eq("org_id", orgId).eq("job_id", id).eq("status", "draft").maybeSingle(),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  // Which groups already have a budget line, so Send to budget can say "On budget ✓".
  let linked: Array<{ id: string; takeoff_parameter_id: string; name: string; unit: string }> = [];
  if (est?.id) {
    const { data } = await supabase.from("estimate_line_items").select("id, takeoff_parameter_id, name, unit")
      .eq("estimate_id", est.id as string).not("takeoff_parameter_id", "is", null);
    linked = (data ?? []) as typeof linked;
  }
  const files = await signFiles(supabase, (rows ?? []) as Array<Record<string, unknown>>);
  return applyCookies(NextResponse.json({ job: j, files, ...takeoff, lines: linked }));
}
