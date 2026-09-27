import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getApiSession } from "@/lib/api-auth";
import {
  PROMPT_VERSION, SYSTEM_PROMPT, findSelfIdentification, renderConversation, sanitize, worthEnriching,
  type Proposal, type Turn,
} from "@/lib/enrich/rules";

/**
 * Suggest names and classifications for unnamed contacts — through Hermes.
 *
 * POST { limit?: number, contact_ids?: string[] }  →  a summary per contact.
 *
 * Writes contact_proposals — a question for Coy — for every contact it reads.
 * customers.relation is never touched: a customer/sub/vendor call always waits
 * for Coy (DECISIONS §2b).
 *
 * ONE EXCEPTION, Coy's rule of 2026-09-27: when the person introduced
 * themselves in their own words ("this is Maegan"), and the contact has no
 * name, the name is written — with name_source='machine', a
 * contact_name_claims row carrying the exact line, and an Undo in the row. The
 * model only proposes; findSelfIdentification() must independently find them
 * saying it. A name Coy confirmed is protected by the database itself
 * (sc_guard_contact_identity), and a name he undid is never re-applied.
 *
 * The rules and the safety checks are the enrich-contacts edge function's,
 * verbatim (src/lib/enrich/rules.ts).
 *
 * What changed from the edge function:
 * - the model runs in Hermes on the VPS (HERMES_URL / HERMES_API_KEY), the
 *   same place Dusty's does — one model service, one key to rotate;
 * - it runs under Coy's session, so RLS scopes it to his org and no service
 *   key is involved;
 * - call content comes from call_artifacts (transcript, else summary), where it
 *   actually lives now — the edge function read messages.transcript, which is
 *   empty — and photos come from message_media (migration 027).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";
const MAX_BATCH = 15;
const SCAN_CAP = 80;
const CONCURRENCY = 3;

type Sb = Extract<Awaited<ReturnType<typeof getApiSession>>, { ok: true }>["session"]["supabase"];

async function loadTurns(sb: Sb, orgId: string, contactId: string): Promise<Turn[]> {
  const { data: rows } = await sb.from("messages")
    .select("id, channel, direction, body_text, summary, occurred_at")
    .eq("org_id", orgId).eq("contact_id", contactId)
    .order("occurred_at", { ascending: true }).limit(250);
  const msgs = (rows ?? []) as Array<{ id: string; channel: string; direction: string; body_text: string | null; summary: string | null; occurred_at: string | null }>;
  if (!msgs.length) return [];

  const ids = msgs.map((m) => m.id);
  const callIds = msgs.filter((m) => m.channel === "call").map((m) => m.id);
  const [{ data: arts }, { data: media }] = await Promise.all([
    callIds.length
      ? sb.from("call_artifacts").select("message_id, kind, content").eq("org_id", orgId)
          .in("message_id", callIds).in("kind", ["transcript", "summary"])
      : Promise.resolve({ data: [] }),
    sb.from("message_media").select("message_id").eq("org_id", orgId).in("message_id", ids),
  ]);
  const transcript = new Map<string, string>();
  const summary = new Map<string, string>();
  for (const a of (arts ?? []) as Array<{ message_id: string; kind: string; content: string | null }>) {
    if (!a.content?.trim()) continue;
    (a.kind === "transcript" ? transcript : summary).set(a.message_id, a.content.trim());
  }
  const withMedia = new Set(((media ?? []) as Array<{ message_id: string }>).map((m) => m.message_id));

  const turns: Turn[] = [];
  for (const m of msgs) {
    const isCall = m.channel === "call";
    // For a call the transcript is the real words; a summary is a paraphrase,
    // used only when there is no transcript.
    const text = (isCall ? transcript.get(m.id) ?? summary.get(m.id) ?? m.summary ?? "" : m.body_text ?? "").trim();
    const hasMedia = withMedia.has(m.id);
    if (!text && !hasMedia) continue;
    turns.push({
      id: m.id, kind: isCall ? "call" : "sms",
      who: m.direction === "outbound" ? "US" : "THEM",
      at: m.occurred_at ?? "", text: text || "(no text)", hasMedia,
    });
  }
  return turns;
}

/**
 * Write the name when — and only when — the person introduced themselves.
 * Every failure here leaves the suggestion in place as a question; nothing is
 * worse off than before.
 */
