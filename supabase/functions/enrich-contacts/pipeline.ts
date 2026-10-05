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
  AUTO_STREAK, PROMPT_VERSION, SYSTEM_PROMPT, bucketOf, findSelfIdentification, greetedName, introducedName, relabelTranscript, renderConversation,
  renderNotes, sanitize, spamSignal, titleKey, worthEnriching, type CoyNote, type Correction, type Proposal, type Turn,
} from './rules.ts'

/**
 * The slice of a supabase-js client this file uses. Structural rather than
 * imported, so the same file runs under Deno and Node without an import map.
 */
// deno-lint-ignore no-explicit-any
export type Db = { from: (table: string) => any }

export type Ask = (conversation: string) => Promise<{ ok: true; proposal: Proposal } | { ok: false; error: string }>

export type Outcome = 'proposed' | 'named' | 'filed' | 'summarized' | 'unchanged' | 'no_words' | 'model_error' | 'failed'

export interface ReadResult {
  outcome: Outcome
  proposal_id?: string | null
  claim_id?: string | null
  note?: string
  /** Dusty's light line about the conversation, for the activity line (migration 039). */
  musing?: string | null
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

/** `extraSystem` carries the org's corrections (renderCorrections); '' adds nothing. */
export function hermesAsk(cfg: HermesConfig, extraSystem = ''): Ask {
  const system = extraSystem ? `${SYSTEM_PROMPT}\n\n${extraSystem}` : SYSTEM_PROMPT
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
          model: cfg.model, stream: false, temperature: 0.1, max_tokens: 1200,
          messages: [
            { role: 'system', content: system },
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
/** The name to put forward: the model's if they introduced themselves by it, else the one they did introduce. */
export function introducedOver(proposed: string | null, turns: Turn[], numbers: string[]): string | null {
  const intro = introducedName(turns, numbers)
  if (proposed && findSelfIdentification(proposed, turns, numbers)) {
    // "Johnette" said, "Johnette Wilson" also said: the whole name (Coy, 2026-10-03).
    return intro && intro.toLowerCase().startsWith(`${proposed.trim().toLowerCase()} `) ? intro : proposed
  }
  return intro ?? proposed
}

export async function applySelfIdentified(sb: Db, orgId: string, contactId: string, p: Named, turns: Turn[], model: string)
  : Promise<{ claim_id: string | null; note: string }> {
  if (!p.proposed_name) return { claim_id: null, note: 'no name proposed' }

  const [{ data: c }, numbers, { data: undone }] = await Promise.all([
    sb.from('contacts').select('name, name_source').eq('org_id', orgId).eq('id', contactId).maybeSingle(),
    contactNumbers(sb, orgId, contactId),
    sb.from('contact_name_claims').select('claimed_name').eq('org_id', orgId).eq('contact_id', contactId).eq('status', 'rejected'),
  ])
  if (!c) return { claim_id: null, note: 'contact not readable' }
  const name = p.proposed_name.trim().replace(/\s+/g, ' ')
  const had = (c.name as string | null)?.trim() || ''
  // A name Dusty wrote may only grow into the fuller one they said; Coy's is never touched.
  const extending = !!had && c.name_source === 'machine' && name.toLowerCase().startsWith(`${had.toLowerCase()} `)
  if ((had && !extending) || c.name_source === 'human') return { claim_id: null, note: 'already has a name' }
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
  const target = sb.from('contacts')
    .update({ name, name_source: 'machine', name_claim_id: claim.id, enrichment_source: 'hermes-self-id' })
    .eq('org_id', orgId).eq('id', contactId).neq('name_source', 'human')
  const { data: rows, error: uErr } = await (extending ? target.eq('name_source', 'machine').eq('name', had) : target.or('name.is.null,name.eq.'))
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
 * Names waiting on a rule, not on a message (Coy, 2026-10-03: Johnette texted
 * "Hi, this is Johnette" and stayed unnamed). A contact is only read again when
 * something new is said, so when the name rules improve, everyone already read
 * under the old ones keeps their old outcome. Each run therefore re-checks the
 * unnamed people whose standing suggestion carries a name — no model call: the
 * same applySelfIdentified() a fresh read uses, on the turns as they are.
 * Cheap (a few reads each) and bounded; a name still has to be one they said.
 */
export async function recheckNames(sb: Db, model: string, limit = 25): Promise<{ checked: number; named: number }> {
  const { data: props } = await sb.from('contact_proposals')
    .select('org_id, contact_id, proposed_name, proposed_company, confidence')
    .eq('status', 'pending').not('proposed_name', 'is', null)
    .order('created_at', { ascending: false }).limit(150)
  const list = (props ?? []) as Array<{ org_id: string; contact_id: string } & Named>
  if (!list.length) return { checked: 0, named: 0 }
  // Unnamed, or a one-word name Dusty wrote that a fuller introduction may extend.
  // Never Coy's name, never merged away. Each row is checked against its own org below.
  const { data: open } = await sb.from('contacts').select('id, org_id, name')
    .in('id', [...new Set(list.map((r) => r.contact_id))])
    .is('merged_into_contact_id', null).neq('name_source', 'human').or('name.is.null,name.eq.,name_source.eq.machine')
  const rank = new Map<string, number>()
  for (const c of (open ?? []) as Array<{ id: string; org_id: string; name: string | null }>) {
    const n = c.name?.trim() ?? ''
    if (!n) rank.set(`${c.org_id}:${c.id}`, 0)
    else if (!n.includes(' ')) rank.set(`${c.org_id}:${c.id}`, 1)
  }
  const rows = list.filter((r) => rank.has(`${r.org_id}:${r.contact_id}`))
    .sort((a, b) => rank.get(`${a.org_id}:${a.contact_id}`)! - rank.get(`${b.org_id}:${b.contact_id}`)!)
    .slice(0, limit)
  let checked = 0, named = 0
  for (const r of rows) {
    checked++
    const [turns, numbers] = await Promise.all([loadTurns(sb, r.org_id, r.contact_id), contactNumbers(sb, r.org_id, r.contact_id)])
    const res = await applySelfIdentified(sb, r.org_id, r.contact_id,
      { ...r, proposed_name: introducedOver(r.proposed_name, turns, numbers) }, turns, model)
    if (res.claim_id) named++
  }
  return { checked, named }
}

/**
 * The name we greet them by, put on a standing suggestion that has none (Coy, 2026-10-05:
 * "Suggest it"). Only a suggestion — Coy confirms it; nothing is written on the contact.
 */
async function suggestGreeted(sb: Db, orgId: string, proposalId: string, turns: Turn[], numbers: string[]): Promise<boolean> {
  const g = greetedName(turns, numbers)
  if (!g) return false
  const { data: cur } = await sb.from('contact_proposals').select('evidence_quote').eq('org_id', orgId).eq('id', proposalId).maybeSingle()
  const q = ((cur as { evidence_quote: string | null } | null)?.evidence_quote ?? '')
  await sb.from('contact_proposals').update({
    proposed_name: g.name, evidence_quote: `${q ? `${q} … ` : ""}(you greeted them: "${g.quote}")`.slice(0, 2000),
  }).eq('org_id', orgId).eq('id', proposalId).is('proposed_name', null)
  return true
}

/**
 * Once, for people read before the rule (the worker's `{"greetings": true}`): each unnamed
 * contact whose standing suggestion has no name gets the one we greet them by, if any.
 */
export async function backfillGreetings(sb: Db, limit = 300): Promise<{ checked: number; suggested: number }> {
  const { data: props } = await sb.from('contact_proposals').select('id, org_id, contact_id')
    .eq('status', 'pending').is('proposed_name', null).order('created_at', { ascending: false }).limit(limit)
  const list = (props ?? []) as Array<{ id: string; org_id: string; contact_id: string }>
  if (!list.length) return { checked: 0, suggested: 0 }
  const { data: open } = await sb.from('contacts').select('id, org_id')
    .in('id', [...new Set(list.map((r) => r.contact_id))])
    .is('merged_into_contact_id', null).neq('name_source', 'human').or('name.is.null,name.eq.')
  const unnamed = new Set(((open ?? []) as Array<{ id: string; org_id: string }>).map((c) => `${c.org_id}:${c.id}`))
  let checked = 0, suggested = 0
  for (const r of list) {
    if (!unnamed.has(`${r.org_id}:${r.contact_id}`)) continue
    checked++
    const [turns, numbers] = await Promise.all([loadTurns(sb, r.org_id, r.contact_id), contactNumbers(sb, r.org_id, r.contact_id)])
    if (await suggestGreeted(sb, r.org_id, r.id, turns, numbers)) suggested++
  }
  return { checked, suggested }
}

/**
 * Dusty files everyone (Coy, 2026-10-03: "Just let Dusty work on filing
 * everything. I can always change it to a different bucket."). A suggestion
 * he is this sure of is filed, marked auto, with Keep / Not X — the earned
 * streak (AUTO_STREAK) still files anything below it. "unknown" is never
 * filed; someone Coy filed, or un-filed, is never touched; spam also needs
 * that Coy never wrote or called back. An automatic vendor or sub still makes
 * leads until Coy keeps it (§2b) — only contacts.contact_type is written.
 */
export const AUTO_FILE_CONFIDENCE = 70
export const AUTO_SPAM_CONFIDENCE = 85

/**
 * The same, for people read before the rule: each run files up to `limit`
 * unsorted contacts from their standing suggestion — no model call.
 */
export async function recheckBuckets(sb: Db, limit = 25): Promise<{ checked: number; filed: number }> {
  const { data: open } = await sb.from('contacts').select('id, org_id, phone')
    .is('merged_into_contact_id', null).is('classification_confirmed_at', null)
    .is('auto_classified_at', null).is('auto_classify_blocked_at', null)
    .order('updated_at', { ascending: false }).limit(150)
  const people = (open ?? []) as Array<{ id: string; org_id: string; phone: string | null }>
  if (!people.length) return { checked: 0, filed: 0 }
  const { data: props } = await sb.from('contact_proposals')
    .select('org_id, contact_id, classification, confidence, evidence_quote')
    .eq('status', 'pending').neq('classification', 'unknown')
    .in('contact_id', people.map((c) => c.id))
  const byId = new Map(people.map((c) => [`${c.org_id}:${c.id}`, c]))
  let checked = 0, filed = 0
  for (const r of (props ?? []) as Array<{ org_id: string; contact_id: string; classification: string; confidence: number; evidence_quote: string | null }>) {
    const c = byId.get(`${r.org_id}:${r.contact_id}`)
    const b = bucketOf(r.classification)
    if (!c || !b || checked >= limit) continue
    if (r.confidence < (b === 'spam' ? AUTO_SPAM_CONFIDENCE : AUTO_FILE_CONFIDENCE)) continue
    checked++
    const res = b === 'spam'
      ? await applyAutoSpam(sb, r.org_id, r.contact_id, await loadTurns(sb, r.org_id, r.contact_id), c.phone, r.confidence, r.evidence_quote ?? '')
      : await applyAutoBucket(sb, r.org_id, r.contact_id, r.classification, r.evidence_quote ?? '')
    if (res.filed) filed++
  }
  return { checked, filed }
}

/**
 * File a contact as spam — the one bucket Dusty sets itself (Coy, 2026-09-27),
 * shown as Auto with Undo. Only when the model said spam AND spamSignal()
 * finds the evidence in their words AND Coy never wrote or called back, and
 * only onto a contact nobody has sorted and Coy has not un-filed before.
 */
export async function applyAutoSpam(sb: Db, orgId: string, contactId: string, turns: Turn[], phone: string | null, confidence = 0, quote = '')
  : Promise<{ filed: boolean; note: string }> {
  if (turns.some((t) => t.who === 'US')) return { filed: false, note: 'Coy has replied to them' }
  // Evidence in their words, or (since Coy's "let Dusty file everything", 2026-10-03) Dusty sure of it.
  const sig = spamSignal(turns, phone) ?? (confidence >= AUTO_SPAM_CONFIDENCE && quote ? { kind: 'scam' as const, quote } : null)
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
// Learning from Coy's sorting (DECISIONS §2b, migration 036)
// ---------------------------------------------------------------------------

export type Bucket = 'customer' | 'vendor' | 'personal' | 'spam'

export interface Learning {
  /** Where Coy filed someone differently from Dusty's guess, newest first, max 10. */
  corrections: Correction[]
  /** Consecutive agreements per bucket since the last miss (sc_bucket_agreement). */
  streaks: Partial<Record<Bucket, number>>
}

export const NO_LEARNING: Learning = { corrections: [], streaks: {} }

/**
 * Loaded once per org per run. Service role, so the org filter is explicit on
 * every read. A failure is not fatal: the read goes ahead without learning,
 * and without learning nothing is ever filed on a streak.
 */
export async function loadLearning(sb: Db, orgId: string): Promise<Learning> {
  const [{ data: agree }, { data: decided }] = await Promise.all([
    sb.from('sc_bucket_agreement').select('bucket, streak').eq('org_id', orgId),
    sb.from('contacts').select('id, contact_type, contact_subtype, classification_confirmed_at')
      .eq('org_id', orgId).not('classification_confirmed_at', 'is', null).is('merged_into_contact_id', null)
      .order('classification_confirmed_at', { ascending: false }).limit(60),
  ])
  const streaks: Learning['streaks'] = {}
  for (const a of (agree ?? []) as Array<{ bucket: Bucket; streak: number }>) streaks[a.bucket] = a.streak

  const people = (decided ?? []) as Array<{ id: string; contact_type: string; contact_subtype: string | null; classification_confirmed_at: string }>
  if (!people.length) return { corrections: [], streaks }
  const { data: props } = await sb.from('contact_proposals')
    .select('contact_id, classification, evidence_quote, created_at')
    .eq('org_id', orgId).in('contact_id', people.map((c) => c.id))
    .order('created_at', { ascending: false })
  const byContact = new Map<string, Array<{ classification: string | null; evidence_quote: string | null; created_at: string }>>()
  for (const p of (props ?? []) as Array<{ contact_id: string; classification: string | null; evidence_quote: string | null; created_at: string }>) {
    const list = byContact.get(p.contact_id) ?? []
    list.push(p)
    byContact.set(p.contact_id, list)
  }

  const corrections: Correction[] = []
  for (const c of people) {
    // Dusty's guess is the latest suggestion made before Coy decided — the same
    // comparison the agreement view makes.
    const guess = byContact.get(c.id)?.find((p) => p.created_at <= c.classification_confirmed_at)
    const gb = bucketOf(guess?.classification)
    if (!guess || !gb || gb === c.contact_type) continue
    corrections.push({ guess: guess.classification as string, answer: c.contact_type, subtype: c.contact_subtype, quote: guess.evidence_quote ?? '' })
    if (corrections.length >= 10) break
  }
  return { corrections, streaks }
}

/**
 * File a contact in a bucket Dusty has earned: his last AUTO_STREAK guesses of
 * it all matched Coy. Same conditions as spam — nobody sorted them, Coy never
 * un-filed them — and the same marks: auto, with Undo.
 *
 * Only contacts.contact_type is written. customers.relation is not, so an
 * automatically filed vendor or sub is NOT a confirmed one and quo-intake
 * still creates their leads until Coy keeps it. A machine opinion never hides
 * a lead (§2b).
 */
export async function applyAutoBucket(sb: Db, orgId: string, contactId: string, classification: string, reason: string)
  : Promise<{ filed: boolean; note: string }> {
  const bucket = bucketOf(classification)
  if (!bucket || bucket === 'spam') return { filed: false, note: 'not a streak bucket' }
  const { data: rows, error } = await sb.from('contacts')
    .update({
      contact_type: bucket, contact_subtype: classification === 'sub' ? 'subcontractor' : null,
      classification_source: 'machine',
      auto_classified_at: new Date().toISOString(), auto_classified_reason: reason.slice(0, 500),
    })
    .eq('org_id', orgId).eq('id', contactId)
    .is('classification_confirmed_at', null).is('auto_classify_blocked_at', null).is('auto_classified_at', null)
    .select('id')
  if (error) return { filed: false, note: `contacts: ${error.message}` }
  return ((rows ?? []) as unknown[]).length
    ? { filed: true, note: reason }
    : { filed: false, note: 'already sorted, or Coy un-filed it before' }
}

// ---------------------------------------------------------------------------
// One contact, start to finish
// ---------------------------------------------------------------------------

/** What the contact already is: whether a read still has anything to ASK. */
interface ContactState {
  name: string | null; name_source: string | null; contact_type: string | null
  classification_confirmed_at: string | null; auto_classified_at: string | null
  status_summary_at: string | null
}

/**
 * Dusty's status lines on the contact (migration 037): a display cache of his
 * summary, shown as his words. Never a name, never a bucket. Only written when
 * the model gave one, so an old answer is not blanked by a thin read.
 */
async function writeStatus(sb: Db, orgId: string, contactId: string, p: Proposal): Promise<void> {
  if (!p.status_summary && !p.recent_summary) return
  await sb.from('contacts').update({
    status_summary: p.status_summary ?? null, recent_summary: p.recent_summary ?? null,
    job_type_hint: p.job_type ?? null, status_summary_at: new Date().toISOString(),
  }).eq('org_id', orgId).eq('id', contactId)
}

/**
 * Dusty's next steps into the checklist (migration 038, enrich v9): source
 * 'dusty', with the line that prompted each. Never one Coy already has — open,
 * done, or dismissed (a dismissed suggestion stays dismissed). Not for people
 * filed personal or spam: their pages have no checklist.
 */
export async function seedNextSteps(sb: Db, orgId: string, contactId: string, p: Proposal, bucket: string | null): Promise<number> {
  const steps = p.next_steps ?? []
  if (!steps.length || bucket === 'personal' || bucket === 'spam') return 0
  const { data: have } = await sb.from('contact_tasks').select('title_key').eq('org_id', orgId).eq('contact_id', contactId)
  const seen = new Set(((have ?? []) as Array<{ title_key: string }>).map((t) => t.title_key))
  const rows = steps.filter((x) => !seen.has(titleKey(x.title))).map((x) => ({
    org_id: orgId, contact_id: contactId, title: x.title, due_on: x.due_on, source: 'dusty', evidence_quote: x.quote,
  }))
  if (!rows.length) return 0
  const { error } = await sb.from('contact_tasks').insert(rows)
  return error ? 0 : rows.length
}

export async function readContact(sb: Db, orgId: string, contactId: string, ask: Ask, model: string, learning: Learning = NO_LEARNING): Promise<ReadResult> {
  const [turns, numbers, { data: st }, { data: noteRows }] = await Promise.all([
    loadTurns(sb, orgId, contactId), contactNumbers(sb, orgId, contactId),
    sb.from('contacts').select('name, name_source, contact_type, classification_confirmed_at, auto_classified_at, status_summary_at')
      .eq('org_id', orgId).eq('id', contactId).maybeSingle(),
    // Coy's notes (migration 041). Read with the conversation, never counted as it.
    sb.from('contact_notes').select('body, created_at')
      .eq('org_id', orgId).eq('contact_id', contactId).order('created_at', { ascending: false }).limit(20),
  ])
  const state = (st ?? {}) as Partial<ContactState>
  const named = !!state.name?.trim() || state.name_source === 'human'
  const sorted = !!(state.classification_confirmed_at || state.auto_classified_at)
  // Named AND sorted: nothing left to ask. The read is for the status line only.
  const asking = !named || !sorted

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
  // chance to name them — it may predate the self-introduction rule. Not when
  // they have no status line yet: that read is what writes it.
  if (pending && pending.source_fingerprint === fp && state.status_summary_at) {
    if (!named && !pending.proposed_name) await suggestGreeted(sb, orgId, pending.id, turns, numbers)
    const auto = await applySelfIdentified(sb, orgId, contactId, { ...pending, proposed_name: introducedOver(pending.proposed_name, turns, numbers) }, turns, model)
    return auto.claim_id
      ? { outcome: 'named', proposal_id: pending.id, claim_id: auto.claim_id, note: auto.note }
      : { outcome: 'unchanged', proposal_id: pending.id }
  }

  const { text: convo } = renderConversation(shown)
  const notes = renderNotes((noteRows ?? []) as CoyNote[])
  const res = await ask(notes ? `${convo}\n\n${notes}` : convo)
  if (!res.ok) return { outcome: 'model_error', note: res.error }
  const { p } = sanitize(res.proposal, shown)
  if (!p.evidence_message_id) return { outcome: 'failed', note: 'no evidence line' }

  await writeStatus(sb, orgId, contactId, p)
  await seedNextSteps(sb, orgId, contactId, p, sorted ? state.contact_type ?? null : null)
  const musing = p.musing ?? null
  if (!asking) return { outcome: 'summarized', note: p.status_summary ?? undefined, musing }
  // A name is only a question for someone without one.
  if (named) p.proposed_name = null
  // The model's pick loses to a name they introduced themselves with (Coy, 2026-10-02:
  // "Charlie", a misheard hello, over "My name is Jonette, j o h n e t t e, Wilson").
  else p.proposed_name = introducedOver(p.proposed_name, turns, numbers)
  // No name of their own: the one we greet them by, as a suggestion only (Coy, 2026-10-05).
  const greeted = !named && !p.proposed_name ? greetedName(turns, numbers) : null
  if (greeted) p.proposed_name = greeted.name

  if (pending?.id) {
    await sb.from('contact_proposals').update({ status: 'superseded' }).eq('org_id', orgId).eq('id', pending.id)
  }
  const { data: ins, error: insErr } = await sb.from('contact_proposals').insert({
    org_id: orgId, contact_id: contactId,
    proposed_name: p.proposed_name, proposed_company: p.proposed_company, proposed_role: p.proposed_role,
    project_type: p.project_type, scope_summary: p.scope_summary, start_timing: p.start_timing,
    length_ft: p.length_ft, width_ft: p.width_ft, sqft_stated: p.sqft_stated, site_hint: p.site_hint,
    has_media: !!p.has_media, classification: p.classification, confidence: p.confidence,
    evidence_message_id: p.evidence_message_id, evidence_quote: (greeted ? `${p.evidence_quote} … (you greeted them: "${greeted.quote}")` : p.evidence_quote).slice(0, 2000),
    model, prompt_version: PROMPT_VERSION, source_fingerprint: fp, status: 'pending', job_title: p.job_title ?? null,
  }).select('id').single()
  if (insErr || !ins) return { outcome: 'failed', note: `proposal: ${insErr?.message ?? 'not written'}` }

  if (p.classification === 'spam') {
    const spam = await applyAutoSpam(sb, orgId, contactId, turns, numbers[0] ?? null, p.confidence, p.evidence_quote)
    if (spam.filed) return { outcome: 'filed', proposal_id: ins.id as string, note: spam.note, musing }
  }
  const b = bucketOf(p.classification)
  if (b && b !== 'spam' && (p.confidence >= AUTO_FILE_CONFIDENCE || (learning.streaks[b] ?? 0) >= AUTO_STREAK)) {
    const filed = await applyAutoBucket(sb, orgId, contactId, p.classification, p.evidence_quote)
    if (filed.filed) {
      // Filing does not stop the name: someone who introduced themselves is
      // still named, and the run records the filing.
      const named = await applySelfIdentified(sb, orgId, contactId, p, turns, model)
      return { outcome: 'filed', proposal_id: ins.id as string, claim_id: named.claim_id, note: filed.note, musing }
    }
  }
  const auto = await applySelfIdentified(sb, orgId, contactId, p, turns, model)
  return auto.claim_id
    ? { outcome: 'named', proposal_id: ins.id as string, claim_id: auto.claim_id, note: auto.note, musing }
    : { outcome: 'proposed', proposal_id: ins.id as string, note: auto.note, musing }
}
