/**
 * What Dusty sees: the screen Coy had open, fetched on the SERVER under his
 * session. The browser sends only `{kind, id}` taken from its route; every fact
 * in the prompt is read here through RLS with the org from the session, so a
 * caller cannot put words in Dusty's context or reach another org's rows.
 */

import type { ApiSession } from "@/lib/api-auth";
import { findDimensions } from "@/lib/plan-ocr";
import { priceBundle, proposalBundle } from "@/lib/proposal-server";
import { termsText, warrantyText, type DocTemplate, type Draw, type ProposalDisplay } from "@/lib/proposal";
import { takeoff, budget, jobMinimum, type BudgetLine, type OverheadItem, type SectionInput } from "@/lib/engine";
import { moneySettings, pricingFor, type JobPricing } from "@/lib/pricing-server";
import { loadTakeoff, takeoffTotalsFor } from "@/lib/plans-server";
import { fmtQty, scaleLabel } from "@/lib/takeoff";
import { settleCallNotes } from "@/lib/call-notes-server";
import { isArchivedNow } from "@/lib/archive";
import { assemble, coldContext, scopeLines, type Assembled, type Block } from "./prompt";

export type ContextRef =
  | { kind: "thread"; id: string }
  | { kind: "scope"; id: string }
  | { kind: "customer"; id: string }
  | { kind: "cash" }
  | { kind: "activity"; since: string }
  | { kind: "cold" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate what the browser sent. Anything unrecognised is cold, not an error. */
export function parseRef(raw: unknown): ContextRef {
  const r = (raw ?? {}) as { kind?: unknown; id?: unknown };
  if (r.kind === "cash") return { kind: "cash" };
  if (r.kind === "activity") {
    // "What's new since I last looked" — the emblem tap. The window is the
    // device's last catch-up, clamped to a week; anything unreadable is 24 h.
    const s = typeof (r as { since?: unknown }).since === "string" ? Date.parse((r as { since: string }).since) : NaN;
    const floor = Date.now() - 7 * 86400_000;
    const at = Number.isFinite(s) ? Math.min(Math.max(s, floor), Date.now()) : Date.now() - 86400_000;
    return { kind: "activity", since: new Date(at).toISOString() };
  }
  if ((r.kind === "thread" || r.kind === "scope" || r.kind === "customer") && typeof r.id === "string" && UUID.test(r.id)) {
    return { kind: r.kind, id: r.id };
  }
  return { kind: "cold" };
}

type Sb = ApiSession["supabase"];
const day = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") : "undated");
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function buildContext(sb: Sb, orgId: string, ref: ContextRef): Promise<Assembled> {
  const today = new Date().toISOString().slice(0, 10);
  if (ref.kind === "thread") return threadContext(sb, orgId, ref.id);
  if (ref.kind === "scope") return scopeContext(sb, orgId, ref.id);
  if (ref.kind === "customer") return customerContext(sb, orgId, ref.id);
  if (ref.kind === "cash") return cashContext(sb, orgId);
  if (ref.kind === "activity") return activityContext(sb, orgId, ref.since);
  const [{ data: org }, inbox, records, recent] = await Promise.all([
    sb.from("orgs").select("name").eq("id", orgId).maybeSingle(),
    inboxBlock(sb, orgId),
    recordsBlock(sb, orgId),
    recentBlock(sb, orgId),
  ]);
  const cold = coldContext((org?.name as string | null) ?? null, today);
  // Even with nothing open, "did you get the email I just forwarded?" has an answer (Coy, 2026-10-02).
  return { ...cold, text: `${cold.text}\n\n## ${recent.title}\n${recent.lines.join("\n")}\n\n## ${inbox.title}\n${inbox.lines.join("\n")}\n\n## ${records.title}\n${records.lines.join("\n")}` };
}

/**
 * The last three days of calls and texts, newest first, with who each person is
 * and Dusty's line on where they stand — so a chat with nothing open can answer
 * "what happened with the woman who called yesterday about a driveway?" (Coy,
 * 2026-10-03: Dusty said he had no record of Johnette Wilson's call).
 */
async function recentBlock(sb: Sb, orgId: string): Promise<Block> {
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data: rows } = await sb.from("messages").select("contact_id, channel, direction, occurred_at, body_text, summary")
    .eq("org_id", orgId).not("contact_id", "is", null).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(120);
  const msgs = (rows ?? []) as Array<{ contact_id: string; channel: string; direction: string; occurred_at: string | null; body_text: string | null; summary: string | null }>;
  const ids = [...new Set(msgs.map((m) => m.contact_id))];
  const { data: people } = ids.length
    ? await sb.from("contacts").select("id, name, phone, contact_type, classification_confirmed_at, auto_classified_at, status_summary").eq("org_id", orgId).in("id", ids)
    : { data: [] };
  const who = new Map(((people ?? []) as Array<{ id: string; name: string | null; phone: string | null; contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null; status_summary: string | null }>)
    .map((c) => [c.id, c]));
  const central = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "?");
  const lines = msgs.map((m) => {
    const c = who.get(m.contact_id);
    if (c?.contact_type === "spam" && (c.classification_confirmed_at || c.auto_classified_at)) return null;
    const bucket = c && (c.classification_confirmed_at || c.auto_classified_at) ? c.contact_type : "unsorted";
    const name = c?.name?.trim() || c?.phone || "unknown number";
    const what = m.channel === "call" ? `CALL — ${m.summary?.trim() || "nothing said on record"}` : `TEXT: ${m.body_text?.trim() || "(photo or attachment)"}`;
    return `- ${central(m.occurred_at)} Central · ${m.direction === "outbound" ? `Coy → ${name}` : `${name} →`} (${bucket}; contact ${m.contact_id}) · ${what}`.slice(0, 600);
  }).filter((x): x is string => !!x);
  const standing = ids.map((id) => who.get(id)).filter((c) => c?.status_summary).slice(0, 25)
    .map((c) => `- ${c!.name?.trim() || c!.phone}: ${c!.status_summary}`);
  return {
    title: "Calls and texts in the last three days (newest first, times in Central)",
    lines: lines.length ? [...lines, "", "Where each of them stands (your earlier read):", ...standing] : ["None in the last three days."],
  };
}

/**
 * Every thread, customer and job by id — what Dusty needs to propose archiving or
 * deleting (Coy, 2026-10-03: "Dusty needs the ability to do all of it for me if I
 * ask"). He proposes; Coy's tap applies it (src/lib/dusty/plan.ts RECORD_RULES).
 * A thread where nothing was ever said is marked NOTHING SAID.
 */
