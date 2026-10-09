import { createHash } from "node:crypto";
import { isEstimate } from "@/lib/estimate-flag";
import type { ApiSession } from "@/lib/api-auth";
import { budget, type BudgetLine, type SectionInput } from "@/lib/engine";
import { CARD_COLS, LINE_COLUMNS, cardToLine, loadAssembly, nextSort, numLine, workingEstimate } from "@/lib/budget-server";
import { pricingFor } from "@/lib/pricing-server";
import { takeoffTotalsFor } from "@/lib/plans-server";
import { extract, modelSeen, type AreaDraft, type Evidence, type Extraction } from "./extract";
import { approvalBlocks, checkRecipe, outcomeOf, RECIPE_VERSION, type DraftOutcome } from "./recipe";
import { modelConfigured, modelJson, modelRead } from "./model-server";
import { rateQueries, RATES_SYSTEM, renderAsks, renderResults, sanitizeRates, sectionQueries, SECTION_RATES_SYSTEM, type RateLookup, type SectionAsk } from "./rates";
import { searchWeb } from "@/lib/web-search-server";
import { cityOf } from "@/lib/dusty/web";
import { areaFor, autoFill, sqftOf, outcomeOnJob, picksForOpen, withJobAreas, WHOLE_JOB_STEPS, type JobArea, type PriceItem } from "./fill";

/**
 * Job → draft budget, the server side (migration 087). Session client only:
 * RLS on every table decides what the build may read and write, and every
 * query also filters the org from the session (DECISIONS §7).
 *
 *   1. gather   the job's own words: its person's (and their customer's
 *               people's) texts, call transcripts line by line, call
 *               summaries (marked weaker), Coy's notes and the job itself —
 *               only from around this job's dates when they have other jobs.
 *   2. read     extract() (plain), plus the model's reading when a key is set,
 *               every model fact checked against the line it quotes.
 *   3. make     on a job with NO areas yet: one area per piece of work heard,
 *               with the sizes said and its quote (origin 'draft'), and Coy's
 *               assembly fills each one. A job that already has areas is never
 *               changed: what was heard differently is a suggestion.
 *   4. record   one budget_runs row: what it read, what it came to, what it
 *               made. The same input never builds twice (idem_key).
 */

type Sb = ApiSession["supabase"];

export const DRAFT_TABLE_MISSING = "Draft budgets need migration 087 — say \"apply 087\".";
const missingTable = (e: { message?: string; code?: string } | null) =>
  !!e && (e.code === "42P01" || /budget_runs|budget_approvals|recipe_exclusions/.test(e.message ?? "") && /does not exist|schema cache/.test(e.message ?? ""));

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);

export interface Gathered {
  job: Record<string, unknown>;
  evidence: Evidence[];
  /** Said on the panel: what was read, and what was left out on purpose. */
  scope: string;
}