async function applySelfIdentified(sb: Sb, orgId: string, contactId: string, p: Proposal, turns: Turn[], model: string)
  : Promise<{ named: boolean; note: string }> {
  if (!p.proposed_name) return { named: false, note: "no name proposed" };

  const [{ data: c }, { data: phones }, { data: undone }] = await Promise.all([
    sb.from("contacts").select("name, name_source, phone").eq("org_id", orgId).eq("id", contactId).maybeSingle(),
    sb.from("contact_phones").select("phone_e164").eq("org_id", orgId).eq("contact_id", contactId),
    sb.from("contact_name_claims").select("claimed_name").eq("org_id", orgId).eq("contact_id", contactId).eq("status", "rejected"),
  ]);
  if (!c) return { named: false, note: "contact not readable" };
  if ((c.name as string | null)?.trim() || c.name_source === "human") return { named: false, note: "already has a name" };

  const name = p.proposed_name.trim().replace(/\s+/g, " ");
  if (((undone ?? []) as Array<{ claimed_name: string | null }>).some((u) => u.claimed_name?.trim().toLowerCase() === name.toLowerCase())) {
    return { named: false, note: "Coy undid this name before" };
  }

  const numbers = [c.phone as string | null, ...((phones ?? []) as Array<{ phone_e164: string }>).map((x) => x.phone_e164)]
    .filter((x): x is string => !!x);
  const hit = findSelfIdentification(name, turns, numbers);
  if (!hit) return { named: false, note: "they never introduced themselves by that name" };

  const now = new Date().toISOString();
  const { data: claim, error: cErr } = await sb.from("contact_name_claims").insert({
    org_id: orgId, contact_id: contactId, claimed_name: name, claimed_company: p.proposed_company,
    claim_type: "self_identification", channel: hit.channel, source_message_id: hit.turnId,
    evidence_quote: hit.quote, provider: "hermes", model, prompt_version: PROMPT_VERSION,
    confidence: p.confidence, status: "accepted", decided_at: now,
  }).select("id").single();
  if (cErr || !claim) return { named: false, note: `claim: ${cErr?.message ?? "not written"}` };

  // Only onto an empty, non-human name. The filter makes a race with Coy
  // typing a name a no-op rather than an overwrite.
  const { data: rows, error: uErr } = await sb.from("contacts")
    .update({ name, name_source: "machine", name_claim_id: claim.id, enrichment_source: "hermes-self-id" })
    .eq("org_id", orgId).eq("id", contactId).neq("name_source", "human").or("name.is.null,name.eq.")
    .select("name");
  // The reserved-names trigger can blank the name (e.g. one of our own); then
  // there is no name to stand behind, so the claim stands down too.
  const landed = !uErr && ((rows ?? []) as Array<{ name: string | null }>).some((r) => !!r.name?.trim());
  if (!landed) {
    await sb.from("contact_name_claims").update({ status: "superseded" }).eq("org_id", orgId).eq("id", claim.id);
    if (!uErr && (rows ?? []).length) {
      await sb.from("contacts").update({ name_claim_id: null, name_source: "legacy" }).eq("org_id", orgId).eq("id", contactId).eq("name_claim_id", claim.id);
    }
    return { named: false, note: uErr ? `contacts: ${uErr.message}` : "name was refused or already set" };
  }
  return { named: true, note: hit.quote };
}

function fingerprint(turns: Turn[]): string {
  const basis = turns.map((t) => `${t.id}:${t.text.length}:${t.hasMedia ? 1 : 0}`).join("|");
  return createHash("sha256").update(basis).digest("hex");
}