async function recordsBlock(sb: Sb, orgId: string): Promise<Block> {
  const [{ data: msgs }, { data: people }, { data: jobs }, { data: custs }] = await Promise.all([
    sb.from("messages").select("contact_id, channel, direction, occurred_at, body_text, summary").eq("org_id", orgId)
      .not("contact_id", "is", null).order("occurred_at", { ascending: false }).limit(4000),
    sb.from("contacts").select("id, name, phone, contact_type, classification_confirmed_at, auto_classified_at, archived_at")
      .eq("org_id", orgId).is("merged_into_contact_id", null).limit(1500),
    sb.from("jobs").select("id, title, status, archived_at, customer_id").eq("org_id", orgId).order("created_at", { ascending: false }).limit(200),
    sb.from("customers").select("id, name, archived_at").eq("org_id", orgId).is("merged_into_customer_id", null).limit(500),
  ]);
  const per = new Map<string, { last: string | null; lastIn: string | null; n: number; said: boolean }>();
  for (const m of (msgs ?? []) as Array<{ contact_id: string; channel: string | null; direction: string | null; occurred_at: string | null; body_text: string | null; summary: string | null }>) {
    const e = per.get(m.contact_id) ?? { last: m.occurred_at, lastIn: null, n: 0, said: false };
    e.n++;
    e.said ||= m.channel !== "call" || !!(m.body_text ?? "").trim() || !!(m.summary ?? "").trim();
    if (!e.lastIn && m.direction === "inbound") e.lastIn = m.occurred_at;
    per.set(m.contact_id, e);
  }
  const live: Array<[string, string]> = [], gone: string[] = [];
  for (const c of (people ?? []) as Array<{ id: string; name: string | null; phone: string | null; contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null; archived_at: string | null }>) {
    const e = per.get(c.id);
    if (!e) continue;
    const bucket = c.classification_confirmed_at || c.auto_classified_at ? c.contact_type ?? "unsorted" : "unsorted";
    const line = `- contact ${c.id} · ${c.name?.trim() || c.phone || "unknown"} · ${bucket} · ${e.n} message${e.n === 1 ? "" : "s"}, last ${day(e.last)}${e.said ? "" : " · NOTHING SAID"}`;
    if (isArchivedNow(c.archived_at, e.lastIn)) gone.push(line); else live.push([e.last ?? "", line]);
  }
  // Newest first, so "the top of the list" means the same here as on Coy's screen.
  live.sort((a, b) => b[0].localeCompare(a[0]));
  const jobRows = (jobs ?? []) as Array<{ id: string; title: string | null; status: string | null; archived_at: string | null }>;
  const custRows = (custs ?? []) as Array<{ id: string; name: string | null; archived_at: string | null }>;
  return {
    title: "Threads, customers and jobs — ids for archive / delete plans",
    trimmable: true,
    lines: [
      `Threads in the lists (${live.length}, newest first):`, ...live.slice(0, 250).map(([, l]) => l),
      `Archived threads (${gone.length}):`, ...gone.slice(0, 60),
      "Jobs:", ...jobRows.filter((j) => !j.archived_at).slice(0, 100).map((j) => `- job ${j.id} · ${j.title || "untitled"} · ${j.status}`),
      "Deleted or archived jobs:", ...jobRows.filter((j) => j.archived_at).slice(0, 40).map((j) => `- job ${j.id} · ${j.title || "untitled"}`),
      "Customers:", ...custRows.filter((c) => !c.archived_at && c.name).slice(0, 150).map((c) => `- customer ${c.id} · ${c.name}`),
      "Deleted customers:", ...custRows.filter((c) => c.archived_at).slice(0, 40).map((c) => `- customer ${c.id} · ${c.name || "unnamed"}`),
    ],
  };
}

const BID_STATE: Record<string, string> = {
  waiting: "waiting to be read", listing: "listing its Box folder", fetching: "copying its files", scanning: "reading its plans and specs",
  extracting: "being read", filing: "being filed", filed: "read and filed as a job", needs_setup: "waiting — Box isn't set up",
  failed: "stuck", not_a_bid: "read — the bid reader found no bid in it", undone: "taken back (Undo bid)",
};

/**
 * The intake inbox (§2h): the latest emails Coy forwarded, who wrote them, where
 * each was filed and what the bid reader made of it — plus the newest one's
 * text when it came in the last two days, so Dusty can say what Ben wants.
 */
async function inboxBlock(sb: Sb, orgId: string): Promise<Block> {
  const { data } = await sb.from("emails")
    .select("id, subject, original_from_name, original_from_address, from_address, created_at, status, job_id, text_body")
    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(8);
  const rows = (data ?? []) as Array<{ id: string; subject: string | null; original_from_name: string | null; original_from_address: string | null; from_address: string | null; created_at: string; status: string; job_id: string | null; text_body: string | null }>;
  const title = "The intake inbox — latest forwarded emails, newest first (times UTC)";
  if (!rows.length) return { title, lines: ["No emails have come in."] };
  const ids = rows.map((r) => r.id);
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))] as string[];
  const [{ data: pkgs }, { data: jobs }, { count: files }] = await Promise.all([
    sb.from("bid_packages").select("email_id, state, error").eq("org_id", orgId).in("email_id", ids),
    jobIds.length ? sb.from("jobs").select("id, title").eq("org_id", orgId).in("id", jobIds) : Promise.resolve({ data: [] }),
    sb.from("job_files").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("email_id", rows[0].id).is("deleted_at", null),
  ]);
  const pkg = new Map(((pkgs ?? []) as Array<{ email_id: string; state: string; error: string | null }>).map((p) => [p.email_id, p]));
  const job = new Map(((jobs ?? []) as Array<{ id: string; title: string | null }>).map((j) => [j.id, j.title]));
  const lines = rows.map((e) => {
    const p = pkg.get(e.id);
    const who = e.original_from_name || e.original_from_address || e.from_address || "unknown";
    return `- [${day(e.created_at)}] from ${who} — "${e.subject || "(no subject)"}" · ${e.job_id ? `filed on the job "${job.get(e.job_id) ?? "untitled"}"` : e.status}${p ? ` · bid reader: ${BID_STATE[p.state] ?? p.state}${p.error ? ` (${p.error})` : ""}` : ""}${e.text_body ? "" : " · (its text didn't come through)"}`.slice(0, 400);
  });
  const newest = rows[0];
  if (newest.text_body && Date.now() - Date.parse(newest.created_at) < 2 * 86400_000) {
    lines.push("", `Newest email's text (${files ?? 0} file${files === 1 ? "" : "s"} came with it):`, newest.text_body.replace(/\n{3,}/g, "\n\n").slice(0, 8000));
  }
  return { title, lines };
}

async function contactBlock(sb: Sb, orgId: string, contactId: string) {
  const { data: c } = await sb.from("contacts")
    .select("id, name, name_source, name_confirmed_at, phone, address, customer_id, merged_into_contact_id, contact_type, contact_subtype, classification_confirmed_at, auto_classified_at, status_summary")
    .eq("org_id", orgId).eq("id", contactId).maybeSingle();
  if (!c) return null;
  const [{ data: phones }, { data: jobs }, { data: tasks }, { data: notes }, { data: musings }, { data: dreams }] = await Promise.all([
    sb.from("contact_phones").select("phone_e164").eq("org_id", orgId).eq("contact_id", contactId),
    sb.from("jobs").select("id, title, status, created_at").eq("org_id", orgId).eq("contact_id", contactId).is("archived_at", null),
    // The next-steps checklist (migration 038) — Coy's own items and Dusty's —
    // so "what do I owe them?" is answered from it.
    sb.from("contact_tasks").select("title, due_on, source").eq("org_id", orgId).eq("contact_id", contactId)
      .eq("status", "open").order("due_on", { ascending: true, nullsFirst: false }).limit(15),
    // Coy's own notes on them (migration 041): "Dusty needs access to all
    // customer and vendor notes." Newest 20.
    sb.from("contact_notes").select("body, created_at").eq("org_id", orgId).eq("contact_id", contactId)
      .order("created_at", { ascending: false }).limit(20),
    // His own passing thoughts about them, as the activity line showed them — Coy taps one
    // to talk about it (2026-10-02), so Dusty has to know what he said.
    sb.from("contact_enrich_runs").select("musing, finished_at").eq("org_id", orgId).eq("contact_id", contactId)
      .not("musing", "is", null).order("started_at", { ascending: false }).limit(5),
    sb.from("dusty_dreams").select("dream, created_at").eq("org_id", orgId).contains("contact_ids", [contactId])
      .order("created_at", { ascending: false }).limit(3),
  ]);
  const numbers = [...new Set([c.phone, ...((phones ?? []) as Array<{ phone_e164: string }>).map((p) => p.phone_e164)].filter(Boolean))];
  const name = (c.name as string | null)?.trim() || null;
  // The bucket, only when it counts (DECISIONS §2b): Coy's, or Dusty's own filing.
  const relation = c.classification_confirmed_at
    ? `${c.contact_type}${c.contact_subtype ? ` (${String(c.contact_subtype).replace(/_/g, " ")})` : ""} — confirmed by Coy`
    : c.auto_classified_at ? `${c.contact_type} — filed by Dusty, not yet kept by Coy` : "unsorted — nobody has said";
  const todo = (tasks ?? []) as Array<{ title: string; due_on: string | null; source: string }>;
  const block: Block = {
    title: "Contact",
    lines: [
      `Name: ${name ? `${name}${c.name_confirmed_at ? " (confirmed by Coy)" : c.name_source === "machine" ? " (they introduced themselves by this name; Coy hasn't confirmed it)" : " (NOT confirmed — may be wrong)"}` : "not recorded"}`,
      `Numbers: ${numbers.join(", ") || "not recorded"}`,
      `Address: ${(c.address as string | null)?.trim() || "not recorded"}`,
      `What they are to the business: ${relation}`,
      `Jobs: ${(jobs ?? []).length ? (jobs as Array<{ title: string | null; status: string | null }>).map((j) => `${j.title || "untitled"} (${j.status})`).join("; ") : "none"}`,
      `Where it stands (Dusty's earlier read): ${(c.status_summary as string | null) ?? "not read yet"}`,
      `Open next steps: ${todo.length ? todo.map((t) => `${t.title}${t.due_on ? ` (due ${t.due_on})` : ""}${t.source === "coy" ? " [Coy's own]" : " [suggested]"}`).join("; ") : "none"}`,
      `Coy's notes on them (newest first): ${((notes ?? []) as Array<{ body: string; created_at: string }>).length
        ? ((notes ?? []) as Array<{ body: string; created_at: string }>).map((n) => `[${day(n.created_at)}] ${n.body.replace(/\s+/g, " ").slice(0, 600)}`).join(" | ")
        : "none"}`,
      `Your own passing thoughts about them, as the activity line showed them (if Coy asks about one, it is one of these; say what in the conversation it came from): ${
        [...((musings ?? []) as Array<{ musing: string; finished_at: string | null }>).map((m) => `[${day(m.finished_at)}] "${m.musing}"`),
         ...((dreams ?? []) as Array<{ dream: string; created_at: string }>).map((d) => `[${day(d.created_at)}, a dream] "${d.dream}"`)].join(" | ") || "none"}`,
    ],
  };
  return { block, name: name ?? (numbers[0] as string | undefined) ?? "unknown number" };
}