export async function gatherEvidence(sb: Sb, orgId: string, jobId: string): Promise<Gathered | null> {
  const { data: job } = await sb.from("jobs")
    .select("id, title, description, job_type, contact_id, customer_id, created_at, origin, address, archived_at")
    .eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (!job) return null;
  const people = new Set<string>();
  if (job.contact_id) people.add(job.contact_id as string);
  if (job.customer_id) {
    const { data: ps } = await sb.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", job.customer_id as string)
      .is("merged_into_contact_id", null);
    for (const p of (ps ?? []) as Array<{ id: string }>) people.add(p.id);
  }
  const ids = [...people];
  const evidence: Evidence[] = [];
  const created = job.created_at as string;
  if ((job.description as string | null)?.trim()) {
    evidence.push({ id: `job:${jobId}`, message_id: null, kind: job.origin === "manual" ? "job" : "summary",
      who: "coy", at: created, text: (job.description as string).trim() });
  }
  if (!ids.length) return { job, evidence, scope: "This job has no person on it, so only its own description was read." };

  // Their other live jobs bound what belongs to this one: messages after the
  // job before it was made, and before the job after it was made.
  const orFilter = [`contact_id.in.(${ids.join(",")})`, job.customer_id ? `customer_id.eq.${job.customer_id}` : null].filter(Boolean).join(",");
  const { data: sib } = await sb.from("jobs").select("id, created_at").eq("org_id", orgId).is("archived_at", null).neq("id", jobId).or(orFilter);
  const sibs = ((sib ?? []) as Array<{ id: string; created_at: string }>).map((s) => s.created_at).sort();
  const from = sibs.filter((t) => t < created).pop() ?? null;
  const to = sibs.find((t) => t > created) ?? null;

  let q = sb.from("messages").select("id, contact_id, channel, direction, body_text, summary, occurred_at, from_address, to_address")
    .eq("org_id", orgId).in("contact_id", ids).order("occurred_at", { ascending: true }).limit(400);
  if (from) q = q.gte("occurred_at", from);
  if (to) q = q.lt("occurred_at", to);
  const { data: msgs } = await q;
  const rows = (msgs ?? []) as Array<Record<string, string | null>>;
  const callIds = rows.filter((m) => m.channel === "call").map((m) => m.id as string);
  const [{ data: arts }, { data: notes }, { data: phones }, { data: lines }] = await Promise.all([
    callIds.length ? sb.from("call_artifacts").select("message_id, kind, content").eq("org_id", orgId).in("message_id", callIds).in("kind", ["transcript", "summary", "voicemail"])
      : Promise.resolve({ data: [] }),
    sb.from("contact_notes").select("id, body, created_at, job_id").eq("org_id", orgId).in("contact_id", ids).order("created_at").limit(100),
    sb.from("contact_phones").select("phone_e164").eq("org_id", orgId).in("contact_id", ids),
    sb.from("org_phone_numbers").select("phone_e164").eq("org_id", orgId),
  ]);
  const theirs = new Set(((phones ?? []) as Array<{ phone_e164: string }>).map((p) => digits(p.phone_e164)));
  const ours = new Set(((lines ?? []) as Array<{ phone_e164: string }>).map((p) => digits(p.phone_e164)));
  const art = new Map<string, string>();
  for (const a of (arts ?? []) as Array<{ message_id: string; kind: string; content: string | null }>) if (a.content) art.set(`${a.kind}:${a.message_id}`, a.content);

  for (const m of rows) {
    const id = m.id as string;
    const at = (m.occurred_at as string) ?? created;
    const them = m.direction === "inbound";
    const counter = digits(them ? m.from_address : m.to_address);
    if (counter) theirs.add(counter);
    const tx = art.get(`transcript:${id}`);
    if (tx) {
      tx.split(/\n+/).forEach((line, n) => {
        const mm = line.match(/^\s*([+\d()\-\s]{7,}|[A-Za-z][\w .'-]{0,30}):\s*(.+)$/);
        const text = (mm ? mm[2] : line).trim();
        if (!text) return;
        const sp = mm ? digits(mm[1]) : "";
        // A line's speaker is a phone number (Quo): theirs is the customer, any other is our side.
        const who: Evidence["who"] = sp ? (ours.has(sp) ? "us" : theirs.has(sp) ? "them" : "us")
          : /^(us|we|coy|cory|corey)$/i.test(mm?.[1]?.trim() ?? "") ? "us" : "them";
        evidence.push({ id: `${id}#L${n + 1}`, message_id: id, kind: "call_line", who, at, text });
      });
      continue;
    }
    const vm = art.get(`voicemail:${id}`);
    if (vm?.trim()) { evidence.push({ id, message_id: id, kind: "text", who: "them", at, text: vm.trim() }); continue; }
    const sum = art.get(`summary:${id}`) ?? m.summary;
    if (m.body_text?.trim()) evidence.push({ id, message_id: id, kind: "text", who: them ? "them" : "us", at, text: m.body_text.trim() });
    else if (sum?.trim()) evidence.push({ id, message_id: id, kind: "summary", who: "them", at, text: sum.trim() });
  }
  for (const n of (notes ?? []) as Array<{ id: string; body: string | null; created_at: string; job_id: string | null }>) {
    if (!n.body?.trim() || /^(archived|deleted) —/i.test(n.body.trim())) continue;
    // A note filed on a job belongs to that job; an unfiled one, to this job's dates.
    if (n.job_id && n.job_id !== jobId) continue;
    if (!n.job_id && from && n.created_at < from) continue;
    if (!n.job_id && to && n.created_at >= to) continue;
    evidence.push({ id: `note:${n.id}`, message_id: null, kind: "note", who: "coy", at: n.created_at, text: n.body.replace(/@\[([^\]]+)\]\([^)]*\)/g, "@$1").trim() });
  }
  const scope = sibs.length
    ? `They have ${sibs.length} other open job${sibs.length === 1 ? "" : "s"}, so only calls, texts and notes ${from ? `after ${from.slice(0, 10)}` : ""}${from && to ? " and " : ""}${to ? `before ${to.slice(0, 10)}` : ""} were read.`
    : "Every call, text and note with them was read.";
  return { job, evidence, scope };
}

export function inputHash(job: Record<string, unknown>, evidence: Evidence[]): string {
  const h = createHash("sha256");
  h.update(`${RECIPE_VERSION}|${job.job_type ?? ""}|`);
  for (const e of evidence) h.update(`${e.id}\u0000${e.text}\u0001`);
  return h.digest("hex").slice(0, 40);
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** What the section row says about where its numbers came from (source_ref, ≤ 300). */
export function provenance(a: AreaDraft): string | null {
  const f = a.facts.find((x) => x.key === "length_ft" || x.key === "sqft") ?? a.facts[0];
  if (!f) return null;
  const who = f.status === "contractor_stated" ? "you" : f.status === "summary_only" ? "call summary" : "customer";
  return clip(`Draft from ${who}, ${f.at.slice(0, 10)}: “${f.quote}”${f.approximate ? " (rough)" : ""}`, 300);
}

export interface Suggestion { section_id: string; section: string; field: string; current: number | null; heard: number; quote: string }

/** What was heard that differs from an area already on the job — never written, shown. */
export function suggestionsFor(areas: AreaDraft[], sections: Array<Record<string, unknown>>): Suggestion[] {
  const out: Suggestion[] = [];
  for (const a of areas) {
    const s = sections.find((x) => x.work_type === a.work_type) ?? (sections.length === 1 && areas.length === 1 ? sections[0] : null);
    if (!s) continue;
    for (const [field, heard] of [["length_ft", a.length_ft], ["width_ft", a.width_ft], ["sqft_override", a.sqft], ["depth_in", a.depth_in]] as const) {
      if (heard === null) continue;
      const cur = s[field] === null || s[field] === undefined ? null : Number(s[field]);
      if (cur !== null && Math.abs(cur - heard) < 1e-6) continue;
      const key = field === "sqft_override" ? "sqft" : field;
      const f = a.facts.find((x) => x.key === key);
      out.push({ section_id: s.id as string, section: (s.name as string) || a.name, field, current: cur, heard, quote: f?.quote ?? "" });
    }
  }
  return out;
}

export type BuildResult =
  | { ok: true; run: Record<string, unknown>; again: boolean }
  | { ok: false; status: number; error: string };

const RUN_COLS = "id, job_id, trigger, status, outcome, recipe_version, reader, reading, made, suggestions, error, attempts, created_at, started_at, finished_at";

/** The automatic build on new jobs is off until Coy turns it on (BUDGET_DRAFT_AUTO=on in Vercel). */
export const autoDraftOn = () => process.env.BUDGET_DRAFT_AUTO === "on";

/** Queue a build for a new job (job-created path): one row, processed by buildDraft. */
export async function queueDraft(sb: Sb, orgId: string, userId: string | null, jobId: string) {
  const { data, error } = await sb.from("budget_runs").insert({
    org_id: orgId, job_id: jobId, trigger: "job_created", idem_key: `${jobId}:created`, input_hash: "pending",
    status: "queued", created_by: userId,
  }).select("id").maybeSingle();
  return error ? null : (data?.id as string | null) ?? null;
}

/**
 * Build (or rebuild) the job's draft. Idempotent on what it reads: the same
 * calls, texts and notes return the run already made. A run stuck in
 * "running" for five minutes is taken over; a failed one is retried in place.
 */
export async function buildDraft(sb: Sb, orgId: string, userId: string | null, jobId: string,
  trigger: "manual" | "job_created"): Promise<BuildResult> {
  const g = await gatherEvidence(sb, orgId, jobId);
  if (!g) return { ok: false, status: 404, error: "No such job." };
  if (g.job.archived_at) return { ok: false, status: 409, error: "This job is archived." };
  const hash = inputHash(g.job, g.evidence);
  // The budget it builds into (migration 088: a job can keep several). The
  // same calls and texts built into a NEW budget are a new build.
  const est = await workingEstimate(sb, orgId, jobId, true);
  if (!est) return { ok: false, status: 500, error: "Couldn't open the budget." };
  const { error: no088 } = await sb.from("budget_runs").select("estimate_id").limit(0);
  const perBudget = !no088;
  const idem = perBudget ? `${jobId}:${est.id as string}:${hash}` : `${jobId}:${hash}`;
  const onBudget = perBudget ? { estimate_id: est.id as string } : {};
  const now = new Date().toISOString();

  // Claim the run.
  const { data: same, error: readErr } = await sb.from("budget_runs").select(RUN_COLS).eq("org_id", orgId).eq("idem_key", idem).maybeSingle();
  if (missingTable(readErr)) return { ok: false, status: 503, error: DRAFT_TABLE_MISSING };
  if (same && same.status === "done") {
    // A queued build with nothing new to read is finished as a copy of this one.
    await sb.from("budget_runs").update({ status: "done", outcome: same.outcome, finished_at: now, error: "same input as an earlier draft" })
      .eq("org_id", orgId).eq("job_id", jobId).eq("status", "queued");
    return { ok: true, run: same, again: true };
  }
  const { data: active } = await sb.from("budget_runs").select("id, status, started_at, created_at, idem_key").eq("org_id", orgId).eq("job_id", jobId)
    .in("status", ["queued", "running"]).maybeSingle();
  // The row this build runs on: the queued or stale one, else the failed try of
  // this same input. Claimed compare-and-set, so two builds never both run.
  type Row = { id: string; status: string; started_at: string | null };
  let target: Row | null = null;
  if (active) {
    const since = Date.parse((active.started_at as string | null) ?? (active.created_at as string));
    if (active.status === "running" && Date.now() - since < 5 * 60_000) return { ok: false, status: 409, error: "A draft is already being built for this job." };
    target = active as unknown as Row;
  }
  if (same && same.id !== target?.id) {
    if (target) await sb.from("budget_runs").update({ status: "done", finished_at: now, error: "same input as an earlier try" })
      .eq("org_id", orgId).eq("id", target.id).eq("status", target.status);
    target = same as unknown as Row;
  }

  const claim = { status: "running", started_at: now, input_hash: hash, idem_key: idem, recipe_version: RECIPE_VERSION, error: null, ...onBudget };
  let runId: string;
  if (target) {
    const { data: prev } = await sb.from("budget_runs").select("attempts").eq("id", target.id).maybeSingle();
    let upd = sb.from("budget_runs").update({ ...claim, attempts: Number(prev?.attempts ?? 0) + 1 })
      .eq("org_id", orgId).eq("id", target.id).eq("status", target.status);
    if (target.started_at) upd = upd.eq("started_at", target.started_at);
    const { data: got, error } = await upd.select("id");
    if (error || !got?.length) return { ok: false, status: 409, error: "A draft is already being built for this job." };
    runId = target.id;
  } else {
    const { data, error } = await sb.from("budget_runs").insert({ org_id: orgId, job_id: jobId, trigger, created_by: userId, attempts: 1, ...claim })
      .select("id").single();
    if (missingTable(error)) return { ok: false, status: 503, error: DRAFT_TABLE_MISSING };
    if (error || !data) return { ok: false, status: 409, error: "A draft is already being built for this job." };
    runId = data.id as string;
  }

  try {
    // Read: the plain reading always; the model's on top when a key is set.
    let reader = "plain";
    let extra: ReturnType<typeof modelSeen> = [];
    if (modelConfigured() && g.evidence.length) {
      const m = await modelRead(g.evidence);
      if (m.ok) { extra = modelSeen(m.json, g.evidence); reader = m.provider; }
      else reader = `plain (model: ${m.error})`;
    }
    const x = extract(g.evidence, (g.job.job_type as string | null) ?? null, extra);
    const outcome = outcomeOf(x);
    if (!g.job.job_type && x.kind !== "unsupported") x.questions.push("Set the job's type (residential…) so your assembly loads on its areas.");

    const { data: secs } = await sb.from("job_sections").select("id, name, work_type, length_ft, width_ft, sqft_override, depth_in")
      .eq("org_id", orgId).eq("job_id", jobId);
    const sections = (secs ?? []) as Array<Record<string, unknown>>;
    const { count: before } = await sb.from("estimate_line_items").select("id", { count: "exact", head: true }).eq("estimate_id", est.id as string);
    const fresh = (before ?? 0) === 0;
    const made: Made = { sections: [], filled: [] };
    let suggestions: Suggestion[] = [];
    if (!sections.length && x.kind !== "unsupported" && x.areas.length) {
      let sort = 0;
      for (const a of x.areas) {
        const row = {
          org_id: orgId, job_id: jobId, name: a.name, work_type: a.work_type, sort_order: sort++,
          length_ft: a.length_ft, width_ft: a.width_ft, sqft_override: a.sqft, depth_in: a.depth_in,
          psi: (a.facts.find((f) => f.key === "psi")?.value as number | undefined) ?? null,
          origin: "draft", source_ref: provenance(a),
        };
        const { data: s, error } = await sb.from("job_sections").insert(row).select("id, work_type").single();
        if (error || !s) throw new Error(`Couldn't add the ${a.name.toLowerCase()} area${/origin/.test(error?.message ?? "") ? " (migration 087)" : ""}.`);
        const asm = await loadAssembly(sb, orgId, jobId, s.id as string,
          { auto: true, jobType: (g.job.job_type as string | null) ?? null, workType: a.work_type });
        made.sections.push({ id: s.id as string, name: a.name, assembly: asm.loaded, lines: asm.lines });
      }
    } else if (sections.length) {
      suggestions = suggestionsFor(x.areas, sections);
      // A new, empty budget on a job that already has areas: Coy's assembly
      // fills each area, as it would a new one. Sizes are never changed —
      // what was heard differently stays a suggestion.
      // An area drawn as a "slab" that they called a driveway takes the
      // driveway's assembly when its own kind has none.
      if (fresh && x.kind !== "unsupported") {
        for (const sec of sections) {
          const jobType = (g.job.job_type as string | null) ?? null;
          let asm = await loadAssembly(sb, orgId, jobId, sec.id as string, { auto: true, jobType, workType: (sec.work_type as string | null) ?? null });
          const heard = x.areas.find((a) => areaFor(a, x.areas.length, [sec as unknown as JobArea]) && a.work_type !== sec.work_type);
          if (!asm.loaded && heard) asm = await loadAssembly(sb, orgId, jobId, sec.id as string, { auto: true, jobType, workType: heard.work_type });
          made.sections.push({ id: sec.id as string, name: (sec.name as string | null) ?? "Area", assembly: asm.loaded, lines: asm.lines, existing: true });
        }
      }
    }
    // Every step the assembly left open takes Coy's one clear item for it, on
    // a budget this build started empty. A toss-up is left for him to pick.
    if (fresh && x.kind !== "unsupported") made.filled = await fillOpenSteps(sb, orgId, jobId, est.id as string, x);
    const sized = withJobAreas(x, (await areasOf(sb, orgId, jobId)));
    const reading = { ...x, scope: g.scope, evidence_count: g.evidence.length };
    const { data: done } = await sb.from("budget_runs").update({
      status: "done", outcome: x.kind === "unsupported" ? outcome : outcomeOnJob(sized), reader, reading, made, suggestions, finished_at: new Date().toISOString(),
    }).eq("org_id", orgId).eq("id", runId).select(RUN_COLS).single();
    return { ok: true, run: done ?? { id: runId, status: "done", outcome }, again: false };
  } catch (e) {
    const msg = clip(((e as Error).message || "The build stopped.").replace(/\s+/g, " "), 300);
    await sb.from("budget_runs").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", runId);
    return { ok: false, status: 500, error: msg };
  }
}

type Made = {
  sections: Array<{ id: string; name: string; assembly: string | null; lines: number; existing?: boolean }>;
  filled: Array<{ step: string; item: string; lines: number }>;
};

const AREA_COLS = "id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, count_qty, count_unit";
const areasOf = async (sb: Sb, orgId: string, jobId: string) =>
  ((await sb.from("job_sections").select(AREA_COLS).eq("org_id", orgId).eq("job_id", jobId)).data ?? []) as unknown as JobArea[];

/** Coy's active Price book items, with how many budget lines each has made. */
export async function priceItems(sb: Sb, orgId: string): Promise<PriceItem[]> {
  const [{ data: items }, { data: groups }, { data: used }] = await Promise.all([
    sb.from("cost_items").select("id, name, cost_type, qty_rule, unit, unit_cost, cost_group_id").eq("org_id", orgId).eq("active", true).limit(3000),
    sb.from("cost_groups").select("id, name").eq("org_id", orgId),
    sb.from("estimate_line_items").select("cost_item_id").eq("org_id", orgId).not("cost_item_id", "is", null).limit(10000),
  ]);
  const gname = new Map(((groups ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
  const n = new Map<string, number>();
  for (const r of (used ?? []) as Array<{ cost_item_id: string }>) n.set(r.cost_item_id, (n.get(r.cost_item_id) ?? 0) + 1);
  return ((items ?? []) as Array<Record<string, unknown>>).map((i) => ({
    id: i.id as string, name: (i.name as string) ?? "", cost_type: (i.cost_type as string) ?? "other", qty_rule: (i.qty_rule as string) ?? "manual",
    unit: (i.unit as string | null) ?? null, unit_cost: i.unit_cost === null || i.unit_cost === undefined ? null : Number(i.unit_cost),
    group_name: i.cost_group_id ? gname.get(i.cost_group_id as string) ?? null : null, used: n.get(i.id as string) ?? 0,
  }));
}

async function recipeLines(sb: Sb, orgId: string, estimateId: string) {
  const [{ data: rows }, { data: groups }] = await Promise.all([
    sb.from("estimate_line_items").select("id, name, cost_type, qty_rule, section_role, cost_group_id").eq("estimate_id", estimateId),
    sb.from("cost_groups").select("id, name").eq("org_id", orgId),
  ]);
  const gname = new Map(((groups ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
  return ((rows ?? []) as Array<Record<string, unknown>>).map((l) => ({
    id: l.id as string, name: l.name as string, cost_type: l.cost_type as string, qty_rule: l.qty_rule as string,
    section_role: (l.section_role as string | null) ?? null, group_name: l.cost_group_id ? gname.get(l.cost_group_id as string) ?? null : null,
  }));
}

/**
 * The open steps' clear picks onto the budget: one line per area for an area
 * step, one whole-job line for mobilization and equipment. Prices are Coy's
 * own, copied from the item as any + Add would.
 */
async function fillOpenSteps(sb: Sb, orgId: string, jobId: string, estimateId: string, x: Extraction) {
  const exclusions = await readExclusions(sb, orgId, estimateId);
  const open = checkRecipe({ demo: x.demo ?? null }, await recipeLines(sb, orgId, estimateId), exclusions)
    .filter((s) => s.state === "open").map((s) => s.key);
  if (!open.length) return [];
  const picks = autoFill(open, await priceItems(sb, orgId));
  if (!picks.length) return [];
  const areas = await areasOf(sb, orgId, jobId);
  const { data: cards } = await sb.from("cost_items").select(CARD_COLS).eq("org_id", orgId).in("id", picks.map((p) => p.item.id));
  const byId = new Map(((cards ?? []) as Array<Record<string, unknown>>).map((c) => [c.id as string, c]));
  let sort = await nextSort(sb, estimateId);
  const out: Made["filled"] = [];
  for (const p of picks) {
    const c = byId.get(p.item.id);
    if (!c) continue;
    const whole = p.item.covers.every((k) => WHOLE_JOB_STEPS.has(k)) || !areas.length;
    const rows = (whole ? [null] : areas.map((a) => a.id)).map((sectionId) =>
      cardToLine(c, { orgId, estimateId, sectionId, optionId: null, sortOrder: sort++ }));
    const { error } = await sb.from("estimate_line_items").insert(rows);
    if (!error) out.push({ step: p.step, item: p.item.name, lines: rows.length });
  }
  return out;
}

/**
 * Coy's tap on a step: one of his items (or one he just made) onto the open
 * budget — on every area for an area step, once for the whole job for
 * mobilization and equipment.
 */
export async function addStepItem(sb: Sb, orgId: string, jobId: string, step: string, itemId: string) {
  const est = await workingEstimate(sb, orgId, jobId, true);
  if (!est) return { ok: false as const, status: 500, error: "Couldn't open the budget." };
  const { data: c } = await sb.from("cost_items").select(CARD_COLS).eq("org_id", orgId).eq("id", itemId).maybeSingle();
  if (!c) return { ok: false as const, status: 404, error: "No such Price book item." };
  const areas = WHOLE_JOB_STEPS.has(step) ? [] : await areasOf(sb, orgId, jobId);
  let sort = await nextSort(sb, est.id as string);
  const rows = (areas.length ? areas.map((a) => a.id) : [null]).map((sectionId) =>
    cardToLine(c as Record<string, unknown>, { orgId, estimateId: est.id as string, sectionId, optionId: null, sortOrder: sort++ }));
  const { error } = await sb.from("estimate_line_items").insert(rows);
  if (error) return { ok: false as const, status: 500, error: error.message };
  return { ok: true as const, lines: rows.length };
}

/**
 * Going rates for the open steps, from the web, kept on the open budget's
 * latest build (made.rates). Only the work and the city leave the app.
 */
export async function lookupRates(sb: Sb, orgId: string, jobId: string) {
  const state = await draftState(sb, orgId, jobId);
  if (!state.ready) return { ok: false as const, status: 503, error: state.error ?? DRAFT_TABLE_MISSING };
  if (!state.run?.id) return { ok: false as const, status: 409, error: "Build the draft budget first." };
  const found = await searchRates(sb, orgId, jobId, state.steps.filter((s) => s.state === "open").map((s) => s.key));
  const made = { ...((state.run.made as Record<string, unknown> | null) ?? {}), rates: found };
  await sb.from("budget_runs").update({ made }).eq("org_id", orgId).eq("id", state.run.id as string);
  return { ok: true as const };
}

/** The web search and the model's read of it: the job's city, the steps asked for (none = every step). */
async function jobPlace(sb: Sb, orgId: string, jobId: string): Promise<string | null> {
  const { data: job } = await sb.from("jobs").select("address, city, state, customer_id").eq("org_id", orgId).eq("id", jobId).maybeSingle();
  let place: string | null = job?.city && job?.state ? `${job.city}, ${job.state}` : cityOf((job?.address as string | null) ?? null);
  if (!place && job?.customer_id) {
    const { data: c } = await sb.from("customers").select("city, state").eq("org_id", orgId).eq("id", job.customer_id as string).maybeSingle();
    if (c?.city && c?.state) place = `${c.city}, ${c.state}`;
  }
  return place;
}

/**
 * Going rates for the job's own sections (Coy, 2026-10-09: the sections made from the plan
 * set, for "a cost analysis of market rates"). One search each, at most four, by the
 * section's name and unit near the job's city; each kept rate's step is the section's id.
 */
export async function searchSectionRates(sb: Sb, orgId: string, jobId: string, asks: Array<SectionAsk & { id: string }>): Promise<RateLookup & { kind: "sections"; section_ids: string[] }> {
  const place = await jobPlace(sb, orgId, jobId);
  const list = asks.slice(0, 4);
  const queries = sectionQueries(place, list);
  const found: RateLookup & { kind: "sections"; section_ids: string[] } = { kind: "sections", section_ids: list.map((a) => a.id), place: place ?? "no city on the job", asked_at: new Date().toISOString(), queries, rates: [], dropped: 0, error: null };
  if (!list.length) { found.error = "No sections to look up."; return found; }
  const web = await searchWeb(queries);
  if (web.error) found.error = web.error;
  else if (!web.results.length) found.error = "The search found nothing.";
  else if (!modelConfigured()) found.error = "Reading the prices needs ANTHROPIC_API_KEY.";
  else {
    const m = await modelJson(SECTION_RATES_SYSTEM, renderAsks(list) + renderResults(web.results), 3000, 45_000);
    if (!m.ok) found.error = `Couldn't read the prices: ${m.error}.`;
    else {
      const got = sanitizeRates(m.json, web.results, new Set(list.map((a) => a.key)));
      const idOf = new Map(list.map((a) => [a.key, a.id]));
      found.rates = got.rates.map((r) => ({ ...r, step: idOf.get(r.step) ?? r.step }));
      found.dropped = got.dropped;
    }
  }
  return found;
}

export async function searchRates(sb: Sb, orgId: string, jobId: string, open: string[]): Promise<RateLookup> {
  const place = await jobPlace(sb, orgId, jobId);
  const queries = rateQueries(place, open);
  const found: RateLookup = { place: place ?? "no city on the job", asked_at: new Date().toISOString(), queries, rates: [], dropped: 0, error: null };
  const web = await searchWeb(queries);
  if (web.error) found.error = web.error;
  else if (!web.results.length) found.error = "The search found nothing.";
  else if (!modelConfigured()) found.error = "Reading the prices needs ANTHROPIC_API_KEY.";
  else {
    const m = await modelJson(RATES_SYSTEM, renderResults(web.results), 3000, 45_000);
    if (!m.ok) found.error = `Couldn't read the prices: ${m.error}.`;
    else Object.assign(found, sanitizeRates(m.json, web.results));
  }
  return found;
}

// ---------------------------------------------------------------- the panel's view

export async function readExclusions(sb: Sb, orgId: string, estimateId: string): Promise<Record<string, string>> {
  const { data, error } = await sb.from("estimates").select("recipe_exclusions").eq("org_id", orgId).eq("id", estimateId).maybeSingle();
  if (error || !data) return {};
  const v = data.recipe_exclusions as Record<string, unknown> | null;
  return Object.fromEntries(Object.entries(v ?? {}).filter(([, r]) => typeof r === "string")) as Record<string, string>;
}

/**
 * Everything the job page's Draft panel shows: the latest build, the recipe
 * checked against the budget as it is NOW (Coy's edits included), what the
 * engine can't price, whether the total is partial, what blocks approval, and
 * the last approval.
 */
export async function draftState(sb: Sb, orgId: string, jobId: string) {
  const est = await workingEstimate(sb, orgId, jobId, false);
  // The open budget's own build (migration 088); a build from before 088 has
  // no budget and shows on whichever is open. Without 088, the job's latest.
  const latest = () => sb.from("budget_runs").select(RUN_COLS).eq("org_id", orgId).eq("job_id", jobId)
    .order("created_at", { ascending: false }).limit(1);
  let { data: runs, error } = est ? await latest().or(`estimate_id.eq.${est.id as string},estimate_id.is.null`) : await latest();
  if (error && /estimate_id/.test(error.message ?? "")) ({ data: runs, error } = await latest());
  if (missingTable(error)) return { ready: false as const, error: DRAFT_TABLE_MISSING };
  const run = ((runs ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  const [{ data: rows }, { data: secs }, pricing, takeoff, { data: groups }, { data: appr }, { data: job }] = await Promise.all([
    est ? sb.from("estimate_line_items").select(LINE_COLUMNS).eq("estimate_id", est.id as string) : Promise.resolve({ data: [] }),
    sb.from("job_sections").select("id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, count_qty, count_unit").eq("org_id", orgId).eq("job_id", jobId),
    pricingFor(sb, orgId, [jobId]),
    takeoffTotalsFor(sb, orgId, jobId),
    sb.from("cost_groups").select("id, name").eq("org_id", orgId),
    est ? sb.from("budget_approvals").select("id, total, cost, approved_at, approved_by").eq("org_id", orgId).eq("job_id", jobId).eq("estimate_id", est.id as string).order("approved_at", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
    sb.from("jobs").select("job_type, duration_days").eq("org_id", orgId).eq("id", jobId).maybeSingle(),
  ]);
  const lines = ((rows ?? []) as Array<Record<string, unknown>>).map(numLine) as unknown as Array<BudgetLine & Record<string, unknown>>;
  const p = pricing.get(jobId);
  const res = p ? budget(lines, [], p.settings, (secs ?? []) as SectionInput[], p.days, { tax_on: est?.tax_on === true, discount: Number(est?.discount_amount ?? 0), takeoff: takeoff as never }) : null;
  const gname = new Map(((groups ?? []) as Array<{ id: string; name: string }>).map((x) => [x.id, x.name]));
  const rawReading = (run?.reading ?? null) as (Extraction & { scope?: string }) | null;
  // The job's measured areas answer "how big" and "how thick" (Coy's 894 SF).
  const reading = rawReading && rawReading.areas ? withJobAreas(rawReading, (secs ?? []) as unknown as JobArea[]) : rawReading;
  const exclusions = est ? await readExclusions(sb, orgId, est.id as string) : {};
  const steps = checkRecipe({ demo: reading?.demo ?? null }, lines.map((l) => ({
    id: l.id, name: l.name, cost_type: l.cost_type, qty_rule: l.qty_rule, section_role: (l.section_role as string | null) ?? null,
    group_name: l.cost_group_id ? gname.get(l.cost_group_id) ?? null : null,
  })), exclusions);
  const blockedLines = res ? lines.filter((l) => res.lines[l.id]?.blocked.length).map((l) => ({ id: l.id, name: l.name, reasons: res.lines[l.id].blocked })) : [];
  const tier = res?.tiers[0] ?? null;
  const manual = run?.outcome === "manual_review" || (job?.job_type && job.job_type !== "residential");
  const blocks = approvalBlocks({ steps, blockedLines, lineCount: lines.length, manualReview: !!manual });
  // Dusty's estimates wait for Coy's Confirm on the budget (Coy, 2026-10-09).
  const estimated = lines.filter((l) => isEstimate((l as { description?: string | null }).description));
  if (estimated.length) blocks.push(`${estimated.length} line${estimated.length === 1 ? " is" : "s are"} Dusty's estimate — confirm ${estimated.length === 1 ? "it" : "them"} on the budget: ${estimated.slice(0, 4).map((l) => l.name).join(", ")}${estimated.length > 4 ? " …" : ""}`);
  if (!res) blocks.unshift("The job's pricing couldn't be read.");
  const unsized = ((secs ?? []) as SectionInput[]).length === 0;
  if (unsized && !lines.length) blocks.unshift("The job has no areas yet.");
  const items = steps.some((s) => s.state === "open") ? await priceItems(sb, orgId) : [];
  const shownRun = run && reading ? {
    ...run, reading,
    outcome: run.outcome && run.outcome !== "manual_review" && reading !== rawReading ? outcomeOnJob(reading as never) : run.outcome,
  } : run;
  return {
    ready: true as const,
    run: shownRun, steps, picks: picksForOpen(steps, items),
    sqft: ((secs ?? []) as unknown as JobArea[]).reduce((n, a) => n + (sqftOf(a) ?? 0), 0) || null, blocked_lines: blockedLines, blocks,
    line_names: Object.fromEntries(lines.map((l) => [l.id, l.name])),
    totals: tier ? { cost: tier.cost, overhead: tier.overhead, price: tier.price, tax: tier.tax, total: tier.total, partial: !tier.priced } : null,
    approval: ((appr ?? []) as Array<Record<string, unknown>>)[0] ?? null,
    estimate_id: (est?.id as string | undefined) ?? null,
    exclusions,
    reader: modelConfigured() ? "model" : "plain",
    outcome: (shownRun?.outcome as DraftOutcome | null) ?? null,
    // For the approval snapshot.
    _lines: lines, _res: res,
  };
}
