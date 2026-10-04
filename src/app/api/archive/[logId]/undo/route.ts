import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { undoArchive } from "@/lib/archive-server";

/** Undo one archive or delete tap (migration 066). Session client, org from the session. */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ logId: string }> }) {
  const { logId } = await ctx.params;
  if (!UUID.test(logId)) return NextResponse.json({ error: "Not an undo id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const r = await undoArchive(sb, orgId, logId);
  return applyCookies(NextResponse.json(r, { status: r.ok ? 200 : 404 }));
}
