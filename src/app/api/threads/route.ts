import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Thread list. Reads `messages` ONLY.
 *
 * Never quo_events, sms_threads or voip_calls. Migration 016 made messages the
 * spine and a database trigger the only writer; the legacy tables survive only
 * because enrich-contacts still reads sms_threads.media_urls.
 *
 * WHY THIS DOES NOT JOIN contacts IN SQL
 *
 * contacts' SELECT policy is
 *     (org_id = (current_setting('app.current_org_id', true))::uuid)
 * — the GUC that DECISIONS.md §9 records as not yet migrated to
 * auth.uid() + org_members. Nothing in this app sets that GUC (verified:
 * `grep -rn current_org_id src/` returns nothing), so through a session-scoped
 * client the GUC is null, the predicate is null, and contacts returns ZERO
 * rows. A thread list built on an inner join to contacts renders empty.
 *
 * messages, call_artifacts and org_phone_numbers all gate on
 * get_user_org_ids(), which works. So the counterparty phone — the thing
 * actually needed for display — is derived from messages itself: the address
 * on the message that is NOT one of the org's own lines.
 *
 * Names are then layered on opportunistically. When contacts becomes readable
 * the 20 named contacts gain a name and nothing else changes; until then every
 * row displays its phone number, which is already the correct rendering for the
 * 124 of 144 contacts that have no name.
 */

export const dynamic = "force-dynamic";

interface MessageRow {
  id: string;
  contact_id: string | null;
  channel: string | null;
  direction: string | null;
  occurred_at: string | null;
  body_text: string | null;
  summary: string | null;
  summary_source: string | null;
  duration_seconds: number | null;
  from_address: string | null;
  to_address: string | null;
}

export interface Thread {
  contact_id: string;
  display_name: string;
  /** True when display_name is a phone number rather than a real name. */
  name_is_phone: boolean;
  phone: string | null;
  contact_type: string | null;
  contact_subtype: string | null;
  channel: string | null;
  direction: string | null;
  occurred_at: string | null;
  preview: string;
  /** Which field produced the preview, so the UI can style it honestly. */
  preview_source: "body" | "summary" | "synthesised";
  /**
   * Where a `summary` preview came from. 'quo_voicemail' means the text is the
   * caller's OWN words left on a machine, not Quo's paraphrase of a two-party
   * conversation. The list labels it, because an unlabelled voicemail preview
   * reads as though Quo summarised a conversation that never happened.
   */
  summary_source: string | null;
  msg_count: number;
}

/** Formats +12253782458 as (225) 378-2458. Leaves anything else alone. */
export function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  const d = raw.replace(/[^\d]/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** "Inbound call · 49s · 23 Aug" — the fallback when there is no text at all. */
function synthesise(m: MessageRow): string {
  const dir = m.direction === "outbound" ? "Outgoing" : "Incoming";
  const kind = m.channel === "call" ? "call" : "message";
  const parts = [`${dir} ${kind}`];
  if (typeof m.duration_seconds === "number" && m.duration_seconds > 0) {
    const s = m.duration_seconds;
    parts.push(s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
  }
  if (m.occurred_at) {
    parts.push(new Date(m.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return parts.join(" · ");
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  // The org's own lines. Membership in this table is what decides which end of
  // a message is us — NOT orgs.business_phone, which holds one number while
  // Coy has three. Getting that wrong renders his own cell as a stranger.
  const { data: orgLines, error: linesErr } = await supabase
    .from("org_phone_numbers")
    .select("phone_e164")
    .eq("org_id", orgId);

  if (linesErr) {
    return applyCookies(NextResponse.json({ error: `org_phone_numbers: ${linesErr.message}` }, { status: 500 }));
  }
  const ours = new Set((orgLines ?? []).map((r: { phone_e164: string }) => r.phone_e164));

  const { data: rows, error: msgErr } = await supabase
    .from("messages")
    .select("id, contact_id, channel, direction, occurred_at, body_text, summary, summary_source, duration_seconds, from_address, to_address")
    .eq("org_id", orgId)
    .not("contact_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(4000);

  if (msgErr) {
    return applyCookies(NextResponse.json({ error: `messages: ${msgErr.message}` }, { status: 500 }));
  }

  // Fold newest-first rows into one entry per contact. The first row seen for a
  // contact is its latest message, which is the distinct-on in the work order's
  // query expressed against a client that has no distinct-on.
  const byContact = new Map<string, { latest: MessageRow; count: number }>();
  for (const r of (rows ?? []) as MessageRow[]) {
    const key = r.contact_id as string;
    const seen = byContact.get(key);
    if (seen) seen.count += 1;
    else byContact.set(key, { latest: r, count: 1 });
  }

  // Opportunistic names. Expected to return nothing today — see the header.
  // Failure here is not an error: the list is fully usable without it.
  const contactIds = [...byContact.keys()];
  const names = new Map<string, { name: string | null; phone: string | null; contact_type: string | null; contact_subtype: string | null }>();
  let contactsReadable = false;
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, phone, contact_type, contact_subtype")
      .in("id", contactIds.slice(0, 1000));
    for (const c of (contacts ?? []) as Array<Record<string, string | null>>) {
      names.set(c.id as string, {
        name: c.name, phone: c.phone,
        contact_type: c.contact_type, contact_subtype: c.contact_subtype,
      });
    }
    contactsReadable = (contacts ?? []).length > 0;
  }

  const threads: Thread[] = [...byContact.entries()].map(([contactId, { latest, count }]) => {
    // The counterparty is whichever address is not one of ours.
    const from = latest.from_address;
    const to = latest.to_address;
    const derived = from && !ours.has(from) ? from : to && !ours.has(to) ? to : from ?? to ?? null;

    const c = names.get(contactId);
    const phone = c?.phone ?? derived;
    const realName = c?.name && c.name.trim() ? c.name.trim() : null;

    let preview: string;
    let preview_source: Thread["preview_source"];
    if (latest.body_text && latest.body_text.trim()) {
      preview = latest.body_text.trim();
      preview_source = "body";
    } else if (latest.summary && latest.summary.trim()) {
      preview = latest.summary.trim();
      preview_source = "summary";
    } else {
      preview = synthesise(latest);
      preview_source = "synthesised";
    }

    return {
      contact_id: contactId,
      display_name: realName ?? formatPhone(phone),
      name_is_phone: realName === null,
      phone,
      contact_type: c?.contact_type ?? null,
      contact_subtype: c?.contact_subtype ?? null,
      channel: latest.channel,
      direction: latest.direction,
      occurred_at: latest.occurred_at,
      preview,
      preview_source,
      summary_source: preview_source === "summary" ? latest.summary_source : null,
      msg_count: count,
    };
  });

  threads.sort((a, b) => (b.occurred_at ?? "").localeCompare(a.occurred_at ?? ""));

  return applyCookies(NextResponse.json({
    threads,
    // Surfaced so a silently-empty name column is diagnosable from the response
    // rather than looking like a UI bug.
    contacts_readable: contactsReadable,
    messages_scanned: rows?.length ?? 0,
  }));
}
