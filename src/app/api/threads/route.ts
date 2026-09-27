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
 * It used to be that it could not. contacts' SELECT policy was
 *     (org_id = (current_setting('app.current_org_id', true))::uuid)
 * — a GUC nothing in this app sets, so through a session-scoped client the
 * predicate was null and contacts returned ZERO rows. A thread list built on an
 * inner join to contacts rendered empty.
 *
 * CORRECTED 2026-09-27: that is no longer true. `contacts_org_select` is now
 * `org_id = ANY (get_user_org_ids())`, moved by migration 024 along with 54
 * other policies. Verified as the `authenticated` role inside a rolled-back
 * transaction: 197 rows readable, 176 of them with no name.
 *
 * The derive-from-messages approach is KEPT anyway, and on purpose. The
 * counterparty phone comes from the address on the message that is not one of
 * the org's own lines, so the list still renders if contacts ever stops being
 * readable — and an embed would return null for a row the caller cannot see,
 * which displays as "no contact" rather than "permission denied". Names are
 * layered on top opportunistically.
 *
 * For 176 of 197 contacts the phone number IS the display name, so that path is
 * the common one rather than the fallback.
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
  /**
   * The contact's most advanced job status, or null when they have no job.
   * Carried so the Quoted / Pouring / Won / Lost chips can actually filter
   * rather than only count. Null for every thread today — `jobs` is 0 rows.
   */
  job_status: string | null;
  /** True when the contact has a job carrying no `job_sections` rows. */
  job_unscoped: boolean;
  /**
   * 'vendor' | 'sub' — and ONLY when relation_confirmed_at is set. An
   * unconfirmed proposal is a machine opinion and stays out of the UI
   * (DECISIONS.md §2b), so this is null for all 135 customers today.
   */
  relation: string | null;
  /**
   * The PENDING enrich-contacts proposal for this contact, if there is one.
   *
   * This is a QUESTION, never an answer. It is carried so the row can ask
   * "is this Amber?" with the evidence attached — it must never reach
   * `display_name`. DECISIONS.md §2b: a machine opinion changes what Coy is
   * asked, never what he is shown. A proposed name appearing in the list
   * before anyone confirmed it is the "Hi Coy" and "Brad Chaney" failure a
   * third time.
   *
   * Only `status='pending'`. An accepted proposal has already become the name;
   * a rejected one is history.
   */
  proposal: ThreadProposal | null;
}

