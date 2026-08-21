/**
 * quo-intake v5 — ScopeCrete.ai
 * File: supabase/functions/quo-intake/index.ts
 * Project: cxiusuewtrvcpqequueh
 *
 * v5 changes:
 * - FIX: findOpenLead returned the PostgREST response wrapper, not the row.
 *   `if (existingLead)` was always true, so createLead was unreachable and
 *   every downstream call sent id=eq.undefined. No lead had ever been created.
 * - Handle call.recording.completed / call.transcript.completed /
 *   call.summary.completed / message.delivered (previously discarded).
 * - Signature verification is now enforced (it was defined but never called,
 *   and would have failed open anyway).
 * - Contacts are keyed on the COUNTERPARTY, not always from_phone, so
 *   outbound events no longer create a contact for our own number.
 * - Every database call now checks `error`. Nothing was checked before,
 *   which is why the lead bug ran silently for the life of the pipeline.
 * - appendNote removed: it wrote to leads.notes, which does not exist.
 *   conversation_log (via appendLog) already carries strictly more detail.
 *
 * v6 changes — all three found by replaying a real signed request against v52:
 * - FIX: the signature timestamp is MILLISECONDS. The seconds-only skew check
 *   rejected every webhook. This is what took intake down on v52.
 * - FIX: call direction is "incoming"/"outgoing", never "inbound". Every
 *   inbound call was filed as outbound, keying the contact to our own number.
 * - Voicemail audio and duration live under data.voicemail, not recording_url.
 *
 * v7 changes:
 * - Calls are mirrored into public.messages (legacy_id = voip_calls.id,
 *   import_source = 'voip_calls') on both the initial call.completed and every
 *   follow-up. messages was empty, which is why
 *   contact_proposals.evidence_message_id could never cite a real row.
 * - FIX: follow-up events keyed quo_events.event_id on the CALL id, colliding
 *   with the call.completed row under the UNIQUE (org_id, event_id) index.
 *   All three follow-ups failed their audit insert on 2026-08-20. They now use
 *   the webhook envelope id.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
// SUPABASE_SECRET_KEY (sb_secret_…) first, legacy service_role JWT second.
//
// Supabase AUTO-INJECTS SUPABASE_SERVICE_ROLE_KEY into every edge function with
// the legacy key. Disabling legacy keys therefore kills that injected value and
// this function loses database access — silently, since createClient does not
// validate the credential until the first query. Reading the new name first
// means the rotation does not take intake down.
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const QUO_ORG_ID = Deno.env.get('QUO_ORG_ID') ?? ''
const QUO_SIGNING_KEY = Deno.env.get('QUO_SIGNING_KEY') ?? ''
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? ''

// Our own Quo/OpenPhone number. Used to tell our side of a conversation
// from the customer's. Hoisted from inside the message handler so the
// call handlers can use it too.
const QUO_PHONE = Deno.env.get('QUO_PHONE') ?? '+12253782458'

// ---------------------------------------------------------------------------
// Error handling helper
// ---------------------------------------------------------------------------

/** Logs a PostgREST error with context. Returns true if there was one. */
function dbFailed(context: string, error: { message: string } | null): boolean {
  if (error) {
    console.error(`[db] ${context}: ${error.message}`)
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j])
  }
  return btoa(binary)
}

/**
 * Verifies OpenPhone's HMAC signature. Fails CLOSED.
 *
 * v4 returned true when the header was absent, had its key guard commented
 * out, and was never called from the handler at all -- the webhook was fully
 * unauthenticated.
 *
 * Every rejection path logs a DISTINCT reason. If enabling this ever takes
 * intake offline, the logs must say why within seconds rather than leaving us
 * guessing between "bad key format", "clock skew" and "genuine mismatch".
 * The whole body is wrapped: atob() throws on a non-base64 key, and this runs
 * outside the handler's try/catch, so an unhandled throw here would 500 every
 * webhook and trigger endless provider retries.
 */
async function verifyQuoSignature(req: Request, body: string): Promise<boolean> {
  try {
    if (!QUO_SIGNING_KEY) {
      console.error('[auth] reject: QUO_SIGNING_KEY is not set')
      return false
    }
    const sigHeader = req.headers.get('openphone-signature')
    if (!sigHeader) {
      console.error('[auth] reject: no openphone-signature header')
      return false
    }
    const parts = sigHeader.split(';')
    if (parts.length !== 4 || parts[0] !== 'hmac' || parts[1] !== '1') {
      console.error(`[auth] reject: unexpected signature header shape (parts=${parts.length}, scheme=${parts[0]}, version=${parts[1]})`)
      return false
    }
    const timestamp = parts[2]
    const providedSig = parts[3]

    // OpenPhone sends the timestamp in MILLISECONDS. Confirmed against a real
    // signed request on 2026-08-20: ts=1787237087956 vs now=1787237088, i.e. a
    // true skew of 0.04s that the old seconds-only comparison read as 1.79
    // BILLION seconds and rejected. Every webhook would have been turned away.
    //
    // The HMAC below still signs the RAW header string. The provider computes
    // its digest over `timestamp + '.' + body` using whatever it sent, so
    // converting units before hashing would break verification. Only the
    // freshness window converts. Seconds are still accepted in case the
    // provider ever changes the unit.
    const tsRaw = Number(timestamp)
    if (!Number.isFinite(tsRaw)) {
      console.error(`[auth] reject: timestamp is not a number (ts=${timestamp})`)
      return false
    }
    const tsSeconds = tsRaw > 1e11 ? tsRaw / 1000 : tsRaw
    const now = Math.floor(Date.now() / 1000)
    const skew = Math.abs(now - tsSeconds)
    if (skew > 300) {
      console.error(`[auth] reject: timestamp skew ${Math.round(skew)}s (ts=${timestamp}, now=${now})`)
      return false
    }

    let keyBytes: Uint8Array
    try {
      keyBytes = base64ToBytes(QUO_SIGNING_KEY)
    } catch {
      console.error('[auth] reject: QUO_SIGNING_KEY is not valid base64 — store the key exactly as the provider shows it')
      return false
    }

    const key = await crypto.subtle.importKey(
      'raw', keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + '.' + body))
    const computedSig = bytesToBase64(new Uint8Array(sig))
    if (providedSig !== computedSig) {
      console.error(`[auth] reject: digest mismatch (provided ${providedSig.length} chars, computed ${computedSig.length}) — key value is wrong, or the signed payload differs`)
      return false
    }
    return true
  } catch (e) {
    console.error('[auth] reject: verification threw:', e instanceof Error ? e.message : String(e))
    return false
  }
}

