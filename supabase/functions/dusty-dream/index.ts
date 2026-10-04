/**
 * dusty-dream — Dusty's dreaming. ScopeCrete, project cxiusuewtrvcpqequueh.
 *
 * Coy, 2026-09-30: "We had some 'dreaming' feature for dusty designed for him
 * to show background processes running even if I'm not engaging him … I'd
 * like him to compile and learn and make funny comments about phone
 * conversations and text messages that are in the database from today and
 * days/weeks past."
 *
 * pg_cron calls this every two hours (migration 058) with the enricher's
 * vault token (sc_enrich_worker_authorized). For each org it looks at either
 *   - today: calls and texts since the last "today" dream (at least 4), or
 *   - a memory: one earlier day in the last 30 not dreamed about yet,
 * and asks Hermes for 1–3 light, past-tense lines (rules.ts), stored in
 * dusty_dreams with the message ids they are about. People filed personal or
 * spam are left out. Phone numbers and emails are scrubbed before the model
 * sees anything and again from what it writes. Nothing is ever changed but
 * dusty_dreams and the heartbeat.
 *
 * Secrets: HERMES_API_KEY (required), HERMES_URL / HERMES_MODEL (optional).
 */

import { createClient } from '@supabase/supabase-js'
import { DREAM_PROMPT, renderTurns, sanitizeDreams, type DreamTurn } from './rules.ts'

const WORKER = 'dusty-dream'
const DEFAULT_HERMES_URL = 'https://srv1594563.tail0f2914.ts.net:8443'
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
const MIN_TURNS = 4
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
type Db = any

async function beat(sb: Db, status: string, detail: string) {
  await sb.from('sc_worker_heartbeats').upsert({ worker: WORKER, ticked_at: new Date().toISOString(), status, detail: detail.slice(0, 300) })
}

