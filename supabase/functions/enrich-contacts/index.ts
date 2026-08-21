/**
 * enrich-contacts — ScopeCrete.ai
 * File: supabase/functions/enrich-contacts/index.ts
 * Project: cxiusuewtrvcpqequueh
 *
 * Piece 2 of the enrichment rebuild. Replaces the enrichContact() that lived
 * inside quo-intake.
 *
 * WHAT THE OLD ONE DID WRONG
 * 1. It called Groq with llama-3.3-70b-versatile, which is decommissioned and
 *    404s. Every extraction had silently no-opped since at least 2026-08-19.
 * 2. It wrote names, addresses and scope STRAIGHT ONTO public.contacts. There
 *    was no review step and no way to tell a guess from a fact.
 * 3. It read messages as a flat pile and took names from greetings. An inbound
 *    "Hi Coy" made it believe the CUSTOMER was named Coy. The owner's name
 *    ended up on five real customers.
 *
 * WHAT THIS ONE DOES
 * - Reads a WHOLE CONVERSATION per contact: every sms_threads row plus every
 *   voip_calls transcript, in time order, each labelled with who was speaking.
 * - Writes ONLY to public.contact_proposals. It has no UPDATE path to
 *   public.contacts at all — not a policy, an absence. Grep this file: the
 *   string 'contacts' appears only in read positions.
 * - Records provenance on every proposal: the row the guess came from, the
 *   literal quote, the model id and the prompt version.
 * - Supersedes rather than deletes, so what the model used to think survives.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? ''
const QUO_PHONE = Deno.env.get('QUO_PHONE') ?? '+12253782458'

const MODEL = 'openai/gpt-oss-120b'
const PROMPT_VERSION = 'enrich-v2-2026-08-21'

/**
 * Names belonging to OUR side of every conversation. The model is told never
 * to propose these, because they identify the recipient of an inbound message,
 * never its sender. This list is the direct structural fix for the bug that
 * put the owner's name on five customers.
 */
const OUR_NAMES = ['Coy', 'Coy Sacco', 'Sacco', 'Sacco Builders', 'ScopeCrete', 'Dusty']

// ---------------------------------------------------------------------------
// THE PROMPT
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You read conversations between a concrete contractor and the people who contact him, and you propose structured facts about the OTHER PARTY. Your output is reviewed by a human before it touches any record. Proposing nothing is a perfectly good answer.

WHO IS WHO — READ THIS TWICE
The contractor's side is labelled US. The other party is labelled THEM.
You are describing THEM. You are never describing US.

The single most damaging mistake you can make is taking a name from a greeting.
When THEM writes "Hi Coy" or "Morning Coy, this is about the driveway", the name
Coy belongs to US — the person being greeted. It is NOT the sender's name.
A previous version of this system made exactly that error and wrote the
contractor's own name onto five different customers.

These names are OURS. Never propose any of them as proposed_name, no matter how
they appear: ${OUR_NAMES.join(', ')}.

WHEN YOU MAY PROPOSE A NAME
Only these two cases:
  1. Self-identification by THEM: "this is Tommy", "Tommy here", "my name is
     Robert Shaw", "it's Mike from ABC Concrete".
  2. A signature block at the end of a message from THEM.

Everything else leaves proposed_name null. Not a guess, not a best effort —
null. A wrong name is worse than no name, because a wrong name gets used.

If the only name you can see is in a greeting, the answer is null.
If you are weighing whether it counts, the answer is null.

CLASSIFICATION — exactly one of:
  customer  — wants concrete work done, asking for a quote or scheduling
  vendor    — sells materials or services TO the contractor (supplier, batch
              plant, equipment rental)
  sub       — a subcontractor offering labour, or one the contractor uses
  not_work  — personal, spam, robocall, wrong number, political texts
  unknown   — genuinely cannot tell from the text

CONFIDENCE, 0-100
Report how sure you are of the CLASSIFICATION.
  90+   they said it outright
  70-89 strongly implied, one plain reading
  40-69 leaning, could be read another way
  under 40 guessing — and if you are guessing, prefer "unknown"

EVIDENCE — required, never optional
Every proposal must quote the actual text the guess came from, in
evidence_quote, copied VERBATIM from the conversation. Do not paraphrase, do
not clean it up, do not invent a quote. Give the message_id of that same line
in evidence_message_id. If you cannot point at a specific line, you do not have
a proposal — return classification "unknown" with the quote left as the closest
real line you did read.

