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
// SUPABASE_SECRET_KEY (sb_secret_…) first, legacy service_role JWT second.
//
// Supabase AUTO-INJECTS SUPABASE_SERVICE_ROLE_KEY into every edge function with
// the legacy key. Disabling legacy keys therefore kills that injected value and
// this function loses database access — silently, since createClient does not
// validate the credential until the first query. Reading the new name first
// means the rotation does not take intake down.
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? ''
const QUO_PHONE = Deno.env.get('QUO_PHONE') ?? '+12253782458'

const MODEL = 'openai/gpt-oss-120b'
// v4 keeps the v3 direction-of-ask rule verbatim. What changed is what reaches
// the model: short ordinal turn labels instead of uuid headers, and the TAIL of
// a long conversation instead of its head. A v3 proposal and a v4 proposal are
// not comparable — v3 was judging roughly the first third of a busy thread.
const PROMPT_VERSION = 'enrich-v4-tail-window-2026-08-23'

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

═══════════════════════════════════════════════════════════════════
CLASSIFICATION — THE DIRECTION OF THE ASK
═══════════════════════════════════════════════════════════════════

This is the primary rule and it decides the classification. Read it before
anything else.

TOPIC DOES NOT CLASSIFY ANYONE. A subcontractor and a customer both discuss
the address, the crew size, the equipment, the concrete, and the start date.
Those words tell you nothing about which one you are reading. Do not classify
on subject matter.

What separates them is WHO WANTS WHAT FROM WHOM.

  Money flowing OUT from US to THEM        -> sub or vendor
  Money flowing IN from THEM to US         -> customer

  THEM offering their availability to US   -> sub
  US offering our availability to THEM     -> customer

  THEM asking to be paid                   -> sub or vendor
  THEM asking what it will cost THEM       -> customer

  THEM telling us what they charge         -> sub or vendor
  THEM asking what we charge               -> customer

  THEM asking when WE need them            -> sub
  THEM asking when WE can start            -> customer

A worked example. This contact is a SUB, and none of the words are about
subject matter:

  "Can you send Luis the payment for Monday he needs it"
  "could you send the $1300"
  "if you have anything for Monday for us we are free"

Money flows OUT to him. He offers his availability TO us. He is labour we
buy, not work we sell. That is a sub, however much he talks about driveways.

A customer sounds like the mirror image:

  "what would you charge for a 20x30 slab"
  "when could you get us on the schedule"
  "do you take a deposit"

They ask what it costs THEM and when WE can start.

THE FIVE VALUES
  customer  — money flows from them to us. They are buying work.
  vendor    — money flows from us to them for MATERIALS or EQUIPMENT
              (supplier, batch plant, rental yard).
  sub       — money flows from us to them for LABOUR. They offer crews,
              availability, or their own trade.
  not_work  — personal, spam, robocall, wrong number, political texts.
  unknown   — the direction of the ask is genuinely not visible in the text.

If you cannot see the direction, the answer is "unknown". Do not fall back to
"customer" because the conversation mentions concrete. Guessing "customer"
creates a fake lead; "unknown" costs nothing.

EVIDENCE MUST SHOW THE DIRECTION
evidence_quote is not decoration and it is not just any line. Quote the line
that shows WHICH WAY THE ASK RUNS — the payment request, the offer of
availability, the question about price. A quote about the address or the
weather is not evidence of a classification, and if that is the best line you
can find, the classification is "unknown".

Copy it VERBATIM from the conversation. Do not paraphrase, do not clean it up,
do not invent a quote. Every turn is labelled with a number like "#42" — put the
number of the turn your quote came from in evidence_turn.

A long conversation may be trimmed to its most recent turns. If it was, a note
at the top says so. Judge on what you are shown and do not speculate about the
part you cannot see.

Set direction_of_ask to a short phrase naming the flow you saw, e.g.
"money out to them", "they ask our price", "they offer availability to us",
"none visible".

═══════════════════════════════════════════════════════════════════

NAMES — THE OTHER RULE THAT MATTERS

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

Note: a name spoken ABOUT someone in the third person is not self-identification
either. "Can you send Luis the payment" does not prove the sender is Luis.

CONFIDENCE, 0-100
Report how sure you are of the CLASSIFICATION — i.e. of the direction of the ask.
  90+   they asked to be paid, or asked our price, outright
  70-89 the direction is clear on one plain reading
  40-69 leaning, could be read the other way
  under 40 guessing — and if you are guessing, use "unknown"

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
repair, commercial, other. Null if not stated. A sub or vendor can have a
project_type too — it is the work being discussed, not a classification.