async function askHermes(conversation: string): Promise<{ ok: true; proposal: Proposal } | { ok: false; error: string }> {
  const base = process.env.HERMES_URL?.replace(/\/+$/, "");
  const key = process.env.HERMES_API_KEY;
  if (!base || !key) return { ok: false, error: "HERMES_URL / HERMES_API_KEY not set" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.HERMES_MODEL || DEFAULT_MODEL,
        stream: false, temperature: 0.1, max_tokens: 900,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `CONVERSATION:\n\n${conversation}` },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `Hermes HTTP ${res.status}` };
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "no JSON in the model's answer" };
    return { ok: true, proposal: JSON.parse(match[0]) as Proposal };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "AbortError" ? "Hermes timed out" : "couldn't reach Hermes" };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  let body: { limit?: unknown; contact_ids?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), MAX_BATCH);
  const only = Array.isArray(body.contact_ids) ? body.contact_ids.filter((x): x is string => typeof x === "string").slice(0, MAX_BATCH) : null;

  // Candidates: unnamed, not merged away, no pending suggestion — most recent
  // traffic first, so the people most likely to call back get named first.
  let q = supabase.from("contacts").select("id, phone, name")
    .eq("org_id", orgId).is("merged_into_contact_id", null);
  if (only) q = q.in("id", only);
  const { data: contacts, error } = await q.limit(1000);
  if (error) return applyCookies(NextResponse.json({ error: `contacts: ${error.message}` }, { status: 500 }));
  const unnamed = ((contacts ?? []) as Array<{ id: string; phone: string | null; name: string | null }>)
    .filter((c) => only || !c.name?.trim());

  const { data: pend } = await supabase.from("contact_proposals").select("contact_id, id, source_fingerprint")
    .eq("org_id", orgId).eq("status", "pending");
  const pending = new Map(((pend ?? []) as Array<{ contact_id: string; id: string; source_fingerprint: string | null }>)
    .map((p) => [p.contact_id, p]));

  const { data: recent } = await supabase.from("messages").select("contact_id, occurred_at")
    .eq("org_id", orgId).in("contact_id", unnamed.map((c) => c.id).slice(0, 1000))
    .order("occurred_at", { ascending: false }).limit(1000);
  const lastAt = new Map<string, string>();
  for (const r of (recent ?? []) as Array<{ contact_id: string; occurred_at: string }>) {
    if (!lastAt.has(r.contact_id)) lastAt.set(r.contact_id, r.occurred_at);
  }
  // A contact with a pending suggestion is read again only when its traffic
  // changed (the fingerprint check below), so new words get a fresh look.
  const queue = unnamed
    .sort((a, b) => (lastAt.get(b.id) ?? "").localeCompare(lastAt.get(a.id) ?? ""))
    .slice(0, SCAN_CAP);

  const results: Array<Record<string, unknown>> = [];
  let proposed = 0, failed = 0, skipped = 0, unchanged = 0, scanned = 0, named = 0;
  const model = `hermes:${process.env.HERMES_MODEL || DEFAULT_MODEL}`;
  let i = 0;

  async function worker() {
    while (i < queue.length && proposed + failed < limit) {
      const c = queue[i++];
      scanned++;
      const turns = await loadTurns(supabase, orgId, c.id);
      if (!worthEnriching(turns)) { skipped++; continue; }
      const fp = fingerprint(turns);
      const existing = pending.get(c.id);
      if (existing?.source_fingerprint === fp) { unchanged++; continue; }

      const { text } = renderConversation(turns);
      const res = await askHermes(text);
      if (!res.ok) { failed++; results.push({ contact_id: c.id, outcome: "model_error", error: res.error }); continue; }
      const { p } = sanitize(res.proposal, turns);
      if (!p.evidence_message_id) { failed++; results.push({ contact_id: c.id, outcome: "no_evidence" }); continue; }

      if (existing?.id) {
        await supabase.from("contact_proposals").update({ status: "superseded" }).eq("id", existing.id).eq("org_id", orgId);
      }
      const { data: ins, error: insErr } = await supabase.from("contact_proposals").insert({
        org_id: orgId, contact_id: c.id,
        proposed_name: p.proposed_name, proposed_company: p.proposed_company, proposed_role: p.proposed_role,
        project_type: p.project_type, scope_summary: p.scope_summary, start_timing: p.start_timing,
        length_ft: p.length_ft, width_ft: p.width_ft, sqft_stated: p.sqft_stated, site_hint: p.site_hint,
        has_media: !!p.has_media, classification: p.classification, confidence: p.confidence,
        evidence_message_id: p.evidence_message_id, evidence_quote: p.evidence_quote.slice(0, 2000),
        model, prompt_version: PROMPT_VERSION,
        source_fingerprint: fp, status: "pending",
      }).select("id").single();
      if (insErr || !ins) { failed++; results.push({ contact_id: c.id, outcome: "insert_error", error: insErr?.message }); continue; }
      proposed++;

      const auto = await applySelfIdentified(supabase, orgId, c.id, p, turns, model);
      if (auto.named) named++;
      results.push({ contact_id: c.id, outcome: "proposed", name: p.proposed_name, classification: p.classification,
        confidence: p.confidence, auto_named: auto.named, auto_note: auto.note });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("enrich run", JSON.stringify({ proposed, named, failed, skipped, unchanged, scanned }));
  return applyCookies(NextResponse.json({
    prompt_version: PROMPT_VERSION, proposed, named, failed, skipped_no_words: skipped, unchanged, scanned,
    remaining: Math.max(queue.length - scanned, 0), results,
  }));
}
