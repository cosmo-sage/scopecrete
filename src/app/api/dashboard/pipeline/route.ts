import { NextRequest, NextResponse } from "next/server";
import { differenceInDays, parseISO } from "date-fns";
import { getApiSession } from "@/lib/api-auth";

/**
 * Lead pipeline for the signed-in user's org.
 *
 * WHY THIS ROUTE WAS REWRITTEN
 *
 * It previously built a service-role client at MODULE scope:
 *
 *     const supabase = createClient(supabaseUrl, supabaseServiceKey);
 *
 * Two separate faults in one line.
 *
 * 1. Service role on a browser-reachable path, with org_id read straight off
 *    the query string and no auth check — any unauthenticated caller could
 *    read any org's leads and quote amounts. DECISIONS.md §7 exists because
 *    api/dashboard/cashflow shipped this exact bug in PR #1.
 *
 * 2. Module scope means Next evaluates it while collecting page data at BUILD
 *    time. When SUPABASE_SERVICE_ROLE_KEY was deleted along with the dead
 *    Supabase project's integration, the key became "" and the constructor
 *    threw "supabaseKey is required." — failing the build rather than the
 *    request. A credential read at module scope turns a missing variable into
 *    a broken deployment.
 *
 * Both are fixed the same way: the client is created per request, inside the
 * handler, from the caller's own session, and the org comes from their
 * org_members row rather than from anything they can type.
 *
 * RESOLVED — this route used to read zero rows. leads and estimates gated
 * select on `current_setting('app.current_org_id')`, a GUC nothing in this
 * codebase sets, so under a session client RLS filtered everything out.
 * Migration 024 moved both onto `org_id = ANY (get_user_org_ids())`; verified
 * 2026-09-27 (`leads_org_select`, `estimates_org_select`). The fix was on the
 * database side, as it should have been — never a reason to put the
 * service-role key back.
 */

export const dynamic = "force-dynamic";

// Only stages that exist in the DB.
const VALID_STAGES = ["new", "contacted", "qualified", "won", "lost"] as const;

interface LeadRow {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  project_type: string | null;
  status: string | null;
  estimate_range_min: number | null;
  estimate_range_max: number | null;
  created_at: string;
  updated_at: string | null;
}

interface StageLead {
  id: string;
  customerName: string;
  projectType: string;
  address: string;
  estimatedValue: number;
  estimateMin: number;
  estimateMax: number;
  quoteAmount: number | null;
  daysInStage: number;
  createdAt: string;
}

interface Stage {
  count: number;
  totalValue: number;
  avgDaysInStage: number;
  leads: StageLead[];
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  // org_id is still filtered explicitly. RLS is the enforcement; this is
  // defence in depth, and it keeps the query honest if a user ever belongs to
  // more than one org.
  const { data: leadRows, error: leadsError } = await supabase
    .from("leads")
    .select(
      "id,customer_name,customer_phone,address,project_type,status," +
        "estimate_range_min,estimate_range_max,created_at,updated_at",
    )
    .eq("org_id", orgId);

  if (leadsError) {
    return applyCookies(
      NextResponse.json({ error: `leads: ${leadsError.message}` }, { status: 500 }),
    );
  }

  const leads = (leadRows ?? []) as LeadRow[];

  // quote_amount is the real number when an estimate has been sent; the
  // range on the lead is only a fallback.
  const estimateByLead: Record<string, number> = {};
  if (leads.length > 0) {
    const { data: estimates, error: estError } = await supabase
      .from("estimates")
      .select("lead_id, quote_amount")
      .in("lead_id", leads.map((l) => l.id))
      .eq("status", "sent");

    if (estError) {
      return applyCookies(
        NextResponse.json({ error: `estimates: ${estError.message}` }, { status: 500 }),
      );
    }

    for (const est of (estimates ?? []) as Array<{ lead_id: string; quote_amount: number | null }>) {
      if (est.quote_amount) {
        estimateByLead[est.lead_id] = Math.max(estimateByLead[est.lead_id] ?? 0, est.quote_amount);
      }
    }
  }

  const now = new Date();
  const stages: Record<string, Stage> = {};
  for (const s of VALID_STAGES) {
    stages[s] = { count: 0, totalValue: 0, avgDaysInStage: 0, leads: [] };
  }

  let totalPipelineValue = 0;
  let needsActionCount = 0;
  let wonCount = 0;
  let totalLeadsForWinRate = 0;

  for (const lead of leads) {
    // Unknown statuses are treated as "new" rather than dropped — a lead with
    // a status nobody recognises is still a lead somebody has to call.
    const status = VALID_STAGES.includes(lead.status as typeof VALID_STAGES[number])
      ? (lead.status as string)
      : "new";
    const daysInStage = differenceInDays(now, parseISO(lead.updated_at || lead.created_at));

    const quoteAmount = estimateByLead[lead.id];
    const rangeMin = lead.estimate_range_min || 0;
    const rangeMax = lead.estimate_range_max || 0;
    const estimatedValue = quoteAmount ?? (rangeMax > 0 ? rangeMax : rangeMin);

    stages[status].leads.push({
      id: lead.id,
      customerName: lead.customer_name || lead.customer_phone || "Unknown Lead",
      projectType: lead.project_type || "Unspecified",
      address: lead.address || "",
      estimatedValue,
      estimateMin: rangeMin,
      estimateMax: rangeMax,
      quoteAmount: quoteAmount ?? null,
      daysInStage,
      createdAt: lead.created_at,
    });

    stages[status].count++;
    stages[status].totalValue += estimatedValue;

    if (status !== "won" && status !== "lost") totalPipelineValue += estimatedValue;
    if (status === "won") { wonCount++; totalLeadsForWinRate++; }
    if (status === "lost") totalLeadsForWinRate++;

    if (
      (status === "new" && differenceInDays(now, parseISO(lead.created_at)) > 1) ||
      (status === "contacted" && daysInStage > 3)
    ) needsActionCount++;
  }

  for (const s of VALID_STAGES) {
    const bucket = stages[s];
    if (bucket.leads.length > 0) {
      const sum = bucket.leads.reduce((a, l) => a + l.daysInStage, 0);
      bucket.avgDaysInStage = Math.round(sum / bucket.leads.length);
    }
  }

  const winRate = totalLeadsForWinRate > 0 ? Math.round((wonCount / totalLeadsForWinRate) * 100) : 0;

  return applyCookies(NextResponse.json({
    stages,
    summary: { totalPipelineValue, needsAction: needsActionCount, winRate },
  }));
}
