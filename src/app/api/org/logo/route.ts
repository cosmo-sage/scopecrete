import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { BRANDING_BUCKET, LOGO_MAX_BYTES, LOGO_TYPES, isOwner, isVariant, orgRow, orgView } from "@/lib/org-server";

/**
 * The org's logo (migration 056). Two variants: light (dark lettering, for
 * the light themes) and dark (light lettering, Night Shift).
 *
 * POST   { variant, mime, size } → { upload: { path, signed_url } }. The
 *        browser PUTs the bytes straight to the private org-branding bucket
 *        (a Vercel function body is capped at 4.5 MB), then calls
 *        /api/org/logo/done { variant, path }. PNG / WebP are shrunk to 1200px
 *        in the browser first; an SVG is cleaned in done.
 * DELETE ?variant= → { org } — clears the path and removes the file.
 *
 * Owners only — checked here, and again by the storage policies and
 * sc_set_org_logo(). Session client; org from the session.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const body = await req.json().catch(() => ({}));
  if (!isVariant(body?.variant)) return applyCookies(NextResponse.json({ error: "variant must be light or dark" }, { status: 400 }));
  const ext = LOGO_TYPES[String(body?.mime ?? "")];
  if (!ext) return applyCookies(NextResponse.json({ error: "A logo must be a PNG, SVG or WebP." }, { status: 400 }));
  const size = Number(body?.size ?? 0);
  if (!(size > 0) || size > LOGO_MAX_BYTES) return applyCookies(NextResponse.json({ error: "A logo must be under 5 MB." }, { status: 400 }));
  if (!(await isOwner(supabase, orgId, userId))) return applyCookies(NextResponse.json({ error: "Only an owner can change the logo." }, { status: 403 }));
  const path = `${orgId}/logo-${body.variant}-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from(BRANDING_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return applyCookies(NextResponse.json({ error: error?.message ?? "no upload link" }, { status: 500 }));
  return applyCookies(NextResponse.json({ upload: { path: data.path, signed_url: data.signedUrl } }, { status: 201 }));
}

export async function DELETE(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const variant = req.nextUrl.searchParams.get("variant");
  if (!isVariant(variant)) return applyCookies(NextResponse.json({ error: "variant must be light or dark" }, { status: 400 }));
  const before = await orgRow(supabase, orgId);
  const old = (before?.[variant === "light" ? "logo_light_path" : "logo_dark_path"] as string | null) ?? null;
  const { data, error } = await supabase.rpc("sc_set_org_logo", { p_org: orgId, p_variant: variant, p_path: null });
  if (error) {
    const denied = /not allowed/.test(error.message);
    return applyCookies(NextResponse.json({ error: denied ? "Only an owner can change the logo." : error.message }, { status: denied ? 403 : 400 }));
  }
  if (old) await supabase.storage.from(BRANDING_BUCKET).remove([old]);
  return applyCookies(NextResponse.json({ org: orgView(data as Record<string, unknown>) }));
}
