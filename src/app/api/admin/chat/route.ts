import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { message, agent } = await request.json();

    if (!message || !agent) {
      return NextResponse.json({ error: "Missing message or agent" }, { status: 400 });
    }

    if (agent === "dusty") {
      // Dusty has full Supabase DB access — route to the Dusty model via the existing tunnel
      // Use the same API endpoint as the contractor dashboard chat
      const dustyResponse = await fetch("http://100.113.194.47:8000/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:0.5b",
          messages: [
            {
              role: "system",
              content: `You are Dusty, the ScopeCrete platform admin assistant. You have FULL ACCESS to the entire Supabase database (project: gjclaovlofzdmawbbaly) — all contractors, all orgs, all leads, all pricing, all market data.

You help the platform admin (admin@scopecrete.ai) manage the ScopeCrete contractor platform. Be direct, concise, and actionable. When answering with data, cite specific numbers.

The Supabase anon key for gjclaovlofzdmawbbaly is: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqY2xhb3Zsb2Z6ZG1hd2JiYWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Nzc3OTksImV4cCI6MjA5MTM1Mzc5OX0.y3dBS0Y3gi_e9Beg42Xm-WFEl3-5nC7GxSW4O3SgojQ

You can directly query Supabase using the anon key above. Table reference:
- orgs: id, name, slug, plan_tier, created_at
- org_members: id, org_id, user_id, role, created_at
- leads: id, org_id, customer_name, customer_phone, status, source_channel, estimate_total, created_at
- profiles: id, full_name, email
- market_pricing: id, market, rate_type, rate_value, updated_at`,
            },
            { role: "user", content: message },
          ],
          stream: false,
        }),
      });

      if (!dustyResponse.ok) {
        const err = await dustyResponse.text();
        return NextResponse.json({ response: `Dusty error (${dustyResponse.status}): ${err}` }, { status: 200 });
      }

      const data = await dustyResponse.json();
      const text = data.choices?.[0]?.message?.content || "No response from Dusty.";
      return NextResponse.json({ response: text });
    }

    if (agent === "doctor") {
      // Doctor manages VPS infrastructure — execute SSH commands via a script on the VPS
      // For now, return a placeholder that describes what Doctor would do
      // In production, this would SSH to VPS and run commands
      return NextResponse.json({
        response: `Doctor here. I can help with VPS management at root@2.24.30.51.

Available actions:
- Check service status (PM2, Docker, Nginx)
- View recent logs
- Restart services
- Check disk/memory/CPU
- Deploy latest code

To run a command, ask me something like:
- "Check PM2 status"
- "Show nginx error logs"
- "Restart the scopecrete-dashboard"
- "Check disk space"

Note: Full Doctor integration requires SSH access configuration. Currently in setup mode.`,
      });
    }

    return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ response: `Error: ${err.message}` }, { status: 200 });
  }
}