import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getReaderClient } from "@/lib/api-auth";
import { FILES_BUCKET } from "@/lib/files";
import { SIGN_CONSENT, type LinkAssets } from "@/lib/proposal-links";

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
  const r = data as null | { gone: boolean; own?: boolean; org_name: string | null; version?: number; shown?: unknown; assets?: LinkAssets; sent_at?: string | null;
    signature?: { name: string | null; at: string | null; image: string | null; total: number | null; number: string | null } | null };
  if (!r) return json({ error: "This link isn't right." }, 404);
  if (r.gone) return json({ gone: true, org_name: r.org_name });

  const a = r.assets ?? { paths: [] };
  const sign = async (bucket: string, paths: string[]) => {
    if (!paths.length) return new Map<string, string>();
    const { data: s } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
    return new Map((s ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl as string]));
  };
  const logos = await sign(BRANDING, [a.logo, a.logo_dark].filter((x): x is string => !!x));
  const fileUrls = await sign(FILES_BUCKET, [a.cover, ...Object.values(a.maps ?? {}), ...Object.values(a.photos ?? {}).flat(), ...Object.values(a.files ?? {})].filter((x): x is string => !!x));
  const urls = {
    logo: (a.logo && logos.get(a.logo)) ?? null,
    logo_dark: (a.logo_dark && logos.get(a.logo_dark)) ?? null,
    cover: (a.cover && fileUrls.get(a.cover)) ?? null,
    maps: Object.fromEntries(Object.entries(a.maps ?? {}).map(([k, p]) => [k, fileUrls.get(p) ?? null]).filter(([, u]) => u)),
    photos: Object.fromEntries(Object.entries(a.photos ?? {}).map(([k, ps]) => [k, ps.map((p) => fileUrls.get(p)).filter(Boolean)])),
    // The photos and PDFs on the owner's own pages, by file id; the name is the stored file's last part.
    files: Object.fromEntries(Object.entries(a.files ?? {}).map(([k, p]) => [k, { url: fileUrls.get(p) ?? null, name: p.split("/").pop() ?? "" }]).filter(([, f]) => (f as { url: string | null }).url)),
  };
  // `signature` is undefined until migration 097 is applied — then signing is off on the page.
  return json({ gone: false, own: !!r.own, org_name: r.org_name, version: r.version, shown: r.shown, urls,
    signature: r.signature ?? null, can_sign: r.signature !== undefined });
}

/**
 * Approve and sign (migration 097): the customer's name, the signature they drew (a PNG data URL)
 * their agreement to sign electronically and the add-ons they ticked (099), through sc_sign_proposal() — the second thing a
 * stranger may run. It checks the link, refuses a member of the org, and wins the job. No session,
 * no service role.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; signature?: unknown; agree?: unknown; addons?: unknown };
  // The add-ons they ticked (099) — ids from their copy; the database checks each one.
  const addons = Array.isArray(b.addons) ? [...new Set(b.addons.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 80))] : [];
  if (addons.length > 50) return json({ error: "Too many add-ons picked." }, 400);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 200) : "";
  const signature = typeof b.signature === "string" ? b.signature : "";
  if (name.length < 2) return json({ error: "Type your full name." }, 400);
  if (!signature.startsWith("data:image/png;base64,") || signature.length > 300_000) return json({ error: "Draw your signature in the box." }, 400);
  if (b.agree !== true) return json({ error: "Tick the box to agree to sign electronically." }, 400);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipHash = ip ? createHash("sha256").update(`${ip}|${token}`).digest("hex").slice(0, 16) : null;
  const args = { p_token: token, p_name: name, p_signature: signature, p_consent: SIGN_CONSENT, p_ip_hash: ipHash, p_ua: req.headers.get("user-agent") };
  const missing = (e: { message: string } | null, fn: string) => !!e && e.message.includes(fn) && /(does not exist|could not find|schema cache)/i.test(e.message);
  let { data, error } = await supabase.rpc("sc_sign_proposal", { ...args, p_addons: addons });
  if (missing(error, "sc_sign_proposal")) {
    // Before migration 099 add-ons can't be recorded, so only a signature without them goes through.
    if (addons.length) return json({ error: "Signing with add-ons isn't switched on yet — untick them to sign, or reply to your contractor with the ones you want." }, 503);
    ({ data, error } = await supabase.rpc("sc_accept_proposal", args));
  }
  if (error) {
    if (missing(error, "sc_accept_proposal")) {
      return json({ error: "Signing online isn't switched on yet — reply to your contractor to accept." }, 503);
    }
    // The function's own refusals are written for the customer (22023 / 42501).
    const mine = error.code === "22023" || error.code === "42501";
    return json({ error: mine ? error.message : "Couldn't save your signature. Try again." }, mine ? 400 : 500);
  }
  return json(data);
}
