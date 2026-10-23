import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { saveBidRequest } from "@/lib/bid-save-server";

/**
 * PATCH /api/bid-requests/[id] — edit a sent bid request (migration 124).
 * The same body as POST /api/bid-requests (its job is kept; recipients may add
 * vendors). Every vendor keeps their link. Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  if (!UUID.test(id)) return result.session.applyCookies(NextResponse.json({ error: "Not an id." }, { status: 400 }));
  return saveBidRequest(req, result.session, id);
}
