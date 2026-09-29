import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Your Dusty conversations (migration 043), newest first — the history rail.
 * RLS shows only your own. `?about=kind:id` puts the ones about the screen
 * you have open first.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("dusty_conversations")
    .select("id, title, context_kind, context_id, context_label, created_at, updated_at")
    .eq("org_id", orgId).order("updated_at", { ascending: false }).limit(200);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ conversations: data ?? [] }));
}
