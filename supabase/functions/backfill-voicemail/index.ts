/**
 * backfill-voicemail — ScopeCrete.ai
 * File: supabase/functions/backfill-voicemail/index.ts
 * Project: cxiusuewtrvcpqequueh
 *
 * ONE-TIME BACKFILL. Piece 1 of the enrichment rebuild.
 *
 * For every voip_calls row that has a recording_url but no stored copy:
 *   1. download the audio from the provider
 *   2. put it in the private `call-audio` storage bucket
 *   3. record the storage path (recording_url is NEVER cleared)
 *   4. transcribe it with Groq whisper-large-v3-turbo
 *   5. write the text to voip_calls.transcript
 *
 * WHY THIS RUNS AS AN EDGE FUNCTION RATHER THAN A LOCAL SCRIPT
 * The provider links are presigned share.quo.com URLs. The development sandbox
 * has no egress to that host (the policy proxy answers 403 to CONNECT) and
 * holds neither GROQ_API_KEY nor a Quo API key. Both secrets already exist in
 * this project's function-secret store, and Supabase's own egress can reach the
 * provider — so the work belongs here, next to the credentials, not on a laptop.
 *
 * SAFE TO RE-RUN. Every step is guarded on its own output column, so a second
 * invocation only picks up what the first one missed. Failures are reported per
 * row and never abort the batch.
 *
 * Invoke:
 *   POST { "limit": 5, "dry_run": true }   preview, downloads nothing
 *   POST { "limit": 5 }                    do 5
 *   POST {}                                do all remaining
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? ''
// Optional. The share.quo.com links carry their own `?sig=`, so they usually
// need no auth at all. This is only used as a fallback if a link 401/403s.
const QUO_API_KEY = Deno.env.get('QUO_API_KEY') ?? ''

const BUCKET = 'call-audio'
const TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo'

interface CallRow {
  id: string
  org_id: string
  quo_call_id: string
  recording_url: string
  recording_storage_path: string | null
  transcript: string | null
}

interface RowResult {
  call_id: string
  quo_call_id: string
  downloaded: boolean
  transcribed: boolean
  bytes?: number
  error?: string
  stage?: 'download' | 'upload' | 'transcribe' | 'update'
}

/**
 * Fetches the recording. Tries the presigned URL bare first, because that is
 * what the signature is for; only falls back to the API key if the provider
 * rejects it. Distinguishes "signature expired" from other failures, since
 * that is the one error no retry will ever fix.
 */
async function downloadRecording(url: string): Promise<
  { ok: true; bytes: Uint8Array; contentType: string } | { ok: false; error: string }
