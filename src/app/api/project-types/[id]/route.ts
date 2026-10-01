import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { TYPE_COLS, typeRow } from "@/lib/proposal-server";

/** Edit a project type's defaults, or remove one Coy added (the three built-in types stay). */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILT_IN = ["residential", "commercial", "public"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("label" in b) {
    const l = typeof b.label === "string" ? b.label.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    if (!l) return bad("A type needs a name.");
    patch.label = l;
  }
  for (const k of ["overhead_pct", "margin_pct"] as const) if (k in b) {
    const v = b[k] === null || b[k] === "" ? null : Number(b[k]);
    if (v !== null && !(v >= 0 && (k === "margin_pct" ? v < 100 : v <= 200))) return bad(k === "margin_pct" ? "Margin is 0 to 99%." : "O.H. is 0 to 200%.");
    patch[k] = v;
  }
  for (const k of ["show_item_prices", "show_qty", "show_tax_line"] as const) if (k in b) patch[k] = b[k] === true;
  if ("cover" in b) { if (!["photo", "none"].includes(String(b.cover))) return bad("Bad cover."); patch.cover = b.cover; }
  if ("draws" in b) {
    if (!Array.isArray(b.draws) || b.draws.length > 20) return bad("Up to 20 draws.");
    const out = [];
    for (const r of b.draws as Array<Record<string, unknown>>) {
      const pct = Number(r.pct);
      if (!(pct >= 0 && pct <= 100)) return bad("A draw's % is 0 to 100.");
      out.push({ pct, when: typeof r.when === "string" ? r.when.slice(0, 200) : "" });
    }
    patch.draws = out;
  }
  for (const [k, kind] of [["warranty_template_id", "warranty"], ["terms_template_id", "terms"]] as const) if (k in b) {
    if (b[k] === null) { patch[k] = null; continue; }
    if (typeof b[k] !== "string" || !UUID.test(b[k] as string)) return bad("Bad template.");
    const { data } = await supabase.from("doc_templates").select("id").eq("org_id", orgId).eq("id", b[k] as string).eq("kind", kind).maybeSingle();
    if (!data) return bad("No such template.");
    patch[k] = data.id;
  }
  const { data, error } = await supabase.from("org_project_types").update(patch).eq("id", id).eq("org_id", orgId).select(TYPE_COLS).maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad("No such type.", 404);
  return applyCookies(NextResponse.json({ type: typeRow(data as Record<string, unknown>) }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: t } = await supabase.from("org_project_types").select("key").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!t) return applyCookies(NextResponse.json({ error: "No such type." }, { status: 404 }));
  if (BUILT_IN.includes(t.key as string)) return applyCookies(NextResponse.json({ error: "Residential, Commercial and Government stay — jobs are filed under them." }, { status: 400 }));
  const { error } = await supabase.from("org_project_types").delete().eq("id", id).eq("org_id", orgId);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
