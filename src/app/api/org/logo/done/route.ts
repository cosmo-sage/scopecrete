import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { BRANDING_BUCKET, isVariant, orgRow, orgView } from "@/lib/org-server";
import { cleanSvg } from "@/lib/svg-clean";

/**
 * The logo's bytes arrived in storage: check they are there, clean an SVG
 * (scripts, handlers, outside references — src/lib/svg-clean.ts), then point
 * the org at it with sc_set_org_logo(), which accepts only a path in this
 * org's own folder. The file it replaces is removed.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const body = await req.json().catch(() => ({}));
  const variant = body?.variant;
  const path = typeof body?.path === "string" ? body.path : "";
  if (!isVariant(variant)) return applyCookies(NextResponse.json({ error: "variant must be light or dark" }, { status: 400 }));
  if (!path.startsWith(`${orgId}/logo-${variant}-`) || path.includes("..")) {
    return applyCookies(NextResponse.json({ error: "That file is not this organisation's." }, { status: 400 }));
  }
  const bucket = supabase.storage.from(BRANDING_BUCKET);
  const { data: blob, error: dlErr } = await bucket.download(path);
  if (dlErr || !blob) return applyCookies(NextResponse.json({ error: "The upload never arrived — try again." }, { status: 409 }));

  if (path.endsWith(".svg")) {
    const clean = cleanSvg(await blob.text());
    if (!clean) {
      await bucket.remove([path]);
      return applyCookies(NextResponse.json({ error: "That file isn't an SVG image." }, { status: 400 }));
    }
    const { error: upErr } = await bucket.update(path, new Blob([clean], { type: "image/svg+xml" }), { contentType: "image/svg+xml", upsert: true });
    if (upErr) return applyCookies(NextResponse.json({ error: `could not clean the SVG: ${upErr.message}` }, { status: 500 }));
  }

  const before = await orgRow(supabase, orgId);
  const old = (before?.[variant === "light" ? "logo_light_path" : "logo_dark_path"] as string | null) ?? null;
  const { data, error } = await supabase.rpc("sc_set_org_logo", { p_org: orgId, p_variant: variant, p_path: path });
  if (error) {
    await bucket.remove([path]);
    const denied = /not allowed/.test(error.message);
    return applyCookies(NextResponse.json({ error: denied ? "Only an owner can change the logo." : error.message }, { status: denied ? 403 : 400 }));
  }
  if (old && old !== path) await bucket.remove([old]);
  return applyCookies(NextResponse.json({ org: orgView(data as Record<string, unknown>) }));
}
