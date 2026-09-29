import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { loadAssembly, setReinforcement, workingEstimate } from "@/lib/budget-server";
import { readSectionFields, SECTION_SELECT } from "../fields";

/**
 * Edit or remove one section. Scoped by job, section AND org.
 *
 * Step 3b (migration 050): a reinforcement pick is a card — recorded on the
 * section and carried as the area's one reinforcement line on the budget. A
 * new work type loads Coy's assembly for it, but only onto an area with no
 * budget lines yet. Removing a section removes its lines from the working
 * budget too, so an area that is gone is not still in the price.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, sectionId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  const fields = readSectionFields(body);
  if (!fields.ok) return applyCookies(NextResponse.json({ error: fields.error }, { status: 400 }));
  if (Object.keys(fields.patch).length === 0 && fields.reinforcement === undefined) {
    return applyCookies(NextResponse.json({ error: "Nothing to change." }, { status: 400 }));
  }

  if (Object.keys(fields.patch).length) {
    const { data, error } = await supabase
      .from("job_sections")
      .update({ ...fields.patch, updated_at: new Date().toISOString() })
      .eq("id", sectionId)
      .eq("job_id", id)
      .eq("org_id", orgId)
      .select("id")
      .maybeSingle();
    if (error) return applyCookies(NextResponse.json({ error: `job_sections update: ${error.message}` }, { status: 500 }));
    if (!data) return applyCookies(NextResponse.json({ error: "No such section.", code: "not_found" }, { status: 404 }));
  } else {
    const { data } = await supabase.from("job_sections").select("id").eq("id", sectionId).eq("job_id", id).eq("org_id", orgId).maybeSingle();
    if (!data) return applyCookies(NextResponse.json({ error: "No such section.", code: "not_found" }, { status: 404 }));
  }

  if (fields.reinforcement !== undefined) {
    const r = await setReinforcement(supabase, orgId, id, sectionId, fields.reinforcement, "set");
    if (!r.ok) return applyCookies(NextResponse.json({ error: r.error }, { status: 400 }));
  }
  let assembly = null;
  if (typeof fields.patch.work_type === "string") {
    const { data: job } = await supabase.from("jobs").select("job_type").eq("id", id).eq("org_id", orgId).maybeSingle();
    assembly = await loadAssembly(supabase, orgId, id, sectionId,
      { auto: true, jobType: (job?.job_type as string | null) ?? null, workType: fields.patch.work_type });
  }

  const { data, error } = await supabase.from("job_sections").select(SECTION_SELECT)
    .eq("id", sectionId).eq("job_id", id).eq("org_id", orgId).maybeSingle();
  if (error || !data) return applyCookies(NextResponse.json({ error: error?.message ?? "No such section." }, { status: 500 }));
  return applyCookies(NextResponse.json({ section: data, assembly }));
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, sectionId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  // The area's lines go with it — otherwise they would fall back to "whole
  // job" and stay in the price.
  const est = await workingEstimate(supabase, orgId, id, false);
  if (est) await supabase.from("estimate_line_items").delete().eq("estimate_id", est.id as string).eq("section_id", sectionId);

  const { data, error } = await supabase
    .from("job_sections")
    .delete()
    .eq("id", sectionId)
    .eq("job_id", id)
    .eq("org_id", orgId)
    .select("id")
    .maybeSingle();

  if (error) return applyCookies(NextResponse.json({ error: `job_sections delete: ${error.message}` }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "No such section.", code: "not_found" }, { status: 404 }));
  return applyCookies(NextResponse.json({ deleted: data.id }));
}
