/**
 * bid-intake — a forwarded bid email becomes the job (migration 063).
 * ScopeCrete, project cxiusuewtrvcpqequueh.
 *
 * Coy, 2026-10-01: "fully automatic … this should replace the Hermes agent
 * because this system should become my harness for quote." pg_cron calls this
 * every minute with the enricher's vault token. Each call claims bid packages
 * (sc_bid_claim opens one per mirrored email) and moves each along:
 *
 *   waiting    the email's own attachments have arrived (email-intake fetches them)
 *   listing    Box shared links in the email → the folder's files (Box API, client credentials)
 *   fetching   each Box file → the private `job-files` bucket, a job_files row (a .zip unpacked)
 *   scanning   each PDF read page by page: title blocks (sheets.ts, the app's reader) and
 *              the pages that talk about concrete or the bid
 *   extracting one Hermes call → bid facts + concrete scope; sanitizeBid() keeps only what is written
 *   filing     the customer, contact and job (made when there is none), the scope as sections,
 *              the files on the job (drawings in the Plan Room, sheets read), the email filed
 *
 * Everything it makes is listed on the package (`created`) so Coy's Undo
 * (sc_undo_bid) takes it back. Service role inside this function only; no
 * browser reaches it. `{"ping": true}` reports what is configured;
 * `{"package": id}` runs one package now; `{"retry": id}` puts a failed one back.
 */

import { createClient } from '@supabase/supabase-js'
import { getDocumentProxy } from 'unpdf'
import { unzipSync } from 'fflate'
import { itemQuantity,
  BID_PROMPT_VERSION, SYSTEM_PROMPT, boxLinks, bidPage, categoryGuess, concretePage, docRole, fileKind,
  matchableDomain, parseReply, projectKey, safeName, sanitizeBid, skipBoxFile, type BidFacts,
} from './rules.ts'
import { readSheet, type TextItem } from './sheets.ts'

const WORKER = 'bid-intake'
const DEFAULT_HERMES_URL = 'https://srv1594563.tail0f2914.ts.net:8443'
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
const BUDGET_MS = 50_000
const BUCKET = 'job-files'
const SCAN_MARK = 'reading…'
const BUFFER_MAX = 40 * 1024 * 1024   // read into memory (and scan) up to this; bigger files stream
const ZIP_MAX = 60 * 1024 * 1024
const MAX_FILES = 400
const PROMPT_CHARS = 110_000
const OURS = ['Sacco', 'ScopeCrete', 'Coy Sacco']
const OUR_EMAILS = ['admin@saccobuilt.com', 'coysacco@gmail.com']

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined
// deno-lint-ignore no-explicit-any
type Sb = any
interface Pkg {
  id: string; org_id: string; email_id: string; state: string; box_url: string | null; box_folder_id: string | null; box_folder_name?: string | null
  facts: BidFacts | null; created: Record<string, unknown>; attempts: number; job_id: string | null
}
interface Email {
  id: string; org_id: string; subject: string | null; text_body: string | null; from_address: string | null
  original_from_address: string | null; original_from_name: string | null; contact_id: string | null; customer_id: string | null
  job_id: string | null; status: string; match: string; created_at: string
}
interface PFile {
  id: string; package_id: string; org_id: string; box_file_id: string | null; path: string | null; name: string; byte_size: number | null
  role: string | null; job_file_id: string | null; fetch_state: string; scan_state: string; scan_error: string | null; attempts: number
  pages: Array<Record<string, unknown>> | null; text_excerpt: string | null
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString()

async function beat(sb: Sb, status: 'ok' | 'not_configured' | 'hermes_unreachable' | 'error', detail: string) {
  await sb.from('sc_worker_heartbeats').upsert({ worker: WORKER, ticked_at: new Date().toISOString(), status, detail: detail.slice(0, 300) })
}

async function setPkg(sb: Sb, id: string, patch: Record<string, unknown>) {
  await sb.from('bid_packages').update({ claimed_at: null, ...patch }).eq('id', id)
}

// ── Box ──────────────────────────────────────────────────────────────────────

const BOX = 'https://api.box.com'
let boxTok: { token: string; until: number } | null = null

function boxConfigured() {
  return !!(Deno.env.get('BOX_CLIENT_ID') && Deno.env.get('BOX_CLIENT_SECRET') && Deno.env.get('BOX_SUBJECT_ID'))
}

/** Client Credentials Grant — the app Coy made and authorised in his own Box account. */
async function boxToken(): Promise<string> {
  if (boxTok && boxTok.until > Date.now() + 60_000) return boxTok.token
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: Deno.env.get('BOX_CLIENT_ID') ?? '',
    client_secret: Deno.env.get('BOX_CLIENT_SECRET') ?? '',
    box_subject_type: Deno.env.get('BOX_SUBJECT_TYPE') || 'enterprise',
    box_subject_id: Deno.env.get('BOX_SUBJECT_ID') ?? '',
  })
  const r = await fetch(`${BOX}/oauth2/token`, { method: 'POST', body: form })
  if (!r.ok) throw new Error(`Box refused the app's keys (HTTP ${r.status}) — check BOX_CLIENT_ID / SECRET / SUBJECT_ID and that the app is authorised`)
  const b = await r.json() as { access_token: string; expires_in: number }
  boxTok = { token: b.access_token, until: Date.now() + (b.expires_in ?? 3600) * 1000 }
  return b.access_token
}

