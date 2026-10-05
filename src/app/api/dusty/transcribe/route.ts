import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * A voice message to Dusty (Coy, 2026-10-01: "a microphone … to record voice
 * messages to get transcribed into dusty chat … telegram style").
 *
 * POST multipart { audio } → { text }
 *
 * Groq Whisper turns the audio into words (GROQ_API_KEY, server only — only
 * the audio goes to Groq, as with section dictation, DECISIONS §3). Nothing is
 * stored: the words come back to the chat, which sends them as the question.
 * Signed-in only.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO = 20 * 1024 * 1024;
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const fail = (error: string, status: number, code?: string) => applyCookies(NextResponse.json({ error, code }, { status }));

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return fail("Voice messages need GROQ_API_KEY in Vercel.", 503, "no_groq");

  let audio: File | null = null;
  try {
    const f = (await req.formData()).get("audio");
    audio = f instanceof File ? f : null;
  } catch { /* handled below */ }
  if (!audio || audio.size === 0) return fail("No audio came through.", 400);
  if (audio.size > MAX_AUDIO) return fail("That recording is too long — keep it under three minutes.", 400);

  const up = new FormData();
  up.append("file", audio, audio.name || "voice.webm");
  up.append("model", GROQ_MODEL);
  up.append("language", "en");
  up.append("temperature", "0");
  // Primes Whisper with the trade's words; it never adds them.
  up.append("prompt", "Concrete contractor talking to his assistant Dusty: driveway, patio, slab, footing, yards, PSI, rebar, mesh, bid, budget, customer, invoice.");
  try {
    const r = await fetch(GROQ_URL, { method: "POST", headers: { Authorization: `Bearer ${groqKey}` }, body: up });
    if (!r.ok) return fail(r.status === 401 ? "Groq rejected the key." : `Groq answered ${r.status}.`, 502, "groq");
    const text = String(((await r.json()) as { text?: string }).text ?? "").trim();
    if (!text) return fail("Didn't catch any words.", 422, "empty");
    return applyCookies(NextResponse.json({ text: text.slice(0, 4000) }));
  } catch {
    return fail("Couldn't reach Groq.", 502, "groq");
  }
}
