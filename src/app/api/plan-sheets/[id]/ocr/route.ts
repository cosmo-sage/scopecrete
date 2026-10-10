import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { SHEET_COLS } from "@/lib/plans-server";
import { isStampTitle } from "@/lib/plan-sheets";

/**
 * What the Plan Room's OCR read off one scanned sheet (migration 064), saved
 * as it finishes each sheet (src/lib/v34/plan-ocr-runner.ts). POST:
 *   { phase: 'title', number?, title?, discipline?, scale_text?, printed_ft_per_pt?, conf? }
 *   { phase: 'full', text, words, conf? }
 *   { phase, error }                      couldn't read it — stamped, so it isn't retried forever
 * A first reading like the text-layer one: it never replaces a number or title
 * Coy typed (number_source 'coy'), and a printed scale is only stored as what
 * the sheet prints — applying it stays Coy's tap. Session client, org from the
 * session, RLS by get_user_org_ids().
 */

export const dynamic = "force-dynamic";

const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const { data: sh } = await supabase.from("plan_sheets").select("id, number_source, title").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!sh) return bad("No such sheet.", 404);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const conf = num(b.conf);
  if (b.phase === "title") {
    patch.ocr_title_at = now;
    if (typeof b.error === "string") patch.ocr_error = txt(b.error, 300);
    else if (sh.number_source !== "coy") {
      const number = txt(b.number, 20);
      if (number) { patch.number = number.toUpperCase(); patch.number_source = "read"; }
      const title = txt(b.title, 120);
      if (title) patch.title = title;
      else if (isStampTitle(sh.title)) patch.title = null; // a plot stamp read off the text layer is no title
      const disc = txt(b.discipline, 12);
      if (disc && number) patch.discipline = disc;
      const scaleText = txt(b.scale_text, 60);
      const k = num(b.printed_ft_per_pt);
      if (scaleText) patch.scale_text = scaleText;
      if (k && k > 0 && k < 100) patch.printed_ft_per_pt = k;
    }
  } else if (b.phase === "full") {
    patch.ocr_at = now;
    if (typeof b.error === "string") patch.ocr_error = txt(b.error, 300);
    else {
      patch.ocr_text = typeof b.text === "string" ? b.text.slice(0, 200_000) : null;
      const words = Array.isArray(b.words) ? b.words.slice(0, 8000).filter((w): w is unknown[] =>
        Array.isArray(w) && w.length === 6 && w.slice(0, 4).every((n) => typeof n === "number" && Number.isFinite(n)) && typeof w[4] === "string" && typeof w[5] === "number")
        .map((w) => [w[0], w[1], w[2], w[3], String(w[4]).slice(0, 60), w[5]]) : [];
      patch.ocr_words = words;
      // Read, but not all of it (a part that timed out) — said, not hidden.
      patch.ocr_error = txt(b.note, 300);
    }
  } else return bad("phase must be 'title' or 'full'.");
  if (conf !== null && conf >= 0 && conf <= 100) patch.ocr_conf = conf;

  const { data, error } = await supabase.from("plan_sheets").update(patch).eq("id", id).eq("org_id", orgId).select(SHEET_COLS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ sheet: data }));
}