// ---------------------------------------------------------------------------
// Phone normalization
// ---------------------------------------------------------------------------

function normalizePhone(phone: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d]/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits[0] === '1') return '+' + digits
  if (phone.startsWith('+') && digits.length >= 10) return phone
  return null
}

/**
 * Group texts arrive with `to` as a comma-joined string
 * ("+12252878292,+12253782458"). A contact row needs a single number, so
 * take the first recipient that isn't us. Note this only picks a contact --
 * to_phone still stores the raw value, so group threads are not yet modelled
 * properly. That is tracked separately.
 */
function primaryCounterparty(phone: string | null): string | null {
  if (!phone) return null
  if (!phone.includes(',')) return phone
  const parts = phone.split(',').map(p => normalizePhone(p.trim())).filter(Boolean) as string[]
  return parts.find(p => p !== QUO_PHONE) ?? parts[0] ?? null
}

/**
 * OpenPhone's call object spells direction "incoming"/"outgoing" -- NOT
 * "inbound"/"outbound". The old test `(data.direction) === 'inbound'` therefore
 * never matched, so EVERY inbound call was filed as outbound. Because the
 * counterparty of an outbound call is the `to` number, that is our own business
 * line: the same funnel-every-call-into-one-contact bug the counterparty fix
 * was meant to close, arriving by a second route. Both spellings accepted.
 */
function callDirection(raw: unknown): 'inbound' | 'outbound' {
  return raw === 'incoming' || raw === 'inbound' ? 'inbound' : 'outbound'
}

/** The other party in the conversation -- never our own number. */
function counterpartyPhone(
  direction: 'inbound' | 'outbound',
  fromPhone: string | null,
  toPhone: string | null
): string | null {
  return direction === 'outbound'
    ? primaryCounterparty(toPhone)
    : primaryCounterparty(fromPhone)
}

// ---------------------------------------------------------------------------
// Payload field extraction for the follow-up call events
//
// VERIFIED against OpenPhone docs: call.transcript.completed and
// call.summary.completed key on `callId` (NOT `id`), carry `dialogue[]` and
// `summary[]`/`nextSteps[]` respectively.
// INFERRED (docs were unreachable): the exact recording-URL field on
// call.recording.completed, and the text field on message.delivered. Both are
// read defensively across the plausible spellings, and the raw payload is
// stored on every event so the first real one can be checked and corrected.
// ---------------------------------------------------------------------------

/** Follow-up call events key on `callId`; the call object itself uses `id`. */
function callIdFromPayload(obj: Record<string, unknown>): string | null {
  return (obj.callId as string) ?? (obj.id as string) ?? null
}

function recordingUrlFromPayload(obj: Record<string, unknown>): string | null {
  const media = obj.media
  if (Array.isArray(media)) {
    for (const m of media) {
      if (typeof m === 'string') return m
      if (m && typeof m === 'object') {
        const url = (m as Record<string, unknown>).url
        if (typeof url === 'string') return url
      }
    }
  }
  return (obj.recordingUrl as string) ?? (obj.recording_url as string) ?? (obj.url as string) ?? null
}

/** call.transcript.completed carries `dialogue[]`, each {identifier, content}. */
function transcriptFromPayload(obj: Record<string, unknown>): string | null {
  const dialogue = obj.dialogue
  if (Array.isArray(dialogue) && dialogue.length > 0) {
    const lines = dialogue.map(d => {
      const seg = d as Record<string, unknown>
      const who = (seg.identifier as string) ?? (seg.userId as string) ?? 'unknown'
      const content = (seg.content as string) ?? ''
      return content ? `${who}: ${content}` : ''
    }).filter(Boolean)
    if (lines.length > 0) return lines.join('\n')
  }
  const flat = (obj.transcript as string) ?? (obj.text as string) ?? null
  return flat && flat.trim() ? flat : null
}

/** call.summary.completed carries `summary[]` plus `nextSteps[]`. */
function summaryFromPayload(obj: Record<string, unknown>): string | null {
  const parts: string[] = []
  const summary = obj.summary
  if (Array.isArray(summary)) parts.push(...summary.filter((s): s is string => typeof s === 'string'))
  else if (typeof summary === 'string' && summary.trim()) parts.push(summary)

  const nextSteps = obj.nextSteps
  if (Array.isArray(nextSteps)) {
    const steps = nextSteps.filter((s): s is string => typeof s === 'string')
    if (steps.length > 0) parts.push('Next steps:', ...steps.map(s => `- ${s}`))
  }
  return parts.length > 0 ? parts.join('\n') : null
}

