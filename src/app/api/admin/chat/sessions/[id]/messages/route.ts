import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Ollama on Clay's PC — Tailscale VPN
const OLLAMA_URL = "http://100.113.194.47:8000/v1/chat/completions";

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
    const { content, attachments, agent, stream } = await request.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Message content required" }, { status: 400 });
    }

    if (agent !== "dusty") {
      return NextResponse.json({ error: "Unknown agent. Use agent=dusty." }, { status: 400 });
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

    // 3. Get session for user_id/org_id
    const { data: session } = await supabaseAdmin
      .from("admin_chat_sessions")
      .select("user_id, org_id")
      .eq("id", sessionId)
      .single();

    // 4. Get chat history (last 12 messages)
    const { data: history } = await supabaseAdmin
      .from("admin_chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(12);

    const historyLines = (history ?? [])
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    // Build system context with live DB data
    const [
      { data: orgs, count: orgCount },
      { data: leads, count: leadCount },
      { data: recentLeads },
      { data: marketData },
    ] = await Promise.all([
      supabaseAdmin.from("orgs").select("id, name, slug, plan_tier, created_at", { count: "exact" }),
      supabaseAdmin.from("leads").select("id, status, customer_name, estimate_total, created_at", { count: "exact" }),
      supabaseAdmin.from("leads").select("customer_name, status, estimate_total, created_at").order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("market_pricing").select("id, display_name, state_code, rates").limit(10),
    ]);

    const orgSummary =
      (orgs ?? []).map((o: any) => `org: ${o.name} (${o.slug}) plan=${o.plan_tier}`).join("\n") ||
      "No orgs found.";
    const leadSummary =
      (leads ?? []).map((l: any) => `lead: ${l.customer_name ?? "unnamed"} | ${l.status} | $${l.estimate_total ?? 0}`).join("\n") ||
      "No leads found.";
    const marketSummary =
      (marketData ?? []).map((m: any) => `market: ${m.display_name} (${m.state_code})`).join("\n") ||
      "No market data.";

    const systemContext = `You are Dusty, ScopeCrete's AI admin assistant. You have FULL ACCESS to the entire ScopeCrete platform database (project: cxiusuewtrvcpqequueh) via service role.

CURRENT DATA:
${orgCount ?? 0} orgs total:
${orgSummary}

${leadCount ?? 0} leads total:
${leadSummary}

Recent leads:
${(recentLeads ?? []).map((l: any) => `- ${l.customer_name ?? "?"} | ${l.status} | $${l.estimate_total ?? 0}`).join("\n") ?? "none"}

Market pricing:
${marketSummary}

Be direct and specific. Cite numbers, names, dates.`;

    const messages = [
      { role: "system", content: systemContext },
      ...(historyLines ? [{ role: "user", content: historyLines + "\nuser: " + content }] : [{ role: "user", content }]),
    ];

    // ─── SSE STREAMING ─────────────────────────────────────────────────────────
    if (stream === true) {
      const encoder = new TextEncoder();
      let cleanText = "";

      const ollamaStream = new ReadableStream({
        async start(controller) {
          try {
            const upstream = await fetch(OLLAMA_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "qwen2.5:0.5b",
                messages,
                stream: true,
              }),
            });

            const reader = upstream.body?.getReader();
            const textDecoder = new TextDecoder();

            if (!reader) throw new Error("No response body");

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = textDecoder.decode(value, { stream: true });

              // Parse SSE lines: data: {...}
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const dataStr = line.slice(6).trim();
                  if (dataStr === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(dataStr);
                    const token = parsed.choices?.[0]?.delta?.content;
                    if (token) {
                      cleanText += token;
                      controller.enqueue(encoder.encode(token));
                    }
                  } catch {
                    // skip malformed SSE line
                  }
                }
              }
            }
          } catch (err) {
            controller.error(err);
          } finally {
            controller.close();
          }
        },
      });

      // Save full response to DB after stream completes (fire-and-forget)
      if (cleanText) {
        supabaseAdmin
          .from("admin_chat_messages")
          .insert({
            session_id: sessionId,
            role: "assistant",
            content: cleanText,
            model: "qwen2.5:0.5b + supabase",
            user_id: session?.user_id ?? null,
            org_id: session?.org_id ?? null,
          })
          .then(({ error }) => {
            if (error) console.error("[Dusty] Failed to save streamed message:", error);
          });
      }

      return new Response(ollamaStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ─── NON-STREAMING (default) ────────────────────────────────────────────────
    let assistantText = "";

    try {
      const dustyRes = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:0.5b",
          messages,
          stream: false,
        }),
      });

      if (dustyRes.ok) {
        const dustyData = await dustyRes.json();
        assistantText = dustyData.choices?.[0]?.message?.content ?? "";
      } else {
        const errText = await dustyRes.text().catch(() => "");
        console.error(`[Dusty] Ollama returned ${dustyRes.status}: ${errText}`);
        assistantText =
          `**Data summary:** ${orgCount ?? 0} contractors, ${leadCount ?? 0} leads\n\n` +
          `Recent leads:\n${(recentLeads ?? []).map((l: any) => `• ${l.customer_name ?? "unnamed"} — ${l.status} — $${l.estimate_total ?? 0}`).join("\n") ?? "none yet"}\n\n` +
          `Market pricing: ${(marketData ?? []).length ?? 0} markets\n\n` +
          `Ollama unavailable (status ${dustyRes.status}). Check that Clay's PC is connected and Ollama is running.`;
      }
    } catch (err: any) {
      console.error(`[Dusty] Ollama tunnel error: ${err.message}`);
      assistantText =
        `**Data summary:** ${orgCount ?? 0} contractors, ${leadCount ?? 0} leads\n\n` +
        `Recent leads:\n${(recentLeads ?? []).map((l: any) => `• ${l.customer_name ?? "unnamed"} — ${l.status} — $${l.estimate_total ?? 0}`).join("\n") ?? "none yet"}\n\n` +
        `Market pricing: ${(marketData ?? []).length ?? 0} markets\n\n` +
        `Ollama unreachable at ${OLLAMA_URL}. Verify Clay's PC is online and Tailscale VPN is active.`;
    }

    // Save assistant response
    const { data: savedMsg, error: asstErr } = await supabaseAdmin
      .from("admin_chat_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: assistantText,
        model: "qwen2.5:0.5b + supabase",
        user_id: session?.user_id ?? null,
        org_id: session?.org_id ?? null,
      })
      .select()
      .single();

    if (asstErr) throw asstErr;

    return NextResponse.json({ message: savedMsg });
  } catch (err: any) {
    console.error("[Dusty /messages POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}