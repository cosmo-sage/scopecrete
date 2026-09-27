/**
 * The rules of the background enricher (index.ts). Pure: no I/O, no imports,
 * so the same file runs in the Deno worker and under `node --test`.
 *
 * The prompt, the name rules and sanitize() are the v4 enricher's verbatim;
 * v5 moved the model to Hermes and added findSelfIdentification() — the one
 * case a name is applied without asking (DECISIONS §2b). The checks here are
 * the guarantee; the prompt is only a request.
 */

export const PROMPT_VERSION = 'enrich-v6-buckets-2026-09-27'

export const OUR_NAMES = ['Coy', 'Coy Sacco', 'Sacco', 'Sacco Builders', 'ScopeCrete', 'Dusty']

// ---------------------------------------------------------------------------
// THE PROMPT
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You read conversations between a concrete contractor and the people who contact him, and you propose structured facts about the OTHER PARTY. Your output is reviewed by a human before it touches any record. Proposing nothing is a perfectly good answer.

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

THE SIX VALUES
  customer  — money flows from them to us. They are buying work.
  vendor    — money flows from us to them for MATERIALS, EQUIPMENT or
              SERVICES (supplier, batch plant, rental yard, lead-generation
              service, someone selling us blades or software).
  sub       — money flows from us to them for LABOUR. They offer crews,
              availability, or their own trade — including someone asking US
              for work as a laborer or independent contractor.
  personal  — family, friends, personal errands. Not the business at all.
  spam      — robocalls, verification codes, marketing blasts, scams, wrong
              numbers, political texts. Nobody is asking for or offering work.
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
  "classification": "customer|vendor|sub|personal|spam|unknown",
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
// Conversation
// ---------------------------------------------------------------------------

export interface Turn {
  id: string
  kind: 'sms' | 'call'
  who: 'US' | 'THEM'
  at: string
  text: string
  hasMedia: boolean
}