/** Message text. message.received uses `body`; `text` is the API spelling. */
function messageTextFromPayload(obj: Record<string, unknown>): string {
  return (obj.body as string) ?? (obj.text as string) ?? ''
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

function makeSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

// ---------------------------------------------------------------------------
// Org resolution
// ---------------------------------------------------------------------------

async function resolveOrg(supabase: ReturnType<typeof createClient>, quoPhone: string | null) {
  if (quoPhone) {
    const { data } = await supabase.from('orgs').select('id').eq('business_phone', quoPhone).maybeSingle()
    if (data?.id) return { orgId: data.id, matchedBy: 'business_phone' as const }
  }
  return { orgId: QUO_ORG_ID, matchedBy: 'fallback' as const }
}

// ---------------------------------------------------------------------------
// Contact upsert (creates or updates by phone)
// ---------------------------------------------------------------------------

async function upsertContact(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  phone: string
): Promise<string> {
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('org_id', orgId)
    .eq('phone', phone)
    .limit(1)
    .maybeSingle()
  if (data?.id) return data.id
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({ org_id: orgId, phone, sources: ['quo'], total_calls: 0, total_texts: 0, contact_type: 'customer' })
    .select('id')
    .single()
  if (error) throw new Error('Failed to create contact: ' + error.message)
  return newContact.id
}

// ---------------------------------------------------------------------------
// public.messages — the unified comms table
// ---------------------------------------------------------------------------

/**
 * Mirrors a call into public.messages, keyed by legacy_id = voip_calls.id.
 *
 * messages is where comms are moving; voip_calls and sms_threads are the
 * legacy shape. The historical import is already done (1,069 rows as of
 * 2026-08-21, every voip_calls row twinned), so this keeps NEW calls in step
 * with it rather than letting the table drift out of date from today onward.
 *
 * Read-then-write rather than upsert. Migration 012 added a unique index on
 * (import_source, legacy_id), so this could become a real upsert; it is left
 * as a read-then-write because the update path deliberately merges rather than
 * replaces (see below), which ON CONFLICT would not do.
 *
 * Never throws. A messages failure must not cost us the voip_calls row.
 */
async function syncCallToMessages(
  supabase: ReturnType<typeof createClient>,
  row: {
    voipCallId: string; orgId: string; contactId: string | null
    direction: 'inbound' | 'outbound'; fromPhone: string; toPhone: string
    durationSec: number | null; transcript: string | null; recordingUrl: string | null
    quoCallId: string; occurredAt: string | null
  }
): Promise<'inserted' | 'updated' | 'failed'> {
  const patch: Record<string, unknown> = {
    org_id: row.orgId,
    contact_id: row.contactId,
    channel: 'call',
    direction: row.direction,
    from_address: row.fromPhone,
    to_address: row.toPhone,
    provider: 'quo',
    provider_message_id: row.quoCallId,
    duration_seconds: row.durationSec,
    recording_url: row.recordingUrl,
    transcript: row.transcript,
    // 'received' is the only status that satisfies messages_no_composed_call
    // for an outbound call without an approver, and it keeps
    // messages_sent_was_approved happy alongside imported_at.
    status: 'received',
    legacy_id: row.voipCallId,
    import_source: 'voip_calls',
    imported_at: new Date().toISOString(),
  }
  if (row.occurredAt) patch.occurred_at = row.occurredAt

  const { data: existing, error: readErr } = await supabase
    .from('messages').select('id')
    .eq('import_source', 'voip_calls').eq('legacy_id', row.voipCallId)
    .limit(1).maybeSingle()
  if (dbFailed(`messages lookup (call=${row.quoCallId})`, readErr)) return 'failed'

  if (existing?.id) {
    // Only overwrite with something. A later webhook that carries no transcript
    // must not blank a transcript an earlier one delivered.
    const merged: Record<string, unknown> = { ...patch }
    for (const k of ['transcript', 'recording_url', 'duration_seconds']) {
      if (merged[k] === null || merged[k] === undefined) delete merged[k]
    }
    const { error } = await supabase.from('messages').update(merged).eq('id', existing.id)
    return dbFailed(`messages update (call=${row.quoCallId})`, error) ? 'failed' : 'updated'
  }

  const { error } = await supabase.from('messages').insert(patch)
  return dbFailed(`messages insert (call=${row.quoCallId})`, error) ? 'failed' : 'inserted'
}

// ---------------------------------------------------------------------------
// quo_events insert helper
// ---------------------------------------------------------------------------

async function insertQuoEvent(
  supabase: ReturnType<typeof createClient>,
  opts: {
    orgId: string
    contactId: string
    eventType: string
    eventId: string
    direction: 'inbound' | 'outbound'
    fromPhone: string
    toPhone: string
    body: string | null
    mediaUrls: unknown
    rawPayload: unknown
    leadId: string | null
  }
) {
  const { error } = await supabase.from('quo_events').insert({
    org_id: opts.orgId,
    contact_id: opts.contactId,
    event_type: opts.eventType,
    event_id: opts.eventId,
    direction: opts.direction,
    from_phone: opts.fromPhone,
    to_phone: opts.toPhone,
    body: opts.body ? opts.body.substring(0, 2000) : null,
    media_urls: opts.mediaUrls,
    raw_payload: opts.rawPayload,
    business: 'sacco_builders',
  })
  return !dbFailed(`quo_events insert (${opts.eventType}/${opts.eventId})`, error)
}

// ---------------------------------------------------------------------------
// Groq enrichment — extracts contact fields from aggregated event text
// ---------------------------------------------------------------------------

interface EnrichedContact {
  first_name: string | null
  last_name: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  contact_type: 'customer' | 'vendor_subcontractor' | 'vendor_supplier' | 'vendor_equipment' | 'vendor_other' | 'customer'
  scope_of_work: string | null
  scope_confidence: number
  address_confidence: number
  name_confidence: number
}

async function enrichContact(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  phone: string,
  contactId: string
): Promise<void> {
  if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY not set — skipping enrichment')
    return
  }

  // Gather all event text for this phone
  const [smsData, callData] = await Promise.all([
    supabase.from('sms_threads').select('message_body, direction, created_at')
      .eq('contact_id', contactId).order('created_at', { ascending: false }).limit(20),
    supabase.from('voip_calls').select('transcript, direction, duration_seconds, created_at')
      .eq('contact_id', contactId).order('created_at', { ascending: false }).limit(10),
  ])

  const smsTexts = (smsData.data ?? []).map((r: { message_body: string; direction: string }) =>
    `[SMS ${r.direction}]: ${r.message_body}`
  ).join('\n')

  const callTexts = (callData.data ?? []).map((r: { transcript: string; direction: string; duration_seconds: number }) =>
    `[CALL ${r.direction} ${r.duration_seconds}s]: ${r.transcript ?? '(no transcript)'}`
  ).join('\n')

  const combinedText = [callTexts, smsTexts].filter(t => t.length > 10).join('\n\n')

  if (combinedText.length < 20) {
    console.log(`Skipping enrichment for ${phone} — insufficient text`)
    return
  }

  const prompt = `You are a contact intelligence parser for a concrete contractor business (ScopeCrete.ai).
Extract structured contact information from the following conversation logs.

Rules:
- name: Extract first and last name. "this is bob" → first_name="bob". "my name is robert smith" → first_name="robert", last_name="smith". "hey it's mike from abc concrete" → first_name="mike". Leave null if no name found.
- email: Look for email addresses in the text.
- address: Look for street addresses, lot numbers, property descriptions. "at 123 main street" or "job is on 456 oak ave" or "lattice lane off highway 99". Extract the most specific address mentioned.
- city/state/zip: Extract city names, states (TX, CA, etc), zip codes. Be conservative.
- contact_type: "customer" if they're asking for a quote or need work done. "vendor_subcontractor" if they say "we're a sub" or "our company does X". "vendor_supplier" if they say "we supply materials" or "batch plant". "vendor_equipment" if they say "we rent equipment" or "pump truck". Default to "customer" if unclear.
- scope_of_work: Summarize in 1-3 sentences what kind of concrete work they need. Be specific: "driveway pour 30x40ft", "parking lot slab", "foundation for shed 12x16", etc. If vendor, describe what they offer: "concrete pumping services", "aggregate supply", etc.
- Confidence scores (0-100): Rate your confidence for each field based on how explicit the information was.

Return ONLY valid JSON:
{
  "first_name": "...",
  "last_name": "...",
  "email": "...",
  "address": "...",
  "city": "...",
  "state": "...",
  "zip": "...",
  "contact_type": "customer" | "vendor_subcontractor" | "vendor_supplier" | "vendor_equipment" | "vendor_other",
  "scope_of_work": "...",
  "scope_confidence": 0-100,
  "address_confidence": 0-100,
  "name_confidence": 0-100
}

CONVERSATION LOGS:
${combinedText.substring(0, 4000)}`

  let extracted: EnrichedContact | null = null

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 800,
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('Groq API error:', groqRes.status, errText)
      return
    }

    const groqData = await groqRes.json()
    const rawContent = groqData.choices?.[0]?.message?.content ?? ''

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON found in Groq response:', rawContent.substring(0, 200))
      return
    }

    extracted = JSON.parse(jsonMatch[0]) as EnrichedContact
  } catch (e) {
    console.error('Enrichment parse error:', e)
    return
  }

  if (!extracted) return

  // Upsert contact with enriched data
  const updateData: Record<string, unknown> = {
    last_enriched_at: new Date().toISOString(),
    enrichment_source: 'quo_events',
    enrichment_version: 1,
  }

  if (extracted.first_name) updateData.first_name = extracted.first_name
  if (extracted.last_name) updateData.last_name = extracted.last_name
  if (extracted.email) updateData.email = extracted.email
  if (extracted.address) updateData.address = extracted.address
  if (extracted.city) updateData.city = extracted.city
  if (extracted.state) updateData.state = extracted.state
  if (extracted.zip) updateData.zip = extracted.zip
  if (extracted.address_confidence) updateData.address_confidence = extracted.address_confidence
  if (extracted.scope_of_work) {
    updateData.scope_of_work = extracted.scope_of_work
    updateData.scope_confidence = extracted.scope_confidence ?? 0
    updateData.scope_raw = extracted
  }
  if (extracted.contact_type) updateData.contact_type = extracted.contact_type

  // Compose full name from parts
  if (extracted.first_name || extracted.last_name) {
    updateData.name = [extracted.first_name, extracted.last_name].filter(Boolean).join(' ')
  }

  const { error: updateError } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', contactId)

  if (updateError) {
    console.error('Failed to update contact:', updateError.message)
  } else {
    console.log(`Enriched contact ${contactId} (${phone}):`, JSON.stringify(updateData).substring(0, 200))
  }
}

