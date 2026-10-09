import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILES_BUCKET } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";
import { modelConfigured, modelJson } from "@/lib/draft/model-server";
import { DETAIL_SYSTEM, cleanDetailRead, detailSummary, readDetailMarker } from "@/lib/plan-details";

/**
 * Read with AI — one detail clipped off the plans (src/lib/plan-details.ts).
 *
 * POST — the clip's picture goes to the model API in one tool-less call (never
 * Hermes), with the sheet's number and title; what comes back is kept only
 * where it reads like a drawing (cleanDetailRead) and saved on the file:
 * facts.detail and a one-line summary, so the section, Dusty and Files see it.
 * A suggestion — nothing on the section changes until Coy taps Use.
 * DETAIL_MODEL picks the model (default Claude Opus 5.5, which reads drawings
 * far better than the draft's small model). Session client, org from the session.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));

  const { data: f } = await supabase.from("files").select("id, storage_path, mime_type, source_url, fetch_state, facts")
    .eq("org_id", orgId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!f) return bad("No such file.", 404);
  const ref = readDetailMarker(f.source_url as string | null);
  if (!ref) return bad("Only a detail clipped off the plans is read here.");
  if (f.fetch_state !== "fetched") return bad("The clip hasn't finished saving yet.", 409);
  if (!modelConfigured()) return bad("Reading a drawing needs ANTHROPIC_API_KEY (or OPENROUTER_API_KEY) set in Vercel.", 503);

  const { data: blob, error: dlErr } = await supabase.storage.from(FILES_BUCKET).download(f.storage_path as string);
  if (dlErr || !blob) return bad(`Couldn't open the clip: ${dlErr?.message ?? "no file"}`, 500);
  if (blob.size > 4.5 * 1024 * 1024) return bad("That clip is too big to read — clip a smaller box.");
  const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const { data: sheet } = await supabase.from("plan_sheets").select("number, title").eq("org_id", orgId).eq("id", ref.sheet_id).maybeSingle();

  const user = `This detail was clipped from sheet ${sheet?.number ?? "(no number)"}${sheet?.title ? ` — ${sheet.title}` : ""}. List what it specifies.`;
  const r = await modelJson(DETAIL_SYSTEM, user, 8000, 80_000, [{ mime: (f.mime_type as string) || "image/jpeg", b64 }],
    { anthropic: process.env.DETAIL_MODEL || "claude-opus-5-5", openrouter: process.env.DETAIL_MODEL_OPENROUTER || "anthropic/claude-opus-4.8" });
  if (!r.ok) return bad(`Couldn't read it: ${r.error}.`, 502);
  const read = cleanDetailRead(r.json);
  if (!read) return bad("The model's answer wasn't a reading of the drawing — try again.", 502);

  const facts = { ...((f.facts as Record<string, unknown> | null) ?? {}), detail: read, detail_read_at: new Date().toISOString(), detail_model: r.provider };
  const { data: row, error } = await supabase.from("files")
    .update({ facts, summary: detailSummary(read), read_state: "read", read_at: new Date().toISOString(), read_error: null })
    .eq("org_id", orgId).eq("id", id).select(FILE_COLUMNS).single();
  if (error || !row) return bad(`Couldn't save the reading: ${error?.message ?? "no row"}`, 500);
  const [signed] = await signFiles(supabase, [row as Record<string, unknown>]);
  return applyCookies(NextResponse.json({ file: signed, read }));
}
