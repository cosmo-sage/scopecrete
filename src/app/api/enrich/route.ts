import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getApiSession } from "@/lib/api-auth";
import {
  PROMPT_VERSION, SYSTEM_PROMPT, renderConversation, sanitize, worthEnriching,
  type Proposal, type Turn,
} from "@/lib/enrich/rules";

/**
 * Suggest names and classifications for unnamed contacts — through Hermes.
 *
 * POST { limit?: number, contact_ids?: string[] }  →  a summary per contact.
 *
 * WRITES ONLY contact_proposals (DECISIONS §2b). Nothing here touches
 * contacts.name or customers.relation — a suggestion appears in the thread
 * row and Coy confirms or rejects it there. The rules and the safety checks
 * are the enrich-contacts edge function's, verbatim (src/lib/enrich/rules.ts).
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
  const queue = unnamed
    .filter((c) => only || !pending.has(c.id))
    .sort((a, b) => (lastAt.get(b.id) ?? "").localeCompare(lastAt.get(a.id) ?? ""))
    .slice(0, SCAN_CAP);

  const results: Array<Record<string, unknown>> = [];
  let proposed = 0, failed = 0, skipped = 0, unchanged = 0, scanned = 0;
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
      const { error: insErr } = await supabase.from("contact_proposals").insert({
        org_id: orgId, contact_id: c.id,
        proposed_name: p.proposed_name, proposed_company: p.proposed_company, proposed_role: p.proposed_role,
        project_type: p.project_type, scope_summary: p.scope_summary, start_timing: p.start_timing,
        length_ft: p.length_ft, width_ft: p.width_ft, sqft_stated: p.sqft_stated, site_hint: p.site_hint,
        has_media: !!p.has_media, classification: p.classification, confidence: p.confidence,
        evidence_message_id: p.evidence_message_id, evidence_quote: p.evidence_quote.slice(0, 2000),
        model: `hermes:${process.env.HERMES_MODEL || DEFAULT_MODEL}`, prompt_version: PROMPT_VERSION,
        source_fingerprint: fp, status: "pending",
      });
      if (insErr) { failed++; results.push({ contact_id: c.id, outcome: "insert_error", error: insErr.message }); continue; }
      proposed++;
      results.push({ contact_id: c.id, outcome: "proposed", name: p.proposed_name, classification: p.classification, confidence: p.confidence });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("enrich run", JSON.stringify({ proposed, failed, skipped, unchanged, scanned }));
  return applyCookies(NextResponse.json({
    prompt_version: PROMPT_VERSION, proposed, failed, skipped_no_words: skipped, unchanged, scanned,
    remaining: Math.max(queue.length - scanned, 0), results,
  }));
}
