import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg, workingEstimate } from "@/lib/budget-server";

/** Rename or describe a tier; delete one (its own lines go with it — shared lines stay). */

export const dynamic = "force-dynamic";

async function optionOf(req: NextRequest, id: string, optionId: string) {
  const result = await getApiSession(req);
  if (!result.ok) return { res: result.response } as const;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await jobInOrg(supabase, orgId, id))) return { res: applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 })) } as const;
  const est = await workingEstimate(supabase, orgId, id, false);
  const { data: o } = est
    ? await supabase.from("estimate_options").select("id").eq("org_id", orgId).eq("estimate_id", est.id as string).eq("id", optionId).maybeSingle()
    : { data: null };
  if (!o) return { res: applyCookies(NextResponse.json({ error: "No such option." }, { status: 404 })) } as const;
  return { supabase, orgId, applyCookies } as const;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; optionId: string }> }) {
  const { id, optionId } = await ctx.params;
  const o = await optionOf(req, id, optionId);
  if ("res" in o) return o.res;
  let b: { label?: unknown; description?: unknown; sort_order?: unknown };
  try { b = await req.json(); } catch { return o.applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 })); }
  const patch: Record<string, unknown> = {};
  if ("label" in b) {
    const l = typeof b.label === "string" ? b.label.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    if (!l) return o.applyCookies(NextResponse.json({ error: "An option needs a name." }, { status: 400 }));
    patch.label = l;
  }
  if ("description" in b) patch.description = typeof b.description === "string" && b.description.trim() ? b.description.trim().slice(0, 500) : null;
  if ("sort_order" in b && Number.isInteger(b.sort_order)) patch.sort_order = b.sort_order;
  const { data, error } = await o.supabase.from("estimate_options").update(patch).eq("id", optionId).eq("org_id", o.orgId)
    .select("id, label, description, sort_order").single();
  if (error || !data) return o.applyCookies(NextResponse.json({ error: error?.message ?? "not saved" }, { status: 500 }));
  return o.applyCookies(NextResponse.json({ option: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; optionId: string }> }) {
  const { id, optionId } = await ctx.params;
  const o = await optionOf(req, id, optionId);
  if ("res" in o) return o.res;
  const { error } = await o.supabase.from("estimate_options").delete().eq("id", optionId).eq("org_id", o.orgId);
  if (error) return o.applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return o.applyCookies(NextResponse.json({ ok: true }));
}
