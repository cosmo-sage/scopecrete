import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanIds, type ArchiveKind } from "@/lib/archive";
import { restoreRecords } from "@/lib/archive-server";

/**
 * Restore from an Archived list (migration 066): POST { kind, ids }. A customer
 * brings back the people and jobs deleted with it. Session client, org from the session.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, userId, applyCookies } = result.session;
  const b = (await req.json().catch(() => ({}))) as { kind?: unknown; ids?: unknown };
  const kind = b.kind as ArchiveKind;
  if (!["contact", "customer", "job"].includes(kind)) return applyCookies(NextResponse.json({ error: "Restore what?" }, { status: 400 }));
  const ids = cleanIds(b.ids);
  if (!ids) return applyCookies(NextResponse.json({ error: "Which ones?" }, { status: 400 }));
  try { return applyCookies(NextResponse.json({ restored: await restoreRecords(sb, orgId, userId, kind, ids) })); }
  catch (e) { return applyCookies(NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })); }
}
