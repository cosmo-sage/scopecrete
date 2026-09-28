import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { REINF_SELECT, readReinforcementFields } from "./fields";

/**
 * Reinforcement in cost settings (migration 042; Coy, 2026-09-28).
 *
 * GET  → { types, defaults }
 * POST { name, kind, unit, unit_cost?, … } → { type }       add one
 * PUT  { job_type, work_type, reinforcement_type_id|null }  set or clear a default
 *
 * Session client, org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

const JOB_TYPES = ["residential", "commercial", "public"];
const WORK_TYPES = ["slab", "driveway", "patio", "sidewalk", "footing", "curb", "other"];

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const [types, defaults] = await Promise.all([
    supabase.from("org_reinforcement_types").select(REINF_SELECT).eq("org_id", orgId).order("created_at"),
    supabase.from("org_reinforcement_defaults").select("job_type, work_type, reinforcement_type_id").eq("org_id", orgId),
  ]);
  if (types.error || defaults.error) {
    return applyCookies(NextResponse.json({ error: (types.error ?? defaults.error)!.message }, { status: 500 }));
  }
  return applyCookies(NextResponse.json({ types: types.data ?? [], defaults: defaults.data ?? [] }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  const f = readReinforcementFields(body, true);
  if (!f.ok) return applyCookies(NextResponse.json({ error: f.error }, { status: 400 }));
  const { data, error } = await supabase.from("org_reinforcement_types")
    .insert({ ...f.patch, org_id: orgId }).select(REINF_SELECT).single();
  if (error) return applyCookies(NextResponse.json({ error: `org_reinforcement_types: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ type: data }, { status: 201 }));
}

export async function PUT(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const jt = body?.job_type, wt = body?.work_type, id = body?.reinforcement_type_id;
  if (!JOB_TYPES.includes(jt as string) || !WORK_TYPES.includes(wt as string)) {
    return applyCookies(NextResponse.json({ error: "job_type and work_type must be known values." }, { status: 400 }));
  }
  if (id === null) {
    const { error } = await supabase.from("org_reinforcement_defaults").delete()
      .eq("org_id", orgId).eq("job_type", jt as string).eq("work_type", wt as string);
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
    return applyCookies(NextResponse.json({ ok: true }));
  }
  if (typeof id !== "string") return applyCookies(NextResponse.json({ error: "reinforcement_type_id must be an id or null." }, { status: 400 }));
  const { data: t } = await supabase.from("org_reinforcement_types").select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!t) return applyCookies(NextResponse.json({ error: "That reinforcement is not in your settings." }, { status: 404 }));
  const { error } = await supabase.from("org_reinforcement_defaults")
    .upsert({ org_id: orgId, job_type: jt, work_type: wt, reinforcement_type_id: id }, { onConflict: "org_id,job_type,work_type" });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
