import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { defaultReinforcement, readSectionFields, SECTION_SELECT } from "./fields";

/**
 * A job's sections — read and create. Session client, org from the session
 * (DECISIONS.md §7). `job_sections_member_*` policies gate on
 * get_user_org_ids(); the job is also looked up with .eq('org_id') first so a
 * cross-org job id is a clean 404 rather than an RLS error.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data, error } = await supabase
    .from("job_sections")
    .select(SECTION_SELECT)
    .eq("job_id", id)
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return applyCookies(NextResponse.json({ error: `job_sections: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ sections: data ?? [] }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
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

  // The FK alone would accept another org's type; the org filter here does not.
  if (typeof fields.patch.reinforcement_type_id === "string") {
    const { data: rt } = await supabase.from("org_reinforcement_types").select("id")
      .eq("org_id", orgId).eq("id", fields.patch.reinforcement_type_id).maybeSingle();
    if (!rt) return applyCookies(NextResponse.json({ error: "That reinforcement is not in your settings." }, { status: 400 }));
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs").select("id, job_type").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (jobErr) return applyCookies(NextResponse.json({ error: `jobs: ${jobErr.message}` }, { status: 500 }));
  if (!job) return applyCookies(NextResponse.json({ error: "No such job in your organisation.", code: "not_found" }, { status: 404 }));

  // depth_in and psi are written explicitly — the schema defaults (4 in,
  // 3000 psi) would otherwise stand in for measurements nobody took.
  const insert = {
    depth_in: null,
    psi: null,
    ...fields.patch,
    org_id: orgId,
    job_id: id,
  };
  // Coy's default for this kind of job and work (migration 042), labelled as a default.
  if (!("reinforcement_type_id" in fields.patch)) {
    const d = await defaultReinforcement(supabase, orgId, job.job_type as string | null, (fields.patch.work_type as string | undefined) ?? "slab");
    if (d) Object.assign(insert, { reinforcement_type_id: d, reinforcement_source: "default" });
  }

  const { data, error } = await supabase.from("job_sections").insert(insert).select(SECTION_SELECT).single();
  if (error) return applyCookies(NextResponse.json({ error: `job_sections insert: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ section: data }, { status: 201 }));
}
