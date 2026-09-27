import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { buildContext, parseRef } from "@/lib/dusty/context";
import { DUSTY_SYSTEM } from "@/lib/dusty/prompt";

/**
 * Dusty — read-only, and it knows what Coy has open.
 *
 * POST { messages: [{role, content}], context: {kind, id} }  →  streamed text.
 *
 * The model runs in the Hermes container on the VPS (DECISIONS §8), reached
 * over Tailscale Funnel at HERMES_URL with a bearer key. Hermes routes to the
 * model through OpenRouter; no model-provider key lives in Vercel.
 *
 * This route stays the only thing that touches customer data:
 * - signed-in only; org from the session (DECISIONS §7);
 * - the context is fetched here under RLS — the browser names a screen, it
 *   never supplies facts — and Hermes sees only what this route sends;
 * - read-only: nothing is written, nothing is sent to a customer;
 * - nothing is stored. The conversation lives in the browser tab.
 *
 * HERMES_API_KEY is server-only and never logged.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TURNS = 30;
const MAX_USER_CHARS = 4000;
const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";
const TIMEOUT_MS = 60_000;

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const base = process.env.HERMES_URL?.replace(/\/+$/, "");
  const key = process.env.HERMES_API_KEY;
  if (!base || !key) {
    return applyCookies(NextResponse.json({
      code: "not_connected",
      error: "Dusty isn't connected yet: HERMES_URL and HERMES_API_KEY are not set in Vercel.",
    }, { status: 503 }));
  }

  let body: { messages?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const history: Turn[] = [];
  for (const m of raw.slice(-MAX_TURNS)) {
    const r = m as { role?: unknown; content?: unknown };
    if ((r.role !== "user" && r.role !== "assistant") || typeof r.content !== "string" || !r.content.trim()) continue;
    if (r.role === "user" && r.content.length > MAX_USER_CHARS) {
      return applyCookies(NextResponse.json({ error: `Keep a message under ${MAX_USER_CHARS} characters.` }, { status: 400 }));
    }
    history.push({ role: r.role, content: r.content.slice(0, 20000) });
  }
  while (history.length && history[0].role !== "user") history.shift();
  if (!history.length || history[history.length - 1].role !== "user") {
    return applyCookies(NextResponse.json({ error: "Nothing to answer." }, { status: 400 }));
  }

  const ctx = await buildContext(supabase, orgId, parseRef(body.context));
  const model = process.env.HERMES_MODEL || DEFAULT_MODEL;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 2000,
        messages: [{ role: "system", content: `${DUSTY_SYSTEM}\n\n${ctx.text}` }, ...history],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    const why = (e as Error).name === "AbortError" ? "Hermes took too long to answer" : "couldn't reach Hermes on the VPS";
    // The network cause (ECONNREFUSED, ENOTFOUND, a TLS code…) is what says
    // WHY. It carries the host, never the key.
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    console.error("dusty upstream", why, JSON.stringify({
      name: (e as Error).name, message: (e as Error).message, code: cause?.code ?? null, cause: cause?.message ?? null,
    }));
    return applyCookies(NextResponse.json({ code: "upstream", error: `Dusty ${why}.` }, { status: 502 }));
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    console.error("dusty upstream status", upstream.status, model);
    const why = upstream.status === 401 || upstream.status === 403 ? "Hermes rejected the key" : `Hermes returned ${upstream.status}`;
    return applyCookies(NextResponse.json({ code: "upstream", error: `Dusty couldn't answer: ${why}.` }, { status: 502 }));
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const isStream = (upstream.headers.get("content-type") ?? "").includes("text/event-stream");
  const reader = upstream.body.getReader();

  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!isStream) {
          // Some OpenAI-compatible servers ignore `stream` and answer once.
          let text = "";
          for (;;) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value, { stream: true }); }
          const j = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
          controller.enqueue(encoder.encode(j.choices?.[0]?.message?.content ?? "[Dusty returned nothing.]"));
        } else {
          let buf = "";
          let finish: string | null = null;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> };
                const piece = j.choices?.[0]?.delta?.content;
                if (piece) controller.enqueue(encoder.encode(piece));
                if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
              } catch { /* a keep-alive or partial line — skip it */ }
            }
          }
          if (finish === "length") controller.enqueue(encoder.encode("\n\n[Cut off — ask for the rest.]"));
          if (finish === "content_filter") controller.enqueue(encoder.encode("\n\n[Dusty declined to answer that one.]"));
        }
        console.log("dusty ok", JSON.stringify({ model, ctx: ctx.label.slice(0, 40), truncated: ctx.truncated }));
      } catch (e) {
        const why = (e as Error).name === "AbortError" ? "Hermes took too long" : "the connection to Hermes dropped";
        console.error("dusty stream", why);
        controller.enqueue(encoder.encode(`\n\n[Dusty couldn't finish: ${why}.]`));
      } finally {
        clearTimeout(timer);
        controller.close();
      }
    },
    cancel() { ctrl.abort(); },
  });

  return applyCookies(new NextResponse(out, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Dusty-Context": encodeURIComponent(ctx.label),
    },
  }));
}
