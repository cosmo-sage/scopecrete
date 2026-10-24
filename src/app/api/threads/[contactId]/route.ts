import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { loadLines } from "@/lib/lines-server";
import { buildChannels } from "@/lib/v34/threads";
import { fillVoicemails, type VoicemailCall, type VoicemailShown } from "@/lib/voicemail-server";

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
  /** An incoming call nobody picked up (Quo's call.completed said "no-answer") — the card says "Missed call" (Coy, 2026-10-10). */
  missed?: boolean;
  /** The voicemail left on a missed call — its words (null until Quo has written them) and seconds. */
  voicemail?: VoicemailShown;
  /** Artifact kinds present for this message, e.g. ["transcript","next_steps"]. */
  artifact_kinds: string[];
  /**
   * Photos, videos, PDFs and contact cards on this message (message_media,
   * migration 027). A count only — the files themselves come from
   * /api/messages/[id]/media, which captures and signs them on demand, so a
   * thread with fifty photos does not fetch fifty files just to render.
   */
  media_count: number;
  /** message_media.kind of each file on it (photo, video, pdf, vcard…) — the search panel's Photos / Files. */
  media_kinds: string[];
  /**
   * Which of our lines it used (migration 035), by name — set whenever the
   * org has two or more lines (Lines, Claude Design package 9), so a one-line
   * org stays uncluttered.
   */
  line: string | null;
  /** That line's id, for the channel's line filter and its colour. */
  line_id: string | null;
  /** The other end's number on this message — which phone channel it belongs to (Threads v2). */
  counterparty: string | null;
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
    .select("id, phone, merged_into_contact_id, name, name_source, name_confirmed_at, address, archived_at, archived_reason")
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
      .select("phone_e164, is_primary, label")
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
    .select("id, phone_e164, label")
    .eq("org_id", orgId);
  const ours = new Set((orgLines ?? []).map((r: { phone_e164: string }) => r.phone_e164));
  const lineName = new Map(((orgLines ?? []) as Array<{ id: string; phone_e164: string; label: string | null }>)
    .map((r) => [r.id, r.label?.trim() || formatLine(r.phone_e164)]));

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, channel, direction, occurred_at, body_text, summary, summary_source, duration_seconds, recording_url, status, from_address, to_address, phone_number_id, provider_message_id")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    // Newest first. Page one is the most recent traffic, so a 350-message
    // thread no longer has to load and scroll in full to show what arrived an
    // hour ago. The conversation screen turns the page round so it reads top to
    // bottom with the newest last.
    .order("occurred_at", { ascending: false })
    .limit(2000);

  if (error) {
    return applyCookies(NextResponse.json({ error: `messages: ${error.message}` }, { status: 500 }));
  }

  type Row = Omit<ThreadMessage, "artifact_kinds" | "line"> & {
    provider_message_id: string | null;
    from_address: string | null;
    to_address: string | null;
    phone_number_id: string | null;
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

  // Stamped with its line whenever the org has more than one (Lines, package 9).
  const manyLines = (orgLines ?? []).length > 1;
  // Missed calls: Quo's call.completed for an incoming call says "no-answer";
  // the message itself only says "received". Read from the raw log by call id.
  const missedIds = new Set<string>();
  const vmByCall = new Map<string, { url: string; duration: number | null }>();
  const callIds = raw.filter((r) => r.channel === "call" && r.direction === "inbound" && r.provider_message_id).map((r) => r.provider_message_id as string).slice(0, 400);
  if (callIds.length) {
    const { data: ends } = await supabase.from("quo_events")
      .select("call_id:raw_payload->>id, call_status:raw_payload->>status, vm_url:raw_payload->voicemail->>url, vm_dur:raw_payload->voicemail->>duration")
      .eq("org_id", orgId).eq("event_type", "call.completed").in("raw_payload->>id", callIds);
    for (const e of (ends ?? []) as Array<{ call_id: string | null; call_status: string | null; vm_url: string | null; vm_dur: string | null }>) {
      if (e.call_id && e.call_status === "no-answer") missedIds.add(e.call_id);
      if (e.call_id && e.vm_url) vmByCall.set(e.call_id, { url: e.vm_url, duration: Number(e.vm_dur) > 0 ? Number(e.vm_dur) : null });
    }
  }
  // A voicemail on the call (call.completed's `voicemail`): its artifact and words (src/lib/voicemail-server.ts).
  const vmCalls: VoicemailCall[] = raw.flatMap((r) => {
    const v = r.provider_message_id ? vmByCall.get(r.provider_message_id) : undefined;
    return v ? [{ messageId: r.id, callId: r.provider_message_id as string, url: v.url, duration: v.duration }] : [];
  });
  const voicemails = await fillVoicemails(supabase, orgId, vmCalls);
  const messages = raw.map((r) => {
    const { from_address, to_address, phone_number_id, provider_message_id, ...rest } = r;
    if (provider_message_id && missedIds.has(provider_message_id)) (rest as ThreadMessage).missed = true;
    const vm = voicemails.get(rest.id);
    if (vm) (rest as ThreadMessage).voicemail = vm;
    const counterparty = from_address && !ours.has(from_address) ? from_address : to_address && !ours.has(to_address) ? to_address : null;
    return { ...rest, counterparty, line: manyLines && phone_number_id ? lineName.get(phone_number_id) ?? null : null, line_id: manyLines ? phone_number_id : null };
  });
  // The lines, with their colours, and which one they first reached you on.
  const lineRows = manyLines ? await loadLines(supabase, orgId) : [];
  const firstMsg = [...raw].reverse().find((r) => r.phone_number_id);

  // Their channels (Threads v2): a tab per number, then email, then chat. Emails
  // are the mirrored inbox filed on this person (migration 061), newest 50.
  const [{ data: emailRows }, { data: addrRows }] = await Promise.all([
    supabase.from("emails").select("id, subject, original_from_name, original_from_address, from_address, sent_at, created_at, text_body, direction, conversation")
      .eq("org_id", orgId).eq("contact_id", contactId).order("created_at", { ascending: false }).limit(50),
    supabase.from("contact_emails").select("email, label, is_primary").eq("org_id", orgId).eq("contact_id", contactId).order("is_primary", { ascending: false }),
  ]);
  const emailList = ((emailRows ?? []) as Array<{ id: string; subject: string | null; original_from_name: string | null; original_from_address: string | null; from_address: string | null; sent_at: string | null; created_at: string; text_body: string | null; direction: string | null; conversation: string | null }>)
    .map((e) => ({ id: e.id, subject: e.subject, from: e.original_from_name || e.original_from_address || e.from_address, at: e.sent_at ?? e.created_at, body: (e.text_body ?? "").slice(0, 1200),
      direction: e.direction === "out" ? "out" : "in", conversation: e.conversation }));
  // The number on the contact row is theirs too, even before it is listed —
  // otherwise adding a second number made it look replaced (Coy, 2026-10-05).
  const listed = ((phoneRows ?? []) as Array<{ phone_e164: string; is_primary: boolean; label: string | null }>).map((p) => ({ phone: p.phone_e164, label: p.label, is_primary: p.is_primary }));
  const rowPhone = (self?.phone as string | null) ?? null;
  if (rowPhone && !listed.some((p) => p.phone === rowPhone)) listed.unshift({ phone: rowPhone, label: null, is_primary: !listed.some((p) => p.is_primary) });
  const channels = buildChannels({
    phones: listed,
    emails: ((addrRows ?? []) as Array<{ email: string; label: string | null }>).map((e) => ({ email: String(e.email), label: e.label })),
    messages, emailCount: emailList.length,
  });

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
  const kindsOfMedia = new Map<string, string[]>();
  if (messages.length > 0) {
    const { data: media } = await supabase
      .from("message_media")
      .select("message_id, kind")
      .eq("org_id", orgId)
      .in("message_id", messages.map((m) => m.id).slice(0, 1000));
    for (const r of (media ?? []) as Array<{ message_id: string; kind: string | null }>) {
      mediaByMessage.set(r.message_id, (mediaByMessage.get(r.message_id) ?? 0) + 1);
      kindsOfMedia.set(r.message_id, [...(kindsOfMedia.get(r.message_id) ?? []), r.kind ?? "file"]);
    }
  }

  const withKinds: ThreadMessage[] = messages.map((m) => ({
    ...m,
    artifact_kinds: [...new Set([...(kindsByMessage.get(m.id) ?? []), ...(voicemails.has(m.id) ? ["voicemail"] : [])])].sort(),
    media_count: mediaByMessage.get(m.id) ?? 0,
    media_kinds: kindsOfMedia.get(m.id) ?? [],
  }));

  return applyCookies(NextResponse.json({
    contact_id: contactId,
    counterparty_phone: counterpartyPhone,
    /** contacts.name when one is set, else null — the header falls back to the phone. */
    name: (self?.name as string | null)?.trim() || null,
    /** Where the name came from, and whether a person confirmed it. */
    name_source: (self?.name_source as string | null) ?? null,
    name_confirmed: !!self?.name_confirmed_at,
    address: (self?.address as string | null)?.trim() || null,
    /** Every number on this contact (contact_phones). Empty until a merge adds them. */
    phones,
    /** Merges into this contact that are still in force — each can be undone. */
    merges,
    messages: withKinds,
    /** The org's lines (only when there are two or more): id, name, colour, provider. */
    lines: lineRows.map((l) => ({ id: l.id, name: l.label?.trim() || formatLine(l.phone_e164), phone: l.phone_e164, color: l.color, provider: l.provider, is_primary: l.is_primary })),
    /**
     * When they were archived and why (Coy, 2026-10-04); `back` once they have
     * called or texted since — the thread shows it with the reason.
     */
    archived: self?.archived_at ? {
      at: self.archived_at as string, reason: (self.archived_reason as string | null) ?? null,
      back: raw.some((r) => r.direction === "inbound" && !!r.occurred_at && r.occurred_at > (self.archived_at as string)),
    } : null,
    /** "first reached you on the Website line, Sep 22". */
    first_line: manyLines && firstMsg?.phone_number_id ? { id: firstMsg.phone_number_id, name: lineName.get(firstMsg.phone_number_id) ?? null, at: firstMsg.occurred_at } : null,
    channels,
    emails: emailList,
  }));
}

/** "(985) 860-8287" for a line with no name. */
function formatLine(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}
