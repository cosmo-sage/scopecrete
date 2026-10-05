import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/** Rename a cost group or set its markup; delete one (its cards stay, ungrouped). */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: { name?: unknown; default_markup_pct?: unknown; sort_order?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const patch: Record<string, unknown> = {};
  if ("name" in b) {
    const n = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (!n) return bad("A group needs a name.");
    patch.name = n;
  }
  if ("default_markup_pct" in b) {
    const m = b.default_markup_pct === null || b.default_markup_pct === "" ? null : Number(b.default_markup_pct);
    if (m !== null && (!Number.isFinite(m) || m < 0 || m > 500)) return bad("Markup must be 0 to 500.");
    patch.default_markup_pct = m;
  }
  if ("sort_order" in b && Number.isInteger(b.sort_order)) patch.sort_order = b.sort_order;
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data, error } = await supabase.from("cost_groups").update(patch).eq("id", id).eq("org_id", orgId)
    .select("id, name, cost_type, default_markup_pct, sort_order").maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad("No such group.", 404);
  return applyCookies(NextResponse.json({ group: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("cost_groups").delete().eq("id", id).eq("org_id", orgId).select("id").maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "No such group." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
