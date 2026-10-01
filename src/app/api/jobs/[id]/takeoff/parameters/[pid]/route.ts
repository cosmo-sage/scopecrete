import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { PARAM_COLS, paramInJob } from "@/lib/plans-server";

/** Rename, recolour, set the depth, or remove a takeoff group (its shapes go with it; a budget line keeps its row and says the group was removed). */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const p = await paramInJob(supabase, orgId, id, pid);
  if (!p) return bad("No such group.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("name" in b) {
    const n = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (!n) return bad("A group needs a name.");
    patch.name = n;
  }
  if ("color" in b) {
    if (typeof b.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(b.color)) return bad("Bad colour.");
    patch.color = b.color;
  }
  if ("depth_in" in b) {
    const d = b.depth_in === null || b.depth_in === "" ? null : Number(b.depth_in);
    if (d !== null && !(d > 0 && d <= 120)) return bad("Depth is in inches, 0 to 120.");
    if (d !== null && p.kind !== "area") return bad("Only an area has a depth.");
    patch.depth_in = d;
  }
  if ("sort_order" in b && Number.isInteger(b.sort_order)) patch.sort_order = b.sort_order;
  const { data, error } = await supabase.from("takeoff_parameters").update(patch).eq("id", pid).eq("org_id", orgId).select(PARAM_COLS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ parameter: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await paramInJob(supabase, orgId, id, pid))) return applyCookies(NextResponse.json({ error: "No such group." }, { status: 404 }));
  const { error } = await supabase.from("takeoff_parameters").delete().eq("id", pid).eq("org_id", orgId);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
