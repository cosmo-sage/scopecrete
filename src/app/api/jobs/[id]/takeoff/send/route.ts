import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { WORK_TYPES } from "../../sections/fields";
import { syncTakeoffSections } from "@/lib/takeoff-sections-server";
import { workTypeFor } from "@/lib/takeoff-sections";
import type { TakeoffKind } from "@/lib/takeoff";

/**
 * Takeoff shapes into budget sections (migration 069; Coy, 2026-10-03:
 * "Pushing to budget should push the area measured under the group. And I
 * should be able to select the individual measurements to push").
 *
 * POST { measurement_ids: [...], mode: "each" | "one" | "into",
 *        section_id?, name?, work_type? }
 *   each — a section per shape, named for the shape (or the group + its number)
 *   one  — one section for all of them (named `name`, else the group's)
 *   into — added to an existing section of this job
 * Each section follows its shapes (size written by syncTakeoffSections). A shape
 * already in a section moves. Nothing is priced here — cost items are added to
 * the sections after, as ever.
 *
 * Session client; every id checked against the job.
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
  const ids = Array.isArray(b.measurement_ids) ? [...new Set(b.measurement_ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 200) : [];
  if (!ids.length) return bad("Which takeoffs?");
  const mode = b.mode === "one" || b.mode === "into" ? b.mode : "each";

  // The shapes, with their groups — all on this job.
  const { data: rows } = await supabase.from("takeoff_measurements")
    .select("id, name, section_id, sort_order, created_at, parameter_id, takeoff_parameters!inner(id, job_id, name, kind)")
    .eq("org_id", orgId).in("id", ids);
  type Row = { id: string; name: string | null; section_id: string | null; sort_order: number; created_at: string; parameter_id: string; takeoff_parameters: { id: string; job_id: string; name: string; kind: TakeoffKind } };
  const shapes = ((rows ?? []) as unknown as Row[]).filter((r) => r.takeoff_parameters.job_id === id);
  if (shapes.length !== ids.length) return bad("Some of those takeoffs aren't on this job.", 404);
  const kinds = new Set(shapes.map((s) => s.takeoff_parameters.kind));
  if (mode !== "each" && kinds.size > 1) return bad("One section takes one kind of takeoff — areas, lengths or counts, not a mix.");
  const was = shapes.map((s) => s.section_id);

  const wt = typeof b.work_type === "string" && (WORK_TYPES as readonly string[]).includes(b.work_type) ? b.work_type : null;
  const { count } = await supabase.from("job_sections").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("job_id", id);
  let order = count ?? 0;
  const made: string[] = [];
  const newSection = async (name: string, workType: string) => {
    const { data, error } = await supabase.from("job_sections").insert({
      org_id: orgId, job_id: id, name: name.slice(0, 80), work_type: workType, depth_in: null, psi: null, sort_order: order++, takeoff_sync: true,
    }).select("id").single();
    if (error || !data) throw new Error(`section: ${error?.message ?? "not made"}`);
    made.push(data.id as string);
    return data.id as string;
  };
  const link = async (mid: string, sid: string) => {
    const { error } = await supabase.from("takeoff_measurements").update({ section_id: sid }).eq("org_id", orgId).eq("id", mid);
    if (error) throw new Error(error.message);
  };

  try {
    if (mode === "into") {
      const sid = typeof b.section_id === "string" && UUID.test(b.section_id) ? b.section_id : null;
      if (!sid) return bad("Into which section?");
      const { data: sec } = await supabase.from("job_sections").select("id").eq("org_id", orgId).eq("job_id", id).eq("id", sid).maybeSingle();
      if (!sec) return bad("No such section on this job.", 404);
      for (const s of shapes) await link(s.id, sid);
      await supabase.from("job_sections").update({ takeoff_sync: true }).eq("org_id", orgId).eq("id", sid);
    } else if (mode === "one") {
      const g = shapes[0].takeoff_parameters;
      const name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : g.name;
      const sid = await newSection(name, wt ?? workTypeFor(g.name, g.kind));
      for (const s of shapes) await link(s.id, sid);
    } else {
      // In the order they were drawn, each named for itself or its group + number.
      const all = await supabase.from("takeoff_measurements").select("id, parameter_id").eq("org_id", orgId)
        .in("parameter_id", [...new Set(shapes.map((s) => s.parameter_id))]).order("sort_order").order("created_at");
      const nth = new Map<string, number>();
      const seen = new Map<string, number>();
      for (const r of (all.data ?? []) as Array<{ id: string; parameter_id: string }>) { const k = (seen.get(r.parameter_id) ?? 0) + 1; seen.set(r.parameter_id, k); nth.set(r.id, k); }
      for (const s of [...shapes].sort((a, z) => (nth.get(a.id) ?? 0) - (nth.get(z.id) ?? 0))) {
        const g = s.takeoff_parameters;
        const sid = await newSection(s.name ?? `${g.name} ${nth.get(s.id) ?? ""}`.trim(), wt ?? workTypeFor(`${s.name ?? ""} ${g.name}`, g.kind));
        await link(s.id, sid);
      }
    }
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e), 500);
  }
  await syncTakeoffSections(supabase, orgId, id, [...was, ...made]);
  return applyCookies(NextResponse.json({ ok: true, sections: made }));
}
