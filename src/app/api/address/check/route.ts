import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { addressCheckOn, matchAddress } from "@/lib/address-server";
import { sureMatch } from "@/lib/address-check";

/**
 * One address checked against the map (Mapbox Geocoding v6) — used when Coy
 * applies a Dusty plan that sets an address: the map's spelling is used only
 * when the house number and street match for sure (`sureMatch()`).
 *
 * GET ?q=  → { on, match: AddressMatch | null, sure }
 *
 * Signed-in members only; MAPBOX_TOKEN stays on the server; nothing stored.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  const match = q.length >= 4 ? await matchAddress(q) : null;
  return applyCookies(NextResponse.json({ on: addressCheckOn(), match, sure: sureMatch(q, match) }));
}
