import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { defaultReinforcement, readSectionFields, SECTION_SELECT } from "../fields";

/** Edit or remove one section. Scoped by job, section AND org. */

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
  if (Object.keys(fields.patch).length === 0) {
    return applyCookies(NextResponse.json({ error: "Nothing to change." }, { status: 400 }));
  }

  // The FK alone would accept another org's type; the org filter here does not.
  if (typeof fields.patch.reinforcement_type_id === "string") {
    const { data: rt } = await supabase.from("org_reinforcement_types").select("id")
      .eq("org_id", orgId).eq("id", fields.patch.reinforcement_type_id).maybeSingle();
    if (!rt) return applyCookies(NextResponse.json({ error: "That reinforcement is not in your settings." }, { status: 400 }));
  }

  // A new work type brings its own default — unless Coy picked the
  // reinforcement himself (source 'set'), which is never swapped.
  if (typeof fields.patch.work_type === "string" && !("reinforcement_type_id" in fields.patch)) {
    const [{ data: cur }, { data: job }] = await Promise.all([
      supabase.from("job_sections").select("reinforcement_source").eq("id", sectionId).eq("job_id", id).eq("org_id", orgId).maybeSingle(),
      supabase.from("jobs").select("job_type").eq("id", id).eq("org_id", orgId).maybeSingle(),
    ]);
    if (cur && cur.reinforcement_source !== "set") {
      const d = await defaultReinforcement(supabase, orgId, (job?.job_type as string | null) ?? null, fields.patch.work_type);
      fields.patch.reinforcement_type_id = d;
      fields.patch.reinforcement_source = d ? "default" : null;
    }
  }

  const { data, error } = await supabase
    .from("job_sections")
    .update({ ...fields.patch, updated_at: new Date().toISOString() })
    .eq("id", sectionId)
    .eq("job_id", id)
    .eq("org_id", orgId)
    .select(SECTION_SELECT)
    .maybeSingle();

  if (error) return applyCookies(NextResponse.json({ error: `job_sections update: ${error.message}` }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "No such section.", code: "not_found" }, { status: 404 }));
  return applyCookies(NextResponse.json({ section: data }));
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, sectionId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

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
