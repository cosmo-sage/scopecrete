import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { SHEET_COLS } from "@/lib/plans-server";

/**
 * One plan sheet (migration 059). PATCH:
 *   { scale_ft_per_pt, scale_method: 'manual' }   measured on a known dimension
 *   { scale_method: 'title_block' }               use the scale the sheet prints
 *   { scale_method: 'none' }                      not to scale — nothing measured here counts
 *   { scale_method: null }                        clear it
 *   { number?, title? }                           Coy's own reading
 * A scale is only ever one Coy set; the printed one is applied by his tap.
 */

import { syncTakeoffSections } from "@/lib/takeoff-sections-server";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const { data: sh } = await supabase.from("plan_sheets").select("id, job_id, printed_ft_per_pt").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!sh) return bad("No such sheet.", 404);

  const patch: Record<string, unknown> = {};
  if ("scale_method" in b) {
    const m = b.scale_method;
    const stamp = { scale_set_at: new Date().toISOString(), scale_set_by: userId };
    if (m === "manual") {
      const k = Number(b.scale_ft_per_pt);
      if (!(k > 0) || !Number.isFinite(k) || k > 100) return bad("That scale doesn't look right — measure a longer dimension.");
      Object.assign(patch, { scale_ft_per_pt: k, scale_method: "manual", ...stamp });
    } else if (m === "title_block") {
      if (!sh.printed_ft_per_pt) return bad("This sheet doesn't print a scale we could read — use the Scale tool.");
      Object.assign(patch, { scale_ft_per_pt: sh.printed_ft_per_pt, scale_method: "title_block", ...stamp });
    } else if (m === "none") Object.assign(patch, { scale_ft_per_pt: null, scale_method: "none", ...stamp });
    else if (m === null) Object.assign(patch, { scale_ft_per_pt: null, scale_method: null, scale_set_at: null, scale_set_by: null });
    else return bad("Unknown scale method.");
  }
  const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
  if ("number" in b) { patch.number = txt(b.number, 20); patch.number_source = "coy"; }
  if ("title" in b) { patch.title = txt(b.title, 120); patch.number_source = "coy"; }
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data, error } = await supabase.from("plan_sheets").update(patch).eq("id", id).eq("org_id", orgId).select(SHEET_COLS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  // A new scale changes every size measured on it — and the sections they are counted in.
  if ("scale_ft_per_pt" in patch) await syncTakeoffSections(supabase, orgId, sh.job_id as string);
  return applyCookies(NextResponse.json({ sheet: data }));
}
