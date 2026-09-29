/**
 * read-files — Dusty reads the files Coy uploads (migration 045/046).
 * ScopeCrete, project cxiusuewtrvcpqequueh.
 *
 * Coy, 2026-09-29: "I need to be able to upload documents and photos for
 * Dusty to parse." pg_cron calls this every minute. Each call:
 *
 *   1. checks the bearer token against the vault secret the enricher uses
 *      (sc_enrich_worker_authorized) — nobody else gets in;
 *   2. checks Hermes is configured and reachable BEFORE claiming anything,
 *      so an outage never marks a file read;
 *   3. claims files one at a time (sc_files_claim: waiting, or failed 30+
 *      minutes ago with fewer than 3 tries, or stuck "reading" 10+ minutes);
 *   4. reads each: a JPEG/PNG photo goes to Hermes as an image; a PDF's text
 *      is pulled out here (unpdf) and Hermes reads the text — a scanned PDF
 *      with no text is skipped and says so; anything else is skipped with why;
 *   5. writes summary, facts (suggestions — shown, never applied, §2b; from a
 *      document a number is kept only if it is written in it), extracted text
 *      and page count, and a pulse in sc_worker_heartbeats.
 *
 * Service role inside this function only; no browser reaches it.
 * `{"wait": true}` runs inline and returns counts; `{"ping": true}` checks Hermes;
 * `{"sample_quote": true}` reads a made-up supplier quote and returns the price lines kept.
 */

import { createClient } from '@supabase/supabase-js'
import { extractText, getDocumentProxy } from 'unpdf'
import { SYSTEM_PROMPT, READ_PROMPT_VERSION, clipText, parseReply, readable, sanitizeRead } from './rules.ts'

const WORKER = 'read-files'
const DEFAULT_HERMES_URL = 'https://srv1594563.tail0f2914.ts.net:8443'
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
const CONCURRENCY = 2
const CLAIM_BUDGET_MS = 45_000
const BUCKET = 'job-files'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined
interface Cfg { url: string; key: string; model: string }
type Outcome = 'read' | 'skipped' | 'failed'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
async function beat(sb: any, status: 'ok' | 'not_configured' | 'hermes_unreachable' | 'error', detail: string) {
  await sb.from('sc_worker_heartbeats').upsert({ worker: WORKER, ticked_at: new Date().toISOString(), status, detail: detail.slice(0, 300) })
}

async function ping(cfg: Cfg) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const r = await fetch(`${cfg.url.replace(/\/+$/, '')}/health`, { signal: ctrl.signal })
    return r.ok ? { ok: true, detail: 'reachable' } : { ok: false, detail: `Hermes /health returned ${r.status}` }
  } catch (e) {
    return { ok: false, detail: `Hermes unreachable: ${(e as Error).message}`.slice(0, 200) }
  } finally { clearTimeout(t) }
}

// deno-lint-ignore no-explicit-any
async function ask(cfg: Cfg, user: any): Promise<{ ok: true; raw: string } | { ok: false; error: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 90_000)
  try {
    const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, stream: false, temperature: 0.1, max_tokens: 6000,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }] }),
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 160)
      return { ok: false, error: res.status === 401 || res.status === 403 ? `Hermes rejected the key (HTTP ${res.status})` : `Hermes HTTP ${res.status}${body ? `: ${body}` : ''}` }
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content ?? ''
    return raw.trim() ? { ok: true, raw } : { ok: false, error: 'Hermes returned an empty answer' }
  } catch (e) {
    return { ok: false, error: (e as Error).name === 'AbortError' ? 'Hermes timed out' : `couldn't reach Hermes: ${(e as Error).message}`.slice(0, 200) }
  } finally { clearTimeout(t) }
}

function b64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

interface Job { id: string; org_id: string; name: string; kind: string; mime_type: string | null; byte_size: number | null; storage_path: string }

// deno-lint-ignore no-explicit-any
async function readOne(sb: any, cfg: Cfg, f: Job): Promise<{ outcome: Outcome; patch: Record<string, unknown> }> {
  const can = readable(f.kind, f.mime_type, f.byte_size)
  if (!can.ok) return { outcome: 'skipped', patch: { read_error: can.why } }

  const { data: blob, error } = await sb.storage.from(BUCKET).download(f.storage_path)
  if (error || !blob) return { outcome: 'failed', patch: { read_error: `couldn't open the stored file: ${error?.message ?? 'missing'}` } }
  const bytes = new Uint8Array(await blob.arrayBuffer())

  let text: string | null = null
  let pages: number | null = null
  let user: unknown
  if (can.as === 'image') {
    const mime = (f.mime_type ?? 'image/jpeg').toLowerCase()
    user = [
      { type: 'text', text: `FILE: ${f.name}\nA photo. Read it.` },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${b64(bytes)}` } },
    ]
  } else {
    try {
      const pdf = await getDocumentProxy(bytes)
      const out = await extractText(pdf, { mergePages: true })
      pages = out.totalPages
      text = (Array.isArray(out.text) ? out.text.join('\n\n') : out.text) ?? ''
    } catch (e) {
      return { outcome: 'failed', patch: { read_error: `couldn't open the PDF: ${(e as Error).message}`.slice(0, 200) } }
    }
    if (text.replace(/\s/g, '').length < 40) {
      return { outcome: 'skipped', patch: { page_count: pages, read_error: 'no text in it — a scanned PDF; reading scanned pages comes later' } }
    }
    const c = clipText(text)
    user = `FILE: ${f.name} (${pages} page${pages === 1 ? '' : 's'}${c.clipped ? ', only the start is below' : ''})\n\n${c.text}`
  }

  const got = await ask(cfg, user)
  if (!got.ok) return { outcome: 'failed', patch: { read_error: got.error, page_count: pages, extracted_text: text?.slice(0, 200_000) ?? null } }
  const r = sanitizeRead(parseReply(got.raw), text)
  if (!r) return { outcome: 'failed', patch: { read_error: 'no usable answer from the model', page_count: pages, extracted_text: text?.slice(0, 200_000) ?? null } }
  return {
    outcome: 'read',
    patch: {
      summary: r.summary, page_count: pages, extracted_text: text?.slice(0, 200_000) ?? null, read_error: null,
      facts: { ...r.facts, ...(r.kind ? { kind_guess: r.kind } : {}), ...(r.dropped.length ? { dropped: r.dropped } : {}), prompt: READ_PROMPT_VERSION },
    },
  }
}

