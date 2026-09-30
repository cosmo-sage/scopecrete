import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { BRANDING_BUCKET, isVariant, orgRow } from "@/lib/org-server";

/**
 * The org's logo as an image: a redirect to a short-lived signed link in the
 * private org-branding bucket, so <img src="/api/org/logo/light"> works and
 * the bucket stays private. 404 when that variant has none (the header then
 * falls back to the other, or to the scopecrete.ai wordmark).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ variant: string }> }) {
  const { variant } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!isVariant(variant)) return applyCookies(NextResponse.json({ error: "variant must be light or dark" }, { status: 400 }));
  const row = await orgRow(supabase, orgId);
  const path = (row?.[variant === "light" ? "logo_light_path" : "logo_dark_path"] as string | null) ?? null;
  if (!path) return applyCookies(NextResponse.json({ error: "No logo." }, { status: 404 }));
  const { data } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return applyCookies(NextResponse.json({ error: "Could not sign the logo." }, { status: 500 }));
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, max-age=300");
  return applyCookies(res);
}