export const WINDOW_CHARS = 12000

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
export function renderTurn(t: Turn, ordinal: number): string {
  const media = t.hasMedia ? ' [IMAGES — you cannot see these]' : ''
  // A call is a voicemail, a transcript (lines labelled US:/THEM:) or a
  // summary; "(voicemail)" was the v4 label and was wrong for the other two.
  const kind = t.kind === 'call' ? ' (call)' : ''
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
export function renderConversation(turns: Turn[]): { text: string; shownFrom: number } {
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

/**
 * Worth spending a model call on?
 * A single message with nothing in it teaches us nothing, and roughly two
 * thirds of the book looks like that.
 */
export function worthEnriching(turns: Turn[]): boolean {
  const theirs = turns.filter(t => theirText(t) || (t.who === 'THEM' && t.hasMedia))
  if (theirs.length === 0) return false
  const substance = theirs.reduce((n, t) => n + (t.hasMedia ? 40 : 0) + theirText(t).length, 0)
  if (turns.length <= 1 && substance < 25) return false
  return substance >= 15
}

/**
 * What THEY said in a turn. A text is theirs or ours whole. A call is both:
 * once relabelled (relabelTranscript) its THEM: lines are theirs whichever side
 * dialled — Coy placing the call does not make the caller's words his. A call
 * with no speaker labels (a summary or voicemail) belongs to whoever called.
 */
export function theirText(t: Turn): string {
  if (t.kind === 'call' && /^(US|THEM): /m.test(t.text)) {
    return t.text.split(/\r?\n/).filter(l => l.startsWith('THEM: ')).map(l => l.slice(6)).join('\n')
  }
  return t.who === 'THEM' && t.text !== '(no text)' ? t.text : ''
}

// ---------------------------------------------------------------------------
// The model's answer, checked
// ---------------------------------------------------------------------------

export interface Proposal {
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

// not_work was v5's single value for personal + spam; still accepted from older answers.
export const VALID_CLASS = ['customer', 'vendor', 'sub', 'personal', 'spam', 'not_work', 'unknown']
export const VALID_PROJECT = ['driveway', 'patio', 'slab', 'foundation', 'sidewalk',
                       'apron', 'demo', 'repair', 'commercial', 'other']

/**
 * Belt and braces on the model's output.
 *
 * The name rule is enforced HERE as well as in the prompt. A prompt is a
 * request; this is a guarantee. If the model returns one of our own names, or
 * a name that only ever appears inside a greeting, it is dropped and the reason
 * is recorded.
 */
export function sanitize(p: Proposal, turns: Turn[]): { p: Proposal; notes: string[] } {
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
      const inTheirWords = turns.some(t => theirText(t).toLowerCase().includes(lower.split(/\s+/)[0]))
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
// Self-identification — the one case a name applies without asking
// ---------------------------------------------------------------------------

/**
 * Where the person said, in their own words, who they are.
 *
 * Coy's rule (2026-09-27, DECISIONS §2b): a name is written automatically ONLY
 * when the person introduced themselves — "this is Maegan", "it's Amber with
 * The Arts", "my name is Jen McLean". Everything else is still a question.
 *
 * This does NOT trust the model. The model proposes a name; this function then
 * has to find the person saying that name about themselves, independently:
 *
 * - only THEIR words count: an inbound text, or a transcript line spoken from
 *   one of the contact's own numbers. Our outbound texts and our side of a call
 *   never count, and a call summary (a paraphrase, with no speaker) never does.
 * - the WHOLE proposed name must follow the introduction. "It's Amber" does not
 *   license "Amber Smith".
 * - "this is Mike's wife" is not Mike. A possessive after the name fails.
 * - if they introduced themselves under two different names, it is a shared
 *   line or a relay, and nothing is applied — that is a question for Coy.
 *
 * Returns the turn and the exact line, which become the claim's evidence.
 */
export interface SelfId {
  turnId: string
  channel: 'sms' | 'call'
  quote: string
}

const INTRO = String.raw`(?:this is|my name is|my name's|my name’s|it's|it’s|its|it is|i'm|i’m|i am)`
const NOT_A_NAME = new Set([
  'a', 'an', 'the', 'what', 'your', 'my', 'our', 'this', 'that', 'it', 'not', 'just', 'here', 'there',
  'so', 'sorry', 'also', 'going', 'good', 'on', 'at', 'in', 'from', 'with', 'working', 'done', 'ok', 'okay',
  'valid', 'about', 'still', 'coming', 'available', 'free', 'ready', 'outside', 'running', 'late', 'back',
  // transcripts stutter: "I'm I'm pretty open this week"
  'i', "i'm", 'i’m', 'im', "i've", 'i’ve', "it's", 'it’s', 'yeah', 'yes', 'no', 'hey', 'hi', 'hello',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'today', 'tomorrow',
  // places said after "it's" ("it's Baton Rouge, off Airline")
  'baton', 'rouge', 'louisiana', 'orleans', 'new', 'central', 'prairieville', 'gonzales', 'denham', 'zachary',
  'south', 'north', 'east', 'west',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
])

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const digits10 = (s: string) => s.replace(/\D/g, '').slice(-10)

/** The lines of a turn that are the contact speaking, or [] if none are. */
export function theirLines(t: Turn, ownNumbers: string[]): string[] {
  if (t.kind === 'sms') return t.who === 'THEM' ? t.text.split(/\r?\n/) : []
  // Transcripts label every line "+12253782458: words", whichever side placed
  // the call. Keep only the lines from the contact's numbers; an unlabelled
  // call text is a summary and never counts.
  const mine = new Set(ownNumbers.map(digits10).filter(d => d.length === 10))
  const out: string[] = []
  for (const line of t.text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\+?[\d\s().-]{10,})\s*:\s*(.*)$/)
    if (m && mine.has(digits10(m[1]))) out.push(m[2])
  }
  return out
}

/**
 * A transcript as the MODEL sees it: each "+12253782458:" speaker label
 * becomes THEM or US. Unrelabelled, the model is handed two phone numbers and
 * no way to know which is the contractor's — and it does not need the numbers.
 * findSelfIdentification() works on the original labels, not this.
 */
export function relabelTranscript(text: string, ownNumbers: string[]): string {
  const mine = new Set(ownNumbers.map(digits10).filter(d => d.length === 10))
  return text.split(/\r?\n/).map(line => {
    const m = line.match(/^\s*(\+?[\d\s().-]{10,})\s*:\s*(.*)$/)
    return m ? `${mine.has(digits10(m[1])) ? 'THEM' : 'US'}: ${m[2]}` : line
  }).join('\n')
}

/** Every first name the contact introduced themselves with. Lower-cased. */
function introducedNames(lines: string[]): Set<string> {
  const found = new Set<string>()
  const re = new RegExp(String.raw`(?:^|[\s,.!;:(-])${INTRO}\s+([A-Za-z][A-Za-z'’-]{1,})`, 'gi')
  for (const line of lines) {
    for (const m of line.matchAll(re)) {
      const w = m[1].replace(/['’]s$/i, '').toLowerCase()
      // Only a Capitalised word is a name here ("it's working" is not).
      if (m[1][0] !== m[1][0].toUpperCase()) continue
      if (NOT_A_NAME.has(w) || OUR_NAMES.some(n => n.toLowerCase() === w)) continue
      found.add(w)
    }
  }
  return found
}

export function findSelfIdentification(name: string | null, turns: Turn[], ownNumbers: string[]): SelfId | null {
  const n = (name ?? '').trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 60 || !/^[A-Za-z][A-Za-z .'’-]*$/.test(n)) return null
  const lower = n.toLowerCase()
  if (OUR_NAMES.some(o => lower === o.toLowerCase() || lower.includes(o.toLowerCase()))) return null
  if (NOT_A_NAME.has(lower.split(' ')[0])) return null
  // Every word Capitalised: "Marjorie with" is a parse, not a name.
  if (n.split(' ').some(w => w[0] !== w[0].toUpperCase() || NOT_A_NAME.has(w.toLowerCase()))) return null

  const nameRe = n.split(' ').map(esc).join(String.raw`\s+`)
  const said = new RegExp(String.raw`(?:^|[\s,.!;:(-])${INTRO}\s+${nameRe}(?![A-Za-z'’])`, 'i')
  const signed = new RegExp(String.raw`^\s*${nameRe}\s+here\b`, 'i')

  const all: string[] = []
  let hit: SelfId | null = null
  for (const t of turns) {
    const lines = theirLines(t, ownNumbers)
    all.push(...lines)
    if (hit) continue
    const line = lines.find(l => said.test(l) || signed.test(l))
    if (line) hit = { turnId: t.id, channel: t.kind, quote: line.trim().slice(0, 400) }
  }
  if (!hit) return null

  // Two different introductions on one number: shared line or relay. Ask.
  const first = lower.split(' ')[0]
  const names = introducedNames(all)
  for (const other of names) if (other !== first) return null
  return hit
}

// ---------------------------------------------------------------------------
// Spam — the one bucket Dusty files on its own
// ---------------------------------------------------------------------------

/**
 * Evidence, independent of the model, that a thread is spam.
 *
 * Coy (2026-09-27): Dusty may file obvious spam itself, with Undo. The model
 * saying "spam" is not enough; one of these must hold in THEIR words:
 *   - the sender is a short code, not a phone number (5–6 digit senders);
 *   - a one-time passcode / verification code;
 *   - marketing opt-out language ("reply STOP", "to opt out", "unsubscribe");
 *   - a stock scam line (car warranty, final notice, pre-approved, you've won).
 * And Coy must never have written or called back — anyone he has answered is
 * someone he might want, so that is always his call (the caller checks).
 */
export interface SpamSignal { kind: 'short_code' | 'passcode' | 'opt_out' | 'scam'; quote: string }

const SPAM_RULES: Array<{ kind: SpamSignal['kind']; re: RegExp }> = [
  { kind: 'passcode', re: /\b(one[- ]time pass(word|code)|verification code|security code|your (login |sign[- ]in )?code is|is your [\w .'-]{0,40}(code|password|pin)\b)/i },
  { kind: 'opt_out', re: /\b((reply|text) stop\b|to opt[- ]?out\b|unsubscribe\b|msg ?& ?data rates)/i },
  { kind: 'scam', re: /\b((car|vehicle|auto) warranty|final notice|pre-?approved for|you('ve| have) (been selected|won)|claim your (prize|reward))/i },
]

export function spamSignal(turns: Turn[], contactPhone: string | null): SpamSignal | null {
  const digits = (contactPhone ?? '').replace(/\D/g, '')
  const theirs = turns.filter(t => t.who === 'THEM' && t.kind === 'sms' && t.text !== '(no text)')
  if (digits && digits.length <= 6) {
    return { kind: 'short_code', quote: (theirs[0]?.text ?? `Short-code sender ${contactPhone}`).slice(0, 400) }
  }
  for (const t of theirs) {
    for (const line of t.text.split(/\r?\n/)) {
      for (const r of SPAM_RULES) if (r.re.test(line)) return { kind: r.kind, quote: line.trim().slice(0, 400) }
    }
  }
  return null
}
