import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { googleCopyright, googleTilesStatus } from "@/lib/google-tiles-server";

/**
 * GET → { google: { on, why? } } — whether Google's map tiles work, so the Map
 * page and Settings → Maps can fall back to Mapbox and say why.
 * GET ?copyright=1&type=roadmap|satellite&z&n&s&e&w → { copyright } for the
 * map's corner. Signed-in members only; no customer data.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const q = req.nextUrl.searchParams;
  if (q.get("copyright")) {
    const n = Number(q.get("n")), s = Number(q.get("s")), e = Number(q.get("e")), w = Number(q.get("w")), z = Math.round(Number(q.get("z")));
    if (![n, s, e, w, z].every(Number.isFinite) || z < 0 || z > 22) return applyCookies(NextResponse.json({ copyright: null }));
    const c = await googleCopyright(q.get("type") === "satellite" ? "satellite" : "roadmap", z, { n, s, e, w });
    return applyCookies(NextResponse.json({ copyright: c }));
  }
  return applyCookies(NextResponse.json({ google: await googleTilesStatus() }));
}
