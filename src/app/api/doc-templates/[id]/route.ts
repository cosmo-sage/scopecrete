import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { TEMPLATE_COLS } from "@/lib/proposal-server";
import { cleanTemplate } from "../clean";

/** Edit a template (it stops being starter text once Coy saves it), or remove it. Proposals already made keep their own copy. */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const { data: t } = await supabase.from("doc_templates").select("kind").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!t) return bad("No such template.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const c = cleanTemplate(b, t.kind as "warranty" | "terms");
  if (!c.ok) return bad(c.error);
  if ("name" in c.row && !c.row.name) return bad("A template needs a name.");
  const { data, error } = await supabase.from("doc_templates").update({ ...c.row, starter: false, updated_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", orgId).select(TEMPLATE_COLS).single();
  if (error) return bad(error.message, 500);
  return applyCookies(NextResponse.json({ template: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { error, count } = await supabase.from("doc_templates").delete({ count: "exact" }).eq("id", id).eq("org_id", orgId);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!count) return applyCookies(NextResponse.json({ error: "No such template." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
