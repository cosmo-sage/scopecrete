import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { differenceInDays, parseISO } from "date-fns";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Only use stages that exist in the DB
const VALID_STAGES = ["new", "contacted", "qualified", "won", "lost"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  try {
    // Fetch leads
    const { data: leads, error } = await supabase
      .from("leads")
      .select(`id,customer_name,customer_phone,address,project_type,status,estimate_range_min,estimate_range_max,created_at,updated_at`)
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads) return NextResponse.json({ stages: {}, summary: {} });

    // Fetch estimates for pipeline value — quote_amount is the real number
    const leadIds = leads.map((l) => l.id);
    const { data: estimates } = await supabase
      .from("estimates")
      .select("lead_id, quote_amount")
      .in("lead_id", leadIds)
      .eq("status", "sent");

    const estimateByLead: Record<string, number> = {};
    for (const est of estimates ?? []) {
      if (est.quote_amount) {
        estimateByLead[est.lead_id] = Math.max(estimateByLead[est.lead_id] ?? 0, est.quote_amount);
      }
    }

    const now = new Date();
    const stages: Record<string,any> = {};
    for (const s of VALID_STAGES) {
      stages[s] = { count: 0, totalValue: 0, avgDaysInStage: 0, leads: [] };
    }

    let totalPipelineValue = 0, needsActionCount = 0, wonCount = 0, lostCount = 0, totalLeadsForWinRate = 0;

    for (const lead of leads) {
      // Skip invalid statuses; treat unknowns as "new"
      const status = VALID_STAGES.includes(lead.status) ? lead.status : "new";
      const daysInStage = differenceInDays(now, parseISO(lead.updated_at || lead.created_at));

      // Use quote_amount if available, else fall back to estimate range
      const quoteAmount = estimateByLead[lead.id];
      const rangeMin = lead.estimate_range_min || 0;
      const rangeMax = lead.estimate_range_max || 0;
      const estimatedValue = quoteAmount ?? (rangeMax > 0 ? rangeMax : rangeMin);

      const customerName = lead.customer_name || lead.customer_phone || "Unknown Lead";

      stages[status].leads.push({
        id: lead.id,
        customerName,
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

      if (status !== "won" && status !== "lost") {
        totalPipelineValue += estimatedValue;
      }
      if (status === "won") { wonCount++; totalLeadsForWinRate++; }
      if (status === "lost") { lostCount++; totalLeadsForWinRate++; }

      if (
        (status === "new" && differenceInDays(now, parseISO(lead.created_at)) > 1) ||
        (status === "contacted" && daysInStage > 3)
      ) needsActionCount++;
    }

    for (const s of VALID_STAGES) {
      if (stages[s].leads.length > 0) {
        const sum = stages[s].leads.reduce((a: number, l: any) => a + l.daysInStage, 0);
        stages[s].avgDaysInStage = Math.round(sum / stages[s].leads.length);
      }
    }

    const winRate = totalLeadsForWinRate > 0 ? Math.round((wonCount / totalLeadsForWinRate) * 100) : 0;
    const summary = { totalPipelineValue, needsAction: needsActionCount, winRate };

    return NextResponse.json({ stages, summary });
  } catch(e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
