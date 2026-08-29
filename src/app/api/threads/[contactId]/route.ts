import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * One thread's messages, oldest first. Reads `messages` ONLY.
 *
 * Deliberately does NOT return transcripts. call_artifacts.content reaches
 * ~10,600 characters and there are threads with 348 messages here; loading
 * transcripts alongside the thread would put megabytes on the wire to render a
 * list of bubbles. The transcript is fetched per message, on expand, from
 * api/messages/[messageId]/artifacts.
 *
 * `has_artifacts` tells the UI which rows are worth offering an expander for,
 * at the cost of one cheap id-only query rather than the content itself.
 */

export const dynamic = "force-dynamic";

export interface ThreadMessage {
  id: string;
  channel: string | null;
  direction: string | null;
  occurred_at: string | null;
  body_text: string | null;
  summary: string | null;
  summary_source: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  status: string | null;
  /** Artifact kinds present for this message, e.g. ["transcript","next_steps"]. */
  artifact_kinds: string[];
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ contactId: string }> },
) {
  const { contactId } = await ctx.params;

  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  // The org's own lines, so the header can show who the thread is WITH.
  // Membership in org_phone_numbers is the test — not orgs.business_phone,
  // which holds one number while there are three lines.
  const { data: orgLines } = await supabase
    .from("org_phone_numbers")
    .select("phone_e164")
    .eq("org_id", orgId);
  const ours = new Set((orgLines ?? []).map((r: { phone_e164: string }) => r.phone_e164));

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, channel, direction, occurred_at, body_text, summary, summary_source, duration_seconds, recording_url, status, from_address, to_address")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    // Newest first. Page one is the most recent traffic, so a 350-message
    // thread no longer has to load and scroll in full to show what arrived an
    // hour ago. Accepted cost: inside a rapid exchange a reply reads above the
    // message it answers. This screen is for triage, not for reconstructing a
    // conversation.
    .order("occurred_at", { ascending: false })
    .limit(2000);

  if (error) {
    return applyCookies(NextResponse.json({ error: `messages: ${error.message}` }, { status: 500 }));
  }

  type Row = Omit<ThreadMessage, "artifact_kinds"> & {
    from_address: string | null;
    to_address: string | null;
  };
  const raw = (rows ?? []) as Row[];

  // Counterparty = the address on any message that is not one of our lines.
  let counterpartyPhone: string | null = null;
  for (const r of raw) {
    const cand = r.from_address && !ours.has(r.from_address) ? r.from_address
               : r.to_address && !ours.has(r.to_address) ? r.to_address
               : null;
    if (cand) { counterpartyPhone = cand; break; }
  }

  const messages = raw.map(({ from_address: _f, to_address: _t, ...rest }) => rest);

  // Which messages have artifacts, without pulling any content.
  const kindsByMessage = new Map<string, string[]>();
  if (messages.length > 0) {
    const { data: arts } = await supabase
      .from("call_artifacts")
      .select("message_id, kind")
      .eq("org_id", orgId)
      .in("message_id", messages.map((m) => m.id).slice(0, 1000));
    for (const a of (arts ?? []) as Array<{ message_id: string; kind: string }>) {
      const list = kindsByMessage.get(a.message_id) ?? [];
      list.push(a.kind);
      kindsByMessage.set(a.message_id, list);
    }
  }

  const withKinds: ThreadMessage[] = messages.map((m) => ({
    ...m,
    artifact_kinds: (kindsByMessage.get(m.id) ?? []).sort(),
  }));

  return applyCookies(NextResponse.json({
    contact_id: contactId,
    counterparty_phone: counterpartyPhone,
    messages: withKinds,
  }));
}
