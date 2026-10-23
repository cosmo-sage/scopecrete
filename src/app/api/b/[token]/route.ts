import { NextRequest, NextResponse } from "next/server";
import { cleanRequirements } from "@/lib/bids";
import { getReaderClient } from "@/lib/api-auth";
import { FILES_BUCKET } from "@/lib/files";

/**
 * A vendor's bid link (migration 091) — scopecrete.ai/b/<token>, no login.
 * No service role: the request's own client (anon when signed out) calls the
 * two SECURITY DEFINER doors.
 * GET  → the vendor's copy (scopes, their measurements and quantities, never a cost), each
 *        section's takeoff map, the packet's
 *        files signed for an hour (the anon storage policy lets through only
 *        paths a live link lists), their answer if they sent one. Logs the
 *        opening unless the reader is in the org.
 * POST { total?, lines?: [{ key, name, unit, qty, price }], note? } → their price
 *        (sc_answer_bid checks it all again).
 */

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

interface Shared {
  gone: boolean; own?: boolean; org_name: string | null; job_title?: string | null; first_name?: string | null;
  price_mode?: string; price_by?: string | null; pour_date?: string | null; scopes?: unknown; note?: string | null;
  packet?: { address?: string | null; access?: string | null; dates?: boolean; quantities?: boolean; files?: Array<{ id: string; name: string; kind: string; path: string; section?: string | null }>; maps?: Record<string, string>; requirements?: unknown; edited_at?: unknown };
  rates?: Record<string, number> | null; answer?: unknown;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const { data, error } = await supabase.rpc("sc_shared_bid", { p_token: token });
  if (error) return json({ error: "Couldn't open the bid request." }, 500);
  const r = data as Shared | null;
  if (!r) return json({ error: "This link isn't right." }, 404);
  if (r.gone) return json({ gone: true, org_name: r.org_name });
  const files = r.packet?.files ?? [];
  // Each section's takeoffs drawn on its sheet, frozen as a picture when it was sent.
  const maps = Object.entries(r.packet?.maps ?? {}).filter(([, p]) => typeof p === "string");
  const paths = [...files.map((f) => f.path), ...maps.map(([, p]) => p)];
  const { data: signed } = paths.length ? await supabase.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl as string]));
  // Opened by someone in the org (Coy, 2026-10-23: "I want to see it on the document itself from my
  // login"): how often the vendor has opened it, read under the session's RLS (members read their
  // org's recipients); never shown to the vendor.
  let opens: { name: string | null; view_count: number; opened_at: string | null; last_viewed_at: string | null; answered_at: string | null; revoked_at: string | null } | null = null;
  if (r.own) {
    const { data: o } = await supabase.from("bid_request_recipients")
      .select("view_count, opened_at, last_viewed_at, answered_at, revoked_at, vendor:contacts(name)").eq("token", token).maybeSingle();
    if (o) {
      const v = o as unknown as { view_count: number; opened_at: string | null; last_viewed_at: string | null; answered_at: string | null; revoked_at: string | null; vendor: { name: string | null } | null };
      opens = { name: v.vendor?.name ?? null, view_count: v.view_count ?? 0, opened_at: v.opened_at, last_viewed_at: v.last_viewed_at, answered_at: v.answered_at, revoked_at: v.revoked_at };
    }
  }
  return json({
    gone: false, own: !!r.own, opens, org_name: r.org_name, job_title: r.job_title ?? null, first_name: r.first_name ?? null,
    price_mode: r.price_mode, price_by: r.packet?.dates === false ? null : r.price_by ?? null, pour_date: r.packet?.dates === false ? null : r.pour_date ?? null,
    scopes: r.scopes ?? [], note: r.note ?? null, address: r.packet?.address ?? null, requirements: cleanRequirements(r.packet?.requirements),
    // An older request carried the sections' Notes as "access"; those are Coy's own and no longer shown.
    access: null,
    files: files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, section: f.section ?? null, url: url.get(f.path) ?? null })).filter((f) => f.url),
    maps: Object.fromEntries(maps.map(([k, p]) => [k, url.get(p) ?? null]).filter(([, u]) => u)),
    rates: r.rates ?? {}, answer: r.answer ?? null,
    edited_at: typeof r.packet?.edited_at === "string" ? r.packet.edited_at : null,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const b = (await req.json().catch(() => null)) as { total?: unknown; lines?: unknown; note?: unknown } | null;
  if (!b) return json({ error: "Send a price." }, 400);
  const total = typeof b.total === "number" && Number.isFinite(b.total) ? Math.round(b.total * 100) / 100 : null;
  const lines = Array.isArray(b.lines) ? (b.lines as Array<Record<string, unknown>>).slice(0, 200)
    .filter((l) => typeof l.price === "number" && Number.isFinite(l.price))
    .map((l) => ({ key: String(l.key ?? "").slice(0, 80), name: String(l.name ?? "").slice(0, 200), unit: l.unit ? String(l.unit).slice(0, 20) : null,
      qty: typeof l.qty === "number" && Number.isFinite(l.qty) ? l.qty : null, price: Math.round((l.price as number) * 10000) / 10000 })) : [];
  const note = typeof b.note === "string" ? b.note.slice(0, 2000) : null;
  const { error } = await supabase.rpc("sc_answer_bid", { p_token: token, p_total: total, p_lines: lines, p_note: note });
  if (error) {
    const m = (error.message ?? "").replace(/^.*?:\s*/, "");
    return json({ error: /bid|price|total|note|link|answered|own/.test(error.message ?? "") ? error.message : `Couldn't send your price${m ? ` (${m})` : ""}.` }, 400);
  }
  return json({ ok: true });
}
