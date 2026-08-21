import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServiceKey } from "@/lib/supabase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("chat_messages")
      .select("id, role, content, model, created_at")
      .eq("chat_session_id", id)
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
        chat_session_id: sessionId, org_id: session.org_id,
        role: role ?? "user",
        content: content.trim(),
      });

    if (userErr) throw userErr;

    // Build context from recent messages
    const { data: history } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("chat_session_id", sessionId)
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
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dusty-mcp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "apikey": supabaseServiceKey,
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
          const aiRes = await fetch("http://100.113.194.47:8000/v1/chat/completions", {
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
        chat_session_id: sessionId, org_id: session.org_id,
        role: "assistant",
        content: responseText,
      })
      .select()
      .single();

    if (asstErr) throw asstErr;

    return NextResponse.json({ message: savedMsg });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}