/**
 * enrich-contacts — the background enricher. ScopeCrete, project cxiusuewtrvcpqequueh.
 *
 * pg_cron calls this every five minutes (migration 030), so contacts get read
 * with the app closed. Each call:
 *
 *   1. checks the caller's bearer token against the vault secret
 *      `enrich_worker_token` (sc_enrich_worker_authorized). Only pg_cron has
 *      it. Everyone else — including anyone holding the public anon key — gets
 *      401 and nothing else;
 *   2. checks Hermes is configured and reachable BEFORE claiming anyone, so an
 *      outage never marks contacts as read;
 *   3. claims up to BATCH due contacts (sc_enrich_claim, view sc_enrich_due:
 *      unnamed, something THEY said, quiet 3 minutes, changed since last read);
 *   4. reads each one (pipeline.ts): a suggestion into contact_proposals, and
 *      the name itself only when the person introduced themselves
 *      (DECISIONS §2b). customers.relation is never written here.
 *   5. records every outcome in contact_enrich_runs and a pulse in
 *      sc_worker_heartbeats.
 *
 * Responds 202 at once and finishes in the background (EdgeRuntime.waitUntil);
 * `{"wait": true}` runs inline and returns counts — never names, numbers or
 * text — for diagnosis. `{"ping": true}` checks Hermes and nothing else.
 *
 * Secrets (Supabase → Edge Functions → Secrets): HERMES_API_KEY, required.
 * HERMES_URL and HERMES_MODEL are optional overrides. The service key is the
 * one Supabase injects.
 *
 * Replaces v2, which accepted any valid JWT — the public anon key included —
 * and returned contacts' phone numbers in its response.
 */

import { createClient } from '@supabase/supabase-js'
import { hermesAsk, pingHermes, readContact, type HermesConfig, type Outcome } from './pipeline.ts'

const WORKER = 'enrich-contacts'
/** DECISIONS §8: Hermes alone on its own Funnel port. Not a secret — the key is. */
const DEFAULT_HERMES_URL = 'https://srv1594563.tail0f2914.ts.net:8443'
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku'
const BATCH = 6
const CONCURRENCY = 3

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
// SUPABASE_SECRET_KEY (sb_secret_…) first, the injected legacy key second —
// same order as quo-intake, so disabling legacy keys does not stop this.
const SERVICE_KEY = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
async function beat(sb: any, status: 'ok' | 'not_configured' | 'hermes_unreachable' | 'error', detail: string) {
  await sb.from('sc_worker_heartbeats')
    .upsert({ worker: WORKER, ticked_at: new Date().toISOString(), status, detail: detail.slice(0, 300) })
}

// deno-lint-ignore no-explicit-any
async function runBatch(sb: any, cfg: HermesConfig, limit: number) {
  const { data: claimed, error } = await sb.rpc('sc_enrich_claim', { p_limit: limit })
  if (error) {
    await beat(sb, 'error', `claim failed: ${error.message}`)
    return { error: 'claim failed' }
  }
  const queue = (claimed ?? []) as Array<{ run_id: string; org_id: string; contact_id: string }>
  const counts: Record<Outcome | 'claimed', number> = {
    claimed: queue.length, proposed: 0, named: 0, unchanged: 0, no_words: 0, model_error: 0, failed: 0,
  }
  const ask = hermesAsk(cfg)
  const model = `hermes:${cfg.model}`
  let firstModelError: string | null = null

  let i = 0
  async function worker() {
    while (i < queue.length) {
      const job = queue[i++]
      let outcome: Outcome = 'failed'
      let fields: Record<string, unknown> = {}
      try {
        const r = await readContact(sb, job.org_id, job.contact_id, ask, model)
        outcome = r.outcome
        fields = { proposal_id: r.proposal_id ?? null, claim_id: r.claim_id ?? null, note: r.note?.slice(0, 300) ?? null }
        if (outcome === 'model_error' && !firstModelError) firstModelError = r.note ?? 'model error'
      } catch (e) {
        fields = { note: `threw: ${(e as Error).message}`.slice(0, 300) }
      }
      counts[outcome]++
      await sb.from('contact_enrich_runs')
        .update({ outcome, finished_at: new Date().toISOString(), ...fields })
        .eq('id', job.run_id)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // A batch where every read hit a model error is a configuration problem
  // (wrong key, model gone), and the app should say so.
  if (queue.length && counts.model_error === queue.length) await beat(sb, 'error', firstModelError ?? 'every read failed')
  else await beat(sb, 'ok', queue.length ? 'last batch finished' : 'nothing due')
  console.log('enrich batch', JSON.stringify(counts))
  return counts
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const { data: authorized } = await sb.rpc('sc_enrich_worker_authorized', { p_token: token })
  if (authorized !== true) return json({ error: 'unauthorized' }, 401)

  let body: { wait?: boolean; ping?: boolean; limit?: number } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const cfg: HermesConfig = {
    url: Deno.env.get('HERMES_URL') || DEFAULT_HERMES_URL,
    key: Deno.env.get('HERMES_API_KEY') ?? '',
    model: Deno.env.get('HERMES_MODEL') || DEFAULT_MODEL,
  }

  const health = await pingHermes(cfg)
  if (body.ping) return json({ hermes: health, key_set: !!cfg.key })
  if (!cfg.key) {
    await beat(sb, 'not_configured', 'HERMES_API_KEY is not set in the Supabase Edge Function secrets.')
    return json({ code: 'not_configured' }, 503)
  }
  if (!health.ok) {
    await beat(sb, 'hermes_unreachable', health.detail)
    return json({ code: 'hermes_unreachable', detail: health.detail }, 502)
  }

  const limit = Math.min(Math.max(Number(body.limit) || BATCH, 1), 12)
  const work = runBatch(sb, cfg, limit)
  if (body.wait || typeof EdgeRuntime === 'undefined') return json(await work)
  EdgeRuntime.waitUntil(work)
  return json({ accepted: true }, 202)
})
