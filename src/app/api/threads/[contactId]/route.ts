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
  /**
   * Photos, videos, PDFs and contact cards on this message (message_media,
   * migration 027). A count only — the files themselves come from
   * /api/messages/[id]/media, which captures and signs them on demand, so a
   * thread with fifty photos does not fetch fifty files just to render.
   */
  media_count: number;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ contactId: string }> },
) {
  const { contactId } = await ctx.params;

  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  // Merged away? Then this contact's history now lives on the person it was
  // merged into (migration 028) — send the caller there rather than render an
  // empty thread that reads as "this number never said anything".
  const { data: self } = await supabase
    .from("contacts")
    .select("id, merged_into_contact_id, name, name_source")
    .eq("org_id", orgId)
    .eq("id", contactId)
    .maybeSingle();
  if (self?.merged_into_contact_id) {
    return applyCookies(NextResponse.json({ redirect_to: self.merged_into_contact_id as string }));
  }

  // Every number this person uses, and the merges that put them here — the
  // header lists the numbers and offers Undo on each merge that is still in
  // force.
  const [{ data: phoneRows }, { data: mergeRows }] = await Promise.all([
    supabase.from("contact_phones")
      .select("phone_e164, is_primary")
      .eq("org_id", orgId).eq("contact_id", contactId)
      .order("is_primary", { ascending: false }),
    supabase.from("contact_merges")
      .select("id, loser_id, merged_at")
      .eq("org_id", orgId).eq("winner_id", contactId)
      .is("undone_at", null)
      .order("merged_at", { ascending: false }),
  ]);
  const loserIds = (mergeRows ?? []).map((m: { loser_id: string }) => m.loser_id);
  const loserPhone = new Map<string, string | null>();
  if (loserIds.length > 0) {
    const { data: losers } = await supabase.from("contacts").select("id, phone").in("id", loserIds);
    for (const l of (losers ?? []) as Array<{ id: string; phone: string | null }>) loserPhone.set(l.id, l.phone);
  }
  const phones = (phoneRows ?? []).map((p: { phone_e164: string }) => p.phone_e164);
  const merges = (mergeRows ?? []).map((m: { id: string; loser_id: string; merged_at: string }) => ({
    id: m.id, merged_at: m.merged_at, phone: loserPhone.get(m.loser_id) ?? null,
  }));

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

  const mediaByMessage = new Map<string, number>();
  if (messages.length > 0) {
    const { data: media } = await supabase
      .from("message_media")
      .select("message_id")
      .eq("org_id", orgId)
      .in("message_id", messages.map((m) => m.id).slice(0, 1000));
    for (const r of (media ?? []) as Array<{ message_id: string }>) {
      mediaByMessage.set(r.message_id, (mediaByMessage.get(r.message_id) ?? 0) + 1);
    }
  }

  const withKinds: ThreadMessage[] = messages.map((m) => ({
    ...m,
    artifact_kinds: (kindsByMessage.get(m.id) ?? []).sort(),
    media_count: mediaByMessage.get(m.id) ?? 0,
  }));

  return applyCookies(NextResponse.json({
    contact_id: contactId,
    counterparty_phone: counterpartyPhone,
    /** contacts.name when one is set, else null — the header falls back to the phone. */
    name: (self?.name as string | null)?.trim() || null,
    /** Every number on this contact (contact_phones). Empty until a merge adds them. */
    phones,
    /** Merges into this contact that are still in force — each can be undone. */
    merges,
    messages: withKinds,
  }));
}
