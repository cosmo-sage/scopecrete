import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * "Same item as…" (migration 052). POST { into_id } merges this item INTO
 * another: its vendor prices move there, it is retired, and assemblies that
 * used it use the other. A vendor who already prices the other item keeps
 * that price; their price on this one stays with it (retired) and is named.
 * If the other item has no default vendor, this one's default comes with it.
 * Budget lines already made keep their own copy. Undo: POST
 * /api/cost-item-merges/[id]/undo.
 *
 * Session client, org from the session; both items must be this org's.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const into = typeof b.into_id === "string" && UUID.test(b.into_id) ? b.into_id : null;
  if (!into || into === id) return bad("Pick the item this one is the same as.");
  const { data: items } = await supabase.from("cost_items").select("id, name, active, default_source_id").eq("org_id", orgId).in("id", [id, into]);
  type It = { id: string; name: string; active: boolean; default_source_id: string | null };
  const loser = ((items ?? []) as It[]).find((i) => i.id === id);
  const winner = ((items ?? []) as It[]).find((i) => i.id === into);
  if (!loser || !winner) return bad("No such item.", 404);
  if (!loser.active || !winner.active) return bad("Both items must be in the catalog (not retired).");

  const [{ data: ls }, { data: ws }, { data: rows }, { data: reinf }] = await Promise.all([
    supabase.from("cost_item_sources").select("id, vendor_contact_id").eq("org_id", orgId).eq("cost_item_id", id),
    supabase.from("cost_item_sources").select("vendor_contact_id").eq("org_id", orgId).eq("cost_item_id", into),
    supabase.from("cost_assembly_items").select("id").eq("org_id", orgId).eq("cost_item_id", id),
    supabase.from("cost_assemblies").select("id").eq("org_id", orgId).eq("reinforcement_item_id", id),
  ]);
  const taken = new Set(((ws ?? []) as Array<{ vendor_contact_id: string }>).map((s) => s.vendor_contact_id));
  const moving = ((ls ?? []) as Array<{ id: string; vendor_contact_id: string }>).filter((s) => !taken.has(s.vendor_contact_id)).map((s) => s.id);
  const stayed = ((ls ?? []) as Array<{ id: string; vendor_contact_id: string }>).filter((s) => taken.has(s.vendor_contact_id)).map((s) => s.id);
  const bringDefault = !winner.default_source_id && loser.default_source_id && moving.includes(loser.default_source_id) ? loser.default_source_id : null;
  const payload = {
    moved_sources: moving, stayed_sources: stayed, loser_default: loser.default_source_id, winner_default_set: bringDefault,
    assembly_items: ((rows ?? []) as Array<{ id: string }>).map((r) => r.id),
    assembly_reinforcement: ((reinf ?? []) as Array<{ id: string }>).map((r) => r.id),
  };
  const { data: merge, error: mErr } = await supabase.from("cost_item_merges")
    .insert({ org_id: orgId, winner_id: into, loser_id: id, undo_payload: payload }).select("id").single();
  if (mErr || !merge) return bad(`Couldn't record the merge: ${mErr?.message ?? "no row"}`, 500);

  const now = new Date().toISOString();
  const step = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) throw new Error(error.message); };
  try {
    // The loser lets go of its default before its sources move away.
    await step(supabase.from("cost_items").update({ default_source_id: null, active: false, updated_at: now }).eq("org_id", orgId).eq("id", id));
    if (moving.length) await step(supabase.from("cost_item_sources").update({ cost_item_id: into, updated_at: now }).eq("org_id", orgId).in("id", moving));
    if (bringDefault) await step(supabase.from("cost_items").update({ default_source_id: bringDefault, updated_at: now }).eq("org_id", orgId).eq("id", into));
    if (payload.assembly_items.length) await step(supabase.from("cost_assembly_items").update({ cost_item_id: into }).eq("org_id", orgId).in("id", payload.assembly_items));
    if (payload.assembly_reinforcement.length) await step(supabase.from("cost_assemblies").update({ reinforcement_item_id: into }).eq("org_id", orgId).in("id", payload.assembly_reinforcement));
  } catch (e) {
    return bad(`The merge stopped part way (${(e as Error).message}). Undo it from the item, then try again.`, 500);
  }
  return applyCookies(NextResponse.json({ merge: { id: merge.id, moved: moving.length, kept_on_retired: stayed.length, assemblies: payload.assembly_items.length + payload.assembly_reinforcement.length } }, { status: 201 }));
}
