import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { MEAS_COLS, cleanPoints, paramInJob, sheetInJob } from "@/lib/plans-server";

/**
 * A shape drawn on a plan sheet (migration 059): POST { parameter_id,
 * sheet_id, name?, geometry: [[x,y],…], cutouts?, method }. Points are PDF
 * page points. No quantity is stored — it is worked out from the shape and
 * the sheet's scale wherever it is shown.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = { area: ["area", "rect"], linear: ["linear"], count: ["count"] } as const;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if (typeof b.parameter_id !== "string" || !UUID.test(b.parameter_id) || typeof b.sheet_id !== "string" || !UUID.test(b.sheet_id)) return bad("Which group and sheet?");
  const [p, sh] = await Promise.all([paramInJob(supabase, orgId, id, b.parameter_id), sheetInJob(supabase, orgId, id, b.sheet_id)]);
  if (!p) return bad("No such group on this job.", 404);
  if (!sh) return bad("No such sheet on this job.", 404);
  const method = String(b.method ?? (p.kind === "area" ? "area" : p.kind));
  if (!(METHODS[p.kind] as readonly string[]).includes(method)) return bad(`A ${p.kind} group can't take a ${method} shape.`);
  const geometry = cleanPoints(b.geometry);
  if (!geometry) return bad("Bad shape.");
  if (p.kind === "area" && geometry.length < 3) return bad("An area needs at least three corners.");
  if (p.kind === "linear" && geometry.length < 2) return bad("A line needs two points.");
  const { count } = await supabase.from("takeoff_measurements").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("parameter_id", p.id);
  const name = typeof b.name === "string" && b.name.trim() ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : null;
  const { data, error } = await supabase.from("takeoff_measurements").insert({
    org_id: orgId, parameter_id: p.id, sheet_id: sh.id, name, geometry, cutouts: [], method, sort_order: count ?? 0,
  }).select(MEAS_COLS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ measurement: data }, { status: 201 }));
}