/** What Dusty has read in the files on a job or a person (migration 045), newest 20. */
/**
 * Emails forwarded to the intake inbox and filed here (migration 061):
 * subject, sender and date only — the bid reader reads the bodies (see The bid); this is
 * so Dusty can say "the plans came in Ben's email of 9/30".
 */
async function emailsBlock(sb: Sb, orgId: string, by: { jobId?: string; customerId?: string }): Promise<Block | null> {
  let q = sb.from("emails").select("subject, original_from_name, original_from_address, from_address, sent_at, created_at")
    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(10);
  q = by.jobId ? q.eq("job_id", by.jobId) : q.eq("customer_id", by.customerId as string);
  const { data } = await q;
  const rows = (data ?? []) as Array<{ subject: string | null; original_from_name: string | null; original_from_address: string | null; from_address: string | null; sent_at: string | null; created_at: string }>;
  if (!rows.length) return null;
  return {
    title: "Emails filed here (forwarded to the intake inbox; their files are in the files list)",
    trimmable: true,
    lines: rows.map((e) => `[${day(e.sent_at ?? e.created_at)}] from ${e.original_from_name || e.original_from_address || e.from_address || "unknown"} — ${e.subject || "(no subject)"}`.slice(0, 300)),
  };
}

/**
 * The bid behind a job (migration 063): what the bid reader kept from the
 * forwarded email, its documents and its Box folder — every value written
 * there — and the concrete scope with the sheet and line that shows each item.
 */
async function bidBlock(sb: Sb, orgId: string, jobId: string): Promise<Block | null> {
  const { data } = await sb.from("bid_packages").select("state, error, facts, box_url, box_folder_name, filed_at, created_at")
    .eq("org_id", orgId).eq("job_id", jobId).neq("state", "undone").order("created_at", { ascending: false }).limit(3);
  const pkgs = (data ?? []) as Array<{ state: string; error: string | null; facts: Record<string, unknown> | null; box_url: string | null; box_folder_name: string | null; filed_at: string | null; created_at: string }>;
  if (!pkgs.length) return null;
  const f = (pkgs[0].facts ?? {}) as {
    project_name?: string | null; gc_company?: string | null; bid_due_text?: string | null; prebid_text?: string | null; scope_summary?: string | null
    estimator?: { name?: string | null; email?: string | null; phone?: string | null }; address?: { line?: string | null; city?: string | null }
    items?: Array<{ name: string; psi: number | null; thickness_in: number | null; reinforcement: string | null; spec_section: string | null; sheets: string[]; quote: string }>
  };
  const est = f.estimator ?? {};
  return {
    title: `The bid (read by the bid reader from ${pkgs.length} forwarded email${pkgs.length === 1 ? "" : "s"}${pkgs[0].box_folder_name ? ` and the Box folder "${pkgs[0].box_folder_name}"` : ""}; every value below is written in them)`,
    lines: [
      `State: ${pkgs[0].state}${pkgs[0].error ? ` (${pkgs[0].error})` : ""}`,
      f.project_name ? `Project: ${f.project_name}` : null,
      f.gc_company ? `GC: ${f.gc_company}` : null,
      est.name || est.email ? `Estimator: ${[est.name, est.email, est.phone].filter(Boolean).join(" · ")}` : null,
      f.bid_due_text ? `Bids due: ${f.bid_due_text}` : "Bids due: not written in what was read",
      f.prebid_text ? `Pre-bid: ${f.prebid_text}` : null,
      f.address?.line ? `Site: ${[f.address.line, f.address.city].filter(Boolean).join(", ")}` : null,
      f.scope_summary ? `Scope summary: ${f.scope_summary}` : null,
      "Concrete scope items (name · psi · thickness · reinforcement · spec · sheets — the line that shows it):",
      ...(f.items ?? []).map((i) => `- ${i.name} · ${i.psi ?? "—"} psi · ${i.thickness_in ?? "—"}" · ${i.reinforcement ?? "—"} · ${i.spec_section ?? "—"} · ${i.sheets.join(", ") || "—"} — "${i.quote}"`.slice(0, 500)),
    ].filter((x): x is string => !!x),
  };
}

