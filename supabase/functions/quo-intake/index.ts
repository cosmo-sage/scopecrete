/**
 * quo-intake v4 — ScopeCrete.ai
 * File: supabase/functions/quo-intake/index.ts
 * Project: cxiusuewtrvcpqequueh
 *
 * Changes from v3 (quо-intake-enriched.ts):
 * - Stores ALL raw events in quo_events first (phone, body, direction, media_urls, raw_payload)
 * - Links contact_id to quo_events rows
 * - Async Groq enrichment: extracts first_name, last_name, email, address, city, state, zip,
 *   contact_type, scope_of_work from aggregated event text per phone
 * - Upserts contacts with enriched fields
 * - Non-blocking: enrichment fires before response but doesn't delay webhook ack
 * - Uses GROQ_API_KEY env var for enrichment
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const QUO_ORG_ID = Deno.env.get('QUO_ORG_ID') ?? ''
const QUO_SIGNING_KEY = Deno.env.get('QUO_SIGNING_KEY') ?? ''
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? ''

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

async function verifyQuoSignature(req: Request, body: string): Promise<boolean> {
  // if (!QUO_SIGNING_KEY) return true
  const sigHeader = req.headers.get('openphone-signature')
  if (!sigHeader) return true
  const parts = sigHeader.split(';')
  if (parts.length !== 4 || parts[0] !== 'hmac' || parts[1] !== '1') return false
  const timestamp = parts[2]
  const providedSig = parts[3]
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp)) > 300) return false
  const signedData = timestamp + '.' + body
  const key = await crypto.subtle.importKey(
    'raw', base64ToBytes(QUO_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedData))
  const computedSig = bytesToBase64(new Uint8Array(sig))
  return providedSig === computedSig
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
  if (error) console.error('quo_events insert error:', error.message)
  return !error
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

async function findOpenLead(supabase: ReturnType<typeof createClient>, contactId: string) {
  return supabase.from('leads').select('id, status, conversation_log')
    .eq('contact_id', contactId)
    .in('status', ['new', 'contacted', 'qualified'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
}

async function createLead(supabase: ReturnType<typeof createClient>, contactId: string, orgId: string, sourceChannel: string) {
  const { data, error } = await supabase.from('leads')
    .insert({ contact_id: contactId, org_id: orgId, status: 'new', source_channel: sourceChannel })
    .select('id').single()
  if (error) throw new Error('Failed to create lead: ' + error.message)
  return data.id
}

async function appendLog(supabase: ReturnType<typeof createClient>, leadId: string, entry: Record<string, unknown>) {
  const { data: lead } = await supabase.from('leads').select('conversation_log').eq('id', leadId).single()
  const log = lead?.conversation_log ?? []
  log.push({ ...entry, timestamp: new Date().toISOString() })
  await supabase.from('leads').update({ conversation_log: log }).eq('id', leadId)
}

async function appendNote(supabase: ReturnType<typeof createClient>, leadId: string, note: string) {
  const { data: lead } = await supabase.from('leads').select('notes').eq('id', leadId).single()
  const notes = lead?.notes ?? []
  notes.push(note)
  await supabase.from('leads').update({ notes }).eq('id', leadId)
}

// ---------------------------------------------------------------------------
// voip_calls insert
// ---------------------------------------------------------------------------

async function insertVoipCall(supabase: ReturnType<typeof createClient>, row: {
  orgId: string; contactId: string; leadId: string; fromPhone: string; toPhone: string
  direction: 'inbound' | 'outbound'; durationSec: number | null; transcript: string | null
  recordingUrl: string | null; status: string; quoCallId: string
}) {
  const { error } = await supabase.from('voip_calls').insert({
    org_id: row.orgId, contact_id: row.contactId, lead_id: row.leadId,
    from_phone: row.fromPhone, to_phone: row.toPhone,
    direction: row.direction, duration_seconds: row.durationSec,
    transcript: row.transcript, recording_url: row.recordingUrl,
    status: row.status, quo_call_id: row.quoCallId, provider: 'quo',
  })
  if (error) console.error('voip_calls insert error:', error.message)
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
  if (error) console.error('sms_threads insert error:', error.message)
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
      const { orgId } = await resolveOrg(supabase, toPhone)
      const contactId = await upsertContact(supabase, orgId, fromPhone)

      const quoCallId = (data.id as string) ?? ''
      const direction: 'inbound' | 'outbound' = (data.direction as string) === 'inbound' ? 'inbound' : 'outbound'
      const rawStatus = (data.status as string) ?? 'missed'
      const status = rawStatus === 'completed' ? 'completed' : rawStatus === 'voicemail' ? 'voicemail' : 'missed'
      const durationSec = (data.duration_sec as number | null) ?? (data.duration as number | null) ?? null
      const transcript = (data.transcript as string | null) ?? (data.transcripts as string | null) ?? null
      const recordingUrl = (data.recording_url as string | null) ?? (data.recordingUrl as string | null) ?? null

      // Insert quo_event
      await insertQuoEvent(supabase, {
        orgId, contactId, eventType, eventId: quoCallId,
        direction, fromPhone, toPhone: toPhone ?? fromPhone,
        body: transcript, mediaUrls: recordingUrl ? [recordingUrl] : null,
        rawPayload: data, leadId: null,
      })

      // Resolve lead
      let leadId: string
      const existingLead = await findOpenLead(supabase, contactId)
      if (existingLead) {
        leadId = existingLead.id
        await appendLog(supabase, leadId, { type: 'call', direction, preview: transcript ?? `Call ${status}, ${durationSec}s`, duration_sec: durationSec, recording_url: recordingUrl })
        await appendNote(supabase, leadId, `[${new Date().toISOString()}] Call: ${status}, ${durationSec}s`)
      } else {
        leadId = await createLead(supabase, contactId, orgId, 'phone')
      }

      await insertVoipCall(supabase, { orgId, contactId, leadId, fromPhone, toPhone: toPhone ?? fromPhone, direction, durationSec, transcript, recordingUrl, status: 'new', quoCallId })

      // Fire async enrichment (non-blocking)
      enrichContact(supabase, orgId, fromPhone, contactId).catch(e => console.error('Enrichment error:', e))

      return new Response(JSON.stringify({ status: 'ok', contact_id: contactId, lead_id: leadId }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // -------------------- message.received --------------------
    if (eventType === 'message.received') {
      const fromRaw = (data.from as string) ?? ''
      const toRaw = (data.to as string) ?? ''
      const fromPhone = normalizePhone(fromRaw)
      if (!fromPhone) return new Response(JSON.stringify({ error: 'Invalid phone' }), { status: 400 })
      const toPhone = normalizePhone(toRaw)
      const QUO_PHONE = '+12253782458'
      const direction: 'inbound' | 'outbound' = fromPhone === QUO_PHONE ? 'outbound' : 'inbound'
      const body = (data.body as string) ?? ''
      const mediaUrls = (data.media as unknown[] | null)
      const quoMessageId = (data.id as string) ?? ''

      const { orgId } = await resolveOrg(supabase, toPhone)
      const contactId = await upsertContact(supabase, orgId, fromPhone)

      // Insert quo_event
      await insertQuoEvent(supabase, {
        orgId, contactId, eventType, eventId: quoMessageId,
        direction, fromPhone, toPhone: toPhone ?? fromPhone,
        body, mediaUrls, rawPayload: data, leadId: null,
      })

      // Resolve lead
      let leadId: string
      const existingLead = await findOpenLead(supabase, contactId)
      if (existingLead) {
        leadId = existingLead.id
        await appendLog(supabase, leadId, { type: 'sms', direction, preview: body.substring(0, 200) })
        await appendNote(supabase, leadId, `[${new Date().toISOString()}] SMS: ${body.substring(0, 100)}`)
      } else {
        leadId = await createLead(supabase, contactId, orgId, 'sms')
      }

      await insertSmsThread(supabase, { orgId, contactId, leadId, fromPhone, toPhone: toPhone ?? fromPhone, direction, body, mediaUrls, quoMessageId })

      // Fire async enrichment
      enrichContact(supabase, orgId, fromPhone, contactId).catch(e => console.error('Enrichment error:', e))

      return new Response(JSON.stringify({ status: 'ok', contact_id: contactId, lead_id: leadId }), { status: 200, headers: { 'Content-Type': 'application/json' } })
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