export interface ThreadProposal {
  id: string;
  proposed_name: string | null;
  proposed_company: string | null;
  proposed_role: string | null;
  classification: string;
  confidence: number;
  evidence_quote: string | null;
  evidence_message_id: string | null;
  /** The scope seed. Displayed read-only — nothing applies these yet. */
  project_type: string | null;
  scope_summary: string | null;
  start_timing: string | null;
  length_ft: number | null;
  width_ft: number | null;
  sqft_stated: number | null;
  site_hint: string | null;
  has_media: boolean;
  model: string | null;
  prompt_version: string | null;
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
  const names = new Map<string, { name: string | null; phone: string | null; contact_type: string | null; contact_subtype: string | null; customer_id: string | null }>();
  let contactsReadable = false;
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, phone, contact_type, contact_subtype, customer_id")
      .in("id", contactIds.slice(0, 1000));
    for (const c of (contacts ?? []) as Array<Record<string, string | null>>) {
      names.set(c.id as string, {
        name: c.name, phone: c.phone,
        contact_type: c.contact_type, contact_subtype: c.contact_subtype,
        customer_id: c.customer_id,
      });
    }
    contactsReadable = (contacts ?? []).length > 0;
  }

  // Job state per contact, so the status chips filter and not merely count.
  // STATUS_RANK picks the most advanced job when a contact has several — a
  // customer with a won job and a fresh lead belongs under Won.
  const STATUS_RANK = ["invited", "lead", "scoping", "quoted", "scheduled", "in_progress", "complete", "closed", "lost", "won"];
  const jobByContact = new Map<string, { status: string | null; unscoped: boolean }>();
  {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, contact_id, status")
      .eq("org_id", orgId);
    const jobRows = (jobs ?? []) as Array<{ id: string; contact_id: string | null; status: string | null }>;

    let scopedIds = new Set<string>();
    if (jobRows.length > 0) {
      const { data: sections } = await supabase
        .from("job_sections")
        .select("job_id")
        .eq("org_id", orgId);
      scopedIds = new Set((sections ?? []).map((s: { job_id: string }) => s.job_id));
    }

    for (const j of jobRows) {
      if (!j.contact_id) continue;
      const prev = jobByContact.get(j.contact_id);
      const better = !prev || STATUS_RANK.indexOf(j.status ?? "") > STATUS_RANK.indexOf(prev.status ?? "");
      jobByContact.set(j.contact_id, {
        status: better ? j.status : (prev?.status ?? null),
        unscoped: (prev?.unscoped ?? false) || !scopedIds.has(j.id),
      });
    }
  }

  // The pending proposals, keyed by contact. This is the ASK side of §2b — the
  // same rule that keeps unconfirmed relations out of `relation` above is what
  // puts the proposal here instead, as a question with its evidence attached.
  const proposalByContact = new Map<string, ThreadProposal>();
  if (contactIds.length > 0) {
    const { data: props } = await supabase
      .from("contact_proposals")
      .select("id, contact_id, proposed_name, proposed_company, proposed_role, classification, confidence, evidence_quote, evidence_message_id, project_type, scope_summary, start_timing, length_ft, width_ft, sqft_stated, site_hint, has_media, model, prompt_version, created_at")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    for (const p of (props ?? []) as Array<Record<string, unknown>>) {
      const key = p.contact_id as string | null;
      // Newest-first, first-wins: enrich-contacts supersedes rather than
      // deletes, so a contact can briefly carry more than one pending row if a
      // supersede failed. Showing the newest is right; showing two is not.
      if (!key || proposalByContact.has(key)) continue;
      proposalByContact.set(key, {
        id: p.id as string,
        proposed_name: (p.proposed_name as string) ?? null,
        proposed_company: (p.proposed_company as string) ?? null,
        proposed_role: (p.proposed_role as string) ?? null,
        classification: (p.classification as string) ?? "unknown",
        confidence: Number(p.confidence ?? 0),
        evidence_quote: (p.evidence_quote as string) ?? null,
        evidence_message_id: (p.evidence_message_id as string) ?? null,
        project_type: (p.project_type as string) ?? null,
        scope_summary: (p.scope_summary as string) ?? null,
        start_timing: (p.start_timing as string) ?? null,
        length_ft: p.length_ft === null || p.length_ft === undefined ? null : Number(p.length_ft),
        width_ft: p.width_ft === null || p.width_ft === undefined ? null : Number(p.width_ft),
        sqft_stated: p.sqft_stated === null || p.sqft_stated === undefined ? null : Number(p.sqft_stated),
        site_hint: (p.site_hint as string) ?? null,
        has_media: p.has_media === true,
        model: (p.model as string) ?? null,
        prompt_version: (p.prompt_version as string) ?? null,
      });
    }
  }

  // Confirmed relations only. An unconfirmed enrich-contacts proposal changes
  // what Coy is asked, never what he is shown (DECISIONS.md §2b).
  const relationByCustomer = new Map<string, string>();
  {
    const { data: rels } = await supabase
      .from("customers")
      .select("id, relation, relation_confirmed_at")
      .eq("org_id", orgId)
      .in("relation", ["vendor", "sub"])
      .not("relation_confirmed_at", "is", null);
    for (const r of (rels ?? []) as Array<{ id: string; relation: string }>) {
      relationByCustomer.set(r.id, r.relation);
    }
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
      job_status: jobByContact.get(contactId)?.status ?? null,
      job_unscoped: jobByContact.get(contactId)?.unscoped ?? false,
      relation: c?.customer_id ? relationByCustomer.get(c.customer_id) ?? null : null,
      // NOT folded into display_name above, and never to be. See the field doc.
      proposal: proposalByContact.get(contactId) ?? null,
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
