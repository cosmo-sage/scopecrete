import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Undo "Same item as…" (migration 052): the retired item comes back, the
 * vendor prices and assembly rows it lost move back — those still where the
 * merge left them — and each item's default vendor is as it was.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const { data: m } = await supabase.from("cost_item_merges").select("id, winner_id, loser_id, undo_payload, undone_at").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!m) return bad("No such merge.", 404);
  if (m.undone_at) return bad("Already undone.");
  const p = m.undo_payload as { moved_sources: string[]; loser_default: string | null; winner_default_set: string | null; assembly_items: string[]; assembly_reinforcement: string[] };
  const now = new Date().toISOString();
  // The winner lets go of the default it was given, if it still has it.
  if (p.winner_default_set) {
    await supabase.from("cost_items").update({ default_source_id: null, updated_at: now }).eq("org_id", orgId).eq("id", m.winner_id).eq("default_source_id", p.winner_default_set);
  }
  if (p.moved_sources.length) {
    await supabase.from("cost_item_sources").update({ cost_item_id: m.loser_id, updated_at: now }).eq("org_id", orgId).eq("cost_item_id", m.winner_id).in("id", p.moved_sources);
  }
  if (p.assembly_items.length) {
    await supabase.from("cost_assembly_items").update({ cost_item_id: m.loser_id }).eq("org_id", orgId).eq("cost_item_id", m.winner_id).in("id", p.assembly_items);
  }
  if (p.assembly_reinforcement.length) {
    await supabase.from("cost_assemblies").update({ reinforcement_item_id: m.loser_id }).eq("org_id", orgId).eq("reinforcement_item_id", m.winner_id).in("id", p.assembly_reinforcement);
  }
  // The retired item comes back with its default vendor, if that price came back with it.
  const { data: back } = p.loser_default
    ? await supabase.from("cost_item_sources").select("id").eq("org_id", orgId).eq("cost_item_id", m.loser_id).eq("id", p.loser_default).maybeSingle()
    : { data: null };
  const { error } = await supabase.from("cost_items").update({ active: true, updated_at: now, ...(back ? { default_source_id: back.id } : {}) })
    .eq("org_id", orgId).eq("id", m.loser_id);
  if (error) return bad(error.message, 500);
  await supabase.from("cost_item_merges").update({ undone_at: now }).eq("org_id", orgId).eq("id", id);
  return applyCookies(NextResponse.json({ ok: true }));
}
