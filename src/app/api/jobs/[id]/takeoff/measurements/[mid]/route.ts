import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { MEAS_COLS, cleanPoints, paramInJob } from "@/lib/plans-server";
import { syncTakeoffSections } from "@/lib/takeoff-sections-server";

/** Rename a shape, move it to another group of the same kind, redraw it, set its cutouts, or remove it. */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function mine(sb: Parameters<typeof paramInJob>[0], orgId: string, jobId: string, mid: string) {
  const { data } = await sb.from("takeoff_measurements").select("id, parameter_id, takeoff_parameters!inner(job_id, kind)")
    .eq("org_id", orgId).eq("id", mid).maybeSingle();
  const row = data as unknown as { id: string; parameter_id: string; takeoff_parameters: { job_id: string; kind: string } } | null;
  return row && row.takeoff_parameters.job_id === jobId ? row : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const m = await mine(supabase, orgId, id, mid);
  if (!m) return bad("No such shape.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = typeof b.name === "string" && b.name.trim() ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : null;
  if ("geometry" in b) {
    const g = cleanPoints(b.geometry);
    if (!g) return bad("Bad shape.");
    patch.geometry = g;
  }
  if ("cutouts" in b) {
    if (m.takeoff_parameters.kind !== "area") return bad("Only an area has cutouts.");
    if (!Array.isArray(b.cutouts) || b.cutouts.length > 100) return bad("Bad cutouts.");
    const cs = b.cutouts.map((c) => cleanPoints(c));
    if (cs.some((c) => !c || c.length < 3)) return bad("A cutout needs at least three corners.");
    patch.cutouts = cs;
  }
  if ("parameter_id" in b) {
    if (typeof b.parameter_id !== "string" || !UUID.test(b.parameter_id)) return bad("Which group?");
    const p = await paramInJob(supabase, orgId, id, b.parameter_id);
    if (!p) return bad("No such group.", 404);
    if (p.kind !== m.takeoff_parameters.kind) return bad(`That group is ${p.kind}, this shape is ${m.takeoff_parameters.kind}.`);
    patch.parameter_id = p.id;
  }
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data, error } = await supabase.from("takeoff_measurements").update(patch).eq("id", mid).eq("org_id", orgId).select(MEAS_COLS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  // The budget section it is counted in follows it (migration 069).
  await syncTakeoffSections(supabase, orgId, id);
  return applyCookies(NextResponse.json({ measurement: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await mine(supabase, orgId, id, mid))) return applyCookies(NextResponse.json({ error: "No such shape." }, { status: 404 }));
  const { data: was } = await supabase.from("takeoff_measurements").select("section_id").eq("id", mid).eq("org_id", orgId).maybeSingle();
  const { error } = await supabase.from("takeoff_measurements").delete().eq("id", mid).eq("org_id", orgId);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  // Its section stays, cost items and all; only the size it gave goes.
  await syncTakeoffSections(supabase, orgId, id, [was?.section_id as string | null]);
  return applyCookies(NextResponse.json({ ok: true }));
}
