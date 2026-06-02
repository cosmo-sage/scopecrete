import { NextRequest, NextResponse } from "next/server";

// Ollama on Clay's PC — routed through VPS SSH tunnel
const OLLAMA_URL = "http://localhost:8000/v1/chat/completions";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model") ?? "qwen2.5:0.5b";
  const prompt = searchParams.get("prompt") ?? "";

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const upstream = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Ollama error", status: upstream.status }, { status: upstream.status });
    }

    const data = await upstream.json();
    return NextResponse.json({
      model: data.model,
      response: data.choices?.[0]?.message?.content ?? "",
      done: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, messages, stream } = body;

    const upstream = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model ?? "qwen2.5:0.5b",
        messages: messages ?? [],
        stream: stream ?? false,
      }),
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Ollama error", status: upstream.status }, { status: upstream.status });
    }

    const data = await upstream.json();
    return NextResponse.json({
      model: data.model,
      choices: data.choices,
      done: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}