import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { BIDS_MISSING, missing091 } from "@/lib/bids-server";
import { saveBidRequest } from "@/lib/bid-save-server";
import { publicOrigin } from "@/lib/hosts";

/**
 * Bid requests (migration 091; Claude Design, Vendors v2).
 *
 * GET ?job=<id> | ?vendor=<contact id>
 *   → { requests: [{ id, job_id, job_title, price_mode, price_by, pour_date, scopes, created_at,
 *        recipients: [{ id, contact_id, name, channel, url, sent_at, sent_via, opened_at, view_count,
 *                       answered_at, price_total, price_lines, answer_note, revoked_at }] }] }
 *
 * POST { job_id, pick: { scopes, lines?, supplied? }, packet: { files: [ids], quantities, address, dates },
 *        price_mode, price_by?, pour_date?, note?, follow_up?, recipients: [{ contact_id, channel }] }
 *   → { request, recipients: [{ id, contact_id, name, phone, email, channel, url, text, email_parts }] }
 *   The vendor's copy is built here from the job's own budget — shownScopes()
 *   copies names, sizes, quantities and units, never a cost. Every vendor gets
 *   their own link. Nothing is sent from here: the composer then texts each
 *   one through /api/texts (Coy's tap) and opens his mail app for email.
 *   follow_up adds a next step on each vendor, due on the price-by date; their
 *   answer marks it done (sc_answer_bid).
 *   maps: [section ids] — the sections whose takeoffs the browser draws on their
 *   sheet as a picture (as the proposal's link does); the reply carries a signed
 *   upload link for each (`uploads`), and the picture's path is in the
 *   request's assets, so the vendor's link can read it.
 *
 * Session client, org from the session, every id checked against it (§7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REC_COLS = "id, bid_request_id, contact_id, channel, token, sent_at, sent_via, opened_at, view_count, last_viewed_at, answered_at, answer_count, price_total, price_lines, answer_note, revoked_at, created_at";
// Coy's won / lost mark (migration 126); read without it until 126 is applied.
const OUTCOME_COLS = ", outcome, outcome_at";
const noOutcome = (e: { message?: string } | null) => !!e && /outcome/.test(e.message ?? "");
// The vendor's weeks (migration 130).
const AVAIL_COLS = ", availability, availability_at, availability_note";
const noAvail = (e: { message?: string } | null) => !!e && /availability/.test(e.message ?? "");
/** Reads recipients with the newest columns first, dropping 130's then 126's while they aren't there. */
type Read = { data: unknown; error: { message?: string; code?: string } | null };
async function withCols(read: (cols: string) => PromiseLike<Read>): Promise<Read> {
  let r = await read(REC_COLS + OUTCOME_COLS + AVAIL_COLS);
  if (noAvail(r.error)) r = await read(REC_COLS + OUTCOME_COLS);
  if (noOutcome(r.error)) r = await read(REC_COLS);
  return r;
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  const job = req.nextUrl.searchParams.get("job"), vendor = req.nextUrl.searchParams.get("vendor");
  if ((job && !UUID.test(job)) || (vendor && !UUID.test(vendor))) return json({ error: "Not an id." }, 400);
  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);

  let reqIds: string[] | null = null;
  let recs: Array<Record<string, unknown>> = [];
  if (vendor) {
    const byVendor = (cols: string) => supabase.from("bid_request_recipients").select(cols).eq("org_id", orgId).eq("contact_id", vendor).order("created_at", { ascending: false }).limit(100);
    const { data, error } = await withCols(byVendor);
    if (missing091(error)) return json({ requests: [], missing: BIDS_MISSING });
    if (error) return json({ error: error.message }, 500);
    recs = (data ?? []) as unknown as Array<Record<string, unknown>>;
    reqIds = [...new Set(recs.map((r) => r.bid_request_id as string))];
  }
  let q = supabase.from("bid_requests").select("id, job_id, price_mode, price_by, pour_date, scopes, packet, note, created_at, job:jobs(title, address)").eq("org_id", orgId);
  if (job) q = q.eq("job_id", job);
  if (reqIds) q = reqIds.length ? q.in("id", reqIds) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(60);
  if (missing091(error)) return json({ requests: [], missing: BIDS_MISSING });
  if (error) return json({ error: error.message }, 500);
  const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (!vendor && ids.length) {
    const byReq = (cols: string) => supabase.from("bid_request_recipients").select(cols).eq("org_id", orgId).in("bid_request_id", ids);
    const { data } = await withCols(byReq);
    recs = (data ?? []) as unknown as Array<Record<string, unknown>>;
  }
  const cids = [...new Set(recs.map((r) => r.contact_id as string))];
  const { data: people } = cids.length ? await supabase.from("contacts").select("id, name, company_name, phone").eq("org_id", orgId).in("id", cids) : { data: [] };
  const who = new Map(((people ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, (p.name as string | null)?.trim() || (p.company_name as string | null) || (p.phone as string | null) || "Vendor"]));
  const requests = ((rows ?? []) as unknown as Array<Record<string, unknown> & { id: string; job: { title: string | null; address: string | null } | null }>).map((r) => ({
    id: r.id, job_id: r.job_id, job_title: r.job?.title ?? null, job_address: r.job?.address ?? null, price_mode: r.price_mode, price_by: r.price_by, pour_date: r.pour_date,
    scopes: r.scopes, note: r.note, created_at: r.created_at, packet: r.packet, edited_at: ((r.packet as Record<string, unknown> | null)?.edited_at as string | undefined) ?? null,
    recipients: recs.filter((x) => x.bid_request_id === r.id).map(({ token, ...x }) => ({ ...x, name: who.get(x.contact_id as string) ?? "Vendor", url: `${origin}/b/${token}` })),
  }));
  return json({ requests });
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  return saveBidRequest(req, result.session, null);
}
