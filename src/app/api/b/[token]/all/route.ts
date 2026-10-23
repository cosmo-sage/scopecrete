import { NextRequest, NextResponse } from "next/server";
import { getReaderClient } from "@/lib/api-auth";

/**
 * A vendor's portal (migration 126) — scopecrete.ai/b/<token>/all, no login. Any live bid link of
 * theirs opens every bid request the org sent them: open ones, the ones they won and the ones they
 * didn't. No service role: the request's own client calls sc_vendor_portal (SECURITY DEFINER,
 * anon may run it), which returns only that vendor's rows — never a cost or another vendor's price.
 */

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const { data, error } = await supabase.rpc("sc_vendor_portal", { p_token: token });
  if (error) {
    if (/sc_vendor_portal/.test(error.message ?? "") && /does not exist|not find/i.test(error.message ?? "")) return json({ error: "This page isn't switched on yet." }, 503);
    return json({ error: "Couldn't open your bid requests." }, 500);
  }
  if (!data) return json({ error: "This link isn't right." }, 404);
  return json(data);
}