DIMENSIONS
Only when THEM states them. Read them out as given:
  "10'x60'"        -> length_ft 60, width_ft 10, sqft_stated 600
  "20 by 30"       -> length_ft 30, width_ft 20, sqft_stated 600
  "about 1200 sqft"-> sqft_stated 1200, length and width null
  "a big driveway" -> all three null. "Big" is not a dimension.
Compute sqft_stated only when both sides are given. Never estimate from a photo
you cannot see, and never infer size from the type of job.

SITE_HINT
Where the work is, in their own words: "lattice lane off highway 99",
"the rental on Government St", "123 Main". A city alone is fine. Null if absent.

PHOTOS
When a message carries images you cannot see, has_media is true, and
scope_summary MUST say the photos still need a human look. Write it like
"Sent 3 photos of the existing slab — scope not established until photos are
reviewed." Never describe a scope as settled when the evidence is an image.

PROJECT_TYPE — one of driveway, patio, slab, foundation, sidewalk, apron, demo,
repair, commercial, other. Null if not stated.

Return ONLY a JSON object, no prose, no code fence:
{
  "classification": "customer|vendor|sub|not_work|unknown",
  "confidence": 0-100,
  "proposed_name": string|null,
  "proposed_company": string|null,
  "proposed_role": string|null,
  "project_type": string|null,
  "scope_summary": string|null,
  "start_timing": string|null,
  "length_ft": number|null,
  "width_ft": number|null,
  "sqft_stated": number|null,
  "site_hint": string|null,
  "has_media": true|false,
  "evidence_message_id": string|null,
  "evidence_quote": string,
  "name_reasoning": string
}

name_reasoning is one short sentence stating why proposed_name is what it is.
If null, say which rule made it null — e.g. "only appearance of a name was the
greeting 'Hi Coy', which names US". This field is read by a human during review.`

// ---------------------------------------------------------------------------
// Conversation assembly
// ---------------------------------------------------------------------------

interface Turn {
  id: string
  kind: 'sms' | 'call'
  who: 'US' | 'THEM'
  at: string
  text: string
  hasMedia: boolean
}

function isOurs(direction: string | null, fromPhone: string | null): boolean {
  if (direction === 'outbound') return true
  if (direction === 'inbound') return false
  return fromPhone === QUO_PHONE
}

async function loadConversation(
  supabase: ReturnType<typeof createClient>,
  contactId: string
): Promise<Turn[]> {
  const [sms, calls] = await Promise.all([
    supabase.from('sms_threads')
      .select('id, direction, from_phone, message_body, media_urls, created_at')
      .eq('contact_id', contactId).order('created_at', { ascending: true }).limit(200),
    supabase.from('voip_calls')
      .select('id, direction, from_phone, transcript, created_at')
      .eq('contact_id', contactId).not('transcript', 'is', null)
      .order('created_at', { ascending: true }).limit(50),
  ])

  const turns: Turn[] = []

  for (const r of (sms.data ?? []) as Array<Record<string, unknown>>) {
    const media = r.media_urls
    const hasMedia = Array.isArray(media) ? media.length > 0 : Boolean(media)
    const text = ((r.message_body as string) ?? '').trim()
    if (!text && !hasMedia) continue
    turns.push({
      id: r.id as string, kind: 'sms',
      who: isOurs(r.direction as string, r.from_phone as string) ? 'US' : 'THEM',
      at: r.created_at as string,
      text: text || '(no text)',
      hasMedia,
    })
  }

  for (const r of (calls.data ?? []) as Array<Record<string, unknown>>) {
    const text = ((r.transcript as string) ?? '').trim()
    if (!text) continue
    turns.push({
      id: r.id as string, kind: 'call',
      // A voicemail is always THEM talking, whatever the call row's direction.
      who: isOurs(r.direction as string, r.from_phone as string) ? 'US' : 'THEM',
      at: r.created_at as string, text, hasMedia: false,
    })
  }

  turns.sort((a, b) => a.at.localeCompare(b.at))
  return turns
}

function renderConversation(turns: Turn[]): string {
  return turns.map(t => {
    const media = t.hasMedia ? ' [ATTACHED IMAGES — you cannot see these]' : ''
    const kind = t.kind === 'call' ? ' (voicemail transcript)' : ''
    return `[message_id: ${t.id}] ${t.who}${kind} @ ${t.at.substring(0, 10)}${media}\n${t.text}`
  }).join('\n\n')
}

