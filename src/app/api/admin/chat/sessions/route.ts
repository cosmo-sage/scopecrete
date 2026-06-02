import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get("agent");

  try {
    let query = supabaseAdmin
      .from("admin_chat_sessions")
      .select("id, agent, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (agent === "dusty" || agent === "doctor") {
      query = query.eq("agent", agent);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ sessions: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { agent, title } = await request.json();

    if (!agent || !["dusty", "doctor"].includes(agent)) {
      return NextResponse.json({ error: "Invalid agent" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_chat_sessions")
      .insert({ agent, title: title ?? `New ${agent} session` })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ session: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}