async function boxGet(path: string, link: string) {
  const r = await fetch(`${BOX}/2.0${path}`, { headers: { Authorization: `Bearer ${await boxToken()}`, BoxApi: `shared_link=${link}` } })
  if (r.status === 404 || r.status === 403) throw new Error(`Box says the link isn't shared with "people with the link" (HTTP ${r.status})`)
  if (!r.ok) throw new Error(`Box HTTP ${r.status} on ${path.split('?')[0]}`)
  // deno-lint-ignore no-explicit-any
  return await r.json() as any
}

/** Every file under a shared folder (recursively), with its path. */
async function listBox(link: string, folderId: string | null): Promise<{ name: string; folderId: string | null; files: Array<{ id: string; name: string; size: number | null; path: string }> }> {
  const root = folderId ? await boxGet(`/folders/${folderId}?fields=id,type,name`, link) : await boxGet('/shared_items?fields=id,type,name,size', link)
  if (root.type === 'file') return { name: root.name, folderId: null, files: [{ id: String(root.id), name: root.name, size: root.size ?? null, path: root.name }] }
  const files: Array<{ id: string; name: string; size: number | null; path: string }> = []
  const walk = async (id: string, prefix: string, depth: number) => {
    for (let offset = 0; offset < 5000 && files.length < MAX_FILES; offset += 1000) {
      const page = await boxGet(`/folders/${id}/items?fields=id,type,name,size&limit=1000&offset=${offset}`, link)
      for (const e of page.entries ?? []) {
        if (e.type === 'file') files.push({ id: String(e.id), name: e.name, size: e.size ?? null, path: `${prefix}${e.name}` })
        else if (e.type === 'folder' && depth < 6) await walk(String(e.id), `${prefix}${e.name}/`, depth + 1)
        if (files.length >= MAX_FILES) return
      }
      if ((page.entries ?? []).length < 1000) return
    }
  }
  await walk(String(root.id), '', 0)
  return { name: root.name, folderId: String(root.id), files }
}

// ── storage ──────────────────────────────────────────────────────────────────

async function storeFile(sb: Sb, pkg: Pkg, email: Email, name: string, mime: string | null, body: Uint8Array | ReadableStream<Uint8Array>, size: number | null, role: string): Promise<string> {
  const kind = fileKind(mime, name)
  const fileId = crypto.randomUUID()
  const path = `${pkg.org_id}/bid/${pkg.id}/${fileId}/${safeName(name)}`
  const type = mime ?? (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream')
  if (body instanceof Uint8Array) {
    const up = await sb.storage.from(BUCKET).upload(path, body, { contentType: type, upsert: false })
    if (up.error) throw new Error(`storage: ${up.error.message}`)
  } else {
    // Streamed straight through: a 90 MB plan set never sits in memory.
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', body,
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': type, 'x-upsert': 'false', ...(size ? { 'Content-Length': String(size) } : {}) },
      // deno-lint-ignore no-explicit-any
      ...({ duplex: 'half' } as any),
    })
    if (!r.ok) throw new Error(`storage HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`)
  }
  const drawings = role === 'drawings'
  const { error } = await sb.from('job_files').insert({
    id: fileId, org_id: pkg.org_id, job_id: pkg.job_id, contact_id: email.contact_id, customer_id: email.customer_id,
    name: name.slice(0, 200), kind, mime_type: type, byte_size: body instanceof Uint8Array ? body.length : size, storage_path: path,
    source: 'email', email_id: email.id,
    category: role === 'spec' ? 'spec' : role === 'itb' ? 'bid' : drawings && kind === 'pdf' ? 'plan' : categoryGuess(kind, name),
    fetch_state: 'fetched', captured_at: new Date().toISOString(),
    // Drawings are read here, for the scope; Dusty's file reader reads the rest.
    read_state: drawings && kind === 'pdf' ? 'skipped' : 'waiting',
    read_error: drawings && kind === 'pdf' ? 'plan sheets — read by the bid reader for the scope and the Plan Room' : null,
    in_plan_room: drawings && kind === 'pdf' && !!pkg.job_id,
  })
  if (error) { await sb.storage.from(BUCKET).remove([path]); throw new Error(`file row: ${error.message}`) }
  const made = (pkg.created.file_ids as string[] | undefined) ?? []
  pkg.created = { ...pkg.created, file_ids: [...made, fileId] }
  await sb.from('bid_packages').update({ created: pkg.created }).eq('id', pkg.id)
  return fileId
}

