import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { missing084, readAdmin } from "@/lib/roadmap";

/**
 * One roadmap item (migration 084).
 * PATCH { vote: boolean }                  → { votes } — yours, on an item open for votes.
 * PATCH { status?, title?, body?, note? }  → { ok } — Coy only (the function checks).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!UUID.test(id)) return bad("Not an item", 404);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (b && typeof b.vote === "boolean") {
    const { data, error } = await supabase.rpc("sc_roadmap_vote", { p_item: id, p_on: b.vote });
    if (error) return bad(missing084(error) ? "The roadmap isn't switched on yet (migration 084)." : error.message, missing084(error) ? 503 : 400);
    return applyCookies(NextResponse.json({ votes: data }));
  }
  const a = readAdmin(b);
  if (!Object.keys(a).length) return bad("Nothing to change");
  const { error } = await supabase.rpc("sc_roadmap_admin", { p_item: id, p_status: a.status ?? null, p_title: a.title ?? null,
    p_body: a.body ?? null, p_note: a.note ?? null });
  if (error) return bad(error.message, /only the platform admin/.test(error.message) ? 403 : 400);
  return applyCookies(NextResponse.json({ ok: true }));
}
