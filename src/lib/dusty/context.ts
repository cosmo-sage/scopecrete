/**
 * What Dusty sees: the screen Coy had open, fetched on the SERVER under his
 * session. The browser sends only `{kind, id}` taken from its route; every fact
 * in the prompt is read here through RLS with the org from the session, so a
 * caller cannot put words in Dusty's context or reach another org's rows.
 */

import type { ApiSession } from "@/lib/api-auth";
import { price, floor, takeoff, type CostSettings, type OverheadItem, type SectionInput } from "@/lib/engine";
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
  const { data: org } = await sb.from("orgs").select("name").eq("id", orgId).maybeSingle();
  return coldContext((org?.name as string | null) ?? null, today);
}

async function contactBlock(sb: Sb, orgId: string, contactId: string) {
  const { data: c } = await sb.from("contacts")
    .select("id, name, name_source, name_confirmed_at, phone, address, customer_id, merged_into_contact_id, contact_type, contact_subtype, classification_confirmed_at, auto_classified_at, status_summary")
    .eq("org_id", orgId).eq("id", contactId).maybeSingle();
  if (!c) return null;
  const [{ data: phones }, { data: jobs }, { data: tasks }, { data: notes }] = await Promise.all([
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
    ],
  };
  return { block, name: name ?? (numbers[0] as string | undefined) ?? "unknown number" };
}


/** What Dusty has read in the files on a job or a person (migration 045), newest 20. */
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
    who.block,
    ...(files ? [files] : []),
    { title: `Messages (last ${msgs.length}, oldest first)`, lines, trimmable: true },
    { title: "Full transcripts of the most recent calls", lines: recentTranscripts, trimmable: true },
  ]);
}

async function settingsAndOverhead(sb: Sb, orgId: string) {
  const [{ data: s }, { data: oh }] = await Promise.all([
    sb.from("org_cost_settings").select("*").eq("org_id", orgId).maybeSingle(),
    sb.from("overhead_items").select("label, amount, cadence, active").eq("org_id", orgId),
  ]);
  const keys: (keyof CostSettings)[] = ["concrete_price_per_cy", "concrete_overage_pct", "shortload_threshold_cy", "shortload_pct",
    "form_finish_per_sqft", "demo_per_sqft", "mobilization_fee", "sales_tax_pct", "tax_applies_to", "markup_material_pct",
    "markup_labor_pct", "markup_equipment_pct", "owner_fee_pct", "estimator_fee_pct", "tax_reserve_pct",
    "assumed_billable_days", "comp_mode", "comp_monthly_draw"];
  const settings = Object.fromEntries(keys.map((k) => [k,
    k === "tax_applies_to" || k === "comp_mode" ? ((s as Record<string, unknown> | null)?.[k] ?? null) : num((s as Record<string, unknown> | null)?.[k])])) as unknown as CostSettings;
  const overhead = ((oh ?? []) as Array<{ label: string; amount: unknown; cadence: string; active: boolean }>)
    .map((o) => ({ ...o, amount: Number(o.amount) })) as OverheadItem[];
  return { settings, overhead, recorded: !!s };
}

async function scopeContext(sb: Sb, orgId: string, jobId: string): Promise<Assembled> {
  const { data: job } = await sb.from("jobs").select("id, title, status, address, contact_id, duration_days")
    .eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (!job) return coldContext(null, new Date().toISOString().slice(0, 10));
  const [{ data: secs }, so, who, files] = await Promise.all([
    sb.from("job_sections").select("name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, rebar, prep_notes, access_notes")
      .eq("org_id", orgId).eq("job_id", jobId).order("sort_order"),
    settingsAndOverhead(sb, orgId),
    job.contact_id ? contactBlock(sb, orgId, job.contact_id as string) : Promise.resolve(null),
    filesBlock(sb, orgId, { jobId }),
  ]);
  const sections: SectionInput[] = ((secs ?? []) as Array<Record<string, unknown>>).map((r) => ({
    name: r.name as string | null, work_type: r.work_type as string,
    length_ft: num(r.length_ft), width_ft: num(r.width_ft), sqft_override: num(r.sqft_override), depth_in: num(r.depth_in), psi: num(r.psi),
  }));
  const t = takeoff(sections, so.settings.concrete_overage_pct);
  const p = price(sections, so.settings);
  const crew = num(job.duration_days);
  const fl = p.priced ? floor(p.cost.total, so.settings, so.overhead, crew) : null;
  const notes = ((secs ?? []) as Array<Record<string, unknown>>).flatMap((r) =>
    [["reinforcement", r.rebar], ["prep", r.prep_notes], ["access", r.access_notes]]
      .filter(([, v]) => typeof v === "string" && v).map(([k, v]) => `- ${r.name || "section"} ${k}: ${v}`));
  const title = (job.title as string | null) || "Untitled scope";
  return assemble(`scope: ${title}`, [
    { title: "Job", lines: [`Title: ${title}`, `Status: ${job.status}`, `Address: ${(job.address as string | null) || "not recorded"}`,
      `Crew days on this job: ${crew ?? "not set"}`, `For: ${who ? who.name : "no customer attached"}`] },
    { title: "Sections and the engine's numbers (exactly what the builder shows)", lines: scopeLines(t, p, fl) },
    { title: "Section notes", lines: notes },
    ...(so.recorded ? [] : [{ title: "Cost settings", lines: ["None recorded for this business yet."] }]),
    ...(files ? [files] : []),
    ...(who ? [who.block] : []),
  ]);
}

async function customerContext(sb: Sb, orgId: string, contactId: string): Promise<Assembled> {
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
  const s = so.settings as unknown as Record<string, unknown>;
  const lines = Object.entries(s).map(([k, v]) => `${k}: ${v === null ? "NOT RECORDED" : v}`);
  const oh = so.overhead.map((o) => `- ${o.label}: $${o.amount} ${o.cadence}${o.active ? "" : " (paused)"}`);
  return assemble("Cash and cost settings", [
    { title: "Cost settings", lines: so.recorded ? lines : ["None recorded yet — every rate is blank."] },
    { title: "Monthly overhead items", lines: oh },
  ]);
}

/**
 * The catch-up (Coy, 2026-09-29: "clicking on the dusty emblem triggers an
 * automatic review of the latest activity"). Real rows only: who got in touch
 * since `since`, what Dusty read, what is due, and how many are unsorted.
 */
async function activityContext(sb: Sb, orgId: string, since: string): Promise<Assembled> {
  const central = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const [{ data: msgs }, { data: runs }, { data: due }, { count: unsorted }] = await Promise.all([
    sb.from("messages").select("contact_id, channel, direction, occurred_at, body_text, summary")
      .eq("org_id", orgId).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(300),
    sb.from("contact_enrich_runs").select("contact_id, outcome, finished_at, musing")
      .eq("org_id", orgId).gte("started_at", since).order("started_at", { ascending: false }).limit(100),
    sb.from("contact_tasks").select("contact_id, title, due_on, source").eq("org_id", orgId).eq("status", "open")
      .lte("due_on", central).order("due_on").limit(30),
    sb.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId)
      .is("merged_into_contact_id", null).is("classification_confirmed_at", null).is("auto_classified_at", null),
  ]);
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
    { title: "What Dusty's background reader did", lines: readLines },
    { title: "Unsorted", lines: [`${unsorted ?? "unknown"} contacts nobody has sorted yet.`] },
  ]);
}
