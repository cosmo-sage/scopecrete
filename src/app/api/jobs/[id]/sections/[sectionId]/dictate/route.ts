import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { hermesJson } from "@/lib/hermes";
import { DICTATE_SYSTEM, sanitizeDictation, type DictatedSection } from "@/lib/dictate";

/**
 * Dictate one section (Coy, 2026-09-28).
 *
 * POST multipart { audio } → { transcript, patch, dropped }
 *
 *   1. Groq Whisper turns the audio into words (GROQ_API_KEY, server only —
 *      only the audio goes to Groq);
 *   2. Dusty (Hermes) turns the words into section fields;
 *   3. sanitizeDictation() keeps a number only if it was said, and a work
 *      type or reinforcement only if it is a real one.
 *
 * Nothing is saved here: the section card applies the patch through the
 * normal section PATCH, so there is one writer and Undo is the old values.
 * Session client; the section is read through the caller's org first.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO = 10 * 1024 * 1024;
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, sectionId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const fail = (error: string, status: number, code?: string) => applyCookies(NextResponse.json({ error, code }, { status }));

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return fail("Add GROQ_API_KEY in Vercel to dictate.", 503, "no_groq");

  const { data: sec } = await supabase.from("job_sections").select("id")
    .eq("id", sectionId).eq("job_id", id).eq("org_id", orgId).maybeSingle();
  if (!sec) return fail("No such section.", 404);

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    audio = f instanceof File ? f : null;
  } catch { /* handled below */ }
  if (!audio || audio.size === 0) return fail("No audio came through.", 400);
  if (audio.size > MAX_AUDIO) return fail("That recording is too long — keep it under a minute.", 400);

  const { data: types } = await supabase.from("org_reinforcement_types").select("id, name").eq("org_id", orgId).eq("active", true);
  const rtypes = (types ?? []) as Array<{ id: string; name: string }>;

  // 1. Words. The prompt primes Whisper with the trade's vocabulary.
  const up = new FormData();
  up.append("file", audio, audio.name || "section.webm");
  up.append("model", GROQ_MODEL);
  up.append("language", "en");
  up.append("temperature", "0");
  up.append("prompt", `Concrete section: driveway, patio, slab, sidewalk, footing, curb. 24 by 30, four inch, 3000 PSI, 6x6 wire mesh, rebar, fiber, base, gravel, pump.${rtypes.length ? ` ${rtypes.map((t) => t.name).join(", ")}.` : ""}`);
  let transcript = "";
  try {
    const r = await fetch(GROQ_URL, { method: "POST", headers: { Authorization: `Bearer ${groqKey}` }, body: up });
    if (!r.ok) return fail(r.status === 401 ? "Groq rejected the key." : `Groq answered ${r.status}.`, 502, "groq");
    transcript = String(((await r.json()) as { text?: string }).text ?? "").trim();
  } catch {
    return fail("Couldn't reach Groq.", 502, "groq");
  }
  if (!transcript) return fail("Didn't catch any words.", 422, "empty");

  // 2. Fields, from Dusty. Without Hermes the words still come back.
  const asked = await hermesJson(DICTATE_SYSTEM,
    `${rtypes.length ? `Reinforcement names in use: ${rtypes.map((t) => t.name).join("; ")}.\n` : ""}Dictated note:\n${transcript}`);
  if (!asked.ok) return applyCookies(NextResponse.json({ transcript, patch: {}, dropped: [], note: asked.error }, { status: 200 }));

  // 3. The guarantee.
  const { patch, dropped } = sanitizeDictation(asked.json as DictatedSection, transcript, rtypes);
  return applyCookies(NextResponse.json({ transcript, patch, dropped }));
}
