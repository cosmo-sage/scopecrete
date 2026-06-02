import { NextRequest, NextResponse } from "next/server";

// Doctor Telegram bot proxy
// Bot token read from environment — set TELEGRAM_BOT_TOKEN in .env
const TELEGRAM_API = "https://api.telegram.org";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

export async function POST(request: NextRequest) {
  try {
    const { message, chat_id } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (!BOT_TOKEN) {
      return NextResponse.json({ error: "Telegram bot token not configured" }, { status: 500 });
    }

    // Send message to Doctor via Telegram bot
    const sendRes = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat_id ?? process.env.DOCTOR_CHAT_ID ?? "",
        text: `[Admin Chat] ${message}`,
        parse_mode: "Markdown",
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      return NextResponse.json({ error: "Telegram send failed", detail: err }, { status: 502 });
    }

    const result = await sendRes.json();

    // For now, return a placeholder since Doctor's Telegram responses come async
    // In production this would need a webhook orpolling to get Doctor's reply
    return NextResponse.json({
      success: true,
      telegram_message_id: result.result?.message_id,
      note: "Doctor response is async — configure webhook for streaming replies",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Health check
  return NextResponse.json({
    status: "ok",
    agent: "doctor",
    endpoint: "/api/chat/doctor",
    method: "POST with { message: string, chat_id?: string }",
  });
}