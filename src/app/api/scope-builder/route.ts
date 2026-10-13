import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobValues } from "@/lib/job-totals";
import { marketOf, scopeProgress, type ScopeFacts } from "@/lib/scope-builder";
import { scopeFacts } from "@/lib/scope-builder-server";

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
    .select("id, title, address, city, job_type, status, created_at, updated_at, duration_days, customer_id, customers!jobs_customer_id_fkey(name), contacts!jobs_contact_id_fkey(name)")
    .eq("org_id", orgId).is("archived_at", null).order("updated_at", { ascending: false }).limit(300);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const rows = (jobs ?? []) as unknown as Array<Record<string, unknown>>;
  const ids = rows.map((j) => j.id as string);
  if (!ids.length) return applyCookies(NextResponse.json({ scopes: [] }));

  const [factsOf, values] = await Promise.all([
    scopeFacts(supabase, orgId, ids),
    jobValues(supabase, orgId, rows.map((j) => ({ id: j.id as string, duration_days: j.duration_days }))),
  ]);

  const scopes = rows.map((j) => {
    const id = j.id as string;
    const facts = factsOf.get(id) as ScopeFacts;
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
