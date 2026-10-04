import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { isArchivedNow } from "@/lib/archive";
import { roleOf, type ContactRole } from "@/lib/v34/threads";

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
  /** residential | commercial | public, from the contact's most advanced job. */
  job_type: string | null;
  /**
   * Where their work stands (Coy, 2026-10-04: "hide completed customer threads
   * and archive lost thread"): open while any job is open; done when every job
   * is complete or closed (or some lost); lost when every job is lost; null with no job.
   */
  job_state: "open" | "done" | "lost" | null;
  /**
   * Dusty's status lines (migration 037, enrich-contacts v8). A display cache
   * of his summary — shown as his words, never as a fact about the contact.
   * `job_type_hint` is his guess at the job type, shown only when there is no
   * job to take it from.
   */
  status_summary: string | null;
  recent_summary: string | null;
  job_type_hint: string | null;
  /**
   * The contact's bucket — customer | vendor | personal | spam — and ONLY when
   * Coy put them there, or Dusty filed them (spam, with Undo: see bucket_auto).
   * Null is Unsorted. The 'customer' column default on 190 legacy rows is a
   * default, not a classification, and never shows here (DECISIONS §2b).
   */
  bucket: "customer" | "vendor" | "personal" | "spam" | null;
  /** org_contact_subtypes slug within the bucket, e.g. subcontractor. */
  subtype: string | null;
  /** Set when Dusty filed this contact on its own; carries the line it went on. */
  bucket_auto: { reason: string | null } | null;
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
  /**
   * Set when display_name was applied automatically because the person
   * introduced themselves (DECISIONS §2b) and Coy has not yet kept or undone
   * it. Carries the line they said it in, so the row can show it with Keep and
   * Undo. Null for every name Coy typed or confirmed.
   */
  auto_name: { claim_id: string; quote: string | null; channel: string | null } | null;
  /** Nothing was ever said: only calls, none with a summary, voicemail or words (src/lib/archive.ts). */
  silent: boolean;
  /** Set on the Archived view: when it was archived, and why (archived, or deleted). */
  archived: { at: string; reason: string | null } | null;
  /** Threads v2 (migration 073): their role, and what the row's second line says. */
  role: ContactRole;
  customer_id: string | null;
  /** contacts.role — "Homeowner", "Dispatcher" — when someone wrote one. */
  person_role: string | null;
  numbers: number;
  has_email: boolean;
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
  const byContact = new Map<string, { latest: MessageRow; count: number; lastIn: string | null; said: boolean }>();
  for (const r of (rows ?? []) as MessageRow[]) {
    const key = r.contact_id as string;
    const said = r.channel !== "call" || !!(r.body_text ?? "").trim() || !!(r.summary ?? "").trim();
    const inbound = r.direction === "inbound" ? r.occurred_at : null;
    const seen = byContact.get(key);
    if (seen) { seen.count += 1; seen.said ||= said; if (!seen.lastIn && inbound) seen.lastIn = inbound; }
    else byContact.set(key, { latest: r, count: 1, lastIn: inbound, said });
  }
  // Archived (migration 066): out of the lists until they call or text again.
  const view = req.nextUrl.searchParams.get("view") === "archived" ? "archived" : "live";
  // A thread Coy made (migration 073): only its members — and members with no
  // calls or texts yet are listed too, so a job thread shows the permit office.
  const threadId = req.nextUrl.searchParams.get("thread");
  let members: Set<string> | null = null;
  if (threadId && /^[0-9a-f-]{36}$/i.test(threadId)) {
    const { data: mem } = await supabase.from("thread_contacts").select("contact_id").eq("org_id", orgId).eq("thread_id", threadId);
    members = new Set(((mem ?? []) as Array<{ contact_id: string }>).map((m) => m.contact_id));
  }

  // Opportunistic names. Expected to return nothing today — see the header.
  // Failure here is not an error: the list is fully usable without it.
  const contactIds = members ? [...members] : [...byContact.keys()];
  const names = new Map<string, { person_role: string | null; archived_at: string | null; archived_reason: string | null; name: string | null; phone: string | null; contact_type: string | null; contact_subtype: string | null; customer_id: string | null; name_source: string | null; name_claim_id: string | null; confirmed: boolean; auto_at: string | null; auto_reason: string | null; status_summary: string | null; recent_summary: string | null; job_type_hint: string | null }>();
  let contactsReadable = false;
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, phone, role, merged_into_contact_id, contact_type, contact_subtype, customer_id, name_source, name_claim_id, classification_confirmed_at, auto_classified_at, auto_classified_reason, status_summary, recent_summary, job_type_hint, archived_at, archived_reason")
      .in("id", contactIds.slice(0, 1000));
    for (const c of (contacts ?? []) as Array<Record<string, string | null>>) {
      if (c.merged_into_contact_id) continue;
      names.set(c.id as string, {
        person_role: c.role,
        archived_at: c.archived_at, archived_reason: c.archived_reason,
        name: c.name, phone: c.phone,
        contact_type: c.contact_type, contact_subtype: c.contact_subtype,
        confirmed: !!c.classification_confirmed_at, auto_at: c.auto_classified_at, auto_reason: c.auto_classified_reason,
        customer_id: c.customer_id,
        name_source: c.name_source, name_claim_id: c.name_claim_id,
        status_summary: c.status_summary, recent_summary: c.recent_summary, job_type_hint: c.job_type_hint,
      });
    }
    contactsReadable = (contacts ?? []).length > 0;
  }

  // Their numbers and emails, and each customer's primary person and size —
  // the row's role ("Customer" vs "Cust. contact") and its second line.
  const numbers = new Map<string, number>(), emails = new Set<string>();
  const custPrimary = new Map<string, string | null>(), custPeople = new Map<string, number>();
  if (contactIds.length > 0) {
    const ids = contactIds.slice(0, 1000);
    const custIds = [...new Set([...names.values()].map((c) => c.customer_id).filter(Boolean))] as string[];
    const [{ data: ph }, { data: em }, { data: cu }, { data: people }] = await Promise.all([
      supabase.from("contact_phones").select("contact_id").eq("org_id", orgId).in("contact_id", ids),
      supabase.from("contact_emails").select("contact_id").eq("org_id", orgId).in("contact_id", ids),
      custIds.length ? supabase.from("customers").select("id, primary_contact_id").eq("org_id", orgId).in("id", custIds) : Promise.resolve({ data: [] }),
      custIds.length ? supabase.from("contacts").select("customer_id").eq("org_id", orgId).in("customer_id", custIds).is("merged_into_contact_id", null).is("archived_at", null) : Promise.resolve({ data: [] }),
    ]);
    for (const r of (ph ?? []) as Array<{ contact_id: string }>) numbers.set(r.contact_id, (numbers.get(r.contact_id) ?? 0) + 1);
    for (const r of (em ?? []) as Array<{ contact_id: string }>) emails.add(r.contact_id);
    for (const r of (cu ?? []) as Array<{ id: string; primary_contact_id: string | null }>) custPrimary.set(r.id, r.primary_contact_id);
    for (const r of (people ?? []) as Array<{ customer_id: string }>) custPeople.set(r.customer_id, (custPeople.get(r.customer_id) ?? 0) + 1);
  }

  // Job state per contact, so the status chips filter and not merely count.
  // STATUS_RANK picks the most advanced job when a contact has several — a
  // customer with a won job and a fresh lead belongs under Won.
  const STATUS_RANK = ["invited", "lead", "scoping", "quoted", "scheduled", "in_progress", "complete", "closed", "lost", "won"];
  const jobByContact = new Map<string, { status: string | null; unscoped: boolean; type: string | null }>();
  const jobState = new Map<string, "open" | "done" | "lost">();
  {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, contact_id, status, job_type")
      .eq("org_id", orgId)
      .is("archived_at", null);
    const jobRows = (jobs ?? []) as Array<{ id: string; contact_id: string | null; status: string | null; job_type: string | null }>;

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
      const st = ["complete", "closed"].includes(j.status ?? "") ? "done" : j.status === "lost" ? "lost" : "open";
      const was = jobState.get(j.contact_id);
      jobState.set(j.contact_id, was === "open" || st === "open" ? "open" : was === "done" || st === "done" ? "done" : "lost");
      const prev = jobByContact.get(j.contact_id);
      const better = !prev || STATUS_RANK.indexOf(j.status ?? "") > STATUS_RANK.indexOf(prev.status ?? "");
      jobByContact.set(j.contact_id, {
        status: better ? j.status : (prev?.status ?? null),
        type: better ? j.job_type : (prev?.type ?? null),
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

  // Names applied automatically, with the line that licensed each one.
  const autoByClaim = new Map<string, { quote: string | null; channel: string | null }>();
  {
    const claimIds = [...names.values()]
      .filter((c) => c.name_source === "machine" && c.name_claim_id)
      .map((c) => c.name_claim_id as string);
    if (claimIds.length) {
      const { data: claims } = await supabase.from("contact_name_claims")
        .select("id, evidence_quote, channel")
        .eq("org_id", orgId).eq("status", "accepted").in("id", claimIds);
      for (const k of (claims ?? []) as Array<{ id: string; evidence_quote: string | null; channel: string | null }>) {
        autoByClaim.set(k.id, { quote: k.evidence_quote, channel: k.channel });
      }
    }
  }

  const entries = [...byContact.entries()].filter(([contactId, e]) => {
    if (members && !members.has(contactId)) return false;
    const c = names.get(contactId);
    const gone = isArchivedNow(c?.archived_at, e.lastIn);
    return view === "archived" ? gone : !gone;
  });
  const threads: Thread[] = entries.map(([contactId, { latest, count, said }]) => {
    // The counterparty is whichever address is not one of ours.
    const from = latest.from_address;
    const to = latest.to_address;
    const derived = from && !ours.has(from) ? from : to && !ours.has(to) ? to : from ?? to ?? null;

    const c = names.get(contactId);
    const bucket = c && (c.confirmed || c.auto_at) && ["customer", "vendor", "personal", "spam"].includes(c.contact_type ?? "")
      ? (c.contact_type as Thread["bucket"]) : null;
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
      // Only a bucket that counts (confirmed, or filed by Dusty) reaches the
      // avatar — never the legacy column default.
      contact_type: bucket,
      contact_subtype: bucket ? c?.contact_subtype ?? null : null,
      channel: latest.channel,
      direction: latest.direction,
      occurred_at: latest.occurred_at,
      preview,
      preview_source,
      summary_source: preview_source === "summary" ? latest.summary_source : null,
      msg_count: count,
      job_status: jobByContact.get(contactId)?.status ?? null,
      job_unscoped: jobByContact.get(contactId)?.unscoped ?? false,
      job_type: jobByContact.get(contactId)?.type ?? null,
      job_state: jobState.get(contactId) ?? null,
      status_summary: c?.status_summary ?? null,
      recent_summary: c?.recent_summary ?? null,
      job_type_hint: c?.job_type_hint ?? null,
      bucket,
      subtype: bucket ? c?.contact_subtype ?? null : null,
      bucket_auto: bucket && !c?.confirmed && c?.auto_at ? { reason: c.auto_reason } : null,
      // NOT folded into display_name above, and never to be. See the field doc.
      proposal: proposalByContact.get(contactId) ?? null,
      auto_name: realName && c?.name_source === "machine" && c.name_claim_id && autoByClaim.has(c.name_claim_id)
        ? { claim_id: c.name_claim_id, ...autoByClaim.get(c.name_claim_id)! }
        : null,
      silent: !said,
      archived: view === "archived" && c?.archived_at ? { at: c.archived_at, reason: c.archived_reason } : null,
      ...extra(contactId, bucket, phone),
    };
  });
  // A thread's members with no calls or texts yet (a permit office, a new sub).
  if (members && view === "live") {
    for (const id of members) {
      if (byContact.has(id)) continue;
      const c = names.get(id);
      if (!c) continue;
      const bucket = (c.confirmed || c.auto_at) && ["customer", "vendor", "personal", "spam"].includes(c.contact_type ?? "")
        ? (c.contact_type as Thread["bucket"]) : null;
      const realName = c.name?.trim() || null;
      threads.push({
        contact_id: id, display_name: realName ?? formatPhone(c.phone), name_is_phone: !realName, phone: c.phone,
        contact_type: bucket, contact_subtype: bucket ? c.contact_subtype : null, channel: null, direction: null, occurred_at: null,
        preview: "No calls or texts yet", preview_source: "synthesised", summary_source: null, msg_count: 0,
        job_status: jobByContact.get(id)?.status ?? null, job_unscoped: false, job_type: jobByContact.get(id)?.type ?? null, job_state: jobState.get(id) ?? null,
        status_summary: c.status_summary, recent_summary: c.recent_summary, job_type_hint: c.job_type_hint,
        bucket, subtype: bucket ? c.contact_subtype : null, bucket_auto: bucket && !c.confirmed && c.auto_at ? { reason: c.auto_reason } : null,
        proposal: proposalByContact.get(id) ?? null, auto_name: null, silent: false, archived: null,
        ...extra(id, bucket, c.phone),
      });
    }
  }
  function extra(id: string, bucket: Thread["bucket"], phone: string | null) {
    const c = names.get(id);
    const cust = c?.customer_id ?? null;
    return {
      role: roleOf({ bucket, subtype: c?.contact_subtype ?? null, customer_id: cust,
        is_primary_on_customer: !!cust && custPrimary.get(cust) === id, customer_people: cust ? custPeople.get(cust) ?? 1 : 0 }),
      customer_id: cust,
      person_role: c?.person_role?.trim() || null,
      numbers: Math.max(numbers.get(id) ?? 0, phone ? 1 : 0),
      has_email: emails.has(id),
    };
  }

  threads.sort((a, b) => (b.occurred_at ?? "").localeCompare(a.occurred_at ?? ""));

  return applyCookies(NextResponse.json({
    threads,
    // Surfaced so a silently-empty name column is diagnosable from the response
    // rather than looking like a UI bug.
    contacts_readable: contactsReadable,
    messages_scanned: rows?.length ?? 0,
  }));
}