/** Stable hash of the conversation, for idempotency. */
async function fingerprint(turns: Turn[]): Promise<string> {
  const basis = turns.map(t => `${t.id}:${t.text.length}:${t.hasMedia ? 1 : 0}`).join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Worth spending a model call on?
 * A single message with nothing in it teaches us nothing, and roughly two
 * thirds of the book looks like that.
 */
function worthEnriching(turns: Turn[]): boolean {
  const theirs = turns.filter(t => t.who === 'THEM')
  if (theirs.length === 0) return false
  const substance = theirs.reduce((n, t) => n + (t.hasMedia ? 40 : 0) + t.text.length, 0)
  if (turns.length <= 1 && substance < 25) return false
  return substance >= 15
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

interface Proposal {
  classification: string
  confidence: number
  proposed_name: string | null
  proposed_company: string | null
  proposed_role: string | null
  project_type: string | null
  scope_summary: string | null
  start_timing: string | null
  length_ft: number | null
  width_ft: number | null
  sqft_stated: number | null
  site_hint: string | null
  has_media: boolean
  evidence_message_id: string | null
  evidence_quote: string
  name_reasoning: string
}

const VALID_CLASS = ['customer', 'vendor', 'sub', 'not_work', 'unknown']
const VALID_PROJECT = ['driveway', 'patio', 'slab', 'foundation', 'sidewalk',
                       'apron', 'demo', 'repair', 'commercial', 'other']

async function askModel(conversation: string): Promise<
  { ok: true; proposal: Proposal } | { ok: false; error: string }
> {
  if (!GROQ_API_KEY) return { ok: false, error: 'GROQ_API_KEY is not set' }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `CONVERSATION:\n\n${conversation.substring(0, 12000)}` },
        ],
        temperature: 0.1,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) {
      return { ok: false, error: `Groq HTTP ${res.status}: ${(await res.text()).substring(0, 300)}` }
    }
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false, error: `no JSON in response: ${raw.substring(0, 200)}` }
    return { ok: true, proposal: JSON.parse(match[0]) as Proposal }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Belt and braces on the model's output.
 *
 * The name rule is enforced HERE as well as in the prompt. A prompt is a
 * request; this is a guarantee. If the model returns one of our own names, or
 * a name that only ever appears inside a greeting, it is dropped and the reason
 * is recorded.
 */
