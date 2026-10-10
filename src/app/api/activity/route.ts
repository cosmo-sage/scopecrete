import { NextRequest, NextResponse } from "next/server";
import { getApiSession, type ApiSession } from "@/lib/api-auth";
import { myAccess } from "@/lib/access-server";
import { plainSpeakers } from "@/lib/speakers";
import { plainNote } from "@/lib/mentions";
import { pinLink, readPin } from "@/lib/plan-pins";
import { formatPhone } from "@/lib/v34/tokens";

/**
 * What Dusty has been doing in the background — the line under the header.
 *
 * GET → { pinned, waiting, last_read_at, items }
 *
 * EVERY ITEM IS A ROW THAT EXISTS. v34's StreamBar was fed ten hardcoded
 * sentences with dollar figures in them, and was left out of the port for
 * exactly that reason. This feeds it from contact_enrich_runs (one row per read
 * by the background enricher) and sc_worker_heartbeats. When nothing is
 * happening the line says when something last did; it never makes up
 * something happening now.
 *
 * `pinned` is set when the reader is not working — not configured, can't reach
 * Hermes, erroring, or silent for 15 minutes. The line then shows that and
 * nothing else, so a broken reader cannot hide behind cheerful lines.
 *
 * Also Dusty's track record per bucket (sc_bucket_agreement, migration 036):
 * how often his guess matched where Coy filed someone, and how far he is from
 * filing that bucket himself.
 *
 * Session client; contact_enrich_runs, contacts, claims, proposals and the
 * agreement view (security_invoker) are all org-scoped by RLS. The heartbeat carries no tenant data.
 */

export const dynamic = "force-dynamic";

type Tone = "live" | "good" | "ask" | "warn" | "quiet";
export interface ActivityItem {
  id: string;
  at: string;
  kind: string;
  contact_id: string | null;
  /** Where the line goes when it isn't a person (a bid → its job). */
  href?: string | null;
  summary: string;
  detail: string | null;
  tone: Tone;
}

const CLASS: Record<string, string> = {
  customer: "a customer", vendor: "a vendor", sub: "a sub", personal: "personal", spam: "spam", not_work: "not work",
};

type Run = {
  id: string; started_at: string; finished_at: string | null; outcome: string; note: string | null; contact_id: string;
  contacts: { name: string | null; phone: string | null } | null;
  contact_name_claims: { claimed_name: string | null; evidence_quote: string | null } | null;
  contact_proposals: { proposed_name: string | null; classification: string | null; evidence_quote: string | null } | null;
};

/** A suggestion's classification as the bucket it files into (enrich-contacts rules.ts bucketOf). */
const BUCKET_OF: Record<string, string> = {
  customer: "customer", vendor: "vendor", sub: "vendor", personal: "personal", spam: "spam", not_work: "spam",
};
/** Must match AUTO_STREAK in supabase/functions/enrich-contacts/rules.ts. */
const AUTO_STREAK = 20;
const PLURAL: Record<string, string> = { customer: "customers", vendor: "vendors", personal: "personal contacts" };

