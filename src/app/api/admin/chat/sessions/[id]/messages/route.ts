import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("admin_chat_messages")
      .select("id, role, content, attachments, model, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ messages: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const { content, attachments, agent } = await request.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Message content required" }, { status: 400 });
    }

    // 1. Save user message
    const { error: userErr } = await supabaseAdmin
      .from("admin_chat_messages")
      .insert({
        session_id: sessionId,
        role: "user",
        content: content.trim(),
        attachments: attachments ?? [],
      });

    if (userErr) throw userErr;

    // 2. Update session updated_at
    await supabaseAdmin
      .from("admin_chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    // 3. Build context from recent messages (last 10)
    const { data: history } = await supabaseAdmin
      .from("admin_chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(10);

    const messages = (history ?? []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // 4. Call Dusty (Ollama on Clay's PC via SSH tunnel)
    const SYSTEM_PROMPT =
      agent === "dusty"
        ? `You are Dusty, ScopeCrete's AI assistant for platform admins. You have FULL ACCESS to the entire Supabase database (project: cxiusuewtrvcpqequueh) — all contractors, all orgs, all leads, all pricing, all market data. The service role anon key is: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o

You can query Supabase directly. Tables: orgs, leads, org_members, contacts, market_pricing, pricing_feedback, admin_chat_sessions, admin_chat_messages. Be direct and cite specific data.`
        : `You are Doctor, ScopeCrete's VPS infrastructure agent. You manage root@2.24.30.51 — PM2, Docker, Nginx, system monitoring. Be direct and technical.`;

    // Non-streaming call to Dusty via VPS tunnel
    let assistantText = "";

    try {
      const dustyRes = await fetch("http://localhost:8000/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:0.5b",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
            { role: "user", content },
          ],
          stream: false,
        }),
      });

      if (dustyRes.ok) {
        const dustyData = await dustyRes.json();
        assistantText = dustyData.choices?.[0]?.message?.content ?? "";
      } else {
        assistantText = `[Error calling Dusty: ${dustyRes.status}]`;
      }
    } catch {
      if (agent === "dusty") {
        assistantText = "Dusty is offline right now. The Ollama tunnel may not be connected.";
      } else {
        assistantText = "Doctor is unavailable. Check VPS connection.";
      }
    }

    // 5. Save assistant response
    const { data: savedMsg, error: asstErr } = await supabaseAdmin
      .from("admin_chat_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: assistantText,
        model: "qwen2.5:0.5b",
      })
      .select()
      .single();

    if (asstErr) throw asstErr;

    return NextResponse.json({ message: savedMsg });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}