async function filesBlock(sb: Sb, orgId: string, by: { jobId?: string; contactId?: string }): Promise<Block | null> {
  let q = sb.from("job_files").select("name, category, summary, facts, read_state, read_error, created_at")
    .eq("org_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).limit(20);
  q = by.jobId ? q.eq("job_id", by.jobId) : q.eq("contact_id", by.contactId as string);
  const { data } = await q;
  const rows = (data ?? []) as Array<{ name: string; category: string | null; summary: string | null; facts: Record<string, unknown> | null; read_state: string | null; read_error: string | null; created_at: string }>;
  if (!rows.length) return null;
  return {
    title: "Files on it (uploaded; your earlier reads — suggestions, not confirmed)",
    trimmable: true,
    lines: rows.map((f) => {
      const facts = f.facts ? Object.entries(f.facts).filter(([k]) => !["prompt", "dropped"].includes(k))
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join("; ") : "";
      const said = f.read_state === "read" ? `${f.summary ?? ""}${facts ? ` [${facts}]` : ""}`
        : f.category === "plan" && f.read_state === "skipped" ? "plan sheets — their text is under \"What the plans and specs say\" when the bid reader read them"
        : f.read_state === "skipped" || f.read_state === "failed" ? `not read (${f.read_error ?? f.read_state})` : "not read yet";
      return `[${day(f.created_at)}] ${f.name}${f.category ? ` (${f.category})` : ""} — ${said}`.slice(0, 1500);
    }),
  };
}

async function threadContext(sb: Sb, orgId: string, contactId: string): Promise<Assembled> {
  const who = await contactBlock(sb, orgId, contactId);
  if (!who) return coldContext(null, new Date().toISOString().slice(0, 10));

  const { data: rows } = await sb.from("messages")
    .select("id, channel, direction, occurred_at, body_text, summary, duration_seconds")
    .eq("org_id", orgId).eq("contact_id", contactId)
    .order("occurred_at", { ascending: false }).limit(80);
  const msgs = ((rows ?? []) as Array<{ id: string; channel: string; direction: string; occurred_at: string | null; body_text: string | null; summary: string | null; duration_seconds: number | null }>).reverse();

  const callIds = msgs.filter((m) => m.channel === "call").map((m) => m.id);
  const { data: arts } = callIds.length
    ? await sb.from("call_artifacts").select("message_id, kind, content").eq("org_id", orgId)
        .in("message_id", callIds).in("kind", ["next_steps", "transcript"])
    : { data: [] };
  const next = new Map<string, string>();
  const transcripts = new Map<string, string>();
  for (const a of (arts ?? []) as Array<{ message_id: string; kind: string; content: string | null }>) {
    if (!a.content) continue;
    if (a.kind === "next_steps") next.set(a.message_id, a.content.trim());
    if (a.kind === "transcript") transcripts.set(a.message_id, a.content.trim());
  }

  const lines = msgs.map((m) => {
    const dir = m.direction === "outbound" ? "OUT (Coy)" : "IN (them)";
    if (m.channel === "call") {
      const bits = [`${day(m.occurred_at)} ${dir} CALL${m.duration_seconds ? ` ${m.duration_seconds}s` : ""}`];
      bits.push(m.summary?.trim() ? `summary: ${m.summary.trim()}` : "no summary");
      if (next.has(m.id)) bits.push(`next steps: ${next.get(m.id)!.replace(/\n+/g, " / ")}`);
      return bits.join(" — ");
    }
    return `${day(m.occurred_at)} ${dir} TEXT: ${m.body_text?.trim() || "(no text — photo or attachment)"}`;
  });

  const recentTranscripts = msgs.filter((m) => transcripts.has(m.id)).slice(-3)
    .map((m) => `[${day(m.occurred_at)} call]\n${transcripts.get(m.id)!.slice(0, 12000)}`);

  const files = await filesBlock(sb, orgId, { contactId });
  return assemble(`${who.name}'s thread`, [
    { title: "Ids (for an archive / delete plan)", lines: [`This thread: contact ${contactId}`] },
    who.block,
    ...(files ? [files] : []),
    { title: `Messages (last ${msgs.length}, oldest first)`, lines, trimmable: true },
    { title: "Full transcripts of the most recent calls", lines: recentTranscripts, trimmable: true },
  ]);
}

async function settingsAndOverhead(sb: Sb, orgId: string) {
  const [money, { data: oh }] = await Promise.all([
    moneySettings(sb, orgId),
    sb.from("overhead_items").select("label, amount, cadence, active").eq("org_id", orgId),
  ]);
  const overhead = ((oh ?? []) as Array<{ label: string; amount: unknown; cadence: string; active: boolean }>)
    .map((o) => ({ ...o, amount: Number(o.amount) })) as OverheadItem[];
  return { money, overhead };
}

async function scopeContext(sb: Sb, orgId: string, jobId: string): Promise<Assembled> {
  const { data: job } = await sb.from("jobs").select("id, title, status, address, contact_id, customer_id, duration_days")
    .eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (!job) return coldContext(null, new Date().toISOString().slice(0, 10));
  const [{ data: secs }, pricing, who, files] = await Promise.all([
    sb.from("job_sections").select("id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, rebar, prep_notes, access_notes, source_ref, count_qty, count_unit")
      .eq("org_id", orgId).eq("job_id", jobId).order("sort_order"),
    pricingFor(sb, orgId, [jobId]),
    job.contact_id ? contactBlock(sb, orgId, job.contact_id as string) : Promise.resolve(null),
    filesBlock(sb, orgId, { jobId }),
  ]);
  const sections: SectionInput[] = ((secs ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string, name: r.name as string | null, work_type: r.work_type as string,
    length_ft: num(r.length_ft), width_ft: num(r.width_ft), sqft_override: num(r.sqft_override), depth_in: num(r.depth_in), psi: num(r.psi),
    count_qty: num(r.count_qty), count_unit: (r.count_unit as string | null) ?? null,
  }));
  const t = takeoff(sections, null);
  const days = num(job.duration_days);
  const jp = pricing.get(jobId) ?? null;
  const [bud, plans, prop, mail, bid, ocr, book, bidText, calls] = await Promise.all([budgetBlock(sb, orgId, jobId, sections, days, jp), plansBlock(sb, orgId, jobId), proposalBlock(sb, orgId, jobId), emailsBlock(sb, orgId, { jobId }), bidBlock(sb, orgId, jobId), ocrBlock(sb, orgId, jobId), priceBookBlock(sb, orgId), bidTextBlock(sb, orgId, jobId),
    callsBlock(sb, orgId, job.contact_id as string | null, job.customer_id as string | null)]);
  // Areas by ref, for a budget plan (src/lib/dusty/plan.ts).
  const areaRefs = ((secs ?? []) as Array<Record<string, unknown>>).map((r) => {
    const sq = num(r.sqft_override) ?? (num(r.length_ft) !== null && num(r.width_ft) !== null ? (num(r.length_ft) as number) * (num(r.width_ft) as number) : null);
    const cnt = num(r.count_qty);
    return `- ${String(r.id).slice(0, 8)} · ${r.name || "Unnamed area"} (${r.work_type})${cnt !== null && sq === null ? ` · counted ${cnt} ${(r.count_unit as string | null) ?? "EA"} (an item priced per each with no typed qty takes this count)` : sq !== null ? ` · ${fmt0(sq)} sf = ${(sq / 9).toFixed(2)} SY` : " · area not set"}${num(r.depth_in) !== null ? ` · ${num(r.depth_in)} in` : ""}${r.source_ref ? ` · from the bid: ${String(r.source_ref).slice(0, 160)}` : ""}`;
  });
  const notes = ((secs ?? []) as Array<Record<string, unknown>>).flatMap((r) =>
    [["reinforcement", r.rebar], ["prep", r.prep_notes], ["access", r.access_notes]]
      .filter(([, v]) => typeof v === "string" && v).map(([k, v]) => `- ${r.name || "section"} ${k}: ${v}`));
  const title = (job.title as string | null) || "Untitled scope";
  return assemble(`scope: ${title}`, [
    { title: "Job", lines: [`Title: ${title}`, `Id (for an archive / delete plan): job ${jobId}${job.customer_id ? `; its customer: customer ${job.customer_id}` : ""}`, `Status: ${job.status}`, `Address: ${(job.address as string | null) || "not recorded"}`,
      `Days on this job: ${days ?? "not set"}`, `For: ${who ? who.name : "no customer attached"}`,
      `Pricing: O.H. ${jp?.settings.overhead_pct ?? "NOT SET"}%, margin ${jp?.settings.margin_pct ?? "NOT SET"}% — price = cost × (1 + O.H.) ÷ (1 − margin)`,
      `Sales tax: ${jp?.tax.rate !== null && jp?.tax.rate !== undefined ? `${jp.tax.rate}% (${jp.tax.source === "override" ? "typed for this job" : `${jp.tax.parish} parish`})` : `unknown — ${jp?.tax.missing ?? "no rate"}`}`] },
    ...(bid ? [bid] : []),
    ...(calls ?? []),
    { title: "Sections and their quantities (exactly what the builder shows)", lines: scopeLines(t, !!bud) },
    { title: "Areas — refs for a budget plan (\"job\" = whole job)", lines: areaRefs },
    ...(bud ? [bud] : []),
    ...(book ? [book] : []),
    ...(plans ? [plans] : []),
    ...(ocr ? [ocr] : []),
    ...(bidText ? [bidText] : []),
    ...(prop ? [prop] : []),
    ...(mail ? [mail] : []),
    { title: "Section notes", lines: notes },
    ...(files ? [files] : []),
    ...(who ? [who.block] : []),
  ], 110000);
}

/**
 * The calls about a job (Coy, 2026-10-03: notes on a live call, then "Dusty can
 * finish putting the quote together"): the caller's and their customer's latest
 * calls, each with its summary, next steps and Coy's notes taken on it, and the
 * full transcripts of the newest two. Read under the session.
 */
