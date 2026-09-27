import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { readSectionFields, SECTION_SELECT } from "../fields";

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
