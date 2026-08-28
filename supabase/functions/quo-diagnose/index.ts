/**
 * quo-diagnose — ScopeCrete.ai
 * File: supabase/functions/quo-diagnose/index.ts
 * Project: cxiusuewtrvcpqequueh
 *
 * THROWAWAY DIAGNOSTIC. Delete once the Quo API question is settled.
 *
 * Why this exists rather than a flag on backfill-call-media: that function's
 * apiGet() is the thing under suspicion, so a diagnostic built on top of it
 * would inherit the very behaviour being investigated. This talks to the API
 * directly and reports what came back, with no interpretation layer.
 *
 * Two specific behaviours in backfill-call-media/index.ts that this avoids:
 *
 *   L88  `if (res.status === 404) { await res.body?.cancel(); return … }`
 *        A 404 returns BEFORE the body is read, so the provider's error
 *        envelope — message, code, title, docs — is thrown away unread. Those
 *        fields are most of the answer.
 *
 *   L96  `if (res.status !== 401 && res.status !== 403) break`
 *        combined with the early return on L88 means the Bearer scheme is only
 *        ever attempted after a 401/403. A 404 on the raw scheme short-circuits
 *        the loop, so "raw key 404s but Bearer would have worked" is a state
 *        the current code cannot discover.
 *
 * This function therefore tries BOTH Authorization schemes against EVERY
 * endpoint independently, and reports both outcomes side by side.
 *
 * It writes NOTHING. No database, no storage. Read-only against the provider.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const QUO_API_KEY = Deno.env.get('QUO_API_KEY') ?? Deno.env.get('OPENPHONE_API_KEY') ?? ''
const API_BASE = 'https://api.openphone.com/v1'

/** How much of each raw body to return. The work order asks for ~800. */
const BODY_CHARS = 800

/**
 * Calls known to have a transcript visible in the Quo UI. Overridable via the
 * request body so this is not welded to two ids.
 */
const DEFAULT_CALL_IDS = [
  'AC20c551da2ad442b5b21d4399e966c51b', // 23 Aug, inbound, 49s
  'AC7650d7763f5e496eb0529261a0424139', // 27 Aug, 22s
]

interface Attempt {
  scheme: 'raw' | 'bearer'
  status: number | null
  status_text: string | null
  content_type: string | null
  body_raw: string
  body_bytes: number | null
  transport_error: string | null
}

/**
 * One request, one scheme, no interpretation.
 *
 * The body is read as TEXT on every path including errors — that is the whole
 * point. Nothing here maps a status onto a boolean.
 */
async function probe(path: string, scheme: 'raw' | 'bearer'): Promise<Attempt> {
  const auth = scheme === 'raw' ? QUO_API_KEY : `Bearer ${QUO_API_KEY}`
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    })
    const text = await res.text()
    return {
      scheme,
      status: res.status,
      status_text: res.statusText,
      content_type: res.headers.get('content-type'),
      body_raw: text.substring(0, BODY_CHARS),
      body_bytes: text.length,
      transport_error: null,
    }
  } catch (e) {
    return {
      scheme,
      status: null,
      status_text: null,
      content_type: null,
      body_raw: '',
      body_bytes: null,
      transport_error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** Both schemes against one path, so neither can mask the other. */
async function probeBoth(label: string, path: string) {
  const raw = await probe(path, 'raw')
  const bearer = await probe(path, 'bearer')
  return {
    request: label,
    path,
    attempts: [raw, bearer],
    // A flat read of which scheme, if either, actually returned 2xx.
    scheme_that_worked:
      raw.status !== null && raw.status >= 200 && raw.status < 300 ? 'raw'
      : bearer.status !== null && bearer.status >= 200 && bearer.status < 300 ? 'bearer'
      : 'neither',
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { call_ids?: string[] } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const callIds = body.call_ids?.length ? body.call_ids : DEFAULT_CALL_IDS

  // Key fingerprint only. Never the value.
  const keyReport = {
    present: Boolean(QUO_API_KEY),
    length: QUO_API_KEY.length,
    first_four: QUO_API_KEY.substring(0, 4),
    source: Deno.env.get('QUO_API_KEY')
      ? 'QUO_API_KEY'
      : Deno.env.get('OPENPHONE_API_KEY') ? 'OPENPHONE_API_KEY' : 'none',
  }

  if (!QUO_API_KEY) {
    return new Response(JSON.stringify({
      verdict: 'NO_KEY',
      note: 'Neither QUO_API_KEY nor OPENPHONE_API_KEY is set on this function. Nothing was requested.',
      key: keyReport,
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const results: unknown[] = []

  // Account-level first. If +12253782458 is absent from this list, the scope
  // question is answered before any per-call request is made.
  results.push(await probeBoth('GET /v1/phone-numbers', '/phone-numbers'))

  // Unfiltered call list. An empty list from a key that can see the workspace
  // means something different from a 403.
  results.push(await probeBoth('GET /v1/calls (unfiltered, maxResults=5)', '/calls?maxResults=5'))

  for (const id of callIds) {
    results.push(await probeBoth(`GET /v1/calls/${id}`, `/calls/${id}`))
    results.push(await probeBoth(`GET /v1/call-recordings/${id}`, `/call-recordings/${id}`))
    results.push(await probeBoth(`GET /v1/call-transcripts/${id}`, `/call-transcripts/${id}`))
    results.push(await probeBoth(`GET /v1/call-summaries/${id}`, `/call-summaries/${id}`))
    results.push(await probeBoth(`GET /v1/call-voicemails/${id}`, `/call-voicemails/${id}`))
  }

  // A flat summary so the shape of the failure is visible without reading
  // every body. The bodies remain authoritative.
  const statusMatrix = (results as Array<{ request: string; attempts: Attempt[]; scheme_that_worked: string }>)
    .map(r => ({
      request: r.request,
      raw: r.attempts[0].status ?? r.attempts[0].transport_error,
      bearer: r.attempts[1].status ?? r.attempts[1].transport_error,
      worked: r.scheme_that_worked,
    }))

  const anyWorked = statusMatrix.some(r => r.worked !== 'neither')

  return new Response(JSON.stringify({
    verdict: anyWorked ? 'SOME_REQUESTS_SUCCEEDED' : 'EVERY_REQUEST_FAILED',
    generated_at: new Date().toISOString(),
    api_base: API_BASE,
    key: keyReport,
    call_ids: callIds,
    status_matrix: statusMatrix,
    results,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