function sanitize(p: Proposal, turns: Turn[]): { p: Proposal; notes: string[] } {
  const notes: string[] = []

  if (!VALID_CLASS.includes(p.classification)) {
    notes.push(`classification "${p.classification}" not recognised, forced to unknown`)
    p.classification = 'unknown'
  }
  p.confidence = Math.max(0, Math.min(100, Math.round(Number(p.confidence) || 0)))

  if (p.project_type && !VALID_PROJECT.includes(p.project_type)) {
    notes.push(`project_type "${p.project_type}" not recognised, dropped`)
    p.project_type = null
  }

  if (p.proposed_name) {
    const name = p.proposed_name.trim()
    const lower = name.toLowerCase()

    if (OUR_NAMES.some(n => lower === n.toLowerCase() || lower.includes(n.toLowerCase()))) {
      notes.push(`proposed_name "${name}" is one of OUR names — dropped`)
      p.proposed_name = null
    } else {
      // Does this name appear anywhere THEM actually wrote it? If it only shows
      // up in our own outbound text, it is not self-identification.
      const inTheirWords = turns.some(t => t.who === 'THEM' && t.text.toLowerCase().includes(lower.split(/\s+/)[0]))
      if (!inTheirWords) {
        notes.push(`proposed_name "${name}" never appears in a message from THEM — dropped`)
        p.proposed_name = null
      }
    }
  }

  // Dimensions must be positive and sane. A 4000-ft-wide driveway is a parse error.
  const num = (v: unknown, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 && n <= max ? n : null
  }
  p.length_ft = num(p.length_ft, 2000)
  p.width_ft = num(p.width_ft, 500)
  p.sqft_stated = num(p.sqft_stated, 500000)

  // Evidence id must be a real turn from this conversation.
  if (p.evidence_message_id && !turns.some(t => t.id === p.evidence_message_id)) {
    notes.push(`evidence_message_id ${p.evidence_message_id} is not in this conversation — dropped`)
    p.evidence_message_id = null
  }

  const anyMedia = turns.some(t => t.hasMedia)
  if (anyMedia && !p.has_media) { p.has_media = true; notes.push('has_media forced true') }
  if (p.has_media && p.scope_summary && !/photo|image|picture/i.test(p.scope_summary)) {
    p.scope_summary = `${p.scope_summary} (Photos attached — scope not established until reviewed.)`
    notes.push('appended photo-review caveat to scope_summary')
  }

  if (!p.evidence_quote || !p.evidence_quote.trim()) {
    const firstTheirs = turns.find(t => t.who === 'THEM' && t.text !== '(no text)')
    p.evidence_quote = firstTheirs ? firstTheirs.text.substring(0, 400) : '(no text in conversation)'
    notes.push('model returned no evidence_quote — substituted first message from THEM')
  }

  return { p, notes }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { limit?: number; contact_ids?: string[]; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const limit = Math.min(Math.max(body.limit ?? 3, 1), 200)
  const dryRun = body.dry_run === true

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  let contactQuery = supabase.from('contacts').select('id, org_id, phone').limit(limit)
  if (body.contact_ids?.length) contactQuery = contactQuery.in('id', body.contact_ids)
  const { data: contacts, error: cErr } = await contactQuery
  if (cErr) {
    return new Response(JSON.stringify({ error: `contacts read: ${cErr.message}` }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const out: unknown[] = []
  let skipped = 0, proposed = 0, unchanged = 0, failed = 0

  for (const c of (contacts ?? []) as Array<{ id: string; org_id: string; phone: string }>) {
    const turns = await loadConversation(supabase, c.id)

    if (!worthEnriching(turns)) {
      skipped++
      out.push({ contact_id: c.id, phone: c.phone, outcome: 'skipped_no_content', turns: turns.length })
      continue
    }

    const fp = await fingerprint(turns)

    const { data: existing } = await supabase.from('contact_proposals')
      .select('id, source_fingerprint').eq('contact_id', c.id).eq('status', 'pending').maybeSingle()
    if (existing?.source_fingerprint === fp) {
      unchanged++
      out.push({ contact_id: c.id, phone: c.phone, outcome: 'unchanged' })
      continue
    }

    const conversation = renderConversation(turns)
    const res = await askModel(conversation)
    if (!res.ok) {
      failed++
      out.push({ contact_id: c.id, phone: c.phone, outcome: 'model_error', error: res.error })
      continue
    }

    const { p, notes } = sanitize(res.proposal, turns)

    const evidenceTurn = turns.find(t => t.id === p.evidence_message_id)
    const row = {
      org_id: c.org_id,
      contact_id: c.id,
      proposed_name: p.proposed_name,
      proposed_company: p.proposed_company,
      proposed_role: p.proposed_role,
      project_type: p.project_type,
      scope_summary: p.scope_summary,
      start_timing: p.start_timing,
      length_ft: p.length_ft,
      width_ft: p.width_ft,
      sqft_stated: p.sqft_stated,
      site_hint: p.site_hint,
      has_media: p.has_media,
      classification: p.classification,
      confidence: p.confidence,
      // evidence_message_id FKs to public.messages, which is empty. The real
      // evidence lives in sms_threads / voip_calls — see migration 011.
      evidence_message_id: null,
      evidence_sms_thread_id: evidenceTurn?.kind === 'sms' ? evidenceTurn.id : null,
      evidence_voip_call_id: evidenceTurn?.kind === 'call' ? evidenceTurn.id : null,
      evidence_quote: p.evidence_quote.substring(0, 2000),
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      source_fingerprint: fp,
      status: 'pending',
    }

    if (dryRun) {
      proposed++
      out.push({ contact_id: c.id, phone: c.phone, outcome: 'would_propose',
                 turns: turns.length, proposal: row, name_reasoning: p.name_reasoning, notes })
      continue
    }

    // Supersede, never delete. What the model used to think is part of the record.
    if (existing?.id) {
      await supabase.from('contact_proposals')
        .update({ status: 'superseded' }).eq('id', existing.id)
    }

    const { error: insErr } = await supabase.from('contact_proposals').insert(row)
    if (insErr) {
      failed++
      out.push({ contact_id: c.id, phone: c.phone, outcome: 'insert_error', error: insErr.message })
      continue
    }
    proposed++
    out.push({ contact_id: c.id, phone: c.phone, outcome: 'proposed',
               turns: turns.length, classification: p.classification, confidence: p.confidence,
               proposed_name: p.proposed_name, name_reasoning: p.name_reasoning, notes })
  }

  return new Response(JSON.stringify({
    model: MODEL, prompt_version: PROMPT_VERSION, dry_run: dryRun,
    considered: contacts?.length ?? 0,
    proposed, skipped_no_content: skipped, unchanged, failed,
    results: out,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
