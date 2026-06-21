import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { differenceInDays, parseISO } from "date-fns";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("org_id");

  if (!orgId) {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  try {
    // Fetch leads with joined contact information
    const { data: leads, error } = await supabase
      .from("leads")
      .select(
        `
        id,
        customer_name,
        customer_phone,
        address,
        project_type,
        scope_of_work,
        status,
        estimated_value,
        created_at,
        updated_at,
        contact_id,
        quo_event_id,
        contacts ( name, phone )
      `,
      )
      .eq("org_id", orgId);

    if (error) {
      console.error("Error fetching leads:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!leads) {
      return NextResponse.json({ stages: {}, summary: {} });
    }

    const now = new Date();

    const stages: Record<string, any> = {
      new: { count: 0, totalValue: 0, avgDaysInStage: 0, leads: [] },
      contacted: { count: 0, totalValue: 0, avgDaysInStage: 0, leads: [] },
      qualified: { count: 0, totalValue: 0, avgDaysInStage: 0, leads: [] },
      quoted: { count: 0, totalValue: 0, avgDaysInStage: 0, leads: [] },
      won: { count: 0, totalValue: 0, avgDaysInStage: 0, leads: [] },
      lost: { count: 0, totalValue: 0, avgDaysInStage: 0, leads: [] },
    };

    let totalPipelineValue = 0;
    let needsActionCount = 0;
    let wonCount = 0;
    let lostCount = 0;
    let totalLeadsConsideredForWinRate = 0;

    for (const lead of leads) {
      if (!stages[lead.status]) {
        // Handle unexpected status values by putting them in 'new' or 'unknown'
        lead.status = "new";
      }

      const createdAt = parseISO(lead.created_at);
      const daysInStage = differenceInDays(now, parseISO(lead.updated_at || lead.created_at));
      const estimatedValue = lead.estimated_value || 0;

      const customerName = lead.customer_name
        ?? lead.contacts?.[0]?.name
        ?? lead.customer_phone
        ?? "Unknown Lead";
      
      let nextAction: string = "";
      if (lead.status === "new" && daysInStage > 0) {
        nextAction = "call_today";
      } else if (lead.status === "contacted" && daysInStage > 3) {
        nextAction = "follow_up";
      } else if (lead.status === "quoted"){
        nextAction = "proposal_sent";
      }

      stages[lead.status].leads.push({
        id: lead.id,
        customerName: customerName,
        projectType: lead.project_type || "Unspecified",
        address: lead.address || "", // Assuming address will be filled by enrichment
        estimatedValue: estimatedValue,
        daysInStage: daysInStage,
        nextAction: nextAction,
        createdAt: lead.created_at,
      });

      // Aggregates
      stages[lead.status].count++;
      stages[lead.status].totalValue += estimatedValue;
      
      // For pipeline and summary stats
      if (lead.status !== "won" && lead.status !== "lost") {
        totalPipelineValue += estimatedValue;
      }
      if (lead.status === "won") {
        wonCount++;
        totalLeadsConsideredForWinRate++;
      }
      if (lead.status === "lost") {
        lostCount++;
        totalLeadsConsideredForWinRate++;
      }

      // Needs Action logic
      if (
        (lead.status === "new" && differenceInDays(now, createdAt) > 1)
        ||
        (lead.status === "contacted" && daysInStage > 3) // Assuming last_activity is updated_at for now
      ) {
        needsActionCount++;
      }
    }

    // Calculate avgDaysInStage (simple average for now)
    for (const status in stages) {
      if (stages[status].leads.length > 0) {
        const sumDays = stages[status].leads.reduce((acc: number, l: any) => acc + l.daysInStage, 0);
        stages[status].avgDaysInStage = sumDays / stages[status].leads.length;
      }
    }

    const winRate = totalLeadsConsideredForWinRate > 0
      ? (wonCount / totalLeadsConsideredForWinRate) * 100
      : 0; // Or null/"-"

    const summary = {
      totalPipelineValue: totalPipelineValue,
      needsAction: needsActionCount,
      winRate: parseFloat(winRate.toFixed(2)),
    };

    return NextResponse.json({ stages, summary });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