async function fetchBoxFile(sb: Sb, pkg: Pkg, email: Email, f: PFile) {
  const tok = await boxToken()
  const r = await fetch(`${BOX}/2.0/files/${f.box_file_id}/content`, { headers: { Authorization: `Bearer ${tok}`, BoxApi: `shared_link=${pkg.box_url}` } })
  if (!r.ok || !r.body) throw new Error(`Box download HTTP ${r.status}`)
  const mime = r.headers.get('content-type')
  const size = Number(r.headers.get('content-length')) || f.byte_size
  if (/\.zip$/i.test(f.name)) {
    if ((size ?? 0) > ZIP_MAX) throw new Error(`a ${Math.round((size ?? 0) / 1e6)} MB zip — too big to unpack here; download it from Box and drop the files in the Plan Room`)
    const entries = unzipSync(new Uint8Array(await r.arrayBuffer()))
    let n = 0
    for (const [entry, bytes] of Object.entries(entries)) {
      const base = entry.split('/').pop() ?? entry
      if (!base || entry.endsWith('/') || skipBoxFile(base, bytes.length) || /^__MACOSX\//.test(entry)) continue
      const role = docRole(base, null)
      const id = await storeFile(sb, pkg, email, base, null, bytes, bytes.length, role)
      await sb.from('bid_package_files').insert({ org_id: pkg.org_id, package_id: pkg.id, box_file_id: `${f.box_file_id}:${entry}`.slice(0, 300), path: `${f.path ?? f.name}/${entry}`, name: base, byte_size: bytes.length, role, job_file_id: id, fetch_state: 'fetched' })
      n++
    }
    await sb.from('bid_package_files').update({ fetch_state: 'fetched', scan_state: 'skipped', scan_error: `unpacked: ${n} file(s)`, attempts: f.attempts + 1 }).eq('id', f.id)
    return
  }
  const body = (size ?? Infinity) <= BUFFER_MAX ? new Uint8Array(await r.arrayBuffer()) : r.body
  const id = await storeFile(sb, pkg, email, f.name, mime, body, size, f.role ?? 'other')
  await sb.from('bid_package_files').update({ fetch_state: 'fetched', job_file_id: id, fetch_error: null, attempts: f.attempts + 1 }).eq('id', f.id)
}

// ── reading a PDF page by page ───────────────────────────────────────────────

async function scanPdf(sb: Sb, f: PFile): Promise<{ pages: Array<Record<string, unknown>>; excerpt: string }> {
  const { data: jf } = await sb.from('job_files').select('storage_path, byte_size').eq('id', f.job_file_id).maybeSingle()
  if (!jf) throw new Error('the stored file is gone')
  const { data: blob, error } = await sb.storage.from(BUCKET).download(jf.storage_path)
  if (error || !blob) throw new Error(`couldn't open the stored file: ${error?.message ?? 'missing'}`)
  const doc = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()))
  const pages: Array<Record<string, unknown>> = []
  const parts: string[] = []
  let chars = 0
  const cap = f.role === 'drawings' ? 30_000 : f.role === 'itb' ? 25_000 : 45_000
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i)
      const v = p.getViewport({ scale: 1 })
      const tc = await p.getTextContent()
      const items: TextItem[] = []
      for (const raw of tc.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
        if (!raw.str || !raw.transform) continue
        const [x, y] = v.convertToViewportPoint(raw.transform[4], raw.transform[5])
        const h = Math.abs(raw.height || Math.hypot(raw.transform[2], raw.transform[3])) || 8
        items.push({ str: raw.str, x, y: y - h, w: Math.abs(raw.width ?? raw.str.length * h * 0.5), h })
      }
      const text = items.map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim()
      let label = `${f.name} · p.${i}`
      if (f.role === 'drawings') {
        const s = readSheet(items, v.width, v.height)
        pages.push({ page: i, page_w: v.width, page_h: v.height, number: s.number, title: s.title, discipline: s.discipline,
          scale_text: s.scale?.text ?? null, printed_ft_per_pt: s.scale?.kind === 'scale' ? s.scale.ft_per_pt : null })
        if (s.number) label += ` · ${s.number}${s.title ? ` ${s.title}` : ''}`
      }
      const wanted = f.role === 'itb' ? (i <= 4 || bidPage(text) || concretePage(text)) : (concretePage(text) || (i <= 2 && bidPage(text)))
      if (wanted && text.length > 20 && chars < cap) {
        const chunk = text.slice(0, f.role === 'drawings' ? 3_000 : 6_000)
        parts.push(`[${label}] ${chunk}`)
        chars += chunk.length
      }
      p.cleanup()
    }
  } finally {
    // unpdf's proxy may not carry destroy(); a missing one must never fail a read that already finished.
    try { await (doc as { destroy?: () => Promise<void> }).destroy?.() } catch { /* nothing to free */ }
  }
  return { pages, excerpt: parts.join('\n') }
}

// ── Hermes ───────────────────────────────────────────────────────────────────

interface Cfg { url: string; key: string; model: string }
const cfg = (): Cfg => ({ url: Deno.env.get('HERMES_URL') || DEFAULT_HERMES_URL, key: Deno.env.get('HERMES_API_KEY') ?? '', model: Deno.env.get('HERMES_MODEL') || DEFAULT_MODEL })

