import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/aerial";
import { fetchTile } from "@/lib/aerial-server";

/**
 * One satellite tile for the aerial picker (src/lib/aerial.ts), fetched here so
 * the Mapbox token never reaches the browser. Signed-in members only; no
 * customer data passes through it.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const q = req.nextUrl.searchParams;
  const p = q.get("p") === "mapbox" ? "mapbox" : q.get("p") === "esri" ? "esri" : null;
  const z = Number(q.get("z")), x = Number(q.get("x")), y = Number(q.get("y"));
  if (!p || !Number.isInteger(z) || z < MIN_ZOOM || z > MAX_ZOOM[p] || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return applyCookies(NextResponse.json({ error: "Which tile?" }, { status: 400 }));
  }
  const b = await fetchTile(p, z, x, y);
  if (!b) return applyCookies(new NextResponse(null, { status: 404 }));
  return applyCookies(new NextResponse(Buffer.from(b), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  }));
}
