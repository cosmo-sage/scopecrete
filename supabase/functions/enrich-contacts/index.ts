/**
 * enrich-contacts — the background enricher. ScopeCrete, project cxiusuewtrvcpqequueh.
 *
 * pg_cron calls this every minute (migration 031), so contacts get read
 * with the app closed. Each call:
 *
 *   1. checks the caller's bearer token against the vault secret
 *      `enrich_worker_token` (sc_enrich_worker_authorized). Only pg_cron has
 *      it. Everyone else — including anyone holding the public anon key — gets
 *      401 and nothing else;
 *   2. checks Hermes is configured and reachable BEFORE claiming anyone, so an
 *      outage never marks contacts as read;
 *   3. keeps claiming due contacts one at a time, CONCURRENCY at once, until
 *      the queue is empty or CLAIM_BUDGET_MS has passed (sc_enrich_claim, view
 *      sc_enrich_due: unnamed, something THEY said, quiet 3 minutes, changed
 *      since last read);
 *   4. reads each one (pipeline.ts): a suggestion into contact_proposals; the
 *      name itself only when the person introduced themselves; the spam
 *      bucket only on evidence in their words from someone Coy never answered;
 *      and any other bucket only once Dusty's last 20 guesses of it matched
 *      Coy (sc_bucket_agreement); and for everyone, named and sorted or not,
 *      Dusty's status line (migration 037). Coy's corrections go into the prompt
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
import { hermesAsk, loadLearning, pingHermes, readContact, type Ask, type HermesConfig, type Learning, type Outcome } from './pipeline.ts'
import { renderCorrections } from './rules.ts'

const WORKER = 'enrich-contacts'
/** DECISIONS §8: Hermes alone on its own Funnel port. Not a secret — the key is. */
const DEFAULT_HERMES_URL = 'https://srv1594563.tail0f2914.ts.net:8443'
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku'
/** Readers working at once. Each claims one contact, reads it, claims the next. */
const CONCURRENCY = 4
/**
 * Stop claiming new contacts after this long. A read can take up to the model
 * timeout (90 s) past it, which keeps a run inside the 150 s wall clock.
 * pg_cron starts a run every minute and the claim lock keeps overlapping runs
 * off each other's contacts, so a backlog drains continuously.
 */
const CLAIM_BUDGET_MS = 45_000

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
async function runBatch(sb: any, cfg: HermesConfig, maxReads: number) {
  const started = Date.now()
  const counts: Record<Outcome | 'claimed', number> = {
    claimed: 0, proposed: 0, named: 0, filed: 0, summarized: 0, unchanged: 0, no_words: 0, model_error: 0, failed: 0,
  }
  // Learning is per org, loaded once per run when the org's first contact is claimed.
  const perOrg = new Map<string, Promise<{ learning: Learning; ask: Ask }>>()
  const forOrg = (orgId: string) => {
    let v = perOrg.get(orgId)
    if (!v) {
      v = loadLearning(sb, orgId)
        .catch(() => ({ corrections: [], streaks: {} }) as Learning)
        .then((learning) => ({ learning, ask: hermesAsk(cfg, renderCorrections(learning.corrections)) }))
      perOrg.set(orgId, v)
    }
    return v
  }
  const model = `hermes:${cfg.model}`
  let firstModelError: string | null = null
  let claimError: string | null = null
  let drained = false

  async function worker() {
    while (!drained && !claimError && counts.claimed < maxReads && Date.now() - started < CLAIM_BUDGET_MS) {
      const { data: claimed, error } = await sb.rpc('sc_enrich_claim', { p_limit: 1 })
      if (error) { claimError = error.message; return }
      const job = ((claimed ?? []) as Array<{ run_id: string; org_id: string; contact_id: string }>)[0]
      if (!job) { drained = true; return }
      counts.claimed++
      let outcome: Outcome = 'failed'
      let fields: Record<string, unknown> = {}
      try {
        const { learning, ask } = await forOrg(job.org_id)
        const r = await readContact(sb, job.org_id, job.contact_id, ask, model, learning)
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

  if (claimError) await beat(sb, 'error', `claim failed: ${claimError}`)
  // Every read hitting a model error is a configuration problem (wrong key,
  // model gone) and the app should say so. Some timeouts are just Hermes.
  else if (counts.claimed && counts.model_error === counts.claimed) await beat(sb, 'error', firstModelError ?? 'every read failed')
  else await beat(sb, 'ok', counts.claimed ? 'last batch finished' : 'nothing due')
  if (counts.claimed) console.log('enrich batch', JSON.stringify(counts))
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

  const maxReads = Math.min(Math.max(Number(body.limit) || 200, 1), 200)
  const work = runBatch(sb, cfg, maxReads)
  if (body.wait || typeof EdgeRuntime === 'undefined') return json(await work)
  EdgeRuntime.waitUntil(work)
  return json({ accepted: true }, 202)
})
