/**
 * email-intake — the email mirror (migration 061). ScopeCrete, project
 * cxiusuewtrvcpqequueh.
 *
 * Coy forwards bid emails from admin@saccobuilt.com to
 * intake-concrete@agentmail.to; his own Hermes agent reads them for scopes.
 * This function only MIRRORS that inbox (Coy, 2026-10-01). Nothing is
 * extracted.
 *
 * AgentMail webhook (message.received), signed:
 *   1. the signature is checked (Svix scheme, AGENTMAIL_WEBHOOK_SECRET); an
 *      unsigned or badly signed request is refused and nothing is stored;
 *   2. the untouched payload goes into email_events (the raw log, §2a),
 *      keyed on the delivery id so a retry is a no-op; 200 at once;
 *   3. it is projected in the background: the inbox names the org; the
 *      forwarder must be on org_inbound_senders (else quarantined — kept,
 *      files held until Coy files it); the ORIGINAL sender is read from the
 *      forwarded block; an exact address on a contact files it on that contact
 *      and its customer; one customer with that company domain is only a
 *      suggestion; attachments are fetched (AGENTMAIL_API_KEY) into the
 *      private job-files bucket as job_files rows (source 'email') that
 *      Dusty's reader then reads.
 *
 * Worker calls (vault token, as the reader's): {"retry": true} — fetch
 * attachments waiting or failed (three tries) and re-project events that
 * didn't; {"ping": true} — are the key and secret set (yes/no only) and does
 * AgentMail answer; {"reproject": "<email_events id>"} — project one again.
 *
 * Service role inside this function only; no browser reaches it.
 */

import { createClient } from '@supabase/supabase-js'
import { attachmentSkip, bodyFrom, categoryGuess, fileKind, fullName, htmlToText, matchableDomain, originalSender, readMessage, safeName, verifySvix, type Msg } from './rules.ts'

const WORKER = 'email-intake'
const BUCKET = 'job-files'
const PROVIDER = 'agentmail'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const API = (Deno.env.get('AGENTMAIL_API_URL') ?? 'https://api.agentmail.to').replace(/\/+$/, '')

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined
// deno-lint-ignore no-explicit-any
type Sb = any

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function beat(sb: Sb, status: 'ok' | 'not_configured' | 'error', detail: string) {
  await sb.from('sc_worker_heartbeats').upsert({ worker: WORKER, ticked_at: new Date().toISOString(), status, detail: detail.slice(0, 300) })
}

// ── projection ───────────────────────────────────────────────────────────────

/**
 * A big email is delivered with no text or html, only `body_url` (Coy's Walker
 * High forward, 2026-10-02 — stored with an empty body, so the bid reader saw
 * a subject and nothing else). Ask AgentMail for the message itself, then try
 * the body link; whatever answers first with words wins.
 */
async function fetchBody(msg: Msg): Promise<{ text: string | null; html: string | null; why: string | null }> {
  const key = Deno.env.get('AGENTMAIL_API_KEY') ?? ''
  const tries: string[] = []
  if (key && msg.inbox && msg.messageId) {
    try {
      const r = await fetch(`${API}/v0/inboxes/${encodeURIComponent(msg.inbox)}/messages/${encodeURIComponent(msg.messageId)}`, { headers: { Authorization: `Bearer ${key}` } })
      if (r.ok) { const b = bodyFrom(await r.text(), r.headers.get('content-type')); if (b.text || b.html) return { ...b, why: null } ; tries.push('the message API had no body') }
      else tries.push(`the message API answered ${r.status}`)
    } catch (e) { tries.push(`the message API: ${(e as Error).message}`) }
  }
  if (msg.bodyUrl) {
    try {
      const r = await fetch(msg.bodyUrl)
      if (r.ok) { const b = bodyFrom(await r.text(), r.headers.get('content-type')); if (b.text || b.html) return { ...b, why: null }; tries.push('the body link was empty') }
      else tries.push(`the body link answered ${r.status}`)
    } catch (e) { tries.push(`the body link: ${(e as Error).message}`) }
  }
  return { text: null, html: null, why: tries.join('; ') || 'no body in the delivery' }
}

interface EventRow { id: string; org_id: string | null; raw_payload: unknown; attempts: number }

