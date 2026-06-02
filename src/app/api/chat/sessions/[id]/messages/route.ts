import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("chat_messages")
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
    const { content, attachments, role } = await request.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Message content required" }, { status: 400 });
    }

    // Verify session belongs to a valid org
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("chat_sessions")
      .select("id, org_id, lead_id, provider")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Save user message
    const { error: userErr } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        role: role ?? "user",
        content: content.trim(),
        attachments: attachments ?? [],
      });

    if (userErr) throw userErr;

    // Build context from recent messages
    const { data: history } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(10);

    const historyText = (history ?? [])
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    let responseText = "";

    // Call dusty-mcp edge function with org API key
    // In production: org's API key from org record
    // For now: use a system-level proxy call
    try {
      const dustyRes = await fetch(
        "https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/dusty-mcp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o",
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4aXVzdWV3dHJ2Y3BxZXF1dWVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4NDIzNCwiZXhwIjoyMDkyNTYwMjM0fQ.3MLilsrNQFnf6seZEkZKo2HkeG7-lkASPU538qWov3o",
          },
          body: JSON.stringify({
            action: "select",
            table: "leads",
            params: { org_id: session.org_id, limit: 5 },
          }),
        }
      );

      if (dustyRes.ok) {
        const dustyData = await dustyRes.json();
        // Build context from dusty-mcp response
        const orgLeads = (dustyData.data ?? []).map((l: any) =>
          `lead: ${l.customer_name ?? "?"} | ${l.status} | $${l.estimate_total ?? 0}`
        ).join("\n");

        const systemContext = `You are Dusty, ScopeCrete's AI assistant for contractor org ${session.org_id}. ` +
          `You have access ONLY to this org's data. Context:\n${orgLeads || "No leads found for this org."}`;

        // Call Ollama for actual AI response (if tunnel available)
        try {
          const aiRes = await fetch("http://localhost:8000/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "qwen2.5:0.5b",
              messages: [
                { role: "system", content: systemContext },
                { role: "user", content: historyText + "\nuser: " + content },
              ],
              stream: false,
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            responseText = aiData.choices?.[0]?.message?.content ?? "";
          }
        } catch { /* tunnel down */ }

        if (!responseText) {
          responseText = `Dusty here — I can see your org has ${dustyData.data?.length ?? 0} leads. ` +
            `Your conversation context is saved. I have access to your org's data.`;
        }
      }
    } catch {
      responseText = "Dusty is unavailable — the connection to the database is offline. Your message has been saved.";
    }

    // Save assistant response
    const { data: savedMsg, error: asstErr } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: responseText,
        model: "dusty-mcp + qwen2.5:0.5b",
      })
      .select()
      .single();

    if (asstErr) throw asstErr;

    return NextResponse.json({ message: savedMsg });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}