async function callsBlock(sb: Sb, orgId: string, contactId: string | null, customerId: string | null): Promise<Block[] | null> {
  let ids = contactId ? [contactId] : [];
  if (customerId) {
    const { data } = await sb.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", customerId).is("merged_into_contact_id", null).limit(20);
    ids = [...new Set([...ids, ...((data ?? []) as Array<{ id: string }>).map((c) => c.id)])];
  }
  if (!ids.length) return null;
  await settleCallNotes(sb, orgId, ids);
  const { data: rows } = await sb.from("messages").select("id, direction, occurred_at, summary")
    .eq("org_id", orgId).in("contact_id", ids).eq("channel", "call").order("occurred_at", { ascending: false }).limit(4);
  const calls = (rows ?? []) as Array<{ id: string; direction: string; occurred_at: string | null; summary: string | null }>;
  if (!calls.length) return null;
  const callIds = calls.map((c) => c.id);
  const [{ data: arts }, { data: notes }] = await Promise.all([
    sb.from("call_artifacts").select("message_id, kind, content").eq("org_id", orgId).in("message_id", callIds).in("kind", ["next_steps", "transcript"]),
    sb.from("contact_notes").select("message_id, body, created_at").eq("org_id", orgId).in("message_id", callIds).order("created_at"),
  ]);
  const art = new Map<string, string>();
  for (const a of (arts ?? []) as Array<{ message_id: string; kind: string; content: string | null }>) if (a.content) art.set(`${a.kind}:${a.message_id}`, a.content.trim());
  const noteBy = new Map<string, string[]>();
  for (const n of (notes ?? []) as Array<{ message_id: string; body: string }>) noteBy.set(n.message_id, [...(noteBy.get(n.message_id) ?? []), n.body.replace(/\s+/g, " ").slice(0, 2000)]);
  const lines = calls.map((c) => [
    `[${day(c.occurred_at)} ${c.direction === "outbound" ? "Coy called" : "they called"}]`,
    `summary: ${c.summary?.trim() || "none"}`,
    art.has(`next_steps:${c.id}`) ? `next steps: ${art.get(`next_steps:${c.id}`)!.replace(/\n+/g, " / ")}` : null,
    noteBy.has(c.id) ? `COY'S NOTES TAKEN ON THIS CALL: ${noteBy.get(c.id)!.join(" | ")}` : "Coy's notes on this call: none",
  ].filter(Boolean).join(" — "));
  const tx = calls.filter((c) => art.has(`transcript:${c.id}`)).slice(0, 2)
    .map((c) => `[${day(c.occurred_at)} call]\n${art.get(`transcript:${c.id}`)!.slice(0, 10000)}`);
  return [
    { title: "Calls about this job (newest first; Coy's notes on a call are his own words — what he heard and wants)", lines },
    ...(tx.length ? [{ title: "Transcripts of the newest calls (machine-heard: names and numbers can be misheard; Coy's notes win where they differ)", lines: tx, trimmable: true }] : []),
  ];
}

const fmt0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * Coy's Price book, one line per active item with an 8-character ref, for
 * Dusty to choose from and to plan with (Coy, 2026-10-02: "analyze the list of
 * items in my cost book and apply the items that I might need"). Read under the
 * session (RLS); names, units, costs, rules and groups only.
 */
async function priceBookBlock(sb: Sb, orgId: string): Promise<Block | null> {
  const [{ data: items }, { data: groups }, { data: asm }] = await Promise.all([
    sb.from("cost_items").select("id, name, unit, unit_cost, cost_type, qty_rule, cost_group_id").eq("org_id", orgId).eq("active", true).order("name").limit(1500),
    sb.from("cost_groups").select("id, name, cost_type").eq("org_id", orgId).order("sort_order").order("name"),
    sb.from("cost_assemblies").select("id, name, job_type, work_type, auto_load, cost_assembly_items(cost_item_id, quantity, sort_order)").eq("org_id", orgId).order("sort_order").order("name"),
  ]);
  if (!items?.length && !groups?.length) return { title: "Price book", lines: ["Empty — no items yet. Propose new_item steps if Coy asks."] };
  const gName = new Map(((groups ?? []) as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]));
  const byGroup = new Map<string, string[]>();
  for (const r of (items ?? []) as Array<Record<string, unknown>>) {
    const g = gName.get(r.cost_group_id as string) ?? "Not in a group";
    const cost = r.unit_cost === null || r.unit_cost === undefined ? "no cost" : `$${Number(r.unit_cost)}`;
    const line = `  ${String(r.id).slice(0, 8)} | ${String(r.name).slice(0, 70)} | ${r.unit} | ${cost} | ${r.qty_rule} | ${r.cost_type}`;
    byGroup.set(g, [...(byGroup.get(g) ?? []), line]);
  }
  const out = [`${items?.length ?? 0} items in ${groups?.length ?? 0} groups. Each line: ref | name | unit | unit cost | how counted | type.`];
  for (const g of (groups ?? []) as Array<{ name: string }>) if (!byGroup.has(g.name)) out.push(`GROUP ${g.name}: (empty)`);
  for (const [g, ls] of byGroup) out.push(`GROUP ${g}:`, ...ls);
  // Assemblies by ref, with their items by ref — to load onto an area, add to, or to see one is missing.
  type Asm = { id: string; name: string; job_type: string | null; work_type: string | null; auto_load: boolean; cost_assembly_items: Array<{ cost_item_id: string; quantity: number | null; sort_order: number }> | null };
  const iName = new Map(((items ?? []) as Array<{ id: string; name: string }>).map((i) => [i.id, i.name]));
  if (asm?.length) {
    out.push("ASSEMBLIES (ref | name | applies to | items):");
    for (const a of asm as Asm[]) {
      const applies = a.work_type ? `${a.job_type ?? "any job"} · ${a.work_type}${a.auto_load ? " · fills new areas on its own" : ""}` : "loaded by hand";
      const list = [...(a.cost_assembly_items ?? [])].sort((x, y) => x.sort_order - y.sort_order)
        .map((x) => `${x.cost_item_id.slice(0, 8)} ${iName.get(x.cost_item_id) ?? "(retired item)"}${x.quantity !== null ? ` ×${Number(x.quantity)}` : ""}`).join("; ");
      out.push(`  ${a.id.slice(0, 8)} | ${a.name} | ${applies} | ${list || "no items"}`);
    }
  } else out.push("ASSEMBLIES: none yet.");
  return { title: "Price book (items and assemblies you can plan with, by ref)", lines: out };
}

/**
 * The job's proposal (migration 060) — the draft, or the latest final — priced
 * by the same priceDraft() the page uses: the rounded total, what is hidden,
 * and whether the draws add up. Reads only; never makes a draft.
 */
async function proposalBlock(sb: Sb, orgId: string, jobId: string): Promise<Block | null> {
  const b = await proposalBundle(sb, orgId, jobId, { create: false });
  if (!b?.proposal) return null;
  const p = b.proposal as Record<string, unknown>;
  const d = (p.display ?? {}) as ProposalDisplay;
  const { priced, check } = priceBundle(b);
  const type = b.types.find((t) => t.key === p.project_type);
  const orgName = b.org?.name ?? "";
  const w = warrantyText(p.warranty as never, b.templates as DocTemplate[], orgName);
  const t = termsText(p.terms as never, b.templates as DocTemplate[], orgName);
  const lines = [
    `Proposal ${(b.job.job_number as string | null) ?? "P"}-${p.version} · ${p.status === "final" ? `FINAL (frozen ${String(p.finalized_at).slice(0, 10)} — what the customer was shown)` : "draft"} · type ${type?.label ?? "not set"}`,
  ];
  if (priced.ok) {
    lines.push(`Customer's total ${priced.total.toFixed(2)} (budget price ${priced.calc.toFixed(2)} rounded UP to ${priced.rounded} — the proposal rounds to the next $50, the budget keeps the exact number; tax ${priced.tax.toFixed(2)}${priced.tax_shown ? " shown as a line" : " folded into the areas"}${priced.discount ? `; discount ${priced.discount.toFixed(2)}` : ""})`);
    lines.push(`Cost ${priced.cost.toFixed(2)}, O.H. ${priced.overhead.toFixed(2)}, profit ${priced.profit.toFixed(2)}${priced.addons_total ? `; optional add-ons not in the total ${priced.addons_total.toFixed(2)}` : ""}`);
    for (const g of priced.groups) lines.push(`- ${g.name}: ${g.hidden ? "HIDDEN from the proposal" : g.price_hidden ? "price hidden (still counted)" : g.sell.toFixed(2)}${g.items.some((i) => i.hidden) ? ` (${g.items.filter((i) => i.hidden).length} line(s) hidden)` : ""}`);
  } else lines.push(`No price yet: ${priced.blocked.slice(0, 5).join("; ")}`);
  const off = Object.keys(d.off ?? {});
  lines.push(`Sections hidden: ${off.length ? off.join(", ") : "none"}. Shows item prices: ${d.show_item_prices ? "yes" : "no"}; qty: ${d.show_qty ? "yes" : "no"}.`);
  lines.push(`Draws: ${((p.draws ?? []) as Draw[]).map((x) => `${x.amt !== null && x.amt !== undefined ? `$${x.amt}` : `${x.pct ?? 0}%`} ${x.when}`).join(" · ") || "none"}${check ? (check.ok ? " — add up to the total" : ` — DO NOT add up: ${check.sum.toFixed(2)} against ${priced.ok ? priced.total.toFixed(2) : "?"}`) : ""}`);
  lines.push(`Warranty: ${w.template?.name ?? (w.edited ? "written for this job" : "none")}${w.edited ? " (edited)" : ""}${w.starter ? " — starter text, not yet checked by Coy's attorney" : ""}`);
  lines.push(`Contract: ${t.template?.name ?? (t.edited ? "written for this job" : "none")}, ${t.clauses.length} clauses${t.starter ? " — starter text" : ""}`);
  return { title: "Proposal (what the customer sees)", lines };
}

/**
 * The Plan Room (migration 059): each sheet's scale and each takeoff group's
 * measured total, worked out by src/lib/takeoff.ts exactly as the page shows
 * it — or why it has no number (a sheet whose scale isn't set).
 */
async function plansBlock(sb: Sb, orgId: string, jobId: string): Promise<Block | null> {
  const { sheets, params, measurements, totals } = await loadTakeoff(sb, orgId, [jobId]);
  if (!sheets.length && !params.length) return null;
  const lines: string[] = [];
  const scaled = sheets.filter((s) => s.scale_ft_per_pt);
  lines.push(`${sheets.length} plan sheets; ${scaled.length} with a scale set${sheets.length > scaled.length ? ` (${sheets.length - scaled.length} not set — nothing measured on them counts)` : ""}.`);
  for (const s of sheets.slice(0, 40)) {
    lines.push(`- ${s.number ?? `p.${s.page}`}${s.title ? ` ${s.title}` : ""}: ${s.scale_ft_per_pt ? `${scaleLabel(s.scale_ft_per_pt)} (${s.scale_method === "manual" ? "measured by Coy" : "printed scale, applied by Coy"})` : s.scale_method === "none" ? "not to scale" : `scale not set${s.scale_text ? ` (prints ${s.scale_text})` : ""}`}`);
  }
  for (const p of params) {
    const t = totals[p.id];
    const n = measurements.filter((m) => m.parameter_id === p.id).length;
    lines.push(`Takeoff group ${p.id.slice(0, 8)} "${p.name}" (${p.kind}${p.depth_in ? `, ${p.depth_in}" deep` : ""}): ${t?.qty !== null && t?.qty !== undefined ? `${fmtQty(t.qty, t.unit)}${t.cy !== null ? ` = ${t.cy.toFixed(1)} CY neat` : ""}` : `no total — ${t?.blocked ?? "nothing measured"}`} from ${n} shape${n === 1 ? "" : "s"}`);
  }
  return { title: "Plan Room takeoff (measured by Coy on the plans or the aerial; a group's 8-character ref lets a plan count an item from it)", lines };
}

/**
 * What OCR read off the job's scanned plan sheets (migration 064). Whole sheets,
 * table rows kept together ("TOTAL | 450"), the sheets that talk most about
 * concrete first, until the room runs out — then the rest by number and title.
 * Read off a scan, so Dusty says it may be misread and points Coy to the sheet.
 * Nothing here is a measurement; quantities come from the takeoff.
 */
const OCR_CONCRETE = /\bconc|\bpsi\b|\brebar|\breinf|\bslab|\bfooting|\bpaving|\bpavement|\bcurb|\bgutter|\bsidewalk|\bwalk\b|\bdrives?\b|\bdriveway|\bramp|\bjoint|\bthick|\bwwf|\bmesh|\bsq\.? ?yd|\bdetectable|\bdome/gi;
const OCR_ROOM = 24_000;
async function ocrBlock(sb: Sb, orgId: string, jobId: string): Promise<Block | null> {
  const { data } = await sb.from("plan_sheets").select("number, page, title, ocr_text, ocr_conf").eq("org_id", orgId).eq("job_id", jobId)
    .not("ocr_text", "is", null).order("page").limit(200);
  const rows = (data ?? []) as Array<{ number: string | null; page: number; title: string | null; ocr_text: string; ocr_conf: number | null }>;
  if (!rows.length) return null;
  const name = (r: (typeof rows)[number]) => `${r.number ?? `p.${r.page}`}${r.title ? ` ${r.title}` : ""}`;
  const ranked = rows.map((r) => ({ r, hits: (r.ocr_text.match(OCR_CONCRETE) ?? []).length + findDimensions(r.ocr_text).length }))
    .filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits);
  const lines: string[] = [`${rows.length} scanned sheet${rows.length === 1 ? "" : "s"} read by OCR in the Plan Room. These are readings off a scan: a digit or a "+" can be misread (104+55 may show as 104455). Quote the sheet, and tell Coy to check a number there before he prices it. Table rows read left to right, " | " between columns.`];
  let room = OCR_ROOM;
  const shown = new Set<string>();
  for (const { r } of ranked) {
    const text = r.ocr_text.split("\n").map((l) => l.trim()).filter((l) => l.length >= 2).join("\n");
    if (text.length + 80 > room) continue;
    room -= text.length + 80;
    shown.add(`${r.page}`);
    lines.push(`── ${name(r)}${r.ocr_conf !== null ? ` (read ${Math.round(r.ocr_conf)}% sure)` : ""} ──\n${text}`);
  }
  const rest = rows.filter((r) => !shown.has(`${r.page}`));
  if (rest.length) lines.push(`Also read, not shown here (ask by sheet): ${rest.slice(0, 80).map(name).join("; ")}`);
  return { title: "Plan sheets read by OCR (scans)", lines };
}

/**
 * The words on the plans and specs, as the bid reader pulled them (§2i): each
 * page that talks about concrete, labelled "[file · p.N · A2.1 Title]". Coy,
 * 2026-10-02, asking Dusty to check each section on its sheets — he had only
 * the sheet names and called the files "not read". Drawings first, then specs.
 */