async function project(sb: Sb, ev: EventRow): Promise<string> {
  const msg = readMessage(ev.raw_payload)
  const done = async (patch: Record<string, unknown>) =>
    sb.from('email_events').update({ attempts: ev.attempts + 1, ...patch }).eq('id', ev.id)
  if (msg.eventType && !/received/i.test(msg.eventType)) {
    await done({ projected_at: new Date().toISOString(), projection_error: null })
    return `ignored ${msg.eventType}`
  }
  if (!ev.org_id) { await done({ projection_error: `no org has the inbox ${msg.inbox ?? msg.to.join(', ') ?? '?'}` }); return 'unknown inbox' }
  if (!msg.messageId) { await done({ projection_error: 'no message id in the payload' }); return 'no message id' }
  const org = ev.org_id

  const { data: senders } = await sb.from('org_inbound_senders').select('email').eq('org_id', org)
  const ours = ((senders ?? []) as Array<{ email: string }>).map((s) => s.email)
  const allowed = !!msg.from && ours.includes(msg.from.address)

  let bodyNote: string | null = null
  if (!msg.text && !msg.html) {
    const b = await fetchBody(msg)
    msg.text = b.text; msg.html = b.html; bodyNote = b.why
  }
  const text = msg.text ?? (msg.html ? htmlToText(msg.html) : null)
  // A forward names its writer in the forwarded block; an email straight from someone else is its own writer.
  const orig = originalSender(text) ?? (allowed ? null : msg.from)

  let contactId: string | null = null, customerId: string | null = null, suggested: string | null = null
  let match: 'exact' | 'domain_suggested' | 'none' = 'none', note: string | null = null
  if (orig) {
    const { data: hit } = await sb.from('contact_emails').select('contact_id').eq('org_id', org).eq('email', orig.address).limit(5)
    for (const h of (hit ?? []) as Array<{ contact_id: string }>) {
      const { data: c } = await sb.from('contacts').select('id, customer_id, merged_into_contact_id').eq('org_id', org).eq('id', h.contact_id).maybeSingle()
      if (!c) continue
      const person = c.merged_into_contact_id
        ? (await sb.from('contacts').select('id, customer_id').eq('org_id', org).eq('id', c.merged_into_contact_id).maybeSingle()).data
        : c
      if (person) { contactId = person.id; customerId = person.customer_id ?? null; match = 'exact'; note = `${orig.address} is on their contact`; break }
    }
    if (!contactId) {
      const domain = matchableDomain(orig.address, ours)
      if (domain) {
        const { data: same } = await sb.from('contact_emails').select('contact_id').eq('org_id', org).ilike('email', `%@${domain}`).limit(50)
        const ids = [...new Set(((same ?? []) as Array<{ contact_id: string }>).map((r) => r.contact_id))]
        if (ids.length) {
          const { data: cs } = await sb.from('contacts').select('customer_id').eq('org_id', org).in('id', ids).is('merged_into_contact_id', null)
          const custs = [...new Set(((cs ?? []) as Array<{ customer_id: string | null }>).map((c) => c.customer_id).filter(Boolean))] as string[]
          if (custs.length === 1) { suggested = custs[0]; match = 'domain_suggested'; note = `same company domain (${domain}); ${orig.address} isn't on a contact yet` }
          else if (custs.length > 1) note = `${domain} is on more than one customer — not guessing`
        }
      }
    }
    // Their whole name on exactly one person (Coy, 2026-10-05: John Freeling's MSA sat unfiled because his
    // address wasn't on his contact yet). Filed as Auto with the reason; never against a different company
    // the domain points at, and never between two people of the same name.
    const whole = fullName(orig.name)
    if (!contactId && whole) {
      const { data: same } = await sb.from('contacts').select('id, customer_id').eq('org_id', org)
        .ilike('name', whole.replace(/[\\%_]/g, (c) => `\\${c}`)).is('merged_into_contact_id', null).is('archived_at', null).limit(3)
      const people = (same ?? []) as Array<{ id: string; customer_id: string | null }>
      if (people.length === 1 && (!suggested || suggested === people[0].customer_id)) {
        contactId = people[0].id; customerId = people[0].customer_id ?? null; suggested = null; match = 'exact'
        note = `${whole} is the only contact by that name (${orig.address} isn't on them yet)`
      } else if (people.length > 1) note = `${note ? `${note} · ` : ''}more than one contact is named ${whole} — not guessing`
    }
  }
  const status = !allowed ? 'quarantined' : match === 'exact' ? 'filed' : 'unfiled'

  const row = {
    org_id: org, event_id: ev.id, provider: PROVIDER, provider_message_id: msg.messageId, inbox: msg.inbox,
    from_address: msg.from?.address ?? null, from_name: msg.from?.name ?? null,
    original_from_address: orig?.address ?? null, original_from_name: orig?.name ?? null,
    subject: msg.subject?.slice(0, 1000) ?? null, text_body: text?.slice(0, 200_000) ?? null,
    sent_at: msg.sentAt && !Number.isNaN(Date.parse(msg.sentAt)) ? new Date(msg.sentAt).toISOString() : null,
    contact_id: contactId, customer_id: customerId, suggested_customer_id: suggested, match,
    match_note: !allowed ? `forwarded by ${msg.from?.address ?? 'an unknown sender'}, not one of the org's forwarding addresses${note ? ` · ${note}` : ''}` : note,
    status, filed_at: status === 'filed' ? new Date().toISOString() : null,
  }
  const { data: existing } = await sb.from('emails').select('id').eq('provider', PROVIDER).eq('provider_message_id', msg.messageId).maybeSingle()
  let emailId: string
  if (existing) {
    emailId = existing.id
    // Re-projected (its body arrived, or the rules got better): fill what was blank, file what nobody has
    // filed — never overwrite Coy's filing (match 'coy').
    const { data: cur } = await sb.from('emails').select('text_body, original_from_address, status, match, filed_by').eq('id', emailId).maybeSingle()
    const open = cur && cur.status === 'unfiled' && cur.match !== 'coy' && !cur.filed_by
    if (cur && ((!cur.text_body && row.text_body) || (open && (row.status === 'filed' || row.match === 'domain_suggested')) || (!cur.original_from_address && row.original_from_address))) {
      await sb.from('emails').update({
        ...(!cur.text_body && row.text_body ? { text_body: row.text_body } : {}),
        ...(cur.original_from_address ? {} : { original_from_address: row.original_from_address, original_from_name: row.original_from_name }),
        ...(open && row.status === 'filed' ? { contact_id: row.contact_id, customer_id: row.customer_id, match: row.match, match_note: row.match_note, status: 'filed', filed_at: row.filed_at } : {}),
        ...(open && row.match === 'domain_suggested' ? { suggested_customer_id: row.suggested_customer_id, match: row.match, match_note: row.match_note } : {}),
      }).eq('id', emailId)
      // Its files follow a filing made here (fetched before it was filed, they were on nobody).
      if (open && row.status === 'filed') {
        await sb.from('job_files').update({ contact_id: row.contact_id, customer_id: row.customer_id }).eq('org_id', org).eq('email_id', emailId).is('job_id', null).is('contact_id', null).is('customer_id', null)
      }
    }
  } else {
    const { data: made, error } = await sb.from('emails').insert(row).select('id').single()
    if (error || !made) { await done({ projection_error: `email row: ${error?.message ?? 'not saved'}`.slice(0, 300) }); return 'email insert failed' }
    emailId = made.id
  }
  for (const a of msg.attachments) {
    const skip = attachmentSkip(a)
    await sb.from('email_attachments').upsert({
      org_id: org, email_id: emailId, provider_attachment_id: a.id, name: a.name.slice(0, 300), mime_type: a.mime, byte_size: a.size, inline: a.inline,
      fetch_state: skip ? 'skipped' : status === 'quarantined' ? 'held' : 'waiting', fetch_error: skip,
    }, { onConflict: 'email_id,provider_attachment_id', ignoreDuplicates: true })
  }
  await done({ projected_at: new Date().toISOString(), projection_error: text ? null : `no body: ${bodyNote ?? 'none in the delivery'}`.slice(0, 300) })
  if (status !== 'quarantined') await fetchDue(sb, { emailId })
  return status
}

