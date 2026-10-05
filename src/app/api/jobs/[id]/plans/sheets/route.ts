import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { SHEET_COLS } from "@/lib/plans-server";

/**
 * The pages of one plan file, as the browser read them with pdf.js
 * (src/lib/plan-sheets.ts): POST { file_id, sheets: [{ page, page_w, page_h,
 * number, title, discipline, scale_text, printed_ft_per_pt }] }. A first
 * reading only — a page already read keeps Coy's own number and title and
 * whatever scale he set; only what was read is refreshed.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);

  let b: { file_id?: unknown; sheets?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if (typeof b.file_id !== "string" || !UUID.test(b.file_id)) return bad("Which file?");
  const { data: f } = await supabase.from("files").select("id, job_id, mime_type").eq("org_id", orgId).eq("id", b.file_id).is("deleted_at", null).maybeSingle();
  if (!f || f.job_id !== id) return bad("That file isn't on this job.", 404);
  if (!Array.isArray(b.sheets) || !b.sheets.length || b.sheets.length > 500) return bad("Send the pages (1 to 500).");

  const { data: have } = await supabase.from("plan_sheets").select("id, page, number_source").eq("org_id", orgId).eq("file_id", f.id);
  const byPage = new Map(((have ?? []) as Array<{ id: string; page: number; number_source: string }>).map((s) => [s.page, s]));
  const fresh: Array<Record<string, unknown>> = [];
  for (const raw of b.sheets as Array<Record<string, unknown>>) {
    const page = typeof raw.page === "number" && Number.isInteger(raw.page) && raw.page >= 1 ? raw.page : null;
    const w = pos(raw.page_w), h = pos(raw.page_h);
    if (!page || !w || !h) return bad("Each page needs its number and size.");
    const read = {
      page_w: w, page_h: h,
      scale_text: txt(raw.scale_text, 60),
      printed_ft_per_pt: pos(raw.printed_ft_per_pt),
      discipline: txt(raw.discipline, 12),
    };
    const was = byPage.get(page);
    const named = { number: txt(raw.number, 20), title: txt(raw.title, 120) };
    if (was) {
      const { error } = await supabase.from("plan_sheets").update(was.number_source === "coy" ? read : { ...read, ...named })
        .eq("id", was.id).eq("org_id", orgId);
      if (error) return bad(error.message, 500);
    } else fresh.push({ org_id: orgId, job_id: id, file_id: f.id, page, ...read, ...named });
  }
  if (fresh.length) {
    const { error } = await supabase.from("plan_sheets").insert(fresh);
    if (error) return bad(error.message, 500);
  }
  const { data } = await supabase.from("plan_sheets").select(SHEET_COLS).eq("org_id", orgId).eq("file_id", f.id).order("page");
  return applyCookies(NextResponse.json({ sheets: data ?? [] }));
}
