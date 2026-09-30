/**
 * What Dusty sees: the screen Coy had open, fetched on the SERVER under his
 * session. The browser sends only `{kind, id}` taken from its route; every fact
 * in the prompt is read here through RLS with the org from the session, so a
 * caller cannot put words in Dusty's context or reach another org's rows.
 */

import type { ApiSession } from "@/lib/api-auth";
import { takeoff, budget, jobMinimum, type BudgetLine, type OverheadItem, type SectionInput } from "@/lib/engine";
import { moneySettings, pricingFor, type JobPricing } from "@/lib/pricing-server";
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
  const [money, { data: oh }] = await Promise.all([
    moneySettings(sb, orgId),
    sb.from("overhead_items").select("label, amount, cadence, active").eq("org_id", orgId),
  ]);
  const overhead = ((oh ?? []) as Array<{ label: string; amount: unknown; cadence: string; active: boolean }>)
    .map((o) => ({ ...o, amount: Number(o.amount) })) as OverheadItem[];
  return { money, overhead };
}

async function scopeContext(sb: Sb, orgId: string, jobId: string): Promise<Assembled> {
  const { data: job } = await sb.from("jobs").select("id, title, status, address, contact_id, duration_days")
    .eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (!job) return coldContext(null, new Date().toISOString().slice(0, 10));
  const [{ data: secs }, pricing, who, files] = await Promise.all([
    sb.from("job_sections").select("id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, rebar, prep_notes, access_notes")
      .eq("org_id", orgId).eq("job_id", jobId).order("sort_order"),
    pricingFor(sb, orgId, [jobId]),
    job.contact_id ? contactBlock(sb, orgId, job.contact_id as string) : Promise.resolve(null),
    filesBlock(sb, orgId, { jobId }),
  ]);
  const sections: SectionInput[] = ((secs ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string, name: r.name as string | null, work_type: r.work_type as string,
    length_ft: num(r.length_ft), width_ft: num(r.width_ft), sqft_override: num(r.sqft_override), depth_in: num(r.depth_in), psi: num(r.psi),
  }));
  const t = takeoff(sections, null);
  const days = num(job.duration_days);
  const jp = pricing.get(jobId) ?? null;
  const bud = await budgetBlock(sb, orgId, jobId, sections, days, jp);
  const notes = ((secs ?? []) as Array<Record<string, unknown>>).flatMap((r) =>
    [["reinforcement", r.rebar], ["prep", r.prep_notes], ["access", r.access_notes]]
      .filter(([, v]) => typeof v === "string" && v).map(([k, v]) => `- ${r.name || "section"} ${k}: ${v}`));
  const title = (job.title as string | null) || "Untitled scope";
  return assemble(`scope: ${title}`, [
    { title: "Job", lines: [`Title: ${title}`, `Status: ${job.status}`, `Address: ${(job.address as string | null) || "not recorded"}`,
      `Days on this job: ${days ?? "not set"}`, `For: ${who ? who.name : "no customer attached"}`,
      `Pricing: O.H. ${jp?.settings.overhead_pct ?? "NOT SET"}%, margin ${jp?.settings.margin_pct ?? "NOT SET"}% — price = cost × (1 + O.H.) ÷ (1 − margin)`,
      `Sales tax: ${jp?.tax.rate !== null && jp?.tax.rate !== undefined ? `${jp.tax.rate}% (${jp.tax.source === "override" ? "typed for this job" : `${jp.tax.parish} parish`})` : `unknown — ${jp?.tax.missing ?? "no rate"}`}`] },
    { title: "Sections and their quantities (exactly what the builder shows)", lines: scopeLines(t, !!bud) },
    ...(bud ? [bud] : []),
    { title: "Section notes", lines: notes },
    ...(files ? [files] : []),
    ...(who ? [who.block] : []),
  ]);
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
    sb.from("estimate_line_items").select("id, name, cost_type, unit, unit_cost, margin_pct, taxable, qty_rule, rule_params, qty_source, quantity, section_id, option_id, cost_group_id")
      .eq("estimate_id", est.id).order("sort_order"),
  ]);
  if (!rows?.length) return null;
  const lines = (rows as Array<Record<string, unknown>>).map((r) => ({
    ...r, unit_cost: num(r.unit_cost), margin_pct: num(r.margin_pct), quantity: num(r.quantity),
  })) as unknown as BudgetLine[];
  const options = (opts ?? []) as Array<{ id: string; label: string }>;
  const res = budget(lines, options.map((o) => o.id), jp?.settings ?? { margin_pct: null, overhead_pct: null, tax_rate_pct: null },
    sections, days, { tax_on: est.tax_on !== false, discount: Number(est.discount_amount ?? 0) });
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
    return assemble(`${cu.name ?? "Customer"} (customer page)`, [
      { title: "The customer", lines: facts },
      ...blocks.map((b) => b.block),
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
  return assemble("Cash and pricing defaults", [
    { title: "Pricing defaults", lines },
    { title: "Monthly overhead items (the burn rate)", lines: oh },
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