const BID_TEXT_ROOM = 40_000;
async function bidTextBlock(sb: Sb, orgId: string, jobId: string): Promise<Block | null> {
  const { data: pkgs } = await sb.from("bid_packages").select("id").eq("org_id", orgId).eq("job_id", jobId).neq("state", "undone").limit(5);
  const ids = ((pkgs ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (!ids.length) return null;
  const { data } = await sb.from("bid_package_files").select("name, role, text_excerpt").eq("org_id", orgId).in("package_id", ids)
    .not("text_excerpt", "is", null).limit(40);
  const order: Record<string, number> = { drawings: 0, itb: 1, spec: 2 };
  const rows = ((data ?? []) as Array<{ name: string; role: string | null; text_excerpt: string }>)
    .filter((r) => r.text_excerpt.trim()).sort((a, b) => (order[a.role ?? ""] ?? 3) - (order[b.role ?? ""] ?? 3));
  if (!rows.length) return null;
  const lines = ["The text of the plan pages and spec pages that mention concrete, as printed (the drawings themselves are pictures — what is drawn but not written isn't here). Each page starts with [file · page · sheet]. To check a section, find its sheet here, quote what the sheet says, and point out anything that disagrees with the section or the bid. Coy opens a sheet by tapping its number under the section (\"Check it on A2.1\") or Plan sheets in the job header — it opens beside the budget."];
  let room = BID_TEXT_ROOM;
  for (const r of rows) {
    if (room <= 200) { lines.push(`(${r.name}: left out for room — ask about a sheet by number)`); continue; }
    const t = r.text_excerpt.slice(0, room);
    room -= t.length;
    lines.push(`══ ${r.name} (${r.role === "drawings" ? "plans" : r.role ?? "file"}) ══\n${t.replace(/\n\[/g, "\n\n[")}${t.length < r.text_excerpt.length ? "\n(… cut for room)" : ""}`);
  }
  return { title: "What the plans and specs say (pulled out by the bid reader)", lines };
}

/**
 * The job's budget (migration 048), priced by the same budget() the screen
 * uses, so Dusty quotes the builder's numbers tier by tier — or names what
 * blocks a tier. Null when the job has no budget lines yet.
 */
async function budgetBlock(sb: Sb, orgId: string, jobId: string, sections: SectionInput[], days: number | null,
  jp: JobPricing | null): Promise<Block | null> {
  const { data: est } = await sb.from("estimates").select("id, tax_on, discount_amount, discount_reason")
    .eq("org_id", orgId).eq("job_id", jobId).eq("status", "draft").maybeSingle();
  if (!est) return null;
  const [{ data: opts }, { data: rows }] = await Promise.all([
    sb.from("estimate_options").select("id, label").eq("org_id", orgId).eq("estimate_id", est.id).order("sort_order"),
    sb.from("estimate_line_items").select("id, name, cost_type, unit, unit_cost, margin_pct, taxable, qty_rule, rule_params, qty_source, quantity, section_id, option_id, cost_group_id, takeoff_parameter_id")
      .eq("estimate_id", est.id).order("sort_order"),
  ]);
  if (!rows?.length) return null;
  const lines = (rows as Array<Record<string, unknown>>).map((r) => ({
    ...r, unit_cost: num(r.unit_cost), margin_pct: num(r.margin_pct), quantity: num(r.quantity),
  })) as unknown as BudgetLine[];
  const options = (opts ?? []) as Array<{ id: string; label: string }>;
  const measured = await takeoffTotalsFor(sb, orgId, jobId);
  const res = budget(lines, options.map((o) => o.id), jp?.settings ?? { margin_pct: null, overhead_pct: null, tax_rate_pct: null },
    sections, days, { tax_on: est.tax_on !== false, discount: Number(est.discount_amount ?? 0), takeoff: measured });
  const min = jobMinimum(jp?.day_minimum ?? null, days);
  const minLine = (total: number) => min.ok
    ? `; job minimum $${min.minimum.toFixed(0)} (${min.days} days × $${min.day_minimum.toFixed(0)})${total < min.minimum ? " — UNDER THE MINIMUM" : ""}`
    : `; job minimum unknown (${min.blocked.join(", ")})`;
  const secName = (id: string | null) => (id ? sections.find((x) => x.id === id)?.name || "section" : "whole job");
  const optName = (id: string | null) => (id ? options.find((o) => o.id === id)?.label ?? "option" : "all options");
  const out: string[] = [];
  for (const tr of res.tiers) {
    const head = tr.option_id ? `Option ${optName(tr.option_id)}` : "Budget";
    out.push(tr.priced
      ? `${head}: total $${tr.total.toFixed(0)} (cost $${tr.cost.toFixed(0)}, O.H. $${tr.overhead.toFixed(0)}, tax $${tr.tax.toFixed(0)}, discount $${tr.discount.toFixed(0)}, profit $${tr.profit.toFixed(0)}, margin ${(tr.margin * 100).toFixed(1)}%)${minLine(tr.total)}`
      : `${head}: NOT PRICED — needs ${tr.blocked.join(", ")}`);
  }
  out.push(`Tax ${est.tax_on === false ? "switched off" : "on"}.${est.discount_reason ? ` Discount reason: ${est.discount_reason}.` : ""}`);
  // Per area, then per line — so Dusty can show each area's calculation as a table.
  const areas = [...new Set(lines.map((l) => l.section_id))];
  for (const a of areas) {
    const ls = lines.filter((l) => l.section_id === a);
    const rs = ls.map((l) => res.lines[l.id]);
    const sum = (k: "ext_cost" | "overhead" | "ext_price") => rs.reduce((x, r) => x + (r[k] ?? 0), 0);
    out.push(`AREA ${secName(a)}: cost $${sum("ext_cost").toFixed(2)}, O.H. $${sum("overhead").toFixed(2)}, price $${sum("ext_price").toFixed(2)}${rs.some((r) => r.blocked.length) ? " (partial — some lines blocked)" : ""}`);
    for (const l of ls) {
      const r = res.lines[l.id];
      out.push(`  - ${l.name} [${optName(l.option_id)}]: ${r.blocked.length ? `blocked — ${r.blocked.join(", ")}` :
        `${r.qty} ${l.unit ?? ""} (${r.qty_note ?? ""}) × $${l.unit_cost} = cost $${(r.ext_cost ?? 0).toFixed(2)}; O.H. $${(r.overhead ?? 0).toFixed(2)}; margin ${r.margin_pct}% (${r.margin_from}) → price $${(r.ext_price ?? 0).toFixed(2)}`}`);
    }
  }
  return { title: "The job budget (THE price — quote these numbers, each option separately)", lines: out };
}

async function customerContext(sb: Sb, orgId: string, id: string): Promise<Assembled> {
  // Since migration 055 a customer page is a CUSTOMER (Art Apartments), with
  // several people under it. The id may still be a contact's (older links).
  const { data: cu } = await sb.from("customers")
    .select("id, name, customer_type, subtype, lead_source, status, notes, address_formatted, primary_contact_id")
    .eq("org_id", orgId).eq("id", id).maybeSingle();
  if (cu) {
    const { data: people } = await sb.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", id)
      .is("merged_into_contact_id", null).order("created_at").limit(6);
    const ids = ((people ?? []) as Array<{ id: string }>).map((p) => p.id);
    const blocks = (await Promise.all(ids.map((cid) => contactBlock(sb, orgId, cid)))).filter(Boolean) as Array<{ name: string; block: Block }>;
    const facts = [
      `Customer: ${cu.name ?? "unnamed"}${cu.customer_type ? ` (${cu.customer_type}${cu.subtype ? `, ${cu.subtype}` : ""})` : ""}`,
      `Address: ${cu.address_formatted ?? "not recorded"}`,
      ...(cu.lead_source ? [`Lead source: ${cu.lead_source}`] : []),
      ...(cu.status ? [`Status: ${cu.status}`] : []),
      ...(cu.notes ? [`Coy's notes on the customer: ${cu.notes}`] : []),
      `Contacts (the people who speak for this customer): ${blocks.map((b) => b.name).join(", ") || "none"}`,
    ];
    const { data: last } = ids.length ? await sb.from("messages").select("contact_id, channel, direction, occurred_at, body_text, summary")
      .eq("org_id", orgId).in("contact_id", ids).order("occurred_at", { ascending: false }).limit(20) : { data: [] };
    const nameOf = new Map(blocks.map((b, i) => [ids[i], b.name]));
    const lines = ((last ?? []) as Array<{ contact_id: string; channel: string; direction: string; occurred_at: string | null; body_text: string | null; summary: string | null }>)
      .reverse().map((m) => `${day(m.occurred_at)} ${m.direction === "outbound" ? "OUT" : `IN (${nameOf.get(m.contact_id) ?? "contact"})`} ${m.channel === "call" ? `CALL — ${m.summary?.trim() || "no summary"}` : `TEXT: ${m.body_text?.trim() || "(attachment)"}`}`);
    const mail = await emailsBlock(sb, orgId, { customerId: id });
    return assemble(`${cu.name ?? "Customer"} (customer page)`, [
      { title: "The customer", lines: [...facts, `Ids (for an archive / delete plan): customer ${cu.id}; its people ${ids.map((x) => `contact ${x}`).join(", ") || "none"}`] },
      ...blocks.map((b) => b.block),
      ...(mail ? [mail] : []),
      { title: "Most recent messages, all contacts", lines, trimmable: true },
    ]);
  }
  const contactId = id;
  const who = await contactBlock(sb, orgId, contactId);
  if (!who) return coldContext(null, new Date().toISOString().slice(0, 10));
  const { data: last } = await sb.from("messages").select("channel, direction, occurred_at, body_text, summary")
    .eq("org_id", orgId).eq("contact_id", contactId).order("occurred_at", { ascending: false }).limit(15);
  const lines = ((last ?? []) as Array<{ channel: string; direction: string; occurred_at: string | null; body_text: string | null; summary: string | null }>)
    .reverse().map((m) => `${day(m.occurred_at)} ${m.direction === "outbound" ? "OUT" : "IN"} ${m.channel === "call" ? `CALL — ${m.summary?.trim() || "no summary"}` : `TEXT: ${m.body_text?.trim() || "(attachment)"}`}`);
  const files = await filesBlock(sb, orgId, { contactId });
  return assemble(`${who.name} (customer page)`, [who.block, ...(files ? [files] : []), { title: "Most recent messages", lines, trimmable: true }]);
}

async function cashContext(sb: Sb, orgId: string): Promise<Assembled> {
  const so = await settingsAndOverhead(sb, orgId);
  const m = so.money;
  const v = (x: number | null, unit: string) => (x === null ? "NOT RECORDED" : `${x}${unit}`);
  const lines = [
    `Default margin: ${v(m.default_margin_pct, "%")}`, `Default O.H.: ${v(m.default_overhead_pct, "%")}`,
    `Day minimum: ${m.day_minimum === null ? "NOT RECORDED" : `$${m.day_minimum}`}`,
    `Pay yourself: ${m.comp_mode === "fixed_draw" ? `fixed draw ${m.comp_monthly_draw === null ? "(amount not recorded)" : `$${m.comp_monthly_draw}/mo`}` : m.comp_mode === "pct_profit" ? `${v(m.comp_profit_pct, "%")} of profit` : "NOT RECORDED"}`,
  ];
  const oh = so.overhead.map((o) => `- ${o.label}: $${o.amount} ${o.cadence}${o.active ? "" : " (paused)"}`);
  // The Price book page shares this context, so Coy can have Dusty edit the book and its assemblies there.
  const book = await priceBookBlock(sb, orgId);
  return assemble("Price book, cash and pricing defaults", [
    { title: "Pricing defaults", lines },
    { title: "Monthly overhead items (the burn rate)", lines: oh },
    ...(book ? [book] : []),
  ]);
}

/**
 * The catch-up (Coy, 2026-09-29: "clicking on the dusty emblem triggers an
 * automatic review of the latest activity"). Real rows only: who got in touch
 * since `since`, what Dusty read, what is due, and how many are unsorted.
 */
async function activityContext(sb: Sb, orgId: string, since: string): Promise<Assembled> {
  const central = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const [{ data: msgs }, { data: runs }, { data: due }, { count: unsorted }, { data: bids }] = await Promise.all([
    sb.from("messages").select("contact_id, channel, direction, occurred_at, body_text, summary")
      .eq("org_id", orgId).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(300),
    sb.from("contact_enrich_runs").select("contact_id, outcome, finished_at, musing")
      .eq("org_id", orgId).gte("started_at", since).order("started_at", { ascending: false }).limit(100),
    sb.from("contact_tasks").select("contact_id, title, due_on, source").eq("org_id", orgId).eq("status", "open")
      .lte("due_on", central).order("due_on").limit(30),
    sb.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId)
      .is("merged_into_contact_id", null).is("classification_confirmed_at", null).is("auto_classified_at", null),
    sb.from("bid_packages").select("state, error, facts, box_folder_name, updated_at").eq("org_id", orgId).gte("updated_at", since)
      .not("state", "in", "(undone,not_a_bid)").order("updated_at", { ascending: false }).limit(10),
  ]);
  const bidLines = ((bids ?? []) as Array<{ state: string; error: string | null; facts: Record<string, unknown> | null; box_folder_name: string | null; updated_at: string }>).map((b) => {
    const f = (b.facts ?? {}) as { project_name?: string | null; gc_company?: string | null; bid_due_text?: string | null; items?: unknown[] };
    return `- ${f.project_name ?? b.box_folder_name ?? "a bid"}${f.gc_company ? ` (${f.gc_company})` : ""}: ${b.state === "filed" ? `filed as a job, ${(f.items ?? []).length} concrete items` : b.state}${f.bid_due_text ? `, due ${f.bid_due_text}` : ""}${b.error ? ` — ${b.error}` : ""}`;
  });
  type M = { contact_id: string | null; channel: string; direction: string; occurred_at: string | null; body_text: string | null; summary: string | null };
  const rows = (msgs ?? []) as M[];
  const ids = [...new Set([
    ...rows.map((m) => m.contact_id),
    ...((runs ?? []) as Array<{ contact_id: string }>).map((r) => r.contact_id),
    ...((due ?? []) as Array<{ contact_id: string }>).map((t) => t.contact_id),
  ].filter(Boolean) as string[])].slice(0, 150);
  const { data: people } = ids.length
    ? await sb.from("contacts").select("id, name, phone, contact_type, classification_confirmed_at, auto_classified_at, status_summary")
        .eq("org_id", orgId).in("id", ids)
    : { data: [] };
  type P = { id: string; name: string | null; phone: string | null; contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null; status_summary: string | null };
  const who = new Map(((people ?? []) as P[]).map((p) => [p.id, p]));
  const label = (id: string | null) => {
    const p = id ? who.get(id) : null;
    if (!p) return "unknown contact";
    const bucket = p.classification_confirmed_at || p.auto_classified_at ? p.contact_type : "unsorted";
    return `${p.name?.trim() || p.phone || "no name"} [${bucket}]`;
  };

  const byPerson = new Map<string, M[]>();
  for (const m of rows) { const k = m.contact_id ?? "none"; byPerson.set(k, [...(byPerson.get(k) ?? []), m]); }
  const spam = (id: string) => who.get(id)?.contact_type === "spam" && !!(who.get(id)?.classification_confirmed_at || who.get(id)?.auto_classified_at);
  const personLines = [...byPerson.entries()].filter(([id]) => !spam(id)).map(([id, ms]) => {
    const inbound = ms.filter((m) => m.direction !== "outbound").length;
    const latest = ms[0];
    const said = latest.channel === "call" ? `CALL — ${latest.summary?.trim() || "no summary"}` : `TEXT: ${latest.body_text?.trim() || "(attachment)"}`;
    const st = id !== "none" ? who.get(id)?.status_summary : null;
    return `- ${label(id)}: ${ms.length} message${ms.length === 1 ? "" : "s"} (${inbound} from them), latest ${day(latest.occurred_at)} ${latest.direction === "outbound" ? "OUT" : "IN"} ${said.slice(0, 400)}${st ? ` | where it stands: ${st}` : ""}`;
  });
  const spamCount = [...byPerson.keys()].filter(spam).length;

  const r = (runs ?? []) as Array<{ contact_id: string; outcome: string | null; finished_at: string | null; musing: string | null }>;
  const outcomes = new Map<string, number>();
  for (const x of r) outcomes.set(x.outcome ?? "running", (outcomes.get(x.outcome ?? "running") ?? 0) + 1);
  const readLines = [
    r.length ? `Reads: ${[...outcomes.entries()].map(([k, n]) => `${n} ${k}`).join(", ")}` : "No reads in this window.",
    ...r.filter((x) => x.outcome === "proposed" || x.outcome === "named" || x.outcome === "filed").slice(0, 20)
      .map((x) => `- ${x.outcome} on ${label(x.contact_id)} at ${day(x.finished_at)}`),
  ];
  const dueLines = ((due ?? []) as Array<{ contact_id: string; title: string; due_on: string; source: string }>)
    .map((t) => `- ${t.due_on < central ? "OVERDUE" : "due today"} (${t.due_on}): ${t.title} — ${label(t.contact_id)}${t.source === "coy" ? " [Coy's own]" : " [suggested]"}`);

  return assemble("the latest activity", [
    { title: "Catch-up window", lines: [`Since ${day(since)} UTC. Today in Louisiana: ${central}.`,
      "Coy tapped the emblem to be caught up. Lead with what needs him; keep it short; name people; say plainly when nothing happened."] },
    { title: `Who got in touch (${personLines.length} people, ${rows.length} messages${spamCount ? `; ${spamCount} spam senders left out` : ""})`, lines: personLines, trimmable: true },
    { title: "Next steps due today or overdue", lines: dueLines },
    { title: "Bids that came in (forwarded bid emails the bid reader read)", lines: bidLines },
    await inboxBlock(sb, orgId),
    { title: "What Dusty's background reader did", lines: readLines },
    { title: "Unsorted", lines: [`${unsorted ?? "unknown"} contacts nobody has sorted yet.`] },
    await recordsBlock(sb, orgId),
  ]);
}
