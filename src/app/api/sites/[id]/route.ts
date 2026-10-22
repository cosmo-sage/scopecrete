import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { SHOT_COLUMNS, SITE_COLUMNS, WAITING_113, missing113, signShots, siteOut } from "@/lib/capture-server";

/**
 * One site (migration 113): GET its shots; PATCH { name?, address?, archived? }.
 * A site is never deleted — Archive hides it (its photos stay in Files).
 * Session client; org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!UUID.test(id)) return applyCookies(NextResponse.json({ error: "Bad id." }, { status: 400 }));
  const { data: s, error } = await supabase.from("sites").select(SITE_COLUMNS).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (missing113(error)) return applyCookies(NextResponse.json({ error: WAITING_113 }, { status: 503 }));
  if (!s) return applyCookies(NextResponse.json({ error: "No such site." }, { status: 404 }));
  const { data: shots } = await supabase.from("files").select(SHOT_COLUMNS).eq("org_id", orgId).eq("site_id", id).is("deleted_at", null)
    .order("taken_at", { ascending: false }).limit(300);
  let jobTitle: string | null = null;
  if (s.job_id) {
    const { data: j } = await supabase.from("jobs").select("title").eq("org_id", orgId).eq("id", s.job_id as string).maybeSingle();
    jobTitle = (j?.title as string | undefined) ?? null;
  }
  return applyCookies(NextResponse.json({
    site: siteOut(s as Record<string, unknown>, { job_title: jobTitle }),
    shots: await signShots(supabase, (shots ?? []) as Array<Record<string, unknown>>),
  }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!UUID.test(id)) return bad("Bad id.");
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 120) : null;
  if ("address" in b) patch.address = typeof b.address === "string" && b.address.trim() ? b.address.trim().slice(0, 200) : null;
  if ("archived" in b) patch.archived_at = b.archived ? new Date().toISOString() : null;
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data, error } = await supabase.from("sites").update(patch).eq("org_id", orgId).eq("id", id).select(SITE_COLUMNS).maybeSingle();
  if (missing113(error)) return bad(WAITING_113, 503);
  if (error) return bad(error.message, 500);
  if (!data) return bad("No such site.", 404);
  return applyCookies(NextResponse.json({ site: siteOut(data as Record<string, unknown>) }));
}
