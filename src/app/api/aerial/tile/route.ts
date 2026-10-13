import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { MAX_ZOOM } from "@/lib/aerial";
import { fetchStreetTile, fetchTile } from "@/lib/aerial-server";
import { fetchGoogleTile } from "@/lib/google-tiles-server";

/**
 * One map tile, fetched here so the Mapbox token never reaches the browser:
 * satellite (p=mapbox | esri) for the aerial and the Map page, or the street
 * map (p=streets) for the Map page's Map view. Any zoom from 2 (the Map page
 * shows the whole metro; only a saved aerial needs 16+, checked where it is
 * saved). p=google-map | google-sat is Google's roadmap or satellite (Map Tiles
 * API, look only — never saved). Signed-in members only; no customer data passes through it.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const q = req.nextUrl.searchParams;
  const raw = q.get("p");
  const p = raw === "mapbox" || raw === "esri" || raw === "streets" || raw === "google-map" || raw === "google-sat" ? raw : null;
  const z = Number(q.get("z")), x = Number(q.get("x")), y = Number(q.get("y"));
  if (!p || !Number.isInteger(z) || z < 2 || z > (p === "streets" || p === "google-map" || p === "google-sat" ? 22 : MAX_ZOOM[p]) || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return applyCookies(NextResponse.json({ error: "Which tile?" }, { status: 400 }));
  }
  if (p === "google-map" || p === "google-sat") {
    const t = await fetchGoogleTile(p === "google-sat" ? "satellite" : "roadmap", z, x, y);
    if (!t) return applyCookies(new NextResponse(null, { status: 404 }));
    return applyCookies(new NextResponse(Buffer.from(t.bytes), { headers: { "Content-Type": t.type, "Cache-Control": t.cache } }));
  }
  if (p === "streets") {
    const t = await fetchStreetTile(z, x, y);
    if (!t) return applyCookies(new NextResponse(null, { status: 404 }));
    return applyCookies(new NextResponse(Buffer.from(t.bytes), { headers: { "Content-Type": t.type, "Cache-Control": "private, max-age=86400" } }));
  }
  const b = await fetchTile(p, z, x, y);
  if (!b) return applyCookies(new NextResponse(null, { status: 404 }));
  return applyCookies(new NextResponse(Buffer.from(b), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  }));
}
