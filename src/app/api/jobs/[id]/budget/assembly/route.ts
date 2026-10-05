import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg, loadAssembly } from "@/lib/budget-server";

/**
 * Load an assembly onto one area of the job's budget, by hand (step 3b).
 * POST { assembly_id, section_id } → { loaded, lines }.
 *
 * Unlike the automatic load when an area is added, this adds even when the
 * area already has lines — Coy asked for it. Session client, org from the
 * session; the job, the area and the assembly are all checked against it.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const assemblyId = typeof b.assembly_id === "string" && UUID.test(b.assembly_id) ? b.assembly_id : null;
  const sectionId = typeof b.section_id === "string" && UUID.test(b.section_id) ? b.section_id : null;
  if (!assemblyId || !sectionId) return bad("Name the assembly and the area.");
  const { data: s } = await supabase.from("job_sections").select("id").eq("org_id", orgId).eq("job_id", id).eq("id", sectionId).maybeSingle();
  if (!s) return bad("That area isn't on this job.");
  const { data: a } = await supabase.from("cost_assemblies").select("id").eq("org_id", orgId).eq("id", assemblyId).maybeSingle();
  if (!a) return bad("No such assembly.", 404);
  const r = await loadAssembly(supabase, orgId, id, sectionId, { auto: false, assemblyId });
  if ("error" in r && r.error) return bad(r.error, 500);
  return applyCookies(NextResponse.json({ loaded: r.loaded, lines: r.lines }, { status: 201 }));
}
