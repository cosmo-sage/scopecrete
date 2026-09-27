import { NextRequest, NextResponse } from "next/server";

const OPENAI_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const systemPrompt = `You are a concrete contractor estimator assistant. Extract project details from customer messages.

Extract these fields when present:
- project_type: "driveway" | "patio" | "slab" | "foundation" | "other"
- length: number (feet)
- width: number (feet)
- depth: number (inches, default to 4 if not specified)
- psi: number (default to 3000 if not specified)
- zip: string (5 digit)
- conditions: string (any special notes about access, grading, etc.)

Return ONLY a valid JSON object with the fields you can extract. Use null for missing fields.
Never explain your answer. Only return JSON.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Customer message: "${message}"\n\nContext so far: ${JSON.stringify(context || {})}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: "OpenAI error", detail: err }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({
        fields: null,
        raw: content,
        error: "Failed to parse JSON from model",
      });
    }

    return NextResponse.json({ fields: parsed, success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}