import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { REINF_SELECT, readReinforcementFields } from "../fields";

/** Edit or remove one reinforcement type. Scoped by org (session). */

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  const f = readReinforcementFields(body, false);
  if (!f.ok) return applyCookies(NextResponse.json({ error: f.error }, { status: 400 }));
  if (!Object.keys(f.patch).length) return applyCookies(NextResponse.json({ error: "Nothing to change." }, { status: 400 }));
  const { data, error } = await supabase.from("org_reinforcement_types")
    .update({ ...f.patch, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id)
    .select(REINF_SELECT).maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "Not found." }, { status: 404 }));
  return applyCookies(NextResponse.json({ type: data }));
}

/** Sections using it fall back to none chosen (ON DELETE SET NULL); its defaults go too. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("org_reinforcement_types").delete()
    .eq("org_id", orgId).eq("id", id).select("id").maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "Not found." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
