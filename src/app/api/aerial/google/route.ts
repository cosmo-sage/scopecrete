import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { WIN_H, WIN_W, validCenter } from "@/lib/aerial";
import { googleStaticUrl } from "@/lib/aerial-server";

/**
 * Google's satellite view of the same window, for a look only. Google's terms
 * don't allow storing or tracing its imagery, so it is never saved, never a
 * sheet, and not cached here.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const q = req.nextUrl.searchParams;
  const c = validCenter(q.get("lat"), q.get("lng"), q.get("z"), "google");
  if (!c) return applyCookies(NextResponse.json({ error: "Where?" }, { status: 400 }));
  const url = googleStaticUrl(c.lat, c.lng, c.z, WIN_W, WIN_H);
  if (!url) return applyCookies(NextResponse.json({ error: "Google isn't set up." }, { status: 503 }));
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return applyCookies(NextResponse.json({ error: `Google answered ${r.status}` }, { status: 502 }));
    return applyCookies(new NextResponse(Buffer.from(await r.arrayBuffer()), {
      headers: { "Content-Type": r.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "no-store" },
    }));
  } catch {
    return applyCookies(NextResponse.json({ error: "Google didn't answer." }, { status: 502 }));
  }
}
