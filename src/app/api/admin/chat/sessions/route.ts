import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

async function getUserIdFromCookie(request: NextRequest): Promise<string | null> {
  try {
    const cookieStore = await import("next/headers").then(m => m.cookies());
    const sessionCookie = cookieStore.get("sc_session");
    if (!sessionCookie?.value) return null;
    const parts = sessionCookie.value.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
    return payload.sub ?? payload.user_id ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get("agent");
  const userId = searchParams.get("user_id");

  try {
    let query = supabaseAdmin
      .from("admin_chat_sessions")
      .select("id, agent, title, user_id, org_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (agent === "dusty" || agent === "doctor") {
      query = query.eq("agent", agent);
    }

    if (userId) {
      query = query.eq("user_id", userId);
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
    const { agent, title, org_id } = await request.json();

    if (!agent || !["dusty", "doctor"].includes(agent)) {
      return NextResponse.json({ error: "Invalid agent" }, { status: 400 });
    }

    const userId = await getUserIdFromCookie(request);

    const insertData: any = {
      agent,
      title: title ?? `New ${agent} session`,
    };

    if (userId) insertData.user_id = userId;
    if (org_id) insertData.org_id = org_id;

    const { data, error } = await supabaseAdmin
      .from("admin_chat_sessions")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ session: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}