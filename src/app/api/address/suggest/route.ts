import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { addressCheckOn, suggestAddressParts } from "@/lib/address-server";

/**
 * Address suggestions as Coy types a street (the customer's Edit form): up to
 * six real addresses from Mapbox, each split into street, city, state and zip
 * with its point, so a pick fills the whole address correctly spelled.
 *
 * GET ?q=&lat=&lng=  → { on, suggestions: AddressMatch[] }
 *
 * Signed-in members only; MAPBOX_TOKEN stays on the server; nothing stored.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const s = req.nextUrl.searchParams;
  const lat = Number(s.get("lat")), lng = Number(s.get("lng"));
  const near = s.get("lat") && s.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  const suggestions = await suggestAddressParts(s.get("q") ?? "", near);
  return applyCookies(NextResponse.json({ on: addressCheckOn(), suggestions }));
}
