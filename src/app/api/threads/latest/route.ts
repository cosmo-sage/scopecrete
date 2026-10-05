import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * The cheapest "has anything changed?" there is, for an open Threads screen
 * (src/lib/v34/live-threads.ts). Two one-row reads: the newest message to land
 * and the newest filing Dusty made. The screen compares the stamp with the one
 * it last saw and refetches its list only when it moved — /api/threads itself
 * reads up to 4,000 messages, too much to poll.
 *
 * Realtime (migration 082) makes this instant; this is the fallback that works
 * without it, and catches anything a dropped socket missed.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const [msg, filed] = await Promise.all([
    supabase.from("messages").select("id, created_at").eq("org_id", orgId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("contacts").select("auto_classified_at").eq("org_id", orgId)
      .not("auto_classified_at", "is", null)
      .order("auto_classified_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (msg.error) return applyCookies(NextResponse.json({ error: msg.error.message }, { status: 500 }));

  const stamp = `${msg.data?.id ?? ""}|${filed.data?.auto_classified_at ?? ""}`;
  return applyCookies(NextResponse.json({ stamp, latest_at: msg.data?.created_at ?? null }));
}
