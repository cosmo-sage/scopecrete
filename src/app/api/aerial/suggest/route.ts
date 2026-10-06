import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { aerialProviders, findAddress, resolveSuggestion, suggestAddresses } from "@/lib/aerial-server";

/**
 * Address suggestions while Coy types in the aerial picker (src/lib/aerial.ts).
 *
 * GET ?q=&lat=&lng=   — up to six suggestions, nearest the map first.
 * GET ?text=&key=     — the point of an Esri suggestion he picked.
 * GET ?find=           — the point of an address (a customer page's Satellite),
 *                        and the satellite provider to draw it with.
 *
 * Signed-in members only; keys stay on the server; nothing stored.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const s = req.nextUrl.searchParams;
  const find = s.get("find");
  if (find) {
    const found = await findAddress(find);
    return applyCookies(NextResponse.json({ found, provider: aerialProviders().mapbox.on ? "mapbox" : "esri" }));
  }
  const key = s.get("key");
  if (key) {
    const found = await resolveSuggestion(s.get("text") ?? "", key);
    return applyCookies(NextResponse.json({ found }));
  }
  const lat = Number(s.get("lat")), lng = Number(s.get("lng"));
  const near = s.get("lat") && s.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;
  const suggestions = await suggestAddresses(s.get("q") ?? "", near);
  return applyCookies(NextResponse.json({ suggestions }));
}