> {
  const attempts: Array<{ label: string; headers: Record<string, string> }> = [
    { label: 'presigned', headers: {} },
  ]
  if (QUO_API_KEY) {
    attempts.push({ label: 'api-key', headers: { Authorization: `Bearer ${QUO_API_KEY}` } })
  }

  let lastError = 'no attempt made'
  for (const attempt of attempts) {
    try {
      const res = await fetch(url, { headers: attempt.headers })
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer())
        if (buf.byteLength === 0) {
          lastError = `${attempt.label}: 200 but empty body`
          continue
        }
        return {
          ok: true,
          bytes: buf,
          contentType: res.headers.get('content-type') ?? 'audio/mpeg',
        }
      }
      // 401/403 on a presigned URL almost always means the signature aged out.
      // Say so plainly — it is not a transient error and should not be retried.
      const hint = (res.status === 401 || res.status === 403) && attempt.label === 'presigned'
        ? ' (presigned signature likely expired — the provider link is dead, not slow)'
        : ''
      lastError = `${attempt.label}: HTTP ${res.status}${hint}`
      await res.body?.cancel()
    } catch (e) {
      lastError = `${attempt.label}: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  return { ok: false, error: lastError }
}

/** Groq's audio transcription endpoint. Multipart, not JSON. */
async function transcribe(bytes: Uint8Array, filename: string): Promise<
  { ok: true; text: string } | { ok: false; error: string }
> {
  if (!GROQ_API_KEY) return { ok: false, error: 'GROQ_API_KEY is not set' }
  try {
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), filename)
    form.append('model', TRANSCRIPTION_MODEL)
    form.append('response_format', 'json')
    // Nudges the model toward this domain's vocabulary. Voicemails are short,
    // noisy, and full of trade words a generic model mangles.
    form.append(
      'prompt',
      'A voicemail left for a concrete contractor. May mention driveway, patio, ' +
      'slab, foundation, sidewalk, apron, demo, tear-out, rebar, PSI, square feet, ' +
      'an address, or a callback number.'
    )

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
    })
    if (!res.ok) {
      return { ok: false, error: `Groq HTTP ${res.status}: ${(await res.text()).substring(0, 300)}` }
    }
    const data = await res.json()
    const text = (data.text ?? '').trim()
    if (!text) return { ok: false, error: 'Groq returned an empty transcript' }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { limit?: number; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 500)
  const dryRun = body.dry_run === true

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: rows, error: readErr } = await supabase
    .from('voip_calls')
    .select('id, org_id, quo_call_id, recording_url, recording_storage_path, transcript')
    .not('recording_url', 'is', null)
    .or('recording_storage_path.is.null,transcript.is.null')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (readErr) {
    return new Response(JSON.stringify({ error: `read failed: ${readErr.message}` }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const calls = (rows ?? []) as CallRow[]
  if (dryRun) {
    return new Response(JSON.stringify({
      dry_run: true,
      would_process: calls.length,
      need_download: calls.filter(c => !c.recording_storage_path).length,
      need_transcript: calls.filter(c => !c.transcript).length,
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const results: RowResult[] = []

  for (const call of calls) {
    const r: RowResult = {
      call_id: call.id, quo_call_id: call.quo_call_id,
      downloaded: false, transcribed: false,
    }

    let audio: Uint8Array | null = null
    let storagePath = call.recording_storage_path

    // --- download + store (skipped if we already hold a copy) ---
    if (!storagePath) {
      const dl = await downloadRecording(call.recording_url)
      if (!dl.ok) {
        r.error = dl.error; r.stage = 'download'
        console.error(`[backfill] download failed call=${call.quo_call_id}: ${dl.error}`)
        results.push(r); continue
      }
      audio = dl.bytes
      r.bytes = dl.bytes.byteLength

      const path = `${call.org_id}/${call.quo_call_id}.mp3`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, dl.bytes, { contentType: dl.contentType, upsert: true })
      if (upErr) {
        r.error = `upload: ${upErr.message}`; r.stage = 'upload'
        console.error(`[backfill] upload failed call=${call.quo_call_id}: ${upErr.message}`)
        results.push(r); continue
      }

      // recording_url is deliberately NOT touched.
      const { error: pathErr } = await supabase.from('voip_calls')
        .update({ recording_storage_path: path, recording_fetched_at: new Date().toISOString() })
        .eq('id', call.id)
      if (pathErr) {
        r.error = `path update: ${pathErr.message}`; r.stage = 'update'
        results.push(r); continue
      }
      storagePath = path
      r.downloaded = true
    }

    // --- transcribe ---
    if (!call.transcript) {
      if (!audio) {
        // Already had a stored copy from an earlier run — read it back rather
        // than hitting the provider again, whose link may since have expired.
        const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(storagePath!)
        if (dlErr || !blob) {
          r.error = `storage read: ${dlErr?.message ?? 'no data'}`; r.stage = 'transcribe'
          results.push(r); continue
        }
        audio = new Uint8Array(await blob.arrayBuffer())
      }

      const tr = await transcribe(audio, `${call.quo_call_id}.mp3`)
      if (!tr.ok) {
        r.error = tr.error; r.stage = 'transcribe'
        console.error(`[backfill] transcribe failed call=${call.quo_call_id}: ${tr.error}`)
        results.push(r); continue
      }

      const { error: trErr } = await supabase.from('voip_calls').update({
        transcript: tr.text,
        transcribed_at: new Date().toISOString(),
        transcription_model: TRANSCRIPTION_MODEL,
      }).eq('id', call.id)
      if (trErr) {
        r.error = `transcript update: ${trErr.message}`; r.stage = 'update'
        results.push(r); continue
      }
      r.transcribed = true
    }

    results.push(r)
  }

  const failures = results.filter(r => r.error)
  return new Response(JSON.stringify({
    considered: calls.length,
    downloaded: results.filter(r => r.downloaded).length,
    transcribed: results.filter(r => r.transcribed).length,
    failed: failures.length,
    failures_by_stage: failures.reduce((acc, f) => {
      acc[f.stage ?? 'unknown'] = (acc[f.stage ?? 'unknown'] ?? 0) + 1
      return acc
    }, {} as Record<string, number>),
    failures: failures.map(f => ({ quo_call_id: f.quo_call_id, stage: f.stage, error: f.error })),
    results,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
