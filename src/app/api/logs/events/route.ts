import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { loadEvents, loadLines } from "@/lib/lines-server";

/**
 * Logs' event table (Claude Design package 9, `Lines.dc.html` C): every
 * provider event of the last 7 days — which line it came through, the
 * provider, the event, who and what, how long it took to reach the app, and
 * whether it did (ok · failed · pending · late). The page filters by line,
 * provider and kind. Session client; quo_events is org-scoped by RLS.
 *
 * GET → { lines: [{ id, label, phone_e164, color, provider }], events: EventRow[] }
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const lines = await loadLines(supabase, orgId);
  const events = await loadEvents(supabase, orgId, lines, 7);
  return applyCookies(NextResponse.json({
    lines: lines.map((l) => ({ id: l.id, label: l.label, phone_e164: l.phone_e164, color: l.color, provider: l.provider })),
    events,
  }));
}
