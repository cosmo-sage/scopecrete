import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanAssembly } from "@/lib/assemblies";

/**
 * Assemblies (step 3b, migration 050): Coy's default set of cost cards for a
 * kind of area — "residential driveways get 3000 psi, form & finish, 6x6
 * mesh". An auto-loading one fills a new area of that kind; any can be loaded
 * by hand from the budget.
 *
 * GET  → { assemblies: [{ …, items: [{ id, cost_item_id, quantity, sort_order }] }] }
 * POST { name, job_type?, work_type?, auto_load?, reinforcement_item_id? } → the new assembly.
 *
 * Session client, org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";
const ASSEMBLY_COLUMNS = "id, name, job_type, work_type, auto_load, reinforcement_item_id, sort_order, updated_at";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const [{ data: asm, error }, { data: items }] = await Promise.all([
    supabase.from("cost_assemblies").select(ASSEMBLY_COLUMNS).eq("org_id", orgId).order("sort_order").order("name"),
    supabase.from("cost_assembly_items").select("id, assembly_id, cost_item_id, quantity, sort_order").eq("org_id", orgId).order("sort_order"),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const list = ((asm ?? []) as Array<Record<string, unknown>>).map((a) => ({
    ...a,
    items: ((items ?? []) as Array<Record<string, unknown>>).filter((i) => i.assembly_id === a.id)
      .map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) })),
  }));
  return applyCookies(NextResponse.json({ assemblies: list }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const c = cleanAssembly(b, false);
  if (!c.ok) return bad(c.error);
  if (c.value.reinforcement_item_id) {
    const { data } = await supabase.from("cost_items").select("id").eq("org_id", orgId).eq("id", c.value.reinforcement_item_id as string).maybeSingle();
    if (!data) return bad("No such card.", 404);
  }
  const { data, error } = await supabase.from("cost_assemblies").insert({ ...c.value, org_id: orgId }).select(ASSEMBLY_COLUMNS).single();
  if (error) return bad(error.code === "23505" ? "Another assembly already fills that kind of area on its own — switch one off first." : error.message, error.code === "23505" ? 409 : 500);
  return applyCookies(NextResponse.json({ assembly: { ...data, items: [] } }, { status: 201 }));
}