// deno-lint-ignore no-explicit-any
async function runBatch(sb: any, cfg: Cfg, maxReads: number) {
  const started = Date.now()
  const counts: Record<Outcome | 'claimed', number> = { claimed: 0, read: 0, skipped: 0, failed: 0 }
  let firstError: string | null = null
  let claimError: string | null = null
  let drained = false
  async function worker() {
    while (!drained && !claimError && counts.claimed < maxReads && Date.now() - started < CLAIM_BUDGET_MS) {
      const { data, error } = await sb.rpc('sc_files_claim', { p_limit: 1 })
      if (error) { claimError = error.message; return }
      const f = ((data ?? []) as Job[])[0]
      if (!f) { drained = true; return }
      counts.claimed++
      let res: { outcome: Outcome; patch: Record<string, unknown> }
      try { res = await readOne(sb, cfg, f) } catch (e) { res = { outcome: 'failed', patch: { read_error: `threw: ${(e as Error).message}`.slice(0, 200) } } }
      counts[res.outcome]++
      if (res.outcome === 'failed' && !firstError) firstError = String(res.patch.read_error ?? 'failed')
      await sb.from('job_files').update({ read_state: res.outcome, read_at: new Date().toISOString(), ...res.patch }).eq('id', f.id)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  if (claimError) await beat(sb, 'error', `claim failed: ${claimError}`)
  else if (counts.claimed && counts.failed === counts.claimed) await beat(sb, 'error', firstError ?? 'every read failed')
  else await beat(sb, 'ok', counts.claimed ? 'last batch finished' : 'nothing due')
  if (counts.claimed) console.log('read-files batch', JSON.stringify(counts))
  return counts
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const { data: authorized } = await sb.rpc('sc_enrich_worker_authorized', { p_token: token })
  if (authorized !== true) return json({ error: 'unauthorized' }, 401)

  let body: { wait?: boolean; ping?: boolean; probe?: boolean; sample_quote?: boolean; limit?: number } = {}
  try { body = await req.json() } catch { /* empty is fine */ }
  const cfg: Cfg = {
    url: Deno.env.get('HERMES_URL') || DEFAULT_HERMES_URL,
    key: Deno.env.get('HERMES_API_KEY') ?? '',
    model: Deno.env.get('HERMES_MODEL') || DEFAULT_MODEL,
  }
  const health = await ping(cfg)
  if (body.ping) return json({ hermes: health, key_set: !!cfg.key })
  // Does Hermes pass an image through to the model? A generated 8x8 red
  // square, no customer data; the answer comes back so a human can see it.
  if (body.probe) {
    const red = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4IyKCFTEMLQkAmD9BAZzFjLYAAAAASUVORK5CYII='
    const got = await ask(cfg, [{ type: 'text', text: 'What colour is this image? Reply as JSON {"summary": "<colour>"}' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${red}` } }])
    return json(got.ok ? { ok: true, answer: got.raw.slice(0, 200) } : got)
  }
  // Price lines (v2) on a made-up supplier quote — no customer data — run
  // through the same sanitiser, so a human can see what would be kept.
  if (body.sample_quote) {
    const text = 'SAMPLE SUPPLY CO. — QUOTE Q-0001 — valid 30 days\nItem  Description  Unit  Qty  Unit price  Ext\nRM3000  3000 PSI ready mix  CY  40  $152.00  $6,080.00\nRM4000  4000 PSI ready mix  CY  12  $164.50  $1,974.00\nRB4-20  #4 rebar 20 ft  EA  90  $14.25  $1,282.50\nWWM66  6x6 W2.9 mesh sheet  SHEET  30  $18.40  $552.00\nSHORT  Short load fee (under 5 CY)  LOAD  1  $95.00  $95.00\nSubtotal $9,983.50  Tax 9.45% $943.44  Total $10,926.94'
    const got = await ask(cfg, `FILE: sample-quote.pdf (1 page)\n\n${text}`)
    if (!got.ok) return json(got)
    const r = sanitizeRead(parseReply(got.raw), text)
    return json({ ok: !!r, price_lines: r?.facts.price_lines ?? null, dropped: r?.dropped ?? null, kind: r?.kind ?? null })
  }
  if (!cfg.key) { await beat(sb, 'not_configured', 'HERMES_API_KEY is not set in the Supabase Edge Function secrets.'); return json({ code: 'not_configured' }, 503) }
  if (!health.ok) { await beat(sb, 'hermes_unreachable', health.detail); return json({ code: 'hermes_unreachable', detail: health.detail }, 502) }

  const work = runBatch(sb, cfg, Math.min(Math.max(Number(body.limit) || 50, 1), 50))
  if (body.wait || typeof EdgeRuntime === 'undefined') return json(await work)
  EdgeRuntime.waitUntil(work)
  return json({ accepted: true }, 202)
})
