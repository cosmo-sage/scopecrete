import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { modelConfigured, modelJson } from "@/lib/draft/model-server";
import { ZONES_SYSTEM, cleanZones } from "@/lib/plan-zones";

/**
 * Find zones on one sheet (src/lib/plan-zones.ts). POST { image: base64 JPEG of the whole sheet
 * drawn in the browser, text?: the words printed on it }. The picture goes to the model API in
 * one tool-less call (never Hermes) — Claude Opus unless ZONES_MODEL says otherwise — which
 * matches the legend's hatches to the drawing and points at each zone. What comes back is only
 * where to look: the browser traces each zone with Fill and shows it as Dusty's estimate, and
 * nothing is saved until Coy keeps it. Session client, org from the session; the sheet must be
 * the org's. Nothing is stored here.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: { image?: unknown; text?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const image = typeof b.image === "string" ? b.image.replace(/^data:image\/jpeg;base64,/, "") : "";
  if (!image || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return bad("Send the sheet as a JPEG.");
  if (image.length > 5_400_000) return bad("That picture of the sheet is too big to send.");
  const text = typeof b.text === "string" ? b.text.replace(/\s+/g, " ").trim().slice(0, 14_000) : "";

  const { data: sh } = await supabase.from("plan_sheets").select("id, number, title, discipline").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!sh) return bad("No such sheet.", 404);
  if (!modelConfigured()) return bad("Finding zones needs ANTHROPIC_API_KEY (or OPENROUTER_API_KEY) set in Vercel.", 503);

  const user = `Sheet ${sh.number ?? "(no number)"}${sh.title ? ` — ${sh.title}` : ""}.\n`
    + (text ? `Words printed on the sheet (its text layer, in reading order — the legend is among them):\n${text}\n` : "This sheet has no text layer (a scan): read the legend off the image.\n")
    + "Find the concrete zones the legend tells apart and point at each one.";
  const r = await modelJson(ZONES_SYSTEM, user, 12_000, 170_000, [{ mime: "image/jpeg", b64: image }],
    { anthropic: process.env.ZONES_MODEL || process.env.DETAIL_MODEL || "claude-opus-5-5", openrouter: process.env.ZONES_MODEL_OPENROUTER || "anthropic/claude-opus-4.8" });
  if (!r.ok) return bad(`Dusty couldn't read the sheet: ${r.error}.`, 502);
  const read = cleanZones(r.json);
  if (!read) return bad("Dusty's answer wasn't a reading of the sheet. Try again.", 502);
  return applyCookies(NextResponse.json({ ...read, model: r.provider }));
}