// ── attachments ──────────────────────────────────────────────────────────────

interface AttRow { id: string; org_id: string; email_id: string; provider_attachment_id: string; name: string; mime_type: string | null; byte_size: number | null; attempts: number }
interface EmailRow { id: string; inbox: string | null; provider_message_id: string; job_id: string | null; contact_id: string | null; customer_id: string | null; raw_inbox?: string | null }

async function download(key: string, email: EmailRow, att: AttRow): Promise<{ bytes: Uint8Array; mime: string | null }> {
  const inbox = encodeURIComponent(email.inbox ?? '')
  const url = `${API}/v0/inboxes/${inbox}/messages/${encodeURIComponent(email.provider_message_id)}/attachments/${encodeURIComponent(att.provider_attachment_id)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`AgentMail ${res.status} for the attachment${res.status === 401 || res.status === 403 ? ' — check AGENTMAIL_API_KEY' : ''}`)
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    // deno-lint-ignore no-explicit-any
    const body: any = await res.json()
    const link = body.download_url ?? body.url ?? body.signed_url
    if (typeof link === 'string') {
      const r2 = await fetch(link)
      if (!r2.ok) throw new Error(`the attachment's download link answered ${r2.status}`)
      return { bytes: new Uint8Array(await r2.arrayBuffer()), mime: body.content_type ?? r2.headers.get('content-type') }
    }
    const b64 = body.content ?? body.data
    if (typeof b64 === 'string') {
      const bin = atob(b64.replace(/^data:[^,]+,/, ''))
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return { bytes: out, mime: body.content_type ?? null }
    }
    throw new Error(`AgentMail answered JSON with no file in it (keys: ${Object.keys(body).slice(0, 8).join(', ')})`)
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: type || null }
}

