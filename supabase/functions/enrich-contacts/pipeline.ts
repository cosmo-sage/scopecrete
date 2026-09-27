/**
 * Reading ONE contact: load the conversation, ask the model, record the
 * suggestion, and apply the name if — and only if — the person introduced
 * themselves. index.ts claims contacts and calls this; tests call it with a
 * fake database and a fake model.
 *
 * Every query filters org_id explicitly. The worker runs as service role, so
 * RLS is not there to catch a missing filter.
 */

import {
  PROMPT_VERSION, SYSTEM_PROMPT, findSelfIdentification, relabelTranscript, renderConversation, sanitize,
  spamSignal, worthEnriching, type Proposal, type Turn,
} from './rules.ts'

/**
 * The slice of a supabase-js client this file uses. Structural rather than
 * imported, so the same file runs under Deno and Node without an import map.
 */
// deno-lint-ignore no-explicit-any
export type Db = { from: (table: string) => any }

export type Ask = (conversation: string) => Promise<{ ok: true; proposal: Proposal } | { ok: false; error: string }>

export type Outcome = 'proposed' | 'named' | 'filed' | 'unchanged' | 'no_words' | 'model_error' | 'failed'

export interface ReadResult {
  outcome: Outcome
  proposal_id?: string | null
  claim_id?: string | null
  note?: string
}

export interface HermesConfig { url: string; key: string; model: string }

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/** Hermes's /health answers without the key, so reachability is checked apart from auth. */
export async function pingHermes(cfg: HermesConfig): Promise<{ ok: boolean; detail: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const r = await fetch(`${cfg.url.replace(/\/+$/, '')}/health`, { signal: ctrl.signal })
    return r.ok ? { ok: true, detail: 'reachable' } : { ok: false, detail: `Hermes /health returned ${r.status}` }
  } catch (e) {
    return { ok: false, detail: (e as Error).name === 'AbortError' ? 'Hermes /health timed out' : `Hermes unreachable: ${(e as Error).message}`.slice(0, 200) }
  } finally {
    clearTimeout(timer)
  }
}

export function hermesAsk(cfg: HermesConfig): Ask {
  return async (conversation) => {
    const ctrl = new AbortController()
    // Hermes answers in 20-85 s (measured 2026-09-27); a small model direct
    // is under 10. 90 s rather than fail a third of reads while that is fixed.
    const timer = setTimeout(() => ctrl.abort(), 90_000)
    try {
      const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/v1/chat/completions`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model: cfg.model, stream: false, temperature: 0.1, max_tokens: 900,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `CONVERSATION:\n\n${conversation}` },
          ],
        }),
      })
      if (!res.ok) return { ok: false, error: res.status === 401 || res.status === 403 ? `Hermes rejected the key (HTTP ${res.status})` : `Hermes HTTP ${res.status}` }
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      const raw = data.choices?.[0]?.message?.content ?? ''
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) return { ok: false, error: 'no JSON in the model\'s answer' }
      return { ok: true, proposal: JSON.parse(match[0]) as Proposal }
    } catch (e) {
      return { ok: false, error: (e as Error).name === 'AbortError' ? 'Hermes timed out' : `couldn't reach Hermes: ${(e as Error).message}`.slice(0, 200) }
    } finally {
      clearTimeout(timer)
    }
  }
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

export async function loadTurns(sb: Db, orgId: string, contactId: string): Promise<Turn[]> {
  const { data: rows } = await sb.from('messages')
    .select('id, channel, direction, body_text, summary, occurred_at')
    .eq('org_id', orgId).eq('contact_id', contactId)
    .order('occurred_at', { ascending: true }).limit(250)
  const msgs = (rows ?? []) as Array<{ id: string; channel: string; direction: string; body_text: string | null; summary: string | null; occurred_at: string | null }>
  if (!msgs.length) return []

  const ids = msgs.map((m) => m.id)
  const callIds = msgs.filter((m) => m.channel === 'call').map((m) => m.id)
  const [{ data: arts }, { data: media }] = await Promise.all([
    callIds.length
      ? sb.from('call_artifacts').select('message_id, kind, content').eq('org_id', orgId)
          .in('message_id', callIds).in('kind', ['transcript', 'summary'])
      : Promise.resolve({ data: [] }),
    sb.from('message_media').select('message_id').eq('org_id', orgId).in('message_id', ids),
  ])
  const transcript = new Map<string, string>()
  const summary = new Map<string, string>()
  for (const a of (arts ?? []) as Array<{ message_id: string; kind: string; content: string | null }>) {
    if (!a.content?.trim()) continue;
    (a.kind === 'transcript' ? transcript : summary).set(a.message_id, a.content.trim())
  }
  const withMedia = new Set(((media ?? []) as Array<{ message_id: string }>).map((m) => m.message_id))

  const turns: Turn[] = []
  for (const m of msgs) {
    const isCall = m.channel === 'call'
    // For a call the transcript is the real words; a summary is a paraphrase,
    // used only when there is no transcript.
    const text = (isCall ? transcript.get(m.id) ?? summary.get(m.id) ?? m.summary ?? '' : m.body_text ?? '').trim()
    const hasMedia = withMedia.has(m.id)
    if (!text && !hasMedia) continue
    turns.push({
      id: m.id, kind: isCall ? 'call' : 'sms',
      who: m.direction === 'outbound' ? 'US' : 'THEM',
      at: m.occurred_at ?? '', text: text || '(no text)', hasMedia,
    })
  }
  return turns
}

/** Web Crypto, so it is the same in Deno and Node. */
export async function fingerprint(turns: Turn[]): Promise<string> {
  const basis = turns.map((t) => `${t.id}:${t.text.length}:${t.hasMedia ? 1 : 0}`).join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function contactNumbers(sb: Db, orgId: string, contactId: string): Promise<string[]> {
  const [{ data: c }, { data: phones }] = await Promise.all([
    sb.from('contacts').select('phone').eq('org_id', orgId).eq('id', contactId).maybeSingle(),
    sb.from('contact_phones').select('phone_e164').eq('org_id', orgId).eq('contact_id', contactId),
  ])
  return [c?.phone as string | null, ...((phones ?? []) as Array<{ phone_e164: string }>).map((x) => x.phone_e164)]
    .filter((x): x is string => !!x)
}

// ---------------------------------------------------------------------------
// The one automatic write
// ---------------------------------------------------------------------------

type Named = Pick<Proposal, 'proposed_name' | 'proposed_company' | 'confidence'>

/**
 * Write the name when — and only when — the person introduced themselves
 * (DECISIONS §2b). Any failure leaves the suggestion standing as a question;
 * nothing is worse off than before.
 */
export async function applySelfIdentified(sb: Db, orgId: string, contactId: string, p: Named, turns: Turn[], model: string)
  : Promise<{ claim_id: string | null; note: string }> {
  if (!p.proposed_name) return { claim_id: null, note: 'no name proposed' }

  const [{ data: c }, numbers, { data: undone }] = await Promise.all([
    sb.from('contacts').select('name, name_source').eq('org_id', orgId).eq('id', contactId).maybeSingle(),
    contactNumbers(sb, orgId, contactId),
    sb.from('contact_name_claims').select('claimed_name').eq('org_id', orgId).eq('contact_id', contactId).eq('status', 'rejected'),
  ])
  if (!c) return { claim_id: null, note: 'contact not readable' }
  if ((c.name as string | null)?.trim() || c.name_source === 'human') return { claim_id: null, note: 'already has a name' }

  const name = p.proposed_name.trim().replace(/\s+/g, ' ')
  if (((undone ?? []) as Array<{ claimed_name: string | null }>).some((u) => u.claimed_name?.trim().toLowerCase() === name.toLowerCase())) {
    return { claim_id: null, note: 'Coy undid this name before' }
  }

  const hit = findSelfIdentification(name, turns, numbers)
  if (!hit) return { claim_id: null, note: 'they never introduced themselves by that name' }

  const { data: claim, error: cErr } = await sb.from('contact_name_claims').insert({
    org_id: orgId, contact_id: contactId, claimed_name: name, claimed_company: p.proposed_company,
    claim_type: 'self_identification', channel: hit.channel, source_message_id: hit.turnId,
    evidence_quote: hit.quote, provider: 'hermes', model, prompt_version: PROMPT_VERSION,
    confidence: p.confidence, status: 'accepted', decided_at: new Date().toISOString(),
  }).select('id').single()
  if (cErr || !claim) return { claim_id: null, note: `claim: ${cErr?.message ?? 'not written'}` }

  // Only onto an empty, non-human name: a race with Coy typing a name is a
  // no-op, not an overwrite. sc_guard_contact_identity enforces the same.
  const { data: rows, error: uErr } = await sb.from('contacts')
    .update({ name, name_source: 'machine', name_claim_id: claim.id, enrichment_source: 'hermes-self-id' })
    .eq('org_id', orgId).eq('id', contactId).neq('name_source', 'human').or('name.is.null,name.eq.')
    .select('name')
  // The reserved-names trigger can blank the name (one of our own); then there
  // is no name to stand behind, and the claim stands down too.
  const landed = !uErr && ((rows ?? []) as Array<{ name: string | null }>).some((r) => !!r.name?.trim())
  if (!landed) {
    await sb.from('contact_name_claims').update({ status: 'superseded' }).eq('org_id', orgId).eq('id', claim.id)
    if (!uErr && (rows ?? []).length) {
      await sb.from('contacts').update({ name_claim_id: null, name_source: 'legacy' })
        .eq('org_id', orgId).eq('id', contactId).eq('name_claim_id', claim.id)
    }
    return { claim_id: null, note: uErr ? `contacts: ${uErr.message}` : 'name was refused or already set' }
  }
  return { claim_id: claim.id as string, note: hit.quote }
}

/**
 * File a contact as spam — the one bucket Dusty sets itself (Coy, 2026-09-27),
 * shown as Auto with Undo. Only when the model said spam AND spamSignal()
 * finds the evidence in their words AND Coy never wrote or called back, and
 * only onto a contact nobody has sorted and Coy has not un-filed before.
 */
export async function applyAutoSpam(sb: Db, orgId: string, contactId: string, turns: Turn[], phone: string | null)
  : Promise<{ filed: boolean; note: string }> {
  if (turns.some((t) => t.who === 'US')) return { filed: false, note: 'Coy has replied to them' }
  const sig = spamSignal(turns, phone)
  if (!sig) return { filed: false, note: 'no spam evidence in their words' }
  const { data: rows, error } = await sb.from('contacts')
    .update({
      contact_type: 'spam', contact_subtype: null, classification_source: 'machine',
      auto_classified_at: new Date().toISOString(), auto_classified_reason: sig.quote,
    })
    .eq('org_id', orgId).eq('id', contactId)
    .is('classification_confirmed_at', null).is('auto_classify_blocked_at', null).is('auto_classified_at', null)
    .select('id')
  if (error) return { filed: false, note: `contacts: ${error.message}` }
  return ((rows ?? []) as unknown[]).length
    ? { filed: true, note: sig.quote }
    : { filed: false, note: 'already sorted, or Coy un-filed it before' }
}

// ---------------------------------------------------------------------------
// One contact, start to finish
// ---------------------------------------------------------------------------

export async function readContact(sb: Db, orgId: string, contactId: string, ask: Ask, model: string): Promise<ReadResult> {
  const [turns, numbers] = await Promise.all([loadTurns(sb, orgId, contactId), contactNumbers(sb, orgId, contactId)])
  // What the model reads and what "their words" means: transcripts with US /
  // THEM speakers. findSelfIdentification() keeps the numbered originals.
  const shown = turns.map((t) => t.kind === 'call' ? { ...t, text: relabelTranscript(t.text, numbers) } : t)
  if (!worthEnriching(shown)) return { outcome: 'no_words' }
  const fp = await fingerprint(turns)

  const { data: pend } = await sb.from('contact_proposals')
    .select('id, source_fingerprint, proposed_name, proposed_company, confidence')
    .eq('org_id', orgId).eq('contact_id', contactId).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1)
  const pending = ((pend ?? []) as Array<{ id: string; source_fingerprint: string | null } & Named>)[0]

  // Nothing new said: no model call. The standing suggestion still gets its
  // chance to name them — it may predate the self-introduction rule.
  if (pending && pending.source_fingerprint === fp) {
    const auto = await applySelfIdentified(sb, orgId, contactId, pending, turns, model)
    return auto.claim_id
      ? { outcome: 'named', proposal_id: pending.id, claim_id: auto.claim_id, note: auto.note }
      : { outcome: 'unchanged', proposal_id: pending.id }
  }

  const { text } = renderConversation(shown)
  const res = await ask(text)
  if (!res.ok) return { outcome: 'model_error', note: res.error }
  const { p } = sanitize(res.proposal, shown)
  if (!p.evidence_message_id) return { outcome: 'failed', note: 'no evidence line' }

  if (pending?.id) {
    await sb.from('contact_proposals').update({ status: 'superseded' }).eq('org_id', orgId).eq('id', pending.id)
  }
  const { data: ins, error: insErr } = await sb.from('contact_proposals').insert({
    org_id: orgId, contact_id: contactId,
    proposed_name: p.proposed_name, proposed_company: p.proposed_company, proposed_role: p.proposed_role,
    project_type: p.project_type, scope_summary: p.scope_summary, start_timing: p.start_timing,
    length_ft: p.length_ft, width_ft: p.width_ft, sqft_stated: p.sqft_stated, site_hint: p.site_hint,
    has_media: !!p.has_media, classification: p.classification, confidence: p.confidence,
    evidence_message_id: p.evidence_message_id, evidence_quote: p.evidence_quote.slice(0, 2000),
    model, prompt_version: PROMPT_VERSION, source_fingerprint: fp, status: 'pending',
  }).select('id').single()
  if (insErr || !ins) return { outcome: 'failed', note: `proposal: ${insErr?.message ?? 'not written'}` }

  if (p.classification === 'spam') {
    const spam = await applyAutoSpam(sb, orgId, contactId, turns, numbers[0] ?? null)
    if (spam.filed) return { outcome: 'filed', proposal_id: ins.id as string, note: spam.note }
  }
  const auto = await applySelfIdentified(sb, orgId, contactId, p, turns, model)
  return auto.claim_id
    ? { outcome: 'named', proposal_id: ins.id as string, claim_id: auto.claim_id, note: auto.note }
    : { outcome: 'proposed', proposal_id: ins.id as string, note: auto.note }
}
