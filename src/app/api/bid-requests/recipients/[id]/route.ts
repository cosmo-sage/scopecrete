import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { BIDS_MISSING, missing091 } from "@/lib/bids-server";
import { bidEmail, bidText, type ShownScope } from "@/lib/bids";
import { publicOrigin } from "@/lib/hosts";
import { orgRow } from "@/lib/org-server";

/**
 * One vendor's bid link (migration 091).
 * PATCH { sent: "text" | "email" } → marks it sent that way (after Coy's tap
 *        sent the text through Quo, or opened his mail app).
 * PATCH { revoke: true }          → turns the link off; the page then says so.
 * GET                             → what a resend needs (Coy, 2026-10-09: "resend a bid
 *        request or check on the status … from the summary page"): their phone and
 *        email, the same words and link the first send used (bidText / bidEmail),
 *        and whether a text carrying their link has come back from Quo as
 *        delivered — the texts in their thread with /b/<token> in them.
 * Members may write only these columns (column grants); the answer is the
 * vendor's alone. Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  if (!UUID.test(id)) return json({ error: "No such link." }, 404);
  const { data: rec, error } = await supabase.from("bid_request_recipients")
    .select("id, contact_id, token, sent_at, sent_via, revoked_at, request:bid_requests(scopes, packet, price_by, pour_date, job:jobs(title))")
    .eq("org_id", orgId).eq("id", id).maybeSingle();
  if (missing091(error)) return json({ error: BIDS_MISSING }, 503);
  if (error) return json({ error: error.message }, 500);
  if (!rec) return json({ error: "No such link." }, 404);
  const r = rec as unknown as {
    id: string; contact_id: string; token: string; revoked_at: string | null;
    request: { scopes: ShownScope[] | null; packet: { address?: string | null; dates?: boolean } | null; price_by: string | null; pour_date: string | null; job: { title: string | null } | null } | null;
  };
  const [{ data: c }, org, { data: texts }] = await Promise.all([
    supabase.from("contacts").select("name, company_name, phone, email").eq("org_id", orgId).eq("id", r.contact_id).maybeSingle(),
    orgRow(supabase, orgId),
    supabase.from("messages").select("to_address, status, occurred_at").eq("org_id", orgId).eq("contact_id", r.contact_id)
      .eq("channel", "sms").eq("direction", "outbound").like("body_text", `%/b/${r.token}%`).order("occurred_at", { ascending: false }).limit(5),
  ]);
  const name = ((c?.name as string | null) ?? "").trim() || (c?.company_name as string | null) || null;
  const scopes = r.request?.scopes ?? [];
  const sizes = scopes.map((s) => s.size).filter(Boolean);
  const packet = r.request?.packet ?? {};
  const dates = packet.dates !== false;
  const words = {
    name, org: ((org?.name as string | undefined) ?? null), job: r.request?.job?.title ?? null, scopes: scopes.map((s) => s.title),
    size: sizes.length === 1 ? sizes[0] : null, street: packet.address ? packet.address.split(",")[0].trim() : null,
    pour: dates ? r.request?.pour_date ?? null : null, priceBy: dates ? r.request?.price_by ?? null : null,
    url: `${publicOrigin(req.headers.get("host"), req.nextUrl.origin)}/b/${r.token}`,
  };
  const last = ((texts ?? []) as Array<{ to_address: string | null; status: string | null; occurred_at: string }>)[0] ?? null;
  return json({
    id: r.id, phone: (c?.phone as string | null) ?? null, email: (c?.email as string | null) ?? null, url: words.url,
    text: bidText(words), email_parts: bidEmail(words),
    delivered: last ? { to: last.to_address, at: last.occurred_at, status: last.status } : null,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));
  if (!UUID.test(id)) return fail("No such link.", 404);
  const b = (await req.json().catch(() => ({}))) as { sent?: unknown; revoke?: unknown };
  const { data: row, error } = await supabase.from("bid_request_recipients").select("id, sent_at, sent_via").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (missing091(error)) return fail(BIDS_MISSING, 503);
  if (!row) return fail("No such link.", 404);
  let patch: Record<string, unknown>;
  if (b.revoke === true) patch = { revoked_at: new Date().toISOString() };
  else if (b.sent === "text" || b.sent === "email") {
    const via = [...new Set([...((row.sent_via as string[] | null) ?? []), b.sent])];
    patch = { sent_at: (row.sent_at as string | null) ?? new Date().toISOString(), sent_via: via };
  } else return fail("Say sent or revoke.");
  const { error: uErr } = await supabase.from("bid_request_recipients").update(patch).eq("org_id", orgId).eq("id", id);
  if (uErr) return fail(uErr.message, 500);
  return applyCookies(NextResponse.json({ ok: true, ...patch }));
}