async function fetchOne(sb: Sb, key: string, att: AttRow, email: EmailRow): Promise<boolean> {
  const now = new Date().toISOString()
  try {
    const { bytes, mime } = await download(key, email, att)
    if (bytes.length > 100 * 1024 * 1024) throw new Error('over 100 MB')
    const fileMime = att.mime_type ?? mime ?? null
    const kind = fileKind(fileMime, att.name)
    const fileId = crypto.randomUUID()
    const path = `${att.org_id}/email/${email.id}/${fileId}/${safeName(att.name)}`
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: fileMime ?? 'application/octet-stream', upsert: false })
    if (up.error) throw new Error(`storage: ${up.error.message}`)
    const { error } = await sb.from('job_files').insert({
      id: fileId, org_id: att.org_id, job_id: email.job_id, contact_id: email.contact_id, customer_id: email.customer_id,
      name: att.name, kind, mime_type: fileMime, byte_size: bytes.length, storage_path: path,
      source: 'email', email_id: email.id, category: categoryGuess(kind, att.name),
      fetch_state: 'fetched', captured_at: now, read_state: 'waiting',
      in_plan_room: kind === 'pdf' && !!email.job_id,
    })
    if (error) { await sb.storage.from(BUCKET).remove([path]); throw new Error(`file row: ${error.message}`) }
    await sb.from('email_attachments').update({ fetch_state: 'fetched', file_id: fileId, fetch_error: null, attempts: att.attempts + 1, last_try_at: now }).eq('id', att.id)
    return true
  } catch (e) {
    await sb.from('email_attachments').update({ fetch_state: 'failed', fetch_error: (e as Error).message.slice(0, 300), attempts: att.attempts + 1, last_try_at: now }).eq('id', att.id)
    return false
  }
}

/** Fetch what is due: one email's waiting files, or (retry) everything waiting, or failed under three tries and 10+ minutes old. */
async function fetchDue(sb: Sb, opts: { emailId?: string }) {
  const key = Deno.env.get('AGENTMAIL_API_KEY') ?? ''
  if (!key) { await beat(sb, 'not_configured', 'AGENTMAIL_API_KEY is not set — attachments wait'); return { fetched: 0, failed: 0, waiting: true } }
  let q = sb.from('email_attachments').select('id, org_id, email_id, provider_attachment_id, name, mime_type, byte_size, attempts')
  if (opts.emailId) q = q.eq('email_id', opts.emailId).eq('fetch_state', 'waiting')
  else q = q.or(`fetch_state.eq.waiting,and(fetch_state.eq.failed,attempts.lt.3,last_try_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()})`)
  const { data: due } = await q.order('created_at').limit(20)
  let fetched = 0, failed = 0
  for (const a of (due ?? []) as AttRow[]) {
    const { data: email } = await sb.from('emails').select('id, inbox, provider_message_id, job_id, contact_id, customer_id, status').eq('id', a.email_id).maybeSingle()
    if (!email || email.status === 'quarantined') continue
    if (await fetchOne(sb, key, a, email as EmailRow)) fetched++; else failed++
  }
  return { fetched, failed }
}

// ── the door ─────────────────────────────────────────────────────────────────

