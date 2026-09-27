import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiSession } from "@/lib/api-auth";
import { buildContext, parseRef } from "@/lib/dusty/context";
import { DUSTY_SYSTEM } from "@/lib/dusty/prompt";

/**
 * Dusty — read-only, and it knows what Coy has open.
 *
 * POST { messages: [{role, content}], context: {kind, id} }  →  streamed text.
 *
 * - Signed-in only; org from the session (DECISIONS §7). The context is fetched
 *   server-side under RLS — the browser names a screen, it never supplies facts.
 * - Read-only: no tools, no writes, nothing sent. Drafts come back as text for
 *   Coy to copy (DECISIONS §10: all outbound contact is the contractor).
 * - Nothing is stored. The conversation lives in the browser tab.
 * - ANTHROPIC_API_KEY is server-only. Never logged; only token usage is.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TURNS = 30;
const MAX_USER_CHARS = 4000;

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  if (!process.env.ANTHROPIC_API_KEY) {
    return applyCookies(NextResponse.json({
      code: "no_key",
      error: "Dusty isn't connected yet: ANTHROPIC_API_KEY is not set in Vercel.",
    }, { status: 503 }));
  }

  let body: { messages?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of raw.slice(-MAX_TURNS)) {
    const r = m as { role?: unknown; content?: unknown };
    if ((r.role !== "user" && r.role !== "assistant") || typeof r.content !== "string" || !r.content.trim()) continue;
    if (r.role === "user" && r.content.length > MAX_USER_CHARS) {
      return applyCookies(NextResponse.json({ error: `Keep a message under ${MAX_USER_CHARS} characters.` }, { status: 400 }));
    }
    messages.push({ role: r.role, content: r.content.slice(0, 20000) });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return applyCookies(NextResponse.json({ error: "Nothing to answer." }, { status: 400 }));
  }

  const ctx = await buildContext(supabase, orgId, parseRef(body.context));
  const client = new Anthropic();

  const stream = client.beta.messages.stream({
    model: "claude-opus-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [
      // Fixed and first, so it is cached across every conversation.
      { type: "text", text: DUSTY_SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: ctx.text },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[Dusty declined to answer that one.]"));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n[Cut off — ask for the rest.]"));
        }
        console.log("dusty usage", JSON.stringify({
          in: final.usage.input_tokens, out: final.usage.output_tokens,
          cache_read: final.usage.cache_read_input_tokens, ctx: ctx.label.slice(0, 40), truncated: ctx.truncated,
        }));
      } catch (e) {
        const msg = e instanceof Anthropic.AuthenticationError ? "the API key was rejected"
          : e instanceof Anthropic.RateLimitError ? "rate limited — try again in a minute"
          : e instanceof Anthropic.APIError ? `API error ${e.status}`
          : "the connection dropped";
        console.error("dusty error", msg);
        controller.enqueue(encoder.encode(`\n\n[Dusty couldn't answer: ${msg}.]`));
      } finally {
        controller.close();
      }
    },
    cancel() { stream.abort(); },
  });

  return applyCookies(new NextResponse(out, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Dusty-Context": encodeURIComponent(ctx.label),
    },
  }));
}
