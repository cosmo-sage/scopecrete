import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getReaderClient } from "@/lib/api-auth";
import { FILES_BUCKET } from "@/lib/files";
import type { LinkAssets } from "@/lib/proposal-links";

/**
 * The customer's proposal, by link (migration 075) — the one route a stranger
 * may call. No session needed and no service role: the request's own client
 * (anon when signed out) calls sc_shared_proposal(), which returns only the
 * frozen version behind a live link and logs the view (not when the reader is
 * in the org). The pictures it lists are signed by that same client; the anon
 * storage policy lets through only paths a live link lists. Nothing else of the
 * org's is reachable from here.
 */

export const dynamic = "force-dynamic";
const BRANDING = "org-branding";
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipHash = ip ? createHash("sha256").update(`${ip}|${token}`).digest("hex").slice(0, 16) : null;
  const { data, error } = await supabase.rpc("sc_shared_proposal", { p_token: token, p_ip_hash: ipHash, p_ua: req.headers.get("user-agent") });
  if (error) return json({ error: "Couldn't open the proposal." }, 500);
  const r = data as null | { gone: boolean; own?: boolean; org_name: string | null; version?: number; shown?: unknown; assets?: LinkAssets; sent_at?: string | null };
  if (!r) return json({ error: "This link isn't right." }, 404);
  if (r.gone) return json({ gone: true, org_name: r.org_name });

  const a = r.assets ?? { paths: [] };
  const sign = async (bucket: string, paths: string[]) => {
    if (!paths.length) return new Map<string, string>();
    const { data: s } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
    return new Map((s ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl as string]));
  };
  const logos = await sign(BRANDING, [a.logo, a.logo_dark].filter((x): x is string => !!x));
  const fileUrls = await sign(FILES_BUCKET, [a.cover, ...Object.values(a.maps ?? {}), ...Object.values(a.photos ?? {}).flat()].filter((x): x is string => !!x));
  const urls = {
    logo: (a.logo && logos.get(a.logo)) ?? null,
    logo_dark: (a.logo_dark && logos.get(a.logo_dark)) ?? null,
    cover: (a.cover && fileUrls.get(a.cover)) ?? null,
    maps: Object.fromEntries(Object.entries(a.maps ?? {}).map(([k, p]) => [k, fileUrls.get(p) ?? null]).filter(([, u]) => u)),
    photos: Object.fromEntries(Object.entries(a.photos ?? {}).map(([k, ps]) => [k, ps.map((p) => fileUrls.get(p)).filter(Boolean)])),
  };
  return json({ gone: false, own: !!r.own, org_name: r.org_name, version: r.version, shown: r.shown, urls });
}
