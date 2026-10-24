import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import {
  bidMessageAlert, bidOpenAlert, emailAlert, isFiledSpam, messageAlert, mergeAlerts, who, LIVE_MAX_MS,
  type Alert, type BidMessageRow, type BidOpenRow, type ContactRow, type EmailRow, type LiveCall, type MessageRow,
} from "@/lib/alerts";

/**
 * Incoming alerts (Coy, 2026-10-06) — what came in since `since`: texts and
 * calls from people (spam left out), forwarded emails, a vendor opening a bid
 * request's link (2026-10-23) or writing on its chat (130), and any call happening now (live_calls, migration 086). The bell and the pop-ups read this
 * (src/components/v34/incoming-alerts.tsx).
 *
 * Small on purpose: at most 30 messages and 15 emails newer than `since`
 * (clamped to 3 days), the open live calls, and their contacts — read side by
 * side. Session client, org from the session, RLS decides.
 */
export const dynamic = "force-dynamic";

const MAX_BACK_MS = 3 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const now = Date.now();
  const asked = Date.parse(req.nextUrl.searchParams.get("since") ?? "");
  const since = new Date(Number.isFinite(asked) ? Math.max(asked, now - MAX_BACK_MS) : now - 24 * 60 * 60 * 1000).toISOString();
  const liveFrom = new Date(now - LIVE_MAX_MS).toISOString();

  const [msgs, mails, live, lines, bidOpens, bidMsgs] = await Promise.all([
    supabase.from("messages").select("id, contact_id, channel, body_text, summary, created_at")
      .eq("org_id", orgId).eq("direction", "inbound").gt("created_at", since)
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("emails").select("id, created_at, original_from_name, original_from_address, from_name, from_address, subject, contact_id, status")
      .eq("org_id", orgId).gt("created_at", since).neq("status", "quarantined")
      .order("created_at", { ascending: false }).limit(15),
    // Missing before 086 is applied: then there are simply no live calls.
    supabase.from("live_calls").select("id, call_id, contact_id, counterparty, direction, status, started_at, answered_at, phone_number_id")
      .eq("org_id", orgId).is("ended_at", null).gt("started_at", liveFrom)
      .order("started_at", { ascending: false }).limit(5),
    supabase.from("org_phone_numbers").select("id, label").eq("org_id", orgId),
    // A vendor opening their bid link (091): the opening counts only when the reader isn't in the org.
    supabase.from("bid_request_recipients")
      .select("id, bid_request_id, view_count, last_viewed_at, answered_at, vendor:contacts(name, phone), request:bid_requests(job_id, job:jobs(title))")
      .eq("org_id", orgId).gt("last_viewed_at", since).order("last_viewed_at", { ascending: false }).limit(15),
    // A vendor's message on their bid link's chat (130; missing before it, then none).
    supabase.from("bid_messages")
      .select("id, bid_request_id, author_name, body, created_at, vendor:contacts(name, phone), request:bid_requests(job_id, job:jobs(title))")
      .eq("org_id", orgId).eq("side", "vendor").gt("created_at", since).order("created_at", { ascending: false }).limit(15),
  ]);
  if (msgs.error) return applyCookies(NextResponse.json({ error: msgs.error.message }, { status: 500 }));

  const msgRows = (msgs.data ?? []) as MessageRow[];
  const liveRows = live.error ? [] : (live.data ?? []) as Array<{
    id: string; call_id: string; contact_id: string | null; counterparty: string | null; direction: "inbound" | "outbound" | null;
    status: string; started_at: string; answered_at: string | null; phone_number_id: string | null;
  }>;
  const ids = [...new Set([...msgRows.map((m) => m.contact_id), ...liveRows.map((c) => c.contact_id)].filter((x): x is string => !!x))];
  const textIds = msgRows.filter((m) => m.channel === "sms" && !(m.body_text ?? "").trim()).map((m) => m.id);

  const [contacts, media] = await Promise.all([
    ids.length
      ? supabase.from("contacts").select("id, name, phone, contact_type, classification_confirmed_at, auto_classified_at").in("id", ids)
      : Promise.resolve({ data: [] as ContactRow[], error: null }),
    textIds.length
      ? supabase.from("message_media").select("message_id").in("message_id", textIds)
      : Promise.resolve({ data: [] as Array<{ message_id: string }>, error: null }),
  ]);
  const byId = new Map(((contacts.data ?? []) as ContactRow[]).map((c) => [c.id, c]));
  const mediaCount = new Map<string, number>();
  for (const r of (media.data ?? []) as Array<{ message_id: string }>) mediaCount.set(r.message_id, (mediaCount.get(r.message_id) ?? 0) + 1);

  const fromMsgs = msgRows
    .map((m) => messageAlert({ ...m, media: mediaCount.get(m.id) ?? 0 }, m.contact_id ? byId.get(m.contact_id) : undefined))
    .filter((a): a is Alert => !!a);
  const fromMail = mails.error ? [] : ((mails.data ?? []) as EmailRow[]).map(emailAlert);
  const fromBids = bidOpens.error ? [] : ((bidOpens.data ?? []) as unknown as BidOpenRow[]).map(bidOpenAlert);
  const fromBidMsgs = bidMsgs.error ? [] : ((bidMsgs.data ?? []) as unknown as BidMessageRow[]).map(bidMessageAlert);
  const lineName = new Map(((lines.data ?? []) as Array<{ id: string; label: string | null }>).map((l) => [l.id, l.label]));

  const liveCalls: LiveCall[] = liveRows.map((c): LiveCall => {
    const person = c.contact_id ? byId.get(c.contact_id) : undefined;
    return {
      id: c.id, call_id: c.call_id, contact_id: c.contact_id, phone: c.counterparty,
      name: who(person?.name, c.counterparty), direction: c.direction,
      status: c.status === "answered" ? "answered" : "ringing",
      started_at: c.started_at, answered_at: c.answered_at,
      line: c.phone_number_id ? lineName.get(c.phone_number_id) ?? null : null,
      href: c.contact_id ? `/dashboard/messages/${c.contact_id}` : null,
    };
  }).filter((c) => !(c.contact_id && isFiledSpam(byId.get(c.contact_id))));

  return applyCookies(NextResponse.json({
    items: mergeAlerts(fromMsgs, fromMail, 40, fromBids, fromBidMsgs),
    live: liveCalls,
    live_ready: !live.error,
    now: new Date(now).toISOString(),
  }));
}