// Summaries are long enough for a desktop header; the line itself trims to the room it has
// (Coy, 2026-10-02: "Reading 2635 Walker High Dugouts Specs 2026 08 ……" was cut here, not on screen).
const clipq = (s: string | null | undefined, n = 90) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  // An onsite estimator (081) reads none of the org's people, calls or reader runs —
  // their line is the notes they were tagged in, nothing else.
  const access = await myAccess(supabase, orgId);
  if (access.limited) {
    return applyCookies(NextResponse.json({ pinned: null, waiting: 0, last_read_at: null, items: await tagItems(supabase, orgId, userId, true), musings: [] }));
  }

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  // Reminders: open next steps due today or overdue (contact_tasks, migration
  // 038). Central time is Coy's; the server has no timezone of its own.
  const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const [{ data: runRows, error }, { data: statusRows }, { data: beat }, { data: agreeRows }, { data: dueRows }, { data: museRows }, { data: dreamRows }] = await Promise.all([
    supabase.from("contact_enrich_runs")
      .select("id, started_at, finished_at, outcome, note, contact_id, contacts(name, phone), contact_name_claims(claimed_name, evidence_quote), contact_proposals(proposed_name, classification, evidence_quote)")
      .eq("org_id", orgId).gte("started_at", since)
      .order("started_at", { ascending: false }).limit(40),
    supabase.rpc("sc_enrich_status"),
    supabase.from("sc_worker_heartbeats").select("status, detail, ticked_at").eq("worker", "enrich-contacts").maybeSingle(),
    supabase.from("sc_bucket_agreement").select("bucket, guesses, agreed, streak").eq("org_id", orgId),
    supabase.from("contact_tasks").select("id, title, due_on, contact_id, contacts(name, phone)")
      .eq("org_id", orgId).eq("status", "open").lte("due_on", todayLocal).order("due_on", { ascending: true }).limit(6),
    // Dusty's musings: a light line about a conversation he read (migration
    // 039). About something that happened, never something happening now.
    supabase.from("contact_enrich_runs").select("id, finished_at, musing, contact_id, contacts(name, phone)")
      .eq("org_id", orgId).not("musing", "is", null).gte("started_at", new Date(Date.now() - 3 * 86400_000).toISOString())
      .order("started_at", { ascending: false }).limit(12),
    // Dusty's dreams (migration 058): light lines about a stretch of calls and
    // texts — today, or a day weeks back — written in the background.
    supabase.from("dusty_dreams").select("id, created_at, dream, contact_ids, span, window_start")
      .eq("org_id", orgId).gte("created_at", new Date(Date.now() - 3 * 86400_000).toISOString())
      .order("created_at", { ascending: false }).limit(12),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: `contact_enrich_runs: ${error.message}` }, { status: 500 }));

  const status = ((statusRows ?? []) as Array<{ waiting: number; last_read_at: string | null }>)[0];
  const waiting = Number(status?.waiting ?? 0);

  // The reader's own state. Anything but a recent 'ok' pins the line.
  let pinned: { summary: string; detail: string | null } | null = null;
  if (!beat) pinned = { summary: "Reader hasn't run yet", detail: "It runs every minute from Supabase (pg_cron)." };
  else if (beat.status === "not_configured") pinned = { summary: "Reader not connected — needs its Hermes key", detail: "Add HERMES_API_KEY in Supabase → Edge Functions → Secrets. Dusty starts reading within a minute of the key going in." };
  else if (beat.status === "hermes_unreachable") pinned = { summary: "Can't reach Hermes on the VPS", detail: beat.detail };
  else if (beat.status === "error") pinned = { summary: "Reader stopped on an error", detail: beat.detail };
  else if (Date.now() - new Date(beat.ticked_at).getTime() > 15 * 60_000) {
    pinned = { summary: `Reader silent since ${new Date(beat.ticked_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, detail: "It runs every minute. Check cron.job_run_details in Supabase." };
  }

  const items: ActivityItem[] = [];
  let quietCount = 0;
  let summarized = 0;
  let summarizedAt: string | null = null;
  let quietAt: string | null = null;
  for (const r of (runRows ?? []) as unknown as Run[]) {
    const who = r.contacts?.name?.trim() || formatPhone(r.contacts?.phone);
    const at = r.finished_at ?? r.started_at;
    const base = { id: r.id, at, kind: r.outcome, contact_id: r.contact_id };
    switch (r.outcome) {
      case "running":
        items.push({ ...base, summary: `Reading ${who}…`, detail: null, tone: "live" });
        break;
      case "named": {
        const q = r.contact_name_claims?.evidence_quote;
        items.push({ ...base, summary: `Named ${r.contact_name_claims?.claimed_name ?? who}${q ? ` — “${clipq(q, 180)}”` : ""}`,
          detail: q ? `They said: “${clipq(q, 400)}”. Keep or Undo it in the thread row.` : null, tone: "good" });
        break;
      }
      case "proposed": {
        const p = r.contact_proposals;
        const cls = p?.classification ? CLASS[p.classification] : null;
        const bits = [p?.proposed_name ? `might be ${p.proposed_name}` : null, cls ? `looks like ${cls}` : null].filter(Boolean);
        items.push({ ...base,
          summary: bits.length ? `${who} ${bits.join(", ")} — your call` : `Read ${who} — no name or read on them yet`,
          detail: p?.evidence_quote ? `Going on: “${clipq(plainSpeakers(p.evidence_quote), 400)}”` : null,
          tone: bits.length ? "ask" : "quiet" });
        break;
      }
      case "filed": {
        // The bucket Dusty filed into is his suggestion's; the contact's own
        // column may since have been undone.
        const b = BUCKET_OF[r.contact_proposals?.classification ?? ""] ?? "spam";
        items.push({ ...base, summary: `Filed ${who} as ${b}${r.note ? ` — “${clipq(r.note, 160)}”` : ""}`,
          detail: r.note ? `Going on: “${clipq(r.note, 400)}”. Wrong? Open the row and tap Not ${b}.` : null, tone: "quiet" });
        break;
      }
      case "summarized":
        // Someone already named and sorted: only their status line changed.
        summarized++;
        if (!summarizedAt) summarizedAt = at;
        break;
      case "model_error": case "failed": case "abandoned":
        items.push({ ...base, summary: `Couldn't read ${who}${r.note ? ` — ${clipq(r.note, 160)}` : ""}`, detail: r.note, tone: "warn" });
        break;
      default:
        // no_words / unchanged / skipped: real, but one line each would be noise.
        quietCount++;
        if (!quietAt) quietAt = at;
    }
  }
  if (summarized) {
    items.push({ id: "summarized", at: summarizedAt!, kind: "quiet", contact_id: null,
      summary: `Updated where things stand for ${summarized} ${summarized === 1 ? "person" : "people"}`,
      detail: "The line under each name on Threads. Dusty's words, from their latest calls and texts.", tone: "quiet" });
  }
  if (quietCount) {
    items.push({ id: "quiet", at: quietAt!, kind: "quiet", contact_id: null,
      summary: `Checked ${quietCount} with nothing new to say`, detail: "Threads with no words from them on record, or nothing new since the last read.", tone: "quiet" });
  }
  // Everything below reads independently — one round trip's wait, not six
  // (2026-10-05: they ran one after another, every 20 s, on every open tab).
  const [{ data: fileRows }, { data: mailRows }, { data: bidRows }, { data: openRows }, { data: archRows }, tagged] = await Promise.all([
    supabase.from("files")
      .select("id, name, contact_id, read_state, read_at, summary, read_error")
      .eq("org_id", orgId).is("deleted_at", null).in("read_state", ["reading", "read", "failed"])
      .gte("read_at", new Date(Date.now() - 24 * 3600_000).toISOString()).order("read_at", { ascending: false }).limit(10),
    supabase.from("emails")
      .select("id, created_at, subject, original_from_name, original_from_address, from_address, contact_id, status, suggested_customer_id, customer_id")
      .eq("org_id", orgId).gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()).order("created_at", { ascending: false }).limit(8),
    supabase.from("bid_packages")
      .select("id, state, error, job_id, facts, box_folder_name, filed_at, updated_at, created")
      .eq("org_id", orgId).gte("updated_at", new Date(Date.now() - 24 * 3600_000).toISOString()).order("updated_at", { ascending: false }).limit(6),
    supabase.from("document_events")
      .select("id, event, occurred_at, document:documents(job_id, decided_name, job:jobs(title))")
      .eq("org_id", orgId).in("event", ["viewed", "accepted"]).gte("occurred_at", new Date(Date.now() - 48 * 3600_000).toISOString())
      .order("occurred_at", { ascending: false }).limit(8),
    supabase.from("contacts").select("id, name, phone, archived_at, archived_reason")
      .eq("org_id", orgId).not("archived_at", "is", null).is("merged_into_contact_id", null).limit(300),
    tagItems(supabase, orgId, userId, false),
  ]);
  // Files Dusty read (migration 045/046): each read is a line; one being read
  // is "running", so the emblem spins for it too.
    for (const f of (fileRows ?? []) as Array<{ id: string; name: string; contact_id: string | null; read_state: string; read_at: string; summary: string | null; read_error: string | null }>) {
    const base = { id: `file-${f.id}-${f.read_state}`, at: f.read_at, contact_id: f.contact_id };
    if (f.read_state === "reading") items.push({ ...base, kind: "running", summary: `Reading ${clipq(f.name, 140)}…`, detail: null, tone: "live" });
    else if (f.read_state === "read") items.push({ ...base, kind: "file", summary: `Read ${clipq(f.name, 120)}${f.summary ? ` — ${clipq(f.summary, 220)}` : ""}`, detail: f.summary, tone: "good" });
    else items.push({ ...base, kind: "file", summary: `Couldn't read ${clipq(f.name, 140)}`, detail: f.read_error, tone: "warn" });
  }
  // The email mirror (migration 061): each forwarded email is a line — filed,
  // a suggestion to confirm, or one to file. Its files then show as reads above.
    for (const m of (mailRows ?? []) as Array<{ id: string; created_at: string; subject: string | null; original_from_name: string | null; original_from_address: string | null; from_address: string | null; contact_id: string | null; status: string; suggested_customer_id: string | null; customer_id: string | null }>) {
    const who = m.original_from_name || m.original_from_address || m.from_address || "someone";
    const subj = m.subject ? ` — ${clipq(m.subject, 160)}` : "";
    items.push({
      id: `email-${m.id}-${m.status}`, at: m.created_at, kind: "email", contact_id: m.contact_id,
      summary: m.status === "filed" ? `Email from ${clipq(who, 80)}${subj}`
        : m.status === "quarantined" ? `Email from an address that isn't yours${subj} — file it in Files › Emails`
          : `Email from ${clipq(who, 30)}${subj} — file it in Files › Emails`,
      detail: m.subject, tone: m.status === "filed" ? "good" : "ask",
    });
  }
  // The bid reader (migration 063): each bid it filed, or the step it's stuck on.
    for (const b of (bidRows ?? []) as Array<{ id: string; state: string; error: string | null; job_id: string | null; facts: Record<string, unknown> | null; box_folder_name: string | null; filed_at: string | null; updated_at: string; created: Record<string, unknown> | null }>) {
    const f = (b.facts ?? {}) as { project_name?: string | null; gc_company?: string | null; bid_due_text?: string | null; items?: unknown[] };
    const name = clipq(f.project_name ?? b.box_folder_name ?? "a bid", 140);
    const href = b.job_id ? `/dashboard/scope/${b.job_id}/summary` : "/dashboard/files?cat=email";
    if (b.state === "filed") {
      const isNew = !!(b.created ?? {}).job_id;
      items.push({ id: `bid-${b.id}-filed`, at: b.filed_at ?? b.updated_at, kind: "bid", contact_id: null, href,
        summary: `${isNew ? "New bid" : "Bid updated"}: ${name}${f.gc_company ? ` — ${clipq(f.gc_company, 80)}` : ""}${f.bid_due_text ? ` · due ${clipq(f.bid_due_text, 80)}` : ""}`,
        detail: `${(f.items ?? []).length} concrete item(s) read into the job's scope. Undo bid on the job takes it all back.`, tone: "good" });
    } else if (["needs_setup", "failed"].includes(b.state)) {
      items.push({ id: `bid-${b.id}-${b.state}`, at: b.updated_at, kind: "bid", contact_id: null, href,
        summary: `Bid stuck: ${name} — ${clipq(b.error ?? b.state, 180)}`, detail: b.error, tone: "warn" });
    } else if (!["undone", "not_a_bid"].includes(b.state)) {
      items.push({ id: `bid-${b.id}-${b.state}`, at: b.updated_at, kind: "running", contact_id: null, href,
        summary: `Reading a bid: ${name}…`, detail: b.error, tone: "live" });
    }
  }
  // Proposal links (migration 075): each time a customer opened one in the last two days.
    for (const e of (openRows ?? []) as unknown as Array<{ id: string; event: string; occurred_at: string; document: { job_id: string | null; decided_name: string | null; job: { title: string | null } | null } | null }>) {
    const job = e.document?.job_id ?? null;
    const title = clipq(e.document?.job?.title ?? "a job", 140);
    // Signed on the link (097): the job is won.
    if (e.event === "accepted") {
      items.push({ id: `signed-${e.id}`, at: e.occurred_at, kind: "proposal", contact_id: null, href: job ? `/dashboard/scope/${job}/summary` : undefined,
        summary: `Proposal signed: ${title}${e.document?.decided_name ? ` — by ${clipq(e.document.decided_name, 60)}` : ""}`, detail: "They approved and signed it on the link. The job is won.", tone: "good" });
      continue;
    }
    items.push({ id: `opened-${e.id}`, at: e.occurred_at, kind: "proposal", contact_id: null, href: job ? `/dashboard/scope/${job}/proposal` : undefined,
      summary: `Proposal opened: ${title}`, detail: "The customer opened the link you sent.", tone: "good" });
  }
  // Back after being archived (Coy, 2026-10-04): someone archived who called or texted since, this week,
  // with the reason Coy gave — the context comes back with them.
    const archived = (archRows ?? []) as Array<{ id: string; name: string | null; phone: string | null; archived_at: string; archived_reason: string | null }>;
  if (archived.length) {
    const { data: backRows } = await supabase.from("messages").select("contact_id, occurred_at")
      .eq("org_id", orgId).eq("direction", "inbound").in("contact_id", archived.map((c) => c.id))
      .gte("occurred_at", new Date(Date.now() - 7 * 86400_000).toISOString()).order("occurred_at", { ascending: true }).limit(500);
    const firstBack = new Map<string, string>();
    for (const m of (backRows ?? []) as Array<{ contact_id: string; occurred_at: string }>) {
      const c = archived.find((x) => x.id === m.contact_id);
      if (c && m.occurred_at > c.archived_at && !firstBack.has(c.id)) firstBack.set(c.id, m.occurred_at);
    }
    for (const c of archived) {
      const at = firstBack.get(c.id);
      if (!at) continue;
      const why = c.archived_reason && !/^(archived|deleted\b)/.test(c.archived_reason) ? c.archived_reason : null;
      const day = new Date(c.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
      items.push({ id: `back-${c.id}-${at}`, at, kind: "reminder", contact_id: c.id, href: `/dashboard/messages/${c.id}`,
        summary: `${clipq(c.name?.trim() || c.phone || "Someone", 60)} is back — archived ${day}${why ? `: ${clipq(why, 160)}` : ""}`,
        detail: why ? `You archived them on ${day} because: ${why}` : `You archived them on ${day} (no reason given).`, tone: "good" });
    }
  }
  // Internal notes that tag this member (Coy, 2026-10-04), the last week, not their own.
  items.push(...tagged);
  items.sort((a, b) => b.at.localeCompare(a.at));
  if (waiting > 0) {
    items.push({ id: "waiting", at: new Date().toISOString(), kind: "waiting", contact_id: null,
      summary: `${waiting} thread${waiting === 1 ? "" : "s"} waiting to be read`, detail: "Read four at a time, every minute, until none are left.", tone: "quiet" });
  }
  // Spam is filed on evidence from the start; the other buckets are earned.
  // Standing lines: never cut by the 20-item cap, never timestamped.
  const standing: ActivityItem[] = [];
  // Dusty reminds: what is due today or late, each linking to the person.
  type Due = { id: string; title: string; due_on: string; contact_id: string;
    contacts: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null };
  for (const t of (dueRows ?? []) as unknown as Due[]) {
    const c = Array.isArray(t.contacts) ? t.contacts[0] : t.contacts;
    const who = c?.name?.trim() || formatPhone(c?.phone ?? null);
    const late = t.due_on < todayLocal;
    standing.push({ id: `due-${t.id}`, at: new Date().toISOString(), kind: "reminder", contact_id: t.contact_id,
      summary: `${late ? "Overdue" : "Due today"}: ${clipq(t.title, 180)} — ${who}`,
      detail: `On ${who}'s next steps${late ? `, due ${t.due_on}` : ""}. Tick it off there when it's done.`,
      tone: late ? "warn" : "ask" });
  }
  for (const a of (agreeRows ?? []) as Array<{ bucket: string; guesses: number; agreed: number; streak: number }>) {
    const plural = PLURAL[a.bucket];
    if (!plural || !a.guesses) continue;
    const earned = a.streak >= AUTO_STREAK;
    standing.push({ id: `agree-${a.bucket}`, at: new Date().toISOString(), kind: "agreement", contact_id: null,
      summary: earned
        ? `Dusty files ${plural} himself now — his last ${AUTO_STREAK} matched you`
        : `Dusty matched you on ${a.agreed} of ${a.guesses} ${plural} — ${a.streak}/${AUTO_STREAK} in a row toward filing them himself`,
      detail: earned
        ? `Each one shows "auto" with Undo. An Undo, or filing one somewhere else, puts him back to 0. An auto vendor still makes leads until you keep it.`
        : `Every time you file someone Dusty had guessed, it counts. ${AUTO_STREAK} in a row and he files ${plural} himself, with Undo. A miss starts the count again.`,
      tone: earned ? "good" : "quiet" });
  }

  // Each thought says where it came from (Coy, 2026-10-02: "it would be more interesting if I knew
  // what the thought was being processed from"): the thread he read, or the day a dream was about.
  type Who = { name: string | null; phone: string | null };
  const one = (c: Who | Who[] | null | undefined) => (Array.isArray(c) ? c[0] : c) ?? null;
  const whoOf = (c: Who | null) => c?.name?.trim() || (c?.phone ? formatPhone(c.phone) : null);
  const dreams = (dreamRows ?? []) as Array<{ id: string; created_at: string; dream: string; contact_ids: string[] | null; span: string; window_start: string }>;
  const dreamIds = [...new Set(dreams.flatMap((d) => (d.contact_ids ?? []).slice(0, 3)))];
  const { data: dreamPeople } = dreamIds.length
    ? await supabase.from("contacts").select("id, name, phone").eq("org_id", orgId).in("id", dreamIds)
    : { data: [] as Array<{ id: string } & Who> };
  const people = new Map(((dreamPeople ?? []) as Array<{ id: string } & Who>).map((c) => [c.id, whoOf(c)]));
  const dayName = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" });

  return applyCookies(NextResponse.json({
    pinned, waiting, last_read_at: status?.last_read_at ?? null, items: [...items.slice(0, 20 - standing.length), ...standing],
    musings: ((museRows ?? []) as Array<{ id: string; finished_at: string | null; musing: string; contact_id: string | null; contacts: Who | Who[] | null }>).map((m) => {
      const who = whoOf(one(m.contacts));
      return { id: `muse-${m.id}`, at: m.finished_at ?? new Date().toISOString(), kind: "musing", contact_id: m.contact_id,
        summary: m.musing, detail: `From reading ${who ? `${who}'s` : "a"} calls and texts`, tone: "quiet" as const };
    }).concat(dreams.map((d) => {
      const names = (d.contact_ids ?? []).slice(0, 3).map((id) => people.get(id)).filter(Boolean);
      const extra = (d.contact_ids ?? []).length - names.length;
      return { id: `dream-${d.id}`, at: d.created_at, kind: "musing", contact_id: d.contact_ids?.[0] ?? null,
        summary: d.dream,
        detail: `A dream about ${d.span === "today" ? "today's" : `${dayName(d.window_start)}'s`} calls and texts${names.length ? ` — ${names.join(", ")}${extra > 0 ? ` +${extra}` : ""}` : ""}`,
        tone: "quiet" as const };
    })).sort((a, b) => b.at.localeCompare(a.at)),
  }));
}

/**
 * Notes that tag this member, the last week, not their own (Coy, 2026-10-04 / 2026-10-05:
 * "Internal users can be mentioned … and get a notification"). Since 081 each tag is a
 * member_notifications row written by the database, so an onsite estimator — who can't read
 * contact_notes — gets theirs, linked to the job they may open. Before 081, the notes themselves.
 */
async function tagItems(supabase: ApiSession["supabase"], orgId: string, userId: string, limited: boolean): Promise<ActivityItem[]> {
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: rows, error } = await supabase.from("member_notifications")
    .select("id, note_id, contact_id, job_id, title, body, created_at")
    .eq("user_id", userId).eq("org_id", orgId).gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(6);
  if (!error) {
    return ((rows ?? []) as Array<{ id: string; note_id: string | null; contact_id: string | null; job_id: string | null; title: string | null; body: string | null; created_at: string }>).map((n) => {
      // A question pinned on a plan sheet opens the sheet at the pin (src/lib/plan-pins.ts).
      const pin = readPin(n.body);
      const href = pin ? pinLink(pin) : limited ? (n.job_id ? `/dashboard/scope/${n.job_id}/summary` : null)
        : n.contact_id ? `/dashboard/messages/${n.contact_id}?channel=notes` : n.job_id ? `/dashboard/scope/${n.job_id}/summary` : null;
      const words = plainNote(n.body ?? "");
      return { id: `tag-${n.note_id ?? n.id}`, at: n.created_at, kind: "reminder", contact_id: limited ? null : n.contact_id, href,
        summary: `Tagged you on ${clipq(n.title ?? "a thread", 60)}: ${clipq(words.replace(/\s+/g, " "), 180)}`,
        detail: limited && !n.job_id ? `${words}\n\n(Not on one of your jobs — ask whoever tagged you.)` : words, tone: "good" as const };
    });
  }
  if (limited) return [];
  const { data: tagRows } = await supabase.from("contact_notes")
    .select("id, body, created_at, created_by, contact_id, contact:contacts(name)")
    .eq("org_id", orgId).like("body", `%(u:${userId})%`).gte("created_at", weekAgo)
    .order("created_at", { ascending: false }).limit(6);
  return ((tagRows ?? []) as unknown as Array<{ id: string; body: string; created_at: string; created_by: string | null; contact_id: string; contact: { name: string | null } | null }>)
    .filter((n) => n.created_by !== userId)
    .map((n) => ({ id: `tag-${n.id}`, at: n.created_at, kind: "reminder", contact_id: n.contact_id, href: `/dashboard/messages/${n.contact_id}?channel=notes`,
      summary: `Tagged you on ${clipq(n.contact?.name ?? "a thread", 60)}: ${clipq(plainNote(n.body).replace(/\s+/g, " "), 180)}`, detail: plainNote(n.body), tone: "good" as const }));
}
