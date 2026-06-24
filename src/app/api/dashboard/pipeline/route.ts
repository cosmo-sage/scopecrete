import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { differenceInDays, parseISO } from "date-fns";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  try {
    const { data: leads, error } = await supabase
      .from("leads")
      .select(`id,customer_name,customer_phone,address,project_type,status,estimate_range_min,estimate_range_max,created_at,updated_at`)
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads) return NextResponse.json({ stages: {}, summary: {} });
    const now = new Date();
    const stages: Record<string,any> = {
      new: { count:0,totalValue:0,avgDaysInStage:0,leads:[] },
      contacted: { count:0,totalValue:0,avgDaysInStage:0,leads:[] },
      qualified: { count:0,totalValue:0,avgDaysInStage:0,leads:[] },
      quoted: { count:0,totalValue:0,avgDaysInStage:0,leads:[] },
      won: { count:0,totalValue:0,avgDaysInStage:0,leads:[] },
      lost: { count:0,totalValue:0,avgDaysInStage:0,leads:[] },
    };
    let totalPipelineValue=0, needsActionCount=0, wonCount=0, lostCount=0, totalLeadsForWinRate=0;
    for (const lead of leads) {
      if (!stages[lead.status]) lead.status = "new";
      const daysInStage = differenceInDays(now, parseISO(lead.updated_at || lead.created_at));
      const rangeMin = lead.estimate_range_min || 0;
      const rangeMax = lead.estimate_range_max || 0;
      const estimatedValue = rangeMax > 0 ? rangeMax : rangeMin;
      const customerName = lead.customer_name || lead.customer_phone || "Unknown Lead";
      let nextAction = "";
      if (lead.status === "new" && daysInStage > 0) nextAction = "call_today";
      else if (lead.status === "contacted" && daysInStage > 3) nextAction = "follow_up";
      else if (lead.status === "quoted") nextAction = "proposal_sent";
      stages[lead.status].leads.push({
        id: lead.id, customerName, projectType: lead.project_type || "Unspecified",
        address: lead.address || "", estimatedValue, estimateMin: rangeMin, estimateMax: rangeMax,
        daysInStage, nextAction, createdAt: lead.created_at,
      });
      stages[lead.status].count++;
      stages[lead.status].totalValue += estimatedValue;
      if (lead.status !== "won" && lead.status !== "lost") totalPipelineValue += estimatedValue;
      if (lead.status === "won") { wonCount++; totalLeadsForWinRate++; }
      if (lead.status === "lost") { lostCount++; totalLeadsForWinRate++; }
      const createdAtDate = parseISO(lead.created_at);
      if ((lead.status === "new" && differenceInDays(now, createdAtDate) > 1) || (lead.status === "contacted" && daysInStage > 3)) needsActionCount++;
    }
    for (const s in stages) {
      if (stages[s].leads.length > 0) {
        const sum = stages[s].leads.reduce((a: number, l: any) => a + l.daysInStage, 0);
        stages[s].avgDaysInStage = Math.round(sum / stages[s].leads.length);
      }
    }
    const winRate = totalLeadsForWinRate > 0 ? Math.round(wonCount / totalLeadsForWinRate * 100) : 0;
    const summary = { totalPipelineValue, needsAction: needsActionCount, winRate };
    return NextResponse.json({ stages, summary });
  } catch(e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