async function ping(url: string): Promise<boolean> {
  try { const r = await fetch(`${url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(10_000) }); return r.ok } catch { return false }
}

async function ask(cfg: { url: string; key: string; model: string }, conversation: string): Promise<unknown> {
  const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/v1/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(90_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, stream: false, temperature: 0.8, max_tokens: 500,
      messages: [{ role: 'system', content: DREAM_PROMPT }, { role: 'user', content: `CONVERSATIONS:\n\n${conversation}` }] }),
  })
  if (!res.ok) throw new Error(`Hermes HTTP ${res.status}`)
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const m = (data.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)
  if (!m) throw new Error('no JSON in the answer')
  return JSON.parse(m[0])
}

/** The org's calls and texts in [from, to), minus anyone filed personal or spam. */
async function turnsBetween(sb: Db, orgId: string, from: string, to: string): Promise<DreamTurn[]> {
  const { data: msgs } = await sb.from('messages')
    .select('id, contact_id, channel, direction, body_text, summary, occurred_at')
    .eq('org_id', orgId).gte('occurred_at', from).lt('occurred_at', to).not('contact_id', 'is', null)
    .order('occurred_at', { ascending: true }).limit(150)
  const rows = (msgs ?? []) as Array<{ id: string; contact_id: string; channel: string; direction: string; body_text: string | null; summary: string | null; occurred_at: string }>
  if (!rows.length) return []
  const ids = [...new Set(rows.map((r) => r.contact_id))]
  const { data: people } = await sb.from('contacts').select('id, name, contact_type, classification_confirmed_at, auto_classified_at')
    .eq('org_id', orgId).in('id', ids)
  const who = new Map<string, { name: string | null; hidden: boolean }>()
  for (const p of (people ?? []) as Array<{ id: string; name: string | null; contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null }>) {
    const filed = !!(p.classification_confirmed_at || p.auto_classified_at)
    who.set(p.id, { name: p.name?.trim() || null, hidden: filed && (p.contact_type === 'personal' || p.contact_type === 'spam') })
  }
  return rows.filter((r) => !(who.get(r.contact_id)?.hidden ?? true))
    .map((r) => ({
      id: r.id, contact_id: r.contact_id, who: who.get(r.contact_id)?.name?.split(/\s+/)[0] ?? 'Someone',
      direction: r.direction === 'outbound' ? 'out' as const : 'in' as const, channel: r.channel === 'call' ? 'call' as const : 'text' as const,
      text: (r.channel === 'call' ? r.summary : r.body_text) ?? '', at: r.occurred_at,
    }))
    .filter((t) => t.text.trim().length > 0)
}

async function dreamFor(sb: Db, cfg: { url: string; key: string; model: string }, orgId: string): Promise<string> {
  const now = new Date()
  const { data: last } = await sb.from('dusty_dreams').select('window_end').eq('org_id', orgId).eq('span', 'today')
    .order('window_end', { ascending: false }).limit(1)
  const dayAgo = new Date(now.getTime() - 86400_000).toISOString()
  const since = last?.[0]?.window_end && last[0].window_end > dayAgo ? last[0].window_end : dayAgo
  let span: 'today' | 'memory' = 'today'
  let from = since, to = now.toISOString()
  let turns = await turnsBetween(sb, orgId, from, to)

  if (turns.length < MIN_TURNS) {
    // A memory: an earlier day in the last 30 that hasn't been dreamed about.
    const { data: past } = await sb.from('dusty_dreams').select('window_start').eq('org_id', orgId).eq('span', 'memory')
      .gte('window_start', new Date(now.getTime() - 31 * 86400_000).toISOString())
    const done = new Set(((past ?? []) as Array<{ window_start: string }>).map((p) => p.window_start.slice(0, 10)))
    const days = Array.from({ length: 29 }, (_, i) => new Date(now.getTime() - (i + 2) * 86400_000).toISOString().slice(0, 10))
      .filter((d) => !done.has(d))
    for (let tries = 0; tries < 6 && days.length; tries++) {
      const d = days.splice(Math.floor(Math.random() * days.length), 1)[0]
      from = `${d}T05:00:00Z`; to = new Date(Date.parse(from) + 86400_000).toISOString()
      turns = await turnsBetween(sb, orgId, from, to)
      if (turns.length >= MIN_TURNS) { span = 'memory'; break }
    }
    if (turns.length < MIN_TURNS) return 'nothing to dream about'
  }

  const use = turns.slice(-60)
  const dreams = sanitizeDreams(await ask(cfg, renderTurns(use)), use)
  if (!dreams.length) return 'no usable dream'
  const { error } = await sb.from('dusty_dreams').insert(dreams.map((d) => ({
    org_id: orgId, span, window_start: from, window_end: to, dream: d.text, message_ids: d.message_ids, contact_ids: d.contact_ids, model: `hermes:${cfg.model}`,
  })))
  if (error) throw new Error(error.message)
  return `${dreams.length} ${span} dream(s)`
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const { data: authorized } = await sb.rpc('sc_enrich_worker_authorized', { p_token: token })
  if (authorized !== true) return json({ error: 'unauthorized' }, 401)
  let body: { wait?: boolean } = {}
  try { body = await req.json() } catch { /* empty is fine */ }

  const cfg = { url: Deno.env.get('HERMES_URL') || DEFAULT_HERMES_URL, key: Deno.env.get('HERMES_API_KEY') ?? '', model: Deno.env.get('HERMES_MODEL') || DEFAULT_MODEL }
  if (!cfg.key) { await beat(sb, 'not_configured', 'HERMES_API_KEY is not set'); return json({ code: 'not_configured' }, 503) }
  if (!(await ping(cfg.url))) { await beat(sb, 'hermes_unreachable', 'Hermes /health did not answer'); return json({ code: 'hermes_unreachable' }, 502) }

  const work = (async () => {
    const { data: orgs } = await sb.from('orgs').select('id')
    const results: string[] = []
    for (const o of (orgs ?? []) as Array<{ id: string }>) {
      try { results.push(await dreamFor(sb, cfg, o.id)) } catch (e) { results.push(`failed: ${(e as Error).message}`) }
    }
    const failed = results.every((r) => r.startsWith('failed'))
    await beat(sb, failed && results.length ? 'error' : 'ok', results.join('; ') || 'no orgs')
    return { results: results.map((r) => r.replace(/[^\w\s():;'-]/g, '')) }
  })()
  if (body.wait || typeof EdgeRuntime === 'undefined') return json(await work)
  EdgeRuntime.waitUntil(work)
  return json({ accepted: true }, 202)
})