async function orgForInbox(sb: Sb, msg: Msg): Promise<string | null> {
  const candidates = [msg.inbox, ...msg.to].filter((x): x is string => !!x).map((x) => x.toLowerCase())
  if (!candidates.length) return null
  const { data } = await sb.from('org_inbound_addresses').select('address, org_id').in('address', candidates).limit(1)
  return ((data ?? []) as Array<{ org_id: string }>)[0]?.org_id ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const body = await req.text()

  // Worker calls carry the vault token, like the reader's.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (bearer && !req.headers.get('svix-id') && !req.headers.get('webhook-id')) {
    const { data: ok } = await sb.rpc('sc_enrich_worker_authorized', { p_token: bearer })
    if (ok !== true) return json({ error: 'unauthorized' }, 401)
    // deno-lint-ignore no-explicit-any
    let cmd: any = {}
    try { cmd = JSON.parse(body || '{}') } catch { /* empty */ }
    if (cmd.ping) {
      const key = Deno.env.get('AGENTMAIL_API_KEY') ?? ''
      let agentmail = 'not checked (no key)'
      if (key) {
        try { const r = await fetch(`${API}/v0/inboxes?limit=1`, { headers: { Authorization: `Bearer ${key}` } }); agentmail = `HTTP ${r.status}` }
        catch (e) { agentmail = `unreachable: ${(e as Error).message}`.slice(0, 120) }
      }
      return json({ api_key_set: !!key, webhook_secret_set: !!Deno.env.get('AGENTMAIL_WEBHOOK_SECRET'), agentmail })
    }
    if (typeof cmd.reproject === 'string') {
      const { data: ev } = await sb.from('email_events').select('id, org_id, raw_payload, attempts').eq('id', cmd.reproject).maybeSingle()
      if (!ev) return json({ error: 'no such event' }, 404)
      return json({ result: await project(sb, ev as EventRow) })
    }
    // retry: events that never projected (three tries), then files due.
    const { data: stuck } = await sb.from('email_events').select('id, org_id, raw_payload, attempts').is('projected_at', null).lt('attempts', 3)
      .lt('received_at', new Date(Date.now() - 2 * 60_000).toISOString()).order('received_at').limit(10)
    const projected: string[] = []
    for (const ev of (stuck ?? []) as EventRow[]) projected.push(await project(sb, ev))
    const files = await fetchDue(sb, {})
    if (files.failed) await beat(sb, 'error', `${files.failed} attachment(s) failed to fetch — see email_attachments.fetch_error`)
    else if (!('waiting' in files)) await beat(sb, 'ok', projected.length || files.fetched ? `retried: ${projected.length} email(s), ${files.fetched} file(s)` : 'nothing due')
    return json({ projected, ...files })
  }

  // A webhook delivery: signed, or nothing.
  const secret = Deno.env.get('AGENTMAIL_WEBHOOK_SECRET') ?? ''
  if (!secret) { await beat(sb, 'not_configured', 'AGENTMAIL_WEBHOOK_SECRET is not set — deliveries refused'); return json({ error: 'not configured' }, 503) }
  const h = {
    id: req.headers.get('svix-id') ?? req.headers.get('webhook-id'),
    timestamp: req.headers.get('svix-timestamp') ?? req.headers.get('webhook-timestamp'),
    signature: req.headers.get('svix-signature') ?? req.headers.get('webhook-signature'),
  }
  const v = await verifySvix(secret, h, body)
  if (!v.ok) {
    // Header NAMES only — never values — so a different signing scheme shows itself.
    const names = [...req.headers.keys()].filter((k) => !/^(authorization|cookie|x-forwarded|cf-|x-real-ip)/i.test(k)).join(', ')
    await beat(sb, 'error', `refused a delivery (${v.why}); headers: ${names}`)
    return json({ error: 'unauthorized' }, 401)
  }

  // deno-lint-ignore no-explicit-any
  let payload: any
  try { payload = JSON.parse(body) } catch { return json({ error: 'not JSON' }, 400) }
  const msg = readMessage(payload)
  const org = await orgForInbox(sb, msg)
  const eventKey = h.id ?? msg.eventId ?? msg.messageId ?? crypto.randomUUID()
  const { data: ev, error } = await sb.from('email_events')
    .upsert({ org_id: org, provider: PROVIDER, provider_event_id: eventKey, event_type: msg.eventType, raw_payload: payload, verified: true },
      { onConflict: 'provider,provider_event_id', ignoreDuplicates: true })
    .select('id, org_id, raw_payload, attempts').maybeSingle()
  if (error) { await beat(sb, 'error', `raw log insert failed: ${error.message}`); return json({ error: 'not stored' }, 500) }
  if (!ev) return json({ ok: true, duplicate: true })

  const work = project(sb, ev as EventRow)
    .then(async (r) => { await beat(sb, 'ok', `last email: ${r}`) })
    .catch(async (e) => { await sb.from('email_events').update({ projection_error: `threw: ${(e as Error).message}`.slice(0, 300), attempts: 1 }).eq('id', ev.id); await beat(sb, 'error', `projection threw: ${(e as Error).message}`) })
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work); else await work
  return json({ ok: true })
})
