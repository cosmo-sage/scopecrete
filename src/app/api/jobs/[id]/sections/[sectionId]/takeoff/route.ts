import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { syncTakeoffSections } from "@/lib/takeoff-sections-server";

/**
 * The takeoffs a section is counted from, picked on the budget page (Coy,
 * 2026-10-03: "in that section I can go in and select the measurement I want
 * to pull into that section which should update the quantities").
 *
 * PUT { measurement_ids: [...] } — exactly these shapes are this section's: the
 * ones listed join it (leaving any other section), the ones not listed leave
 * it. The section follows them again. Session client; ids checked against the job.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string; sectionId: string }> }) {
  const { id, sectionId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if (!Array.isArray(b.measurement_ids)) return bad("Which takeoffs?");
  const ids = [...new Set(b.measurement_ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 200);

  const { data: sec } = await supabase.from("job_sections").select("id").eq("org_id", orgId).eq("job_id", id).eq("id", sectionId).maybeSingle();
  if (!sec) return bad("No such section.", 404);
  const { data: rows } = await supabase.from("takeoff_measurements").select("id, section_id, takeoff_parameters!inner(job_id, kind)").eq("org_id", orgId).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  type Row = { id: string; section_id: string | null; takeoff_parameters: { job_id: string; kind: string } };
  const picked = ((rows ?? []) as unknown as Row[]).filter((r) => r.takeoff_parameters.job_id === id);
  if (picked.length !== ids.length) return bad("Some of those takeoffs aren't on this job.", 404);
  if (new Set(picked.map((r) => r.takeoff_parameters.kind)).size > 1) return bad("One section takes one kind of takeoff — areas, lengths or counts, not a mix.");

  const { data: had } = await supabase.from("takeoff_measurements").select("id").eq("org_id", orgId).eq("section_id", sectionId);
  const leaving = ((had ?? []) as Array<{ id: string }>).map((r) => r.id).filter((x) => !ids.includes(x));
  if (leaving.length) {
    const { error } = await supabase.from("takeoff_measurements").update({ section_id: null }).eq("org_id", orgId).in("id", leaving);
    if (error) return bad(error.message, 500);
  }
  if (ids.length) {
    const { error } = await supabase.from("takeoff_measurements").update({ section_id: sectionId }).eq("org_id", orgId).in("id", ids);
    if (error) return bad(error.message, 500);
  }
  // A section that had no shapes and still has none keeps the size typed on it.
  const hadAny = ((had ?? []) as unknown[]).length > 0;
  if (ids.length) await supabase.from("job_sections").update({ takeoff_sync: true }).eq("org_id", orgId).eq("id", sectionId);
  await syncTakeoffSections(supabase, orgId, id, [...(ids.length || hadAny ? [sectionId] : []), ...picked.map((r) => r.section_id)]);
  return applyCookies(NextResponse.json({ ok: true }));
}