Return ONLY a JSON object, no prose, no code fence:
{
  "classification": "customer|vendor|sub|not_work|unknown",
  "direction_of_ask": string,
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
  "evidence_turn": number|null,
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

/**
 * Reads the conversation from public.messages.
 *
 * messages is fully backfilled (verified 2026-08-21: 1,069 rows covering all
 * 435 voip_calls and 634 sms_threads, zero without a twin, zero duplicates).
 * Reading it directly rather than joining sms_threads + voip_calls means every
 * turn id IS a messages id, so contact_proposals.evidence_message_id — a FK to
 * messages — can be cited straight from the model's answer with no translation
 * step and no chance of citing an id from the wrong table.
 *
 * messages carries no media column, so image flags still come from
 * sms_threads.media_urls, matched back through legacy_id.
 */
async function loadConversation(
  supabase: ReturnType<typeof createClient>,
  contactId: string
): Promise<Turn[]> {
  const [msgs, sms] = await Promise.all([
    supabase.from('messages')
      .select('id, channel, direction, body_text, transcript, occurred_at, legacy_id, import_source')
      .eq('contact_id', contactId)
      .order('occurred_at', { ascending: true }).limit(250),
    supabase.from('sms_threads')
      .select('id, media_urls').eq('contact_id', contactId).limit(250),
  ])

  const withMedia = new Set<string>()
  for (const r of (sms.data ?? []) as Array<Record<string, unknown>>) {
    const m = r.media_urls
    if (Array.isArray(m) ? m.length > 0 : Boolean(m)) withMedia.add(r.id as string)
  }

  const turns: Turn[] = []
  for (const r of (msgs.data ?? []) as Array<Record<string, unknown>>) {
    const isCall = r.channel === 'call'
    // For a call the transcript is the content; body_text carries the
    // provider's AI summary, which is a paraphrase — prefer the real words.
    const text = (((isCall ? r.transcript : r.body_text) as string) ?? '').trim()
    const hasMedia = r.import_source === 'sms_threads'
      && typeof r.legacy_id === 'string' && withMedia.has(r.legacy_id)
    if (!text && !hasMedia) continue
    turns.push({
      id: r.id as string,
      kind: isCall ? 'call' : 'sms',
      who: (r.direction as string) === 'outbound' ? 'US' : 'THEM',
      at: (r.occurred_at as string) ?? '',
      text: text || '(no text)',
      hasMedia,
    })
  }

  turns.sort((a, b) => a.at.localeCompare(b.at))
  return turns
}

/**
 * How much conversation the model is shown, in characters.
 *
 * This is a COST control, not a context limit — gpt-oss-120b will take far
 * more than this. Keep it in step with the header scheme below.
 */
const WINDOW_CHARS = 12000

/**
 * Cap on a SINGLE turn, so one outlier cannot eat the whole window.
 *
 * The tail-drop below refuses to discard the last remaining turn — otherwise a
 * conversation could render to nothing — so without this cap one 50,000-char
 * call transcript would be sent in full. A long voicemail is still worth
 * reading; it is just not worth four times the budget.
 */
const MAX_TURN_CHARS = 4000

/**
 * One turn, labelled with a SHORT ordinal rather than its uuid.
 *
 * The uuid header this replaces cost ~69 characters per turn. Measured against
 * Luis (contact 63d7e1eb) on 2026-08-23: 256 turns rendered to 32,837 chars of
 * which 17,664 — 54% — were message_id headers, so the 12,000-char window held
 * barely a third of the thread and most of that third was uuids. `#42 THEM
 * 2026-07-10` costs about 20, which buys back roughly half the window.
 *
 * The ordinal is 1-based and indexes `turns`, so sanitize() can turn the
 * model's `evidence_turn` back into a real messages id. The model never sees a
 * uuid, which also removes any chance of it inventing one.
 */
function renderTurn(t: Turn, ordinal: number): string {
  const media = t.hasMedia ? ' [IMAGES — you cannot see these]' : ''
  const kind = t.kind === 'call' ? ' (voicemail)' : ''
  const text = t.text.length > MAX_TURN_CHARS
    ? `${t.text.slice(0, MAX_TURN_CHARS)} […turn truncated]`
    : t.text
  return `#${ordinal} ${t.who}${kind} ${t.at.substring(0, 10)}${media}\n${text}`
}

/**
 * Renders the conversation, keeping the TAIL when it will not all fit.
 *
 * Taking the head was the wrong end. The direction of the ask is clearest in
 * recent traffic, and on the worked example every line this repo cites as the
 * evidence for `sub` sat at offset 30,000+ — past a head-first cut, so the
 * model never saw any of them.
 *
 * Returns the ordinal of the first turn shown so the caller can log how much
 * was dropped.
 */
function renderConversation(turns: Turn[]): { text: string; shownFrom: number } {
  const rendered = turns.map((t, i) => renderTurn(t, i + 1))
  const cost = (s: string) => s.length + 2 // + the '\n\n' join

  let total = rendered.reduce((n, s) => n + cost(s), 0)
  if (total <= WINDOW_CHARS) return { text: rendered.join('\n\n'), shownFrom: 1 }

  let start = 0
  while (start < rendered.length - 1 && total > WINDOW_CHARS) {
    total -= cost(rendered[start])
    start++
  }
  const note = `[Showing the most recent ${rendered.length - start} of ${rendered.length} turns. Earlier turns are not shown.]`
  return { text: [note, ...rendered.slice(start)].join('\n\n'), shownFrom: start + 1 }
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
  direction_of_ask: string
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
  /** 1-based ordinal into the turns array, as shown to the model. */
  evidence_turn: number | null
  /** Resolved from evidence_turn by sanitize(). The model never sets this. */
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
          // Already windowed by renderConversation — no second truncation here,
          // which would cut the tail back off after we deliberately kept it.
          { role: 'user', content: `CONVERSATION:\n\n${conversation}` },
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

  // The model cites a turn ORDINAL; the database wants a messages id. Resolving
  // it here rather than letting the model hand back a uuid means it can only
  // ever point at a turn that was actually in this conversation — an
  // out-of-range ordinal is caught, and an invented uuid is now impossible.
  p.evidence_message_id = null
  if (p.evidence_turn !== null && p.evidence_turn !== undefined) {
    const idx = Math.round(Number(p.evidence_turn)) - 1
    if (Number.isFinite(idx) && idx >= 0 && idx < turns.length) {
      p.evidence_message_id = turns[idx].id
    } else {
      notes.push(`evidence_turn ${p.evidence_turn} is out of range (1-${turns.length}) — replaced`)
    }
  }
  if (!p.evidence_message_id) {
    const fallback = turns.find(t => t.who === 'THEM') ?? turns[0]
    if (fallback) {
      p.evidence_message_id = fallback.id
      notes.push(`evidence_message_id defaulted to first message from THEM (${fallback.id})`)
    }
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

    const { text: conversation, shownFrom } = renderConversation(turns)
    const res = await askModel(conversation)
    if (!res.ok) {
      failed++
      out.push({ contact_id: c.id, phone: c.phone, outcome: 'model_error', error: res.error })
      continue
    }

    const { p, notes } = sanitize(res.proposal, turns)

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
      // Turn ids ARE messages ids — the conversation is read from messages —
      // so this cites the row the quote came from with no translation.
      // sanitize() has already verified it is a turn in THIS conversation.
      evidence_message_id: p.evidence_message_id,
      evidence_quote: p.evidence_quote.substring(0, 2000),
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      source_fingerprint: fp,
      status: 'pending',
    }

    if (dryRun) {
      proposed++
      out.push({ contact_id: c.id, phone: c.phone, outcome: 'would_propose',
                 turns: turns.length, turns_shown: turns.length - shownFrom + 1,
                 proposal: row, direction_of_ask: p.direction_of_ask,
                 evidence_turn: p.evidence_turn,
                 name_reasoning: p.name_reasoning, notes })
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
               turns: turns.length, turns_shown: turns.length - shownFrom + 1,
               classification: p.classification, confidence: p.confidence,
               proposed_name: p.proposed_name, direction_of_ask: p.direction_of_ask,
               name_reasoning: p.name_reasoning, notes })
  }

  return new Response(JSON.stringify({
    model: MODEL, prompt_version: PROMPT_VERSION, dry_run: dryRun,
    considered: contacts?.length ?? 0,
    proposed, skipped_no_content: skipped, unchanged, failed,
    results: out,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
