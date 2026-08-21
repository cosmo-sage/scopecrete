import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const { lead_id, org_id } = await request.json();

    if (!lead_id || !org_id) {
      return NextResponse.json({ error: "lead_id and org_id are required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("leads")
      .update({ org_id, updated_at: new Date().toISOString() })
      .eq("id", lead_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ lead: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}