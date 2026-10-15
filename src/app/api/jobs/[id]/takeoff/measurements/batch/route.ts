import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { MEAS_COLS, cleanPoints, paramInJob, sheetInJob } from "@/lib/plans-server";
import { groupSection, syncTakeoffSections } from "@/lib/takeoff-sections-server";

/**
 * Many lines at once into one linear group (Find joints, src/lib/plan-joints.ts — a parking lot's
 * control joints are a hundred and more separate runs): POST { parameter_id, sheet_id,
 * shapes: [{ geometry: [[x,y],…], name? }] }, at most 500. One insert; the same checks as one
 * shape at a time (…/measurements). Only linear groups: an area or count is drawn one by one.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if (typeof b.parameter_id !== "string" || !UUID.test(b.parameter_id) || typeof b.sheet_id !== "string" || !UUID.test(b.sheet_id)) return bad("Which group and sheet?");
  if (!Array.isArray(b.shapes) || !b.shapes.length || b.shapes.length > 500) return bad("Send 1 to 500 lines.");
  const [p, sh] = await Promise.all([paramInJob(supabase, orgId, id, b.parameter_id), sheetInJob(supabase, orgId, id, b.sheet_id)]);
  if (!p) return bad("No such group on this job.", 404);
  if (!sh) return bad("No such sheet on this job.", 404);
  if (p.kind !== "linear") return bad("Lines go in a linear group.");
  const shapes: Array<{ geometry: NonNullable<ReturnType<typeof cleanPoints>>; name: string | null }> = [];
  for (const raw of b.shapes as unknown[]) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const geometry = cleanPoints(o.geometry);
    if (!geometry || geometry.length < 2) return bad("A line needs two points.");
    const name = typeof o.name === "string" && o.name.trim() ? o.name.replace(/\s+/g, " ").trim().slice(0, 80) : null;
    shapes.push({ geometry, name });
  }
  const { count } = await supabase.from("takeoff_measurements").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("parameter_id", p.id);
  const section_id = await groupSection(supabase, orgId, p.id);
  const rows = shapes.map((s, i) => ({
    org_id: orgId, parameter_id: p.id, sheet_id: sh.id, name: s.name, geometry: s.geometry, cutouts: [], method: "linear",
    sort_order: (count ?? 0) + i, ...(section_id ? { section_id } : {}),
  }));
  const { data, error } = await supabase.from("takeoff_measurements").insert(rows).select(MEAS_COLS);
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  if (section_id) await syncTakeoffSections(supabase, orgId, id, [section_id]);
  return applyCookies(NextResponse.json({ measurements: data }, { status: 201 }));
}
