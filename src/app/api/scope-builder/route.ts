import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobValues } from "@/lib/job-totals";
import { marketOf, scopeProgress, type ScopeFacts } from "@/lib/scope-builder";

/**
 * The Scope Builder page (Coy, 2026-10-09) — every scope not archived, with how
 * far it has got: Files → Takeoffs → Budget → Proposal → Sent
 * (src/lib/scope-builder.ts), its market (residential vs commercial /
 * government) and its price from the engine (job-totals, the Dashboard's
 * reader). Counts only — nothing is written.
 *
 * GET → { scopes: [{ id, title, customer, address, job_type, market, status,
 *          created_at, updated_at, facts, progress, total }] }
 *
 * Session client, org from the session (DECISIONS §7). An onsite estimator
 * never reaches this page (redirectFor).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: jobs, error } = await supabase.from("jobs")
    .select("id, title, address, city, job_type, status, created_at, updated_at, duration_days, customer_id, customers(name), contacts!jobs_contact_id_fkey(name)")
    .eq("org_id", orgId).is("archived_at", null).order("updated_at", { ascending: false }).limit(300);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const rows = (jobs ?? []) as unknown as Array<Record<string, unknown>>;
  const ids = rows.map((j) => j.id as string);
  if (!ids.length) return applyCookies(NextResponse.json({ scopes: [] }));

  const [files, shapes, secs, ests, props, docs, values] = await Promise.all([
    supabase.from("files").select("job_id").eq("org_id", orgId).is("deleted_at", null).in("job_id", ids).limit(10000),
    supabase.from("takeoff_measurements").select("takeoff_parameters!inner(job_id)").eq("org_id", orgId).in("takeoff_parameters.job_id", ids).limit(10000),
    supabase.from("job_sections").select("job_id, length_ft, width_ft, sqft_override, count_qty").eq("org_id", orgId).in("job_id", ids).limit(5000),
    supabase.from("estimates").select("id, job_id, estimate_line_items(count)").eq("org_id", orgId).eq("status", "draft").in("job_id", ids),
    supabase.from("job_proposals").select("job_id, status").eq("org_id", orgId).eq("status", "final").in("job_id", ids),
    supabase.from("documents").select("job_id, sent_at, view_count, revoked_at").eq("org_id", orgId).not("proposal_id", "is", null).in("job_id", ids),
    jobValues(supabase, orgId, rows.map((j) => ({ id: j.id as string, duration_days: j.duration_days }))),
  ]);
  const bump = (m: Map<string, number>, k: string | null | undefined, n = 1) => { if (k) m.set(k, (m.get(k) ?? 0) + n); };
  const fileN = new Map<string, number>(), shapeN = new Map<string, number>(), secN = new Map<string, number>(), sizedN = new Map<string, number>(),
    lineN = new Map<string, number>(), viewN = new Map<string, number>();
  const finals = new Set<string>(), sent = new Set<string>();
  for (const f of (files.data ?? []) as Array<{ job_id: string }>) bump(fileN, f.job_id);
  for (const s of (shapes.data ?? []) as unknown as Array<{ takeoff_parameters: { job_id: string } | null }>) bump(shapeN, s.takeoff_parameters?.job_id);
  for (const s of (secs.data ?? []) as Array<Record<string, unknown>>) {
    bump(secN, s.job_id as string);
    if ((Number(s.length_ft) > 0 && Number(s.width_ft) > 0) || Number(s.sqft_override) > 0 || Number(s.count_qty) > 0) bump(sizedN, s.job_id as string);
  }
  for (const e of (ests.data ?? []) as unknown as Array<{ job_id: string; estimate_line_items: Array<{ count: number }> | null }>) bump(lineN, e.job_id, e.estimate_line_items?.[0]?.count ?? 0);
  for (const p of (props.data ?? []) as Array<{ job_id: string }>) finals.add(p.job_id);
  for (const d of (docs.data ?? []) as Array<{ job_id: string; sent_at: string | null; view_count: number | null; revoked_at: string | null }>) {
    if (d.sent_at) { sent.add(d.job_id); bump(viewN, d.job_id, d.view_count ?? 0); }
  }

  const scopes = rows.map((j) => {
    const id = j.id as string;
    const facts: ScopeFacts = {
      files: fileN.get(id) ?? 0, measured: shapeN.get(id) ?? 0, sized_sections: sizedN.get(id) ?? 0, sections: secN.get(id) ?? 0,
      budget_lines: lineN.get(id) ?? 0, final_proposal: finals.has(id), sent: sent.has(id), views: viewN.get(id) ?? 0,
    };
    const market = marketOf(j.job_type as string | null);
    const cust = (j.customers as { name: string | null } | null)?.name ?? (j.contacts as { name: string | null } | null)?.name ?? null;
    return {
      id, title: (j.title as string | null) || "Untitled scope", customer: cust, address: (j.address as string | null) ?? null, city: (j.city as string | null) ?? null,
      job_type: (j.job_type as string | null) ?? null, market, status: j.status as string,
      created_at: j.created_at as string, updated_at: (j.updated_at as string | null) ?? (j.created_at as string),
      facts, progress: scopeProgress(facts, market), total: values.get(id)?.total ?? null,
    };
  });
  return applyCookies(NextResponse.json({ scopes }));
}
