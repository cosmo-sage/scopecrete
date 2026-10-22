import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getApiSession } from "@/lib/api-auth";
import { newToken } from "@/lib/proposal-links";
import { publicOrigin } from "@/lib/hosts";

/**
 * A customer's portal link (migration 123): their own page at /c/<token>,
 * proposals sent to them and the bid requests they send.
 * GET   → { supported, link: { id, url, created_at, view_count, last_viewed_at } | null, requests }
 * POST  → the live link, made if there is none (one live link per customer).
 * PATCH { revoke: true } → the link turned off (a new one can be made after).
 * Session client; org from the session; members insert and may set only revoked_at.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (m: string | undefined) => /customer_portals|portal_requests/.test(m ?? "") && /does not exist|schema cache|not find/i.test(m ?? "");

export async function GET(req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await ctx.params;
  if (!UUID.test(customerId)) return NextResponse.json({ error: "Not a customer id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  const { data, error } = await sb.from("customer_portals").select("id, token, created_at, view_count, last_viewed_at")
    .eq("org_id", orgId).eq("customer_id", customerId).is("revoked_at", null).maybeSingle();
  if (error) return missing(error.message) ? json({ supported: false, link: null, requests: 0 }) : json({ error: error.message }, 500);
  const { count } = await sb.from("portal_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("customer_id", customerId);
  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);
  return json({
    supported: true, requests: count ?? 0,
    link: data ? { id: data.id, url: `${origin}/c/${data.token}`, created_at: data.created_at, view_count: data.view_count, last_viewed_at: data.last_viewed_at } : null,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await ctx.params;
  if (!UUID.test(customerId)) return NextResponse.json({ error: "Not a customer id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, userId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  const { data: c } = await sb.from("customers").select("id").eq("org_id", orgId).eq("id", customerId).maybeSingle();
  if (!c) return json({ error: "Customer not found." }, 404);
  const { data: live, error: lErr } = await sb.from("customer_portals").select("id, token").eq("org_id", orgId).eq("customer_id", customerId).is("revoked_at", null).maybeSingle();
  if (lErr) return json({ error: missing(lErr.message) ? "The portal waits for migration 123." : lErr.message }, missing(lErr.message) ? 409 : 500);
  let row = live;
  if (!row) {
    const { data, error } = await sb.from("customer_portals").insert({ org_id: orgId, customer_id: customerId, token: newToken(randomBytes(24)), created_by: userId })
      .select("id, token").single();
    if (error) return json({ error: error.message }, 500);
    row = data;
  }
  return json({ id: row.id, url: `${publicOrigin(req.headers.get("host"), req.nextUrl.origin)}/c/${row.token}` });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await ctx.params;
  if (!UUID.test(customerId)) return NextResponse.json({ error: "Not a customer id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  const b = (await req.json().catch(() => null)) as { revoke?: unknown } | null;
  if (b?.revoke !== true) return json({ error: "Nothing to change." }, 400);
  const { error } = await sb.from("customer_portals").update({ revoked_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("customer_id", customerId).is("revoked_at", null);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