// ---------------------------------------------------------------------------
// Lead helpers
// ---------------------------------------------------------------------------

/**
 * Returns the open lead ROW for a contact, or null.
 *
 * This previously returned the PostgREST response wrapper and callers did
 * `if (existingLead) { leadId = existingLead.id }` -- the wrapper is always
 * truthy, so `.id` was always undefined, createLead was unreachable, and every
 * downstream request went out as id=eq.undefined. Destructuring here keeps the
 * fix in one place so no caller can reintroduce it.
 */
async function findOpenLead(
  supabase: ReturnType<typeof createClient>,
  contactId: string
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase.from('leads').select('id, status')
    .eq('contact_id', contactId)
    .in('status', ['new', 'contacted', 'qualified'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (dbFailed(`findOpenLead(contact=${contactId})`, error)) return null
  return (data as { id: string; status: string } | null) ?? null
}

async function createLead(supabase: ReturnType<typeof createClient>, contactId: string, orgId: string, sourceChannel: string) {
  const { data, error } = await supabase.from('leads')
    .insert({ contact_id: contactId, org_id: orgId, status: 'new', source_channel: sourceChannel })
    .select('id').single()
  if (error) throw new Error('Failed to create lead: ' + error.message)
  return data.id
}

/** Resolves the lead for a contact, creating one if there is no open lead. */
async function resolveLead(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  orgId: string,
  sourceChannel: string
): Promise<{ leadId: string; created: boolean }> {
  const existing = await findOpenLead(supabase, contactId)
  if (existing?.id) return { leadId: existing.id, created: false }
  return { leadId: await createLead(supabase, contactId, orgId, sourceChannel), created: true }
}

async function appendLog(supabase: ReturnType<typeof createClient>, leadId: string, entry: Record<string, unknown>) {
  if (!leadId) {
    console.error('[appendLog] called without a leadId — skipping')
    return
  }
  const { data: lead, error: readErr } = await supabase
    .from('leads').select('conversation_log').eq('id', leadId).maybeSingle()
  if (dbFailed(`appendLog read (lead=${leadId})`, readErr)) return
  const log = Array.isArray(lead?.conversation_log) ? lead.conversation_log : []
  log.push({ ...entry, timestamp: new Date().toISOString() })
  const { error: writeErr } = await supabase
    .from('leads').update({ conversation_log: log }).eq('id', leadId)
  dbFailed(`appendLog write (lead=${leadId})`, writeErr)
}

// appendNote() removed in v5. It read and wrote leads.notes, which does not
// exist on public.leads -- every call produced a 400 on both the SELECT and the
// UPDATE, silently. conversation_log (appendLog) already records the same
// events with more structure, so the column was not worth adding.

// ---------------------------------------------------------------------------
// voip_calls insert
// ---------------------------------------------------------------------------

async function insertVoipCall(supabase: ReturnType<typeof createClient>, row: {
  orgId: string; contactId: string; leadId: string; fromPhone: string; toPhone: string
  direction: 'inbound' | 'outbound'; durationSec: number | null; transcript: string | null
  recordingUrl: string | null; status: string; quoCallId: string
}): Promise<string | null> {
  // Returns the new row id so the call can be mirrored into public.messages
  // with legacy_id pointing back here. Null on failure.
  const { data, error } = await supabase.from('voip_calls').insert({
    org_id: row.orgId, contact_id: row.contactId, lead_id: row.leadId,
    from_phone: row.fromPhone, to_phone: row.toPhone,
    direction: row.direction, duration_seconds: row.durationSec,
    transcript: row.transcript, recording_url: row.recordingUrl,
    status: row.status, quo_call_id: row.quoCallId, provider: 'quo',
  }).select('id').single()
  if (dbFailed(`voip_calls insert (call=${row.quoCallId})`, error)) return null
  return (data as { id: string }).id
}

/**
 * Patches an existing call row from a follow-up event.
 * voip_calls.quo_call_id carries a UNIQUE constraint, so this matches exactly
 * one row. Returns the row's org/contact/direction so the caller can log a
 * quo_event against it, or null when the call has not landed yet.
 */
async function updateCallByQuoId(
  supabase: ReturnType<typeof createClient>,
  quoCallId: string,
  patch: Record<string, unknown>
): Promise<{ id: string; org_id: string; contact_id: string; lead_id: string | null
             direction: 'inbound' | 'outbound'; from_phone: string; to_phone: string } | null> {
  const { data, error } = await supabase
    .from('voip_calls')
    .update(patch)
    .eq('quo_call_id', quoCallId)
    .select('id, org_id, contact_id, lead_id, direction, from_phone, to_phone')
    .maybeSingle()
  if (dbFailed(`voip_calls update (call=${quoCallId})`, error)) return null
  if (!data) {
    console.error(`[match] no voip_calls row for quo_call_id=${quoCallId} — follow-up event arrived before call.completed, or the call was never stored`)
    return null
  }
  return data as never
}

// ---------------------------------------------------------------------------
// sms_threads insert
// ---------------------------------------------------------------------------

async function insertSmsThread(supabase: ReturnType<typeof createClient>, row: {
  orgId: string; contactId: string; leadId: string; fromPhone: string; toPhone: string
  direction: 'inbound' | 'outbound'; body: string; mediaUrls: unknown; quoMessageId: string
}) {
  const { error } = await supabase.from('sms_threads').insert({
    org_id: row.orgId, contact_id: row.contactId, lead_id: row.leadId,
    from_phone: row.fromPhone, to_phone: row.toPhone,
    direction: row.direction, message_body: row.body,
    media_urls: row.mediaUrls, quo_message_id: row.quoMessageId, provider: 'quo',
  })
  return !dbFailed(`sms_threads insert (msg=${row.quoMessageId})`, error)
}

/**
 * Stores an outbound message from message.delivered.
 *
 * Unlike the call follow-ups this is NOT purely an update: outbound messages
 * were never inserted by any handler, so there is usually no row to patch.
 * sms_threads.quo_message_id has no UNIQUE constraint, so this reads first
 * rather than relying on ON CONFLICT. (Adding that constraint would let this
 * become a real upsert -- worth doing, but it is a schema change.)
 */
async function storeOutboundMessage(supabase: ReturnType<typeof createClient>, row: {
  orgId: string; contactId: string; leadId: string; fromPhone: string; toPhone: string
  body: string; mediaUrls: unknown; quoMessageId: string
}): Promise<'inserted' | 'updated' | 'failed'> {
  const { data: existing, error: readErr } = await supabase
    .from('sms_threads').select('id').eq('quo_message_id', row.quoMessageId).limit(1).maybeSingle()
  if (dbFailed(`sms_threads lookup (msg=${row.quoMessageId})`, readErr)) return 'failed'

  if (existing?.id) {
    const { error } = await supabase.from('sms_threads')
      .update({ message_body: row.body, media_urls: row.mediaUrls, lead_id: row.leadId })
      .eq('id', existing.id)
    return dbFailed(`sms_threads update (msg=${row.quoMessageId})`, error) ? 'failed' : 'updated'
  }

  const ok = await insertSmsThread(supabase, { ...row, direction: 'outbound' })
  return ok ? 'inserted' : 'failed'
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, openphone-signature' }
    })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const rawBody = await req.text()

  // Enforce the HMAC signature before doing anything with the payload.
  // v4 defined verifyQuoSignature but never called it.
  if (!(await verifyQuoSignature(req, rawBody))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = makeSupabase()
  let payload: Record<string, unknown>
  try { payload = JSON.parse(rawBody) } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  try {
    const eventType = payload.type as string
    const data = (payload.data as Record<string, unknown>)?.object as Record<string, unknown> ?? {}

    // -------------------- call.completed --------------------
    if (eventType === 'call.completed') {
      const fromRaw = (data.from as string) ?? ''
      const toRaw = (data.to as string) ?? ''
      const fromPhone = normalizePhone(fromRaw)
      if (!fromPhone) return new Response(JSON.stringify({ error: 'Invalid phone' }), { status: 400 })
      const toPhone = normalizePhone(toRaw)
      const quoCallId = (data.id as string) ?? ''
      const direction: 'inbound' | 'outbound' = callDirection(data.direction)

      // Key the contact on the counterparty, not always from_phone. On an
      // outbound call from_phone is OUR number, which previously funnelled all
      // 426 outbound calls into a single contact row for ourselves.
      const contactPhone = counterpartyPhone(direction, fromPhone, toPhone)
      if (!contactPhone) {
        console.error(`[call.completed] no usable counterparty (from=${fromPhone} to=${toPhone})`)
        return new Response(JSON.stringify({ error: 'No counterparty phone' }), { status: 400 })
      }
      const { orgId } = await resolveOrg(supabase, toPhone)
      const contactId = await upsertContact(supabase, orgId, contactPhone)

      const rawStatus = (data.status as string) ?? 'missed'
      const status = rawStatus === 'completed' ? 'completed' : rawStatus === 'voicemail' ? 'voicemail' : 'missed'
      // A missed call that went to voicemail carries its audio at
      // data.voicemail.url and its length at data.voicemail.duration. Neither
      // spelling was read before, so voicemail audio and duration were dropped
      // on every missed call -- and a missed call IS the lead, for this business.
      const voicemail = (data.voicemail as Record<string, unknown> | null) ?? null
      const durationSec = (data.duration_sec as number | null)
        ?? (data.duration as number | null)
        ?? (voicemail?.duration as number | null)
        ?? null
      const transcript = (data.transcript as string | null) ?? (data.transcripts as string | null) ?? null
      const recordingUrl = (data.recording_url as string | null)
        ?? (data.recordingUrl as string | null)
        ?? (voicemail?.url as string | null)
        ?? null

      // Insert quo_event
      await insertQuoEvent(supabase, {
        orgId, contactId, eventType, eventId: quoCallId,
        direction, fromPhone, toPhone: toPhone ?? fromPhone,
        body: transcript, mediaUrls: recordingUrl ? [recordingUrl] : null,
        rawPayload: data, leadId: null,
      })

      // Resolve lead
      const { leadId, created } = await resolveLead(supabase, contactId, orgId, 'phone')
      if (!created) {
        await appendLog(supabase, leadId, { type: 'call', direction, preview: transcript ?? `Call ${status}, ${durationSec}s`, duration_sec: durationSec, recording_url: recordingUrl })
      }

      const voipCallId = await insertVoipCall(supabase, { orgId, contactId, leadId, fromPhone, toPhone: toPhone ?? fromPhone, direction, durationSec, transcript, recordingUrl, status: 'new', quoCallId })

      // Mirror into public.messages. New calls land in the unified table from
      // the moment they arrive, not via a later migration.
      let messageOutcome: string | null = null
      if (voipCallId) {
        messageOutcome = await syncCallToMessages(supabase, {
          voipCallId, orgId, contactId, direction,
          fromPhone, toPhone: toPhone ?? fromPhone,
          durationSec, transcript, recordingUrl, quoCallId,
          occurredAt: (data.createdAt as string) ?? null,
        })
      }

      // Fire async enrichment (non-blocking)
      enrichContact(supabase, orgId, contactPhone, contactId).catch(e => console.error('Enrichment error:', e))

      return new Response(JSON.stringify({ status: 'ok', contact_id: contactId, lead_id: leadId, message: messageOutcome }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // -------------------- message.received --------------------
    if (eventType === 'message.received') {
      const fromRaw = (data.from as string) ?? ''
      const toRaw = (data.to as string) ?? ''
      const fromPhone = normalizePhone(fromRaw)
      if (!fromPhone) return new Response(JSON.stringify({ error: 'Invalid phone' }), { status: 400 })
      const toPhone = normalizePhone(toRaw)
      const direction: 'inbound' | 'outbound' = fromPhone === QUO_PHONE ? 'outbound' : 'inbound'
      const body = messageTextFromPayload(data)
      const mediaUrls = (data.media as unknown[] | null)
      const quoMessageId = (data.id as string) ?? ''

      const contactPhone = counterpartyPhone(direction, fromPhone, toPhone)
      if (!contactPhone) {
        console.error(`[message.received] no usable counterparty (from=${fromPhone} to=${toPhone})`)
        return new Response(JSON.stringify({ error: 'No counterparty phone' }), { status: 400 })
      }
      const { orgId } = await resolveOrg(supabase, toPhone)
      const contactId = await upsertContact(supabase, orgId, contactPhone)

      // Insert quo_event
      await insertQuoEvent(supabase, {
        orgId, contactId, eventType, eventId: quoMessageId,
        direction, fromPhone, toPhone: toPhone ?? fromPhone,
        body, mediaUrls, rawPayload: data, leadId: null,
      })

      // Resolve lead
      const { leadId, created } = await resolveLead(supabase, contactId, orgId, 'sms')
      if (!created) {
        await appendLog(supabase, leadId, { type: 'sms', direction, preview: body.substring(0, 200) })
      }

      await insertSmsThread(supabase, { orgId, contactId, leadId, fromPhone, toPhone: toPhone ?? fromPhone, direction, body, mediaUrls, quoMessageId })

      // Fire async enrichment
      enrichContact(supabase, orgId, contactPhone, contactId).catch(e => console.error('Enrichment error:', e))

      return new Response(JSON.stringify({ status: 'ok', contact_id: contactId, lead_id: leadId }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // -------------------- call follow-ups --------------------
    // recording / transcript / summary arrive as SEPARATE webhooks after
    // call.completed, so these patch the existing voip_calls row rather than
    // inserting. They key on `callId` (the call object itself uses `id`), and
    // voip_calls.quo_call_id is UNIQUE, so the match is exact.
    if (
      eventType === 'call.recording.completed' ||
      eventType === 'call.transcript.completed' ||
      eventType === 'call.summary.completed'
    ) {
      const quoCallId = callIdFromPayload(data)
      if (!quoCallId) {
        console.error(`[${eventType}] no callId in payload:`, JSON.stringify(data).substring(0, 500))
        return new Response(JSON.stringify({ status: 'no_call_id' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      let patch: Record<string, unknown> = {}
      let logEntry: Record<string, unknown> = {}
      let bodyForEvent: string | null = null
      let mediaForEvent: unknown = null

      if (eventType === 'call.recording.completed') {
        const recordingUrl = recordingUrlFromPayload(data)
        if (!recordingUrl) {
          console.error(`[${eventType}] no recording url found:`, JSON.stringify(data).substring(0, 500))
          return new Response(JSON.stringify({ status: 'no_recording_url' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        patch = { recording_url: recordingUrl }
        logEntry = { type: 'call_recording', recording_url: recordingUrl }
        mediaForEvent = [recordingUrl]
      } else if (eventType === 'call.transcript.completed') {
        const transcript = transcriptFromPayload(data)
        if (!transcript) {
          console.error(`[${eventType}] no transcript text found:`, JSON.stringify(data).substring(0, 500))
          return new Response(JSON.stringify({ status: 'no_transcript' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        patch = { transcript }
        logEntry = { type: 'call_transcript', preview: transcript.substring(0, 200) }
        bodyForEvent = transcript
      } else {
        const summary = summaryFromPayload(data)
        if (!summary) {
          console.error(`[${eventType}] no summary text found:`, JSON.stringify(data).substring(0, 500))
          return new Response(JSON.stringify({ status: 'no_summary' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        // Written to BOTH columns so the live webhook and the API backfill
        // cannot diverge. `summary` is the original; `provider_summary` is the
        // name that says where the text came from, which will matter once a
        // ScopeCrete-generated summary exists alongside the provider's.
        // Retire `summary` once the two are confirmed identical.
        patch = { summary, provider_summary: summary, provider_summary_fetched_at: new Date().toISOString() }
        logEntry = { type: 'call_summary', preview: summary.substring(0, 200) }
        bodyForEvent = summary
      }

      const call = await updateCallByQuoId(supabase, quoCallId, patch)
      if (!call) {
        // Raw payload is preserved in the function logs above so nothing is lost.
        return new Response(JSON.stringify({ status: 'unmatched', call_id: quoCallId }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // Mirror the patch into public.messages alongside voip_calls.
      const msgOutcome = await syncCallToMessages(supabase, {
        voipCallId: call.id, orgId: call.org_id, contactId: call.contact_id,
        direction: call.direction, fromPhone: call.from_phone, toPhone: call.to_phone,
        durationSec: null,
        transcript: eventType === 'call.transcript.completed' ? bodyForEvent : null,
        recordingUrl: eventType === 'call.recording.completed'
          ? (patch.recording_url as string ?? null) : null,
        quoCallId, occurredAt: null,
      })

      // event_id must be the ENVELOPE id, not the call id.
      //
      // quo_events carries a UNIQUE index on (org_id, event_id). These
      // follow-ups are three separate webhooks about ONE call, so keying them
      // on the call id made all three collide with the call.completed row
      // already stored under it. Observed live on 2026-08-20 21:58 — all three
      // logged "duplicate key value violates unique constraint
      // idx_quo_events_org_event_id". The voip_calls patches had already
      // succeeded, so no call data was lost, but the audit trail for every
      // follow-up event was silently dropped.
      //
      // The envelope's own `id` (EV…) is unique per webhook delivery, which is
      // exactly what this column wants. call.completed and message.received
      // keep keying on the object id so the existing joins onto
      // voip_calls.quo_call_id / sms_threads.quo_message_id still work; the
      // follow-ups link back through raw_payload->>'callId'.
      const envelopeId = (payload.id as string) ?? `${quoCallId}:${eventType}`
      await insertQuoEvent(supabase, {
        orgId: call.org_id, contactId: call.contact_id, eventType, eventId: envelopeId,
        direction: call.direction, fromPhone: call.from_phone, toPhone: call.to_phone,
        body: bodyForEvent, mediaUrls: mediaForEvent, rawPayload: data, leadId: call.lead_id,
      })

      if (call.lead_id) await appendLog(supabase, call.lead_id, { ...logEntry, direction: call.direction })

      // A transcript is the richest signal this pipeline gets; re-enrich now
      // that it exists (enrichContact reads voip_calls.transcript).
      if (eventType === 'call.transcript.completed') {
        enrichContact(supabase, call.org_id, call.from_phone, call.contact_id)
          .catch(e => console.error('Enrichment error:', e))
      }

      return new Response(JSON.stringify({ status: 'ok', call_id: quoCallId, updated: Object.keys(patch), message: msgOutcome }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // -------------------- message.delivered (our outbound texts) --------------------
    // Unlike the call follow-ups this usually INSERTS: outbound messages were
    // never captured by any handler, so our side of every conversation is
    // currently absent. Reads first in case the row already exists.
    if (eventType === 'message.delivered') {
      const fromRaw = (data.from as string) ?? ''
      const toRaw = (data.to as string) ?? ''
      const fromPhone = normalizePhone(fromRaw)
      const toPhone = normalizePhone(toRaw)
      const quoMessageId = (data.id as string) ?? ''
      const body = messageTextFromPayload(data)
      const mediaUrls = (data.media as unknown[] | null)

      if (!quoMessageId) {
        console.error('[message.delivered] no message id in payload:', JSON.stringify(data).substring(0, 500))
        return new Response(JSON.stringify({ status: 'no_message_id' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // Delivered means we sent it, so the counterparty is the recipient.
      const contactPhone = counterpartyPhone('outbound', fromPhone, toPhone)
      if (!contactPhone) {
        console.error(`[message.delivered] no usable counterparty (from=${fromPhone} to=${toPhone})`)
        return new Response(JSON.stringify({ status: 'no_counterparty' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      const { orgId } = await resolveOrg(supabase, fromPhone)
      const contactId = await upsertContact(supabase, orgId, contactPhone)

      await insertQuoEvent(supabase, {
        orgId, contactId, eventType, eventId: quoMessageId,
        direction: 'outbound', fromPhone: fromPhone ?? QUO_PHONE, toPhone: toPhone ?? contactPhone,
        body, mediaUrls, rawPayload: data, leadId: null,
      })

      const { leadId, created } = await resolveLead(supabase, contactId, orgId, 'sms')
      if (!created) {
        await appendLog(supabase, leadId, { type: 'sms', direction: 'outbound', preview: body.substring(0, 200) })
      }

      const outcome = await storeOutboundMessage(supabase, {
        orgId, contactId, leadId,
        fromPhone: fromPhone ?? QUO_PHONE, toPhone: toPhone ?? contactPhone,
        body, mediaUrls, quoMessageId,
      })

      return new Response(JSON.stringify({ status: 'ok', contact_id: contactId, lead_id: leadId, message: outcome }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ status: 'ignored', type: eventType }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Function error:', message)
    return new Response(JSON.stringify({ error: 'Internal error', detail: message }), { status: 500 })
  }
})
// redeploy trigger
// 2026-06-22T06:13:54+00:00
// 2026-06-22T06:14:47+00:00 - redeploy v2
// 2026-06-22T06:19:43+00:00 - v43 test with VERIFY_JWT=false
// 2026-06-22T14:15:32+00:00 - v44 verify_jwt check
// 2026-06-22T14:19:43+00:00 - v45 - redeploy to lock verify_jwt off