async function hermesUp(c: Cfg): Promise<string | null> {
  if (!c.key) return 'HERMES_API_KEY is not set'
  try { const r = await fetch(`${c.url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(10_000) }); return r.ok ? null : `Hermes /health ${r.status}` }
  catch (e) { return `Hermes unreachable: ${(e as Error).message}`.slice(0, 160) }
}

async function ask(c: Cfg, user: string): Promise<{ ok: true; raw: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${c.url.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(110_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify({ model: c.model, stream: false, temperature: 0.1, max_tokens: 6000,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }] }),
    })
    if (!res.ok) return { ok: false, error: `Hermes HTTP ${res.status}` }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content ?? ''
    return raw.trim() ? { ok: true, raw } : { ok: false, error: 'Hermes returned an empty answer' }
  } catch (e) {
    return { ok: false, error: (e as Error).name === 'TimeoutError' ? 'Hermes timed out' : `couldn't reach Hermes: ${(e as Error).message}`.slice(0, 160) }
  }
}

// ── filing: the customer, the contact, the job, the scope ───────────────────

async function file(sb: Sb, pkg: Pkg, email: Email, files: PFile[]) {
  const f = pkg.facts as BidFacts
  const org = pkg.org_id
  const created: Record<string, unknown> = { ...pkg.created }
  const estEmail = (f.estimator.email ?? email.original_from_address ?? null)?.toLowerCase() ?? null
  const estName = f.estimator.name ?? email.original_from_name ?? null
  const ours = (e: string | null) => !!e && OUR_EMAILS.includes(e)

  // Who it is from: the email's own match, else the estimator's address, else the company's domain.
  let contactId: string | null = email.contact_id
  let customerId: string | null = email.customer_id
  if (!contactId && estEmail && !ours(estEmail)) {
    const { data: hit } = await sb.from('contact_emails').select('contact_id').eq('org_id', org).eq('email', estEmail).limit(1)
    const cid = hit?.[0]?.contact_id
    if (cid) {
      const { data: c } = await sb.from('contacts').select('id, customer_id, merged_into_contact_id').eq('id', cid).maybeSingle()
      const person = c?.merged_into_contact_id ? (await sb.from('contacts').select('id, customer_id').eq('id', c.merged_into_contact_id).maybeSingle()).data : c
      if (person) { contactId = person.id; customerId = customerId ?? person.customer_id ?? null }
    }
  }
  const phone = f.estimator.phone ? `+1${f.estimator.phone.replace(/\D/g, '').slice(-10)}` : null
  if (!contactId && phone) {
    // Their number is already one of Coy's contacts: that is the person — and their customer is the
    // customer (Dylan's work line had texted before; 2026-10-02 the reader made a second customer).
    const { data: byPhone } = await sb.from('contacts').select('id, customer_id, merged_into_contact_id').eq('org_id', org).eq('phone', phone).limit(1)
    let p = byPhone?.[0] as { id: string; customer_id: string | null; merged_into_contact_id: string | null } | undefined
    if (!p) {
      const { data: alt } = await sb.from('contact_phones').select('contact_id').eq('org_id', org).eq('phone_e164', phone).limit(1)
      const cid = alt?.[0]?.contact_id
      if (cid) p = (await sb.from('contacts').select('id, customer_id, merged_into_contact_id').eq('id', cid).maybeSingle()).data ?? undefined
    }
    if (p?.merged_into_contact_id) p = (await sb.from('contacts').select('id, customer_id, merged_into_contact_id').eq('id', p.merged_into_contact_id).maybeSingle()).data ?? p
    if (p) { contactId = p.id; customerId = customerId ?? p.customer_id ?? null }
  }
  if (contactId && !customerId) customerId = (await sb.from('contacts').select('customer_id').eq('id', contactId).maybeSingle()).data?.customer_id ?? null
  if (!customerId && estEmail && !ours(estEmail)) {
    const domain = matchableDomain(estEmail, OUR_EMAILS)
    if (domain) {
      const { data: same } = await sb.from('contact_emails').select('contact_id').eq('org_id', org).ilike('email', `%@${domain}`).limit(50)
      const ids = [...new Set((same ?? []).map((r: { contact_id: string }) => r.contact_id))]
      if (ids.length) {
        const { data: cs } = await sb.from('contacts').select('customer_id').eq('org_id', org).in('id', ids).is('merged_into_contact_id', null)
        const custs = [...new Set((cs ?? []).map((c: { customer_id: string | null }) => c.customer_id).filter(Boolean))] as string[]
        if (custs.length === 1) customerId = custs[0]
      }
    }
  }
  // A customer of its own when there is none — named, or not made (a customer has a name).
  if (!customerId) {
    const name = f.gc_company ?? estName
    if (name) {
      const { data: cu, error } = await sb.from('customers').insert({
        org_id: org, name, kind: f.gc_company ? 'company' : 'person', customer_type: 'commercial', lead_source: 'gc_invite',
        relation: 'customer', relation_source: 'default',
      }).select('id').single()
      if (error) throw new Error(`customer: ${error.message}`)
      customerId = cu.id
      created.customer_id = cu.id
    }
  }
  // An existing customer or contact with a blank is filled in from the bid as written — never
  // overwritten. What was filled is listed on the package so Undo bid can blank it again.
  if (customerId && f.gc_company && !created.customer_id) {
    const { data: cu } = await sb.from('customers').select('id, name, kind, customer_type').eq('id', customerId).maybeSingle()
    if (cu && !cu.name) {
      await sb.from('customers').update({ name: f.gc_company, kind: 'company', customer_type: cu.customer_type ?? 'commercial' }).eq('id', cu.id)
      created.filled_customer = { id: cu.id, kind: cu.kind, customer_type: cu.customer_type }
    }
  }
  if (contactId && !created.contact_id) {
    const { data: ct } = await sb.from('contacts').select('id, name, name_source').eq('id', contactId).maybeSingle()
    const fill: Record<string, unknown> = {}
    // Their own signature on their own email: the person saying who they are (§2b's self-introduction rule).
    if (ct && !ct.name && estName && ct.name_source !== 'human') { fill.name = estName; fill.name_source = 'machine' }
    if (Object.keys(fill).length) await sb.from('contacts').update(fill).eq('id', contactId)
    let addedEmail: string | null = null
    if (estEmail && !ours(estEmail)) {
      const { data: has } = await sb.from('contact_emails').select('contact_id').eq('org_id', org).eq('email', estEmail).limit(1)
      if (!has?.length) {
        const { error } = await sb.from('contact_emails').insert({ org_id: org, contact_id: contactId, email: estEmail, is_primary: true, source: 'inbound_email' })
        if (!error) addedEmail = estEmail
      }
    }
    if (fill.name || addedEmail) created.filled_contact = { id: contactId, name: !!fill.name, email: addedEmail }
  }
  if (!contactId && customerId && (estName || estEmail) && !ours(estEmail)) {
    const now = new Date().toISOString()
    const { data: ct, error } = await sb.from('contacts').insert({
      org_id: org, name: estName, email: estEmail, phone,
      company_name: f.gc_company, customer_id: customerId, role: 'Estimator', is_primary: !!created.customer_id,
      contact_type: 'customer', classification_source: 'machine', auto_classified_at: now, auto_classified_reason: 'sent a bid invitation (forwarded email)',
      name_source: estName ? 'machine' : 'legacy', sources: ['bid_email'], status: 'active',
    }).select('id').single()
    if (error) throw new Error(`contact: ${error.message}`)
    contactId = ct.id
    created.contact_id = ct.id
    if (estEmail) await sb.from('contact_emails').insert({ org_id: org, contact_id: ct.id, email: estEmail, is_primary: true, source: 'inbound_email' })
    if (created.customer_id) await sb.from('customers').update({ primary_contact_id: ct.id }).eq('id', customerId)
  }

  // The job: an addendum joins the open job for the same Box folder or project; else a new one.
  let jobId: string | null = null
  const { data: open } = await sb.from('jobs').select('id, title, customer_id, box_url, status').eq('org_id', org).is('archived_at', null)
    .not('status', 'in', '(lost,closed,complete)').limit(500)
  const key = projectKey(f.project_name)
  const match = (open ?? []).find((j: { box_url: string | null; customer_id: string | null; title: string | null }) =>
    (pkg.box_url && j.box_url === pkg.box_url) || (key && j.customer_id === customerId && projectKey(j.title) === key))
  if (match) {
    jobId = match.id
    // Re-reading this package's OWN job (a retry, not an addendum): it takes the new reading.
    if (created.job_id === match.id) {
      const addr = f.address
      await sb.from('jobs').update({
        customer_id: customerId, contact_id: contactId,
        title: (f.job_title ?? f.project_name ?? match.title ?? 'Bid').slice(0, 120),
        address: addr.line, city: addr.city, state: addr.state, zip: addr.zip,
        description: f.scope_summary?.slice(0, 900) ?? null, bid_due_at: f.bid_due_at,
        notes: [f.project_name && `Project: ${f.project_name}`, f.bid_due_text && `Bids due: ${f.bid_due_text}`, f.prebid_text && `Pre-bid: ${f.prebid_text}`].filter(Boolean).join('\n') || null,
      }).eq('id', match.id)
    }
  } else {
    const addr = f.address
    const { data: job, error } = await sb.from('jobs').insert({
      org_id: org, customer_id: customerId, contact_id: contactId,
      title: (f.job_title ?? f.project_name ?? email.subject?.replace(/^(\s*(re|fwd?):\s*)+/i, '') ?? 'Bid').slice(0, 120),
      address: addr.line, city: addr.city, state: addr.state, zip: addr.zip,
      description: f.scope_summary?.slice(0, 900) ?? null, job_type: 'commercial', status: 'invited', origin: 'machine',
      lead_source: 'gc_invite', confirmed_at: new Date().toISOString(), stage_changed_at: new Date().toISOString(),
      bid_due_at: f.bid_due_at, itb_received_at: email.created_at, box_url: pkg.box_url,
      notes: [f.project_name && `Project: ${f.project_name}`, f.bid_due_text && `Bids due: ${f.bid_due_text}`, f.prebid_text && `Pre-bid: ${f.prebid_text}`].filter(Boolean).join('\n') || null,
    }).select('id').single()
    if (error) throw new Error(`job: ${error.message}`)
    jobId = job.id
    created.job_id = job.id
  }

  // The scope, as sections: what is written, dimensions to be measured in the Plan Room.
  const { data: have } = await sb.from('job_sections').select('name, work_type').eq('job_id', jobId)
  const seen = new Set((have ?? []).map((s: { name: string | null; work_type: string }) => `${(s.name ?? '').toLowerCase()}|${s.work_type}`))
  const sectionIds: string[] = []
  let order = (have ?? []).length
  for (const it of f.items) {
    const k = `${it.name.toLowerCase()}|${it.work_type}`
    if (seen.has(k)) continue
    seen.add(k)
    const ref = [it.sheets.join(', '), it.spec_section, `"${it.quote}"`].filter(Boolean).join(' · ').slice(0, 300)
    const { data: s, error } = await sb.from('job_sections').insert({
      org_id: org, job_id: jobId, name: it.name.slice(0, 80), work_type: it.work_type,
      psi: it.psi, depth_in: it.thickness_in, rebar: it.reinforcement, length_ft: null, width_ft: null,
      // The bid's own area for this item ("1,769.80 SY"), as written on its line.
      sqft_override: itemQuantity(it.quote)?.sqft ?? null,
      // A count ("8 EA") is the section's count (migration 065), not an area.
      count_qty: ['EA', 'LS'].includes(itemQuantity(it.quote)?.unit ?? '') ? itemQuantity(it.quote)!.qty : null,
      count_unit: ['EA', 'LS'].includes(itemQuantity(it.quote)?.unit ?? '') ? itemQuantity(it.quote)!.unit : null,
      origin: 'bid', source_ref: ref, sort_order: order++,
    }).select('id').single()
    if (!error && s) sectionIds.push(s.id)
  }
  created.section_ids = [...((created.section_ids as string[] | undefined) ?? []), ...sectionIds]

  // The files onto the job; drawings into the Plan Room with their sheets read.
  await sb.from('job_files').update({ job_id: jobId, customer_id: customerId, contact_id: contactId }).eq('email_id', email.id).is('deleted_at', null)
  for (const pf of files) {
    if (!pf.job_file_id || pf.role !== 'drawings') continue
    await sb.from('job_files').update({ in_plan_room: true }).eq('id', pf.job_file_id).eq('kind', 'pdf')
    const pages = pf.pages ?? []
    if (!pages.length) continue
    const { data: got } = await sb.from('plan_sheets').select('page').eq('file_id', pf.job_file_id)
    const done = new Set((got ?? []).map((s: { page: number }) => s.page))
    const rows = pages.filter((p) => !done.has(Number(p.page))).map((p) => ({
      org_id: org, job_id: jobId, file_id: pf.job_file_id, page: p.page, page_w: p.page_w, page_h: p.page_h,
      number: typeof p.number === 'string' ? p.number.slice(0, 20) : null, title: typeof p.title === 'string' ? p.title.slice(0, 120) : null,
      discipline: typeof p.discipline === 'string' ? p.discipline.slice(0, 12) : null,
      scale_text: typeof p.scale_text === 'string' ? p.scale_text.slice(0, 60) : null, printed_ft_per_pt: p.printed_ft_per_pt ?? null, number_source: 'read',
    }))
    for (let i = 0; i < rows.length; i += 200) await sb.from('plan_sheets').insert(rows.slice(i, i + 200))
  }

  // The email filed on it.
  await sb.from('emails').update({
    job_id: jobId, customer_id: customerId, contact_id: contactId, status: 'filed', filed_at: new Date().toISOString(),
    match_note: `filed by the bid reader${created.job_id ? ' — new job' : ' — added to the open job'}`,
  }).eq('id', email.id)

  await setPkg(sb, pkg.id, { state: 'filed', job_id: jobId, customer_id: customerId, contact_id: contactId, created, filed_at: new Date().toISOString(), error: null })
}

// ── one package, one step at a time ──────────────────────────────────────────

async function step(sb: Sb, pkg: Pkg, until: number): Promise<string> {
  const { data: email } = await sb.from('emails').select('id, org_id, subject, text_body, from_address, original_from_address, original_from_name, contact_id, customer_id, job_id, status, match, created_at')
    .eq('id', pkg.email_id).maybeSingle() as { data: Email | null }
  if (!email) { await setPkg(sb, pkg.id, { state: 'failed', error: 'the email is gone' }); return 'no email' }
  if (email.status === 'quarantined') { await setPkg(sb, pkg.id, { next_try_at: later(30) }); return 'quarantined — waits for Coy to file it' }

  const files = async () => ((await sb.from('bid_package_files').select('*').eq('package_id', pkg.id).order('created_at')).data ?? []) as PFile[]

  switch (pkg.state) {
    case 'waiting': {
      // The email's own attachments first (email-intake fetches them).
      const { data: atts } = await sb.from('email_attachments').select('fetch_state').eq('email_id', email.id)
      const pending = (atts ?? []).some((a: { fetch_state: string }) => a.fetch_state === 'waiting')
      if (pending && Date.parse(email.created_at) > Date.now() - 15 * 60_000) { await setPkg(sb, pkg.id, { next_try_at: later(1) }); return 'waiting for attachments' }
      const { data: jfs } = await sb.from('job_files').select('id, name, mime_type, byte_size').eq('email_id', email.id).is('deleted_at', null)
      for (const j of (jfs ?? []) as Array<{ id: string; name: string; mime_type: string | null; byte_size: number | null }>) {
        await sb.from('bid_package_files').upsert({ org_id: pkg.org_id, package_id: pkg.id, job_file_id: j.id, name: j.name, byte_size: j.byte_size, role: docRole(j.name, j.mime_type), fetch_state: 'fetched' },
          { onConflict: 'package_id,job_file_id', ignoreDuplicates: true })
      }
      const link = boxLinks(`${email.text_body ?? ''}`)[0] ?? null
      await setPkg(sb, pkg.id, link ? { state: 'listing', box_url: link.url, box_folder_id: link.folderId, next_try_at: later(0) } : { state: 'scanning', next_try_at: later(0) })
      return link ? 'found a Box link' : 'no Box link — reading the attachments'
    }
    case 'listing': case 'needs_setup': {
      if (!pkg.box_url) { await setPkg(sb, pkg.id, { state: 'scanning' }); return 'no link' }
      if (!boxConfigured()) { await setPkg(sb, pkg.id, { state: 'needs_setup', error: 'Box app keys are not set (BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_SUBJECT_ID)', next_try_at: later(15) }); return 'needs Box keys' }
      const list = await listBox(pkg.box_url, pkg.box_folder_id)
      for (const b of list.files) {
        const skip = skipBoxFile(b.name, b.size)
        await sb.from('bid_package_files').upsert({ org_id: pkg.org_id, package_id: pkg.id, box_file_id: b.id, path: b.path.slice(0, 500), name: b.name.slice(0, 200),
          byte_size: b.size, role: docRole(b.name, null), fetch_state: skip ? 'skipped' : 'waiting', fetch_error: skip, scan_state: skip ? 'skipped' : 'waiting' },
          { onConflict: 'package_id,box_file_id', ignoreDuplicates: true })
      }
      await setPkg(sb, pkg.id, { state: 'fetching', box_folder_name: list.name?.slice(0, 200) ?? null, error: null, next_try_at: later(0) })
      return `listed ${list.files.length} file(s) in "${list.name}"`
    }
    case 'fetching': {
      let n = 0
      for (const f of (await files()).filter((x) => x.fetch_state === 'waiting' || (x.fetch_state === 'failed' && x.attempts < 3))) {
        if (Date.now() > until) break
        try { await fetchBoxFile(sb, pkg, email, f); n++ }
        catch (e) { await sb.from('bid_package_files').update({ fetch_state: 'failed', fetch_error: (e as Error).message.slice(0, 300), attempts: f.attempts + 1 }).eq('id', f.id) }
      }
      const left = (await files()).filter((x) => x.fetch_state === 'waiting' || (x.fetch_state === 'failed' && x.attempts < 3)).length
      await setPkg(sb, pkg.id, left ? { next_try_at: later(0) } : { state: 'scanning', next_try_at: later(0) })
      return `fetched ${n}, ${left} to go`
    }
    case 'scanning': {
      let n = 0
      // Smallest first, so an addendum is read before a book that may not fit (Walker High, 2026-10-02).
      const due = (await files()).filter((x) => x.fetch_state === 'fetched' && x.scan_state === 'waiting' && x.job_file_id)
        .sort((a, b) => (a.byte_size ?? 0) - (b.byte_size ?? 0))
      for (const f of due) {
        if (Date.now() > until) break
        const pdf = /\.pdf$/i.test(f.name)
        if (!pdf || f.role === 'other') { await sb.from('bid_package_files').update({ scan_state: 'skipped', scan_error: pdf ? null : 'not a PDF' }).eq('id', f.id); continue }
        if ((f.byte_size ?? 0) > BUFFER_MAX) { await sb.from('bid_package_files').update({ scan_state: 'skipped', scan_error: 'over 40 MB — its sheets are read when it is opened in the Plan Room' }).eq('id', f.id); continue }
        // A run the platform stopped (CPU time) leaves this mark behind: that file doesn't fit a server read,
        // so it is skipped with the reason — never retried forever. Dusty's file reader and the Plan Room still read it.
        if (f.scan_error === SCAN_MARK) {
          await sb.from('bid_package_files').update({ scan_state: 'skipped', scan_error: 'too big to read on the server in one go — Dusty\'s file reader and the Plan Room read it' }).eq('id', f.id)
          continue
        }
        await sb.from('bid_package_files').update({ scan_error: SCAN_MARK }).eq('id', f.id)
        try {
          const { pages, excerpt } = await scanPdf(sb, f)
          await sb.from('bid_package_files').update({ scan_state: 'scanned', pages, text_excerpt: excerpt.slice(0, 60_000), scan_error: excerpt ? null : 'no text in it — a scanned PDF' }).eq('id', f.id)
          n++
        } catch (e) { await sb.from('bid_package_files').update({ scan_state: 'failed', scan_error: (e as Error).message.slice(0, 300) }).eq('id', f.id) }
      }
      const left = (await files()).filter((x) => x.fetch_state === 'fetched' && x.scan_state === 'waiting').length
      await setPkg(sb, pkg.id, left ? { next_try_at: later(0) } : { state: 'extracting', next_try_at: later(0) })
      return `scanned ${n}, ${left} to go`
    }
    case 'extracting': {
      const c = cfg()
      const down = await hermesUp(c)
      if (down) { await setPkg(sb, pkg.id, { next_try_at: later(5), error: down }); return down }
      const all = await files()
      const sheetNos = all.flatMap((f) => (f.pages ?? []).map((p) => (typeof p.number === 'string' ? p.number : null)).filter((x): x is string => !!x))
      const index = all.filter((f) => f.pages?.length).map((f) => `${f.name}: ${(f.pages ?? []).map((p) => [p.number, p.title].filter(Boolean).join(' ')).filter(Boolean).join('; ')}`).join('\n')
      const header = `${pkg.box_folder_name ? `BOX FOLDER: ${pkg.box_folder_name}\n\n` : ''}EMAIL\nSubject: ${email.subject ?? ''}\nForwarded by: ${email.from_address ?? ''}\nOriginally from: ${email.original_from_name ?? ''} <${email.original_from_address ?? ''}>\n\n${(email.text_body ?? '').slice(0, 15_000)}`
      const order = { itb: 0, spec: 1, drawings: 2, other: 3 } as Record<string, number>
      let body = ''
      for (const f of all.slice().sort((a, b) => (order[a.role ?? 'other'] ?? 3) - (order[b.role ?? 'other'] ?? 3))) {
        if (!f.text_excerpt) continue
        if (body.length + f.text_excerpt.length > PROMPT_CHARS - header.length - index.length) { body += `\n${f.text_excerpt.slice(0, Math.max(0, PROMPT_CHARS - header.length - index.length - body.length))}`; break }
        body += `\n${f.text_excerpt}`
      }
      const user = `${header}\n\nSHEET INDEX\n${index || '(no drawings read)'}\n\nDOCUMENT EXCERPTS\n${body || '(no document text)'}`
      const got = await ask(c, user)
      if (!got.ok) { await setPkg(sb, pkg.id, { error: got.error, next_try_at: later(pkg.attempts > 3 ? 30 : 5), ...(pkg.attempts > 6 ? { state: 'failed' } : {}) }); return got.error }
      const r = sanitizeBid(parseReply(got.raw), user, sheetNos, OURS)
      if (!r) { await setPkg(sb, pkg.id, { error: 'no usable answer from the model', next_try_at: later(10) }); return 'unusable answer' }
      const facts = { ...r.facts, prompt: BID_PROMPT_VERSION }
      if (!r.facts.is_bid) { await setPkg(sb, pkg.id, { state: 'not_a_bid', facts, dropped: r.dropped, error: null }); return 'not a bid' }
      await setPkg(sb, pkg.id, { state: 'filing', facts, dropped: r.dropped, error: null, next_try_at: later(0) })
      pkg.facts = facts
      pkg.state = 'filing'
      return step(sb, pkg, until)
    }
    case 'filing': {
      await file(sb, pkg, email, await files())
      return 'filed'
    }
    case 'failed': {
      await setPkg(sb, pkg.id, { next_try_at: later(30) })
      return 'failed — waiting for a retry'
    }
  }
  return `nothing to do in ${pkg.state}`
}

async function run(sb: Sb, only?: string) {
  const until = Date.now() + BUDGET_MS
  const out: string[] = []
  for (let i = 0; i < 20 && Date.now() < until; i++) {
    let pkg: Pkg | null = null
    if (only) {
      if (i > 0) break
      pkg = (await sb.from('bid_packages').select('*').eq('id', only).maybeSingle()).data
    } else {
      const { data, error } = await sb.rpc('sc_bid_claim', { p_limit: 1 })
      if (error) { await beat(sb, 'error', `claim failed: ${error.message}`); return out }
      pkg = (data ?? [])[0] ?? null
    }
    if (!pkg) break
    pkg.created = pkg.created ?? {}
    try { out.push(`${pkg.id.slice(0, 8)} ${pkg.state}: ${await step(sb, pkg, until)}`) }
    catch (e) {
      const msg = (e as Error).message.slice(0, 300)
      await setPkg(sb, pkg.id, { error: msg, next_try_at: later(pkg.attempts >= 5 ? 60 : 5), ...(pkg.attempts >= 5 ? { state: 'failed' } : {}) })
      out.push(`${pkg.id.slice(0, 8)} ${pkg.state}: ${msg}`)
    }
  }
  const bad = out.find((o) => /Box refused|Hermes|failed/.test(o))
  await beat(sb, bad ? 'error' : 'ok', out.length ? out.slice(-3).join(' | ') : 'nothing due')
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const { data: ok } = await sb.rpc('sc_enrich_worker_authorized', { p_token: token })
  if (ok !== true) return json({ error: 'unauthorized' }, 401)
  // deno-lint-ignore no-explicit-any
  let body: any = {}
  try { body = await req.json() } catch { /* empty is fine */ }

  if (body.ping) {
    let box = 'not configured'
    if (boxConfigured()) { try { await boxToken(); box = 'token ok' } catch (e) { box = (e as Error).message } }
    return json({ box, hermes: (await hermesUp(cfg())) ?? 'ok', storage_key: !!SERVICE_KEY })
  }
  if (typeof body.retry === 'string') {
    await sb.from('bid_packages').update({ state: 'waiting', attempts: 0, error: null, next_try_at: new Date().toISOString(), claimed_at: null }).eq('id', body.retry).neq('state', 'undone')
    return json({ ok: true })
  }
  const work = run(sb, typeof body.package === 'string' ? body.package : undefined)
  if (body.wait || typeof body.package === 'string' || typeof EdgeRuntime === 'undefined') return json({ steps: await work })
  EdgeRuntime.waitUntil(work)
  return json({ accepted: true }, 202)
})
