import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { TEMPLATE_COLS } from "@/lib/proposal-server";
import { cleanTemplate } from "./clean";

/** Warranty and contract templates (migration 060). POST adds one — also "Save as template" from a proposal. */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("doc_templates").select(TEMPLATE_COLS).eq("org_id", orgId).order("kind").order("name");
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ templates: data ?? [] }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if (b.kind !== "warranty" && b.kind !== "terms") return bad("Warranty or terms?");
  const c = cleanTemplate(b, b.kind);
  if (!c.ok) return bad(c.error);
  if (!c.row.name) return bad("Name the template.");
  const { data, error } = await supabase.from("doc_templates").insert({ org_id: orgId, kind: b.kind, ...c.row, starter: false }).select(TEMPLATE_COLS).single();
  if (error) return bad(error.code === "23505" ? "There is already a template with that name." : error.message, error.code === "23505" ? 409 : 500);
  return applyCookies(NextResponse.json({ template: data }, { status: 201 }));
}
