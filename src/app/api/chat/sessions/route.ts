import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");

  if (!orgId) {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  try {
    let query = supabaseAdmin
      .from("chat_sessions")
      .select("id, org_id, lead_id, dusty_session_id, provider, status, created_at, updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(50);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ sessions: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { org_id, lead_id, provider, contact_email, contact_phone, project_category } = await request.json();

    if (!org_id) {
      return NextResponse.json({ error: "org_id is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("chat_sessions")
      .insert({
        org_id,
        lead_id: lead_id ?? null,
        provider: provider ?? "dusty",
        contact_email: contact_email ?? null,
        contact_phone: contact_phone ?? null,
        project_category: project_category ?? null,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ session: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}