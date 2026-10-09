import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { TEMPLATE_COLS, TYPE_COLS, typeRow } from "@/lib/proposal-server";
import { readRisk } from "@/lib/risk";

/**
 * Project types (migration 060): Residential / Commercial / Government and any
 * Coy adds — each type's O.H., margin and risk (096; a new budget copies them), what its
 * proposal shows, its draws, and which warranty and contract load. Edited in
 * Price book → Defaults. GET lists types and templates; POST adds a type.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const [{ data: types, error }, { data: templates }] = await Promise.all([
    supabase.from("org_project_types").select(TYPE_COLS).eq("org_id", orgId).order("sort_order"),
    supabase.from("doc_templates").select(TEMPLATE_COLS).eq("org_id", orgId).order("kind").order("name"),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  // Each type's risk (096) — read apart, so the page works before 096 is applied.
  const { data: risks, error: riskErr } = await supabase.from("org_project_types").select("id, risk").eq("org_id", orgId);
  const riskById = new Map(((risks ?? []) as Array<{ id: string; risk: unknown }>).map((r) => [r.id, r.risk ? readRisk(r.risk) : null]));
  return applyCookies(NextResponse.json({
    types: ((types ?? []) as Array<Record<string, unknown>>).map((t) => ({ ...typeRow(t), risk: riskById.get(t.id as string) ?? null })),
    templates: templates ?? [], risk_ready: !riskErr,
  }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const label = typeof b.label === "string" ? b.label.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  if (!label) return bad("Name the type — Industrial, HOA, Church…");
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "type";
  const { count } = await supabase.from("org_project_types").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if ((count ?? 0) >= 20) return bad("Twenty types is plenty.");
  const { data, error } = await supabase.from("org_project_types").insert({ org_id: orgId, key, label, sort_order: count ?? 0, draws: [{ pct: 100, when: "On completion" }] })
    .select(TYPE_COLS).single();
  if (error) return bad(error.code === "23505" ? "There is already a type with that name." : error.message, error.code === "23505" ? 409 : 500);
  return applyCookies(NextResponse.json({ type: typeRow(data as Record<string, unknown>) }, { status: 201 }));
}
