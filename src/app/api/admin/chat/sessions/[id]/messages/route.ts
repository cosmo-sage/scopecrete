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

    // 3. Get session history (last 12 messages for context)
    const { data: history } = await supabaseAdmin
      .from("admin_chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(12);

    const historyLines = (history ?? [])
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    let assistantText = "";

    if (agent === "dusty") {
      // ─── Dusty: global admin data via supabaseAdmin ───
      try {
        // Fetch live data for context
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

        const orgSummary = orgs?.map((o: any) =>
          `org: ${o.name} (${o.slug}) plan=${o.plan_tier} created=${o.created_at?.slice(0,10)}`
        ).join("\n") ?? "No orgs found.";

        const leadSummary = leads?.map((l: any) =>
          `lead: ${l.customer_name ?? "unnamed"} status=${l.status} estimate=$${l.estimate_total ?? 0} created=${l.created_at?.slice(0,10)}`
        ).join("\n") ?? "No leads found.";

        const marketSummary = marketData?.map((m: any) =>
          `market: ${m.display_name} (${m.state_code}) rates=${JSON.stringify(m.rates ?? {})}`
        ).join("\n") ?? "No market data.";

        const systemContext = `You are Dusty, ScopeCrete's AI admin assistant. You have FULL ACCESS to the entire ScopeCrete platform database (project: cxiusuewtrvcpqequueh) via service role.

CURRENT DATA:
${orgCount ?? 0} orgs total:
${orgSummary}

${leadCount ?? 0} leads total:
${leadSummary}

Recent leads:
${recentLeads?.map((l: any) => `- ${l.customer_name ?? "?"} | ${l.status} | $${l.estimate_total ?? 0} | ${l.created_at?.slice(0,10)}`).join("\n") ?? "none"}

Market pricing:
${marketSummary}

Be direct and specific. Cite numbers, names, dates. Answer admin questions about any contractor, lead, or pricing data.`;

        // Call Ollama if available (will fail gracefully if tunnel is down)
        let dustyResponse = "";
        try {
          const dustyRes = await fetch("http://localhost:8000/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "qwen2.5:0.5b",
              messages: [
                { role: "system", content: systemContext },
                { role: "user", content: historyLines + "\nuser: " + content },
              ],
              stream: false,
            }),
          });

          if (dustyRes.ok) {
            const dustyData = await dustyRes.json();
            dustyResponse = dustyData.choices?.[0]?.message?.content ?? "";
          }
        } catch { /* tunnel down — fall through to structured response */ }

        if (dustyResponse) {
          assistantText = dustyResponse;
        } else {
          // Fallback: give a structured data summary directly
          assistantText = `Data summary from ScopeCrete DB:\n\n` +
            `**${orgCount ?? 0} contractors**, **${leadCount ?? 0} leads**\n\n` +
            `Recent leads:\n${recentLeads?.map((l: any) => `• ${l.customer_name ?? "unnamed"} — ${l.status} — $${l.estimate_total ?? 0}`).join("\n") ?? "none yet"}\n\n` +
            `Market pricing: ${marketData?.length ?? 0} markets configured\n\n` +
            `The Ollama tunnel is offline. Connect Clay's PC to query via AI.`;
        }
      } catch (dbErr: any) {
        assistantText = `DB error: ${dbErr.message}`;
      }
    } else {
      // ─── Doctor: VPS management ───
      try {
        const doctorRes = await fetch("http://100.113.194.47:8000/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "qwen2.5:0.5b",
            messages: [
              { role: "system", content: "You are Doctor, ScopeCrete's VPS infrastructure agent. You manage root@2.24.30.51 — PM2, Docker, Nginx, system monitoring. Be direct and technical. Commands: pm2 status, docker ps, nginx -t, df -h, tail /var/log/syslog" },
              { role: "user", content },
            ],
            stream: false,
          }),
        });

        if (doctorRes.ok) {
          const doctorData = await doctorRes.json();
          assistantText = doctorData.choices?.[0]?.message?.content ?? "";
        } else {
          assistantText = "Doctor is unavailable. VPS may be offline.";
        }
      } catch {
        assistantText = "Doctor is unreachable. Check VPS connection at root@2.24.30.51.";
      }
    }

    // 4. Save assistant response
    const { data: savedMsg, error: asstErr } = await supabaseAdmin
      .from("admin_chat_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: assistantText,
        model: agent === "dusty" ? "qwen2.5:0.5b + supabase" : "qwen2.5:0.5b",
      })
      .select()
      .single();

    if (asstErr) throw asstErr;

    return NextResponse.json({ message: savedMsg });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}