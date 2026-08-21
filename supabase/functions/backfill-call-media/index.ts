/**
 * backfill-call-media — ScopeCrete.ai
 * File: supabase/functions/backfill-call-media/index.ts
 * Project: cxiusuewtrvcpqequueh
 *
 * ONE-TIME BACKFILL over all 435 voip_calls rows.
 *
 * Quo has had auto-record, transcription and AI summaries switched ON since at
 * least June 2026. Every one of those calls has audio, a transcript and a
 * summary sitting on the provider's side. None of it reached us, because
 * quo-intake up to v52 fell through to `{ status: 'ignored' }` on
 * call.recording.completed / call.transcript.completed / call.summary.completed.
 * v53 handles all three, so this recovers the history those versions dropped.
 *
 * Sources the API, not the stored share.quo.com links. Those links are
 * PRESIGNED and expire; the API is authoritative and can be re-read at will.
 *
 *   GET /v1/call-recordings/{callId}
 *   GET /v1/call-transcripts/{callId}
 *   GET /v1/call-summaries/{callId}
 *   Authorization: <api-key>        <- raw key, NOT "Bearer <key>"
 *
 * Per call: audio -> call-audio bucket, transcript -> voip_calls.transcript,
 * summary -> voip_calls.provider_summary, and transcript + summary mirrored
 * onto the matching public.messages row.
 *
 * SAFE TO RE-RUN. Each step is guarded on its own output column, so a repeat
 * invocation only picks up what is still missing. Per-call failures never
 * abort the batch. Nothing is ever deleted and recording_url is never cleared.
 *
 *   POST {"limit": 5, "dry_run": true}   fetch + show, write nothing
 *   POST {"limit": 5}                    do 5
 *   POST {}                              do the rest
 *   POST {"call_ids": ["AC..."]}         target specific calls
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
// Accepts either name — the secret store may hold it under either.
const QUO_API_KEY = Deno.env.get('QUO_API_KEY') ?? Deno.env.get('OPENPHONE_API_KEY') ?? ''

const API_BASE = 'https://api.openphone.com/v1'
const BUCKET = 'call-audio'

/** Provider rate limit is modest; stay well under it. */
const PAUSE_MS = 350
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function dbFailed(context: string, error: { message: string } | null): boolean {
  if (error) { console.error(`[db] ${context}: ${error.message}`); return true }
  return false
}

// ---------------------------------------------------------------------------
// Provider API
// ---------------------------------------------------------------------------

/**
 * OpenPhone expects the API key RAW in the Authorization header, not as a
 * Bearer token. Both are attempted because getting this wrong looks exactly
 * like a bad key, and one wasted round trip is cheaper than a misdiagnosis.
 * A 404 is returned as a normal "absent" result, not an error — plenty of
 * calls legitimately have no recording.
 */
async function apiGet(path: string): Promise<
  { ok: true; data: unknown } | { ok: false; absent: boolean; error: string }
> {
  if (!QUO_API_KEY) return { ok: false, absent: false, error: 'QUO_API_KEY / OPENPHONE_API_KEY is not set' }

  const schemes = [QUO_API_KEY, `Bearer ${QUO_API_KEY}`]
  let last = 'no attempt'
  for (const auth of schemes) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: auth, Accept: 'application/json' },
      })
      if (res.status === 404) { await res.body?.cancel(); return { ok: false, absent: true, error: 'not found' } }
      if (res.status === 429) {
        await res.body?.cancel()
        return { ok: false, absent: false, error: 'rate limited (429) — lower the limit and re-run' }
      }
      if (res.ok) return { ok: true, data: await res.json() }
      last = `HTTP ${res.status}: ${(await res.text()).substring(0, 200)}`
      // 401/403 on the raw key is the signal to try the Bearer form.
      if (res.status !== 401 && res.status !== 403) break
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
      break
    }
  }
  return { ok: false, absent: false, error: last }
}

/** Unwraps `{data: X}` or a bare X, and takes the first element of a list. */
function unwrap(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const inner = 'data' in obj ? obj.data : obj
  if (Array.isArray(inner)) return (inner[0] as Record<string, unknown>) ?? null
  return (inner as Record<string, unknown>) ?? null
}

function recordingFrom(payload: unknown): { url: string; duration: number | null } | null {
  const obj = unwrap(payload)
  if (!obj) return null
  const url = (obj.url ?? obj.mediaUrl ?? obj.recordingUrl) as string | undefined
  if (typeof url !== 'string' || !url) return null
  const d = Number(obj.duration)
  return { url, duration: Number.isFinite(d) && d > 0 ? d : null }
}

/** Same dialogue[] shape the call.transcript.completed webhook carries. */
function transcriptFrom(payload: unknown): string | null {
  const obj = unwrap(payload)
  if (!obj) return null
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
  const flat = (obj.transcript ?? obj.text) as string | undefined
  return flat && flat.trim() ? flat : null
}

/** Same summary[] / nextSteps[] shape as call.summary.completed. */
function summaryFrom(payload: unknown): string | null {
  const obj = unwrap(payload)
  if (!obj) return null
  const parts: string[] = []
  const s = obj.summary
  if (Array.isArray(s)) parts.push(...s.filter((x): x is string => typeof x === 'string'))
  else if (typeof s === 'string' && s.trim()) parts.push(s)
  const next = obj.nextSteps
  if (Array.isArray(next)) {
    const steps = next.filter((x): x is string => typeof x === 'string')
    if (steps.length > 0) parts.push('Next steps:', ...steps.map(x => `- ${x}`))
  }
  return parts.length > 0 ? parts.join('\n') : null
}

// ---------------------------------------------------------------------------
// messages mirror
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Presigned-link expiry measurement
// ---------------------------------------------------------------------------

/**
 * Measures how long a stored share.quo.com link stays valid.
 *
 * This exists to answer one operational question: is a DAILY sweep fast enough
 * to capture audio before the provider's presigned link dies, or is the window
 * shorter than 24h? If it is shorter, a scheduled sweep is not a safety net at
 * all and audio must be captured at webhook time instead.
 *
 * The quo links carry only `?sig=` — no readable expiry — so the answer has to
 * come from observation: HEAD the stored link and pair the result with the row's
 * age. Across a batch that gives the cutoff directly. Known expiry parameter
 * names are still parsed in case the format ever changes.
 */
function statedExpiry(url: string): string | null {
  try {
    const q = new URL(url).searchParams
    for (const k of ['Expires', 'X-Amz-Expires', 'X-Goog-Expires', 'exp', 'se', 'st']) {
      const v = q.get(k)
      if (!v) continue
      const n = Number(v)
      // Bare seconds-to-live vs absolute epoch.
      if (Number.isFinite(n)) {
        return n < 1e9 ? `${k}=${n}s TTL` : `${k}=${new Date(n * 1000).toISOString()}`
      }
      return `${k}=${v}`
    }
    return null
  } catch { return null }
}

async function probePresigned(url: string, ageHours: number): Promise<Record<string, unknown>> {
  const probe: Record<string, unknown> = {
    age_hours: Math.round(ageHours * 10) / 10,
    stated_expiry: statedExpiry(url) ?? 'none in URL',
  }
  try {
    const res = await fetch(url, { method: 'HEAD' })
    probe.status = res.status
    probe.alive = res.ok
    await res.body?.cancel()
  } catch (e) {
    probe.status = 'network_error'
    probe.alive = false
    probe.detail = e instanceof Error ? e.message : String(e)
  }
  return probe
}

/** Patches the matching messages row. Never throws; never blanks a value. */
async function mirrorToMessages(
  supabase: ReturnType<typeof createClient>,
  voipCallId: string,
  patch: Record<string, unknown>
): Promise<'updated' | 'absent' | 'failed' | 'nothing'> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) if (v !== null && v !== undefined) clean[k] = v
  if (Object.keys(clean).length === 0) return 'nothing'

  const { data, error: readErr } = await supabase.from('messages').select('id')
    .eq('import_source', 'voip_calls').eq('legacy_id', voipCallId).limit(1).maybeSingle()
  if (dbFailed(`messages lookup (voip_call=${voipCallId})`, readErr)) return 'failed'
  // messages was fully backfilled on 2026-08-21 — every voip_calls row has a
  // twin (verified: 0 without, 0 duplicates). So 'absent' is an ANOMALY worth
  // shouting about, not a normal outcome. Never insert here: that would
  // duplicate the twin rather than update it.
  if (!data?.id) {
    console.error(`[anomaly] no messages twin for voip_call=${voipCallId} — messages was verified complete; investigate before trusting this batch`)
    return 'absent'
  }

  const { error } = await supabase.from('messages').update(clean).eq('id', data.id)
  return dbFailed(`messages update (voip_call=${voipCallId})`, error) ? 'failed' : 'updated'
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface CallRow {
  id: string; org_id: string; quo_call_id: string
  recording_storage_path: string | null
  transcript: string | null
  provider_summary: string | null
  duration_seconds: number | null
  recording_url: string | null
  created_at: string
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { limit?: number; dry_run?: boolean; call_ids?: string[] } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 500)
  const dryRun = body.dry_run === true

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  let q = supabase.from('voip_calls')
    .select('id, org_id, quo_call_id, recording_storage_path, transcript, provider_summary, duration_seconds, recording_url, created_at')
    .not('quo_call_id', 'is', null)
  if (body.call_ids?.length) q = q.in('quo_call_id', body.call_ids)
  else q = q.or('recording_storage_path.is.null,transcript.is.null,provider_summary.is.null')

  const { data: rows, error: readErr } = await q.order('created_at', { ascending: false }).limit(limit)
  if (readErr) {
    return new Response(JSON.stringify({ error: `read failed: ${readErr.message}` }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const calls = (rows ?? []) as CallRow[]
  const results: Record<string, unknown>[] = []
  let audioOk = 0, transcriptOk = 0, summaryOk = 0, failed = 0
  const errors: Record<string, number> = {}
  const note = (e: string) => { errors[e] = (errors[e] ?? 0) + 1 }

  for (const call of calls) {
    const r: Record<string, unknown> = { quo_call_id: call.quo_call_id, voip_call_id: call.id }
    const update: Record<string, unknown> = {}
    const now = new Date().toISOString()

    // Measure the presigned window before doing anything else, so the reading
    // is of the link as it was found rather than one just refreshed by the API.
    if (call.recording_url) {
      const ageHours = (Date.now() - new Date(call.created_at).getTime()) / 3_600_000
      r.presigned_probe = await probePresigned(call.recording_url, ageHours)
      await sleep(PAUSE_MS)
    }

    // ---- transcript ----
    if (!call.transcript) {
      const res = await apiGet(`/call-transcripts/${call.quo_call_id}`)
      if (res.ok) {
        const text = transcriptFrom(res.data)
        if (text) {
          update.transcript = text
          update.transcript_fetched_at = now
          r.transcript_chars = text.length
          r.transcript_preview = text.substring(0, 1500)
          transcriptOk++
        } else { r.transcript_status = 'empty'; note('transcript:empty') }
      } else if (res.absent) { r.transcript_status = 'not_available'; note('transcript:404') }
      else { r.transcript_status = `error: ${res.error}`; note(`transcript:${res.error.substring(0, 60)}`) }
      await sleep(PAUSE_MS)
    } else r.transcript_status = 'already_present'

    // ---- summary ----
    if (!call.provider_summary) {
      const res = await apiGet(`/call-summaries/${call.quo_call_id}`)
      if (res.ok) {
        const text = summaryFrom(res.data)
        if (text) {
          update.provider_summary = text
          update.provider_summary_fetched_at = now
          r.summary_preview = text
          summaryOk++
        } else { r.summary_status = 'empty'; note('summary:empty') }
      } else if (res.absent) { r.summary_status = 'not_available'; note('summary:404') }
      else { r.summary_status = `error: ${res.error}`; note(`summary:${res.error.substring(0, 60)}`) }
      await sleep(PAUSE_MS)
    } else r.summary_status = 'already_present'

    // ---- audio ----
    if (!call.recording_storage_path) {
      const res = await apiGet(`/call-recordings/${call.quo_call_id}`)
      if (res.ok) {
        const rec = recordingFrom(res.data)
        if (!rec) { r.audio_status = 'no_recording'; note('audio:none') }
        else if (dryRun) { r.audio_status = 'would_download'; r.audio_url_head = rec.url.substring(0, 70) }
        else {
          try {
            const audioRes = await fetch(rec.url)
            if (!audioRes.ok) {
              r.audio_status = `download HTTP ${audioRes.status}`; note(`audio:http${audioRes.status}`)
              await audioRes.body?.cancel()
            } else {
              const bytes = new Uint8Array(await audioRes.arrayBuffer())
              const path = `${call.org_id}/${call.quo_call_id}.mp3`
              const { error: upErr } = await supabase.storage.from(BUCKET)
                .upload(path, bytes, { contentType: 'audio/mpeg', upsert: true })
              if (upErr) { r.audio_status = `upload: ${upErr.message}`; note('audio:upload') }
              else {
                update.recording_storage_path = path
                update.recording_fetched_at = now
                if (rec.duration && !call.duration_seconds) update.duration_seconds = rec.duration
                r.audio_status = 'stored'; r.audio_bytes = bytes.byteLength
                audioOk++
              }
            }
          } catch (e) {
            r.audio_status = `download: ${e instanceof Error ? e.message : String(e)}`; note('audio:fetch')
          }
        }
      } else if (res.absent) { r.audio_status = 'not_available'; note('audio:404') }
      else { r.audio_status = `error: ${res.error}`; note(`audio:${res.error.substring(0, 60)}`) }
      await sleep(PAUSE_MS)
    } else r.audio_status = 'already_stored'

    // ---- write ----
    if (dryRun) {
      r.would_update = Object.keys(update)
      results.push(r)
      continue
    }
    if (Object.keys(update).length === 0) { r.outcome = 'nothing_to_write'; results.push(r); continue }

    const { error: updErr } = await supabase.from('voip_calls').update(update).eq('id', call.id)
    if (updErr) { failed++; r.outcome = `voip_calls update failed: ${updErr.message}`; results.push(r); continue }

    r.messages_mirror = await mirrorToMessages(supabase, call.id, {
      transcript: update.transcript ?? null,
      // messages has no provider_summary column; the provider's summary is the
      // only summary a call has, so it lands in the generic field there.
      body_text: update.provider_summary ?? null,
      duration_seconds: update.duration_seconds ?? null,
    })
    r.outcome = 'written'
    results.push(r)
  }

  // Collapse the per-row probes into the answer we actually want: at what age
  // do these links stop working?
  const probes = results
    .map(r => r.presigned_probe as Record<string, unknown> | undefined)
    .filter(Boolean) as Record<string, unknown>[]
  const alive = probes.filter(p => p.alive === true).map(p => p.age_hours as number)
  const dead = probes.filter(p => p.alive === false).map(p => p.age_hours as number)

  return new Response(JSON.stringify({
    dry_run: dryRun,
    considered: calls.length,
    audio_stored: audioOk, transcripts_fetched: transcriptOk, summaries_fetched: summaryOk,
    write_failures: failed,
    error_tally: errors,
    presigned_expiry: {
      probed: probes.length,
      alive: alive.length, dead: dead.length,
      oldest_alive_hours: alive.length ? Math.max(...alive) : null,
      newest_dead_hours: dead.length ? Math.min(...dead) : null,
      stated_expiry_seen: [...new Set(probes.map(p => p.stated_expiry))],
      // If newest_dead_hours < 24 the link window is shorter than a day and a
      // daily sweep CANNOT be relied on — capture at webhook time instead.
      verdict: dead.length === 0
        ? 'no expiry observed in this sample'
        : (Math.min(...dead) < 24
            ? 'WINDOW SHORTER THAN 24h — a daily sweep will miss recordings'
            : 'window appears longer than 24h — a daily sweep is viable'),
    },
    results,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
