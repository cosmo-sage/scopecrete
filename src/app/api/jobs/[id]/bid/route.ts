import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";

/**
 * The bid behind a job (migration 063): what the bid reader found and did.
 *
 * GET → { bid: null } | { bid: { id, state, error, facts, box_url, box_folder_name,
 *   files: { total, fetched, failed, scanned }, sheets, email_id, made: { job, customer, contact },
 *   scope: [{ id, name, work_type, psi, depth_in, rebar, source_ref }] } }
 *
 * Session client; org from the session; RLS decides (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const { data: pkgs } = await supabase.from("bid_packages")
    .select("id, state, error, facts, box_url, box_folder_name, email_id, created, filed_at, created_at")
    .eq("org_id", orgId).eq("job_id", id).neq("state", "undone").order("created_at", { ascending: false }).limit(5);
  const pkg = (pkgs ?? [])[0] as Record<string, unknown> | undefined;
  if (!pkg) return applyCookies(NextResponse.json({ bid: null }));
  const ids = ((pkgs ?? []) as Array<{ id: string }>).map((p) => p.id);
  const [{ data: files }, { count: sheets }, { data: scope }] = await Promise.all([
    supabase.from("bid_package_files").select("fetch_state, scan_state").eq("org_id", orgId).in("package_id", ids),
    supabase.from("plan_sheets").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("job_id", id),
    supabase.from("job_sections").select("id, name, work_type, psi, depth_in, rebar, source_ref").eq("org_id", orgId).eq("job_id", id).eq("origin", "bid").order("sort_order"),
  ]);
  const fs = (files ?? []) as Array<{ fetch_state: string; scan_state: string }>;
  const made = (pkg.created ?? {}) as Record<string, unknown>;
  return applyCookies(NextResponse.json({
    bid: {
      id: pkg.id, state: pkg.state, error: pkg.error, facts: pkg.facts, box_url: pkg.box_url, box_folder_name: pkg.box_folder_name,
      email_id: pkg.email_id, filed_at: pkg.filed_at, packages: ids.length,
      files: { total: fs.length, fetched: fs.filter((f) => f.fetch_state === "fetched").length, failed: fs.filter((f) => f.fetch_state === "failed").length, scanned: fs.filter((f) => f.scan_state === "scanned").length },
      sheets: sheets ?? 0,
      made: { job: !!made.job_id, customer: !!made.customer_id, contact: !!made.contact_id },
      scope: scope ?? [],
    },
  }));
}
