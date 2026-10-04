/**
 * read-files — the rules. Pure: tests/read-files.test.mjs runs them.
 *
 * Dusty reads a file Coy uploaded (migration 045) and says what it is. What
 * comes back is a SUGGESTION (DECISIONS §2b): it is shown on the file, never
 * applied. And the same guarantee as dictation: from a document with text, a
 * number is kept only if it is written in the document.
 */

export const READ_PROMPT_VERSION = 'read-files-v3-vendor-details-2026-09-29'

export const SYSTEM_PROMPT = `You read one file for a concrete contractor (driveways, slabs, sidewalks, curbs; residential, commercial and government work). The file is a photo or a document: plans, a spec, a bid invite, a vendor's quote, a receipt, a contract.

Return ONLY a JSON object, no prose:
{"summary": string, "kind": "photo"|"plan"|"spec"|"bid"|"vendor_quote"|"receipt"|"contract"|"other",
 "facts": {"bid_due": "YYYY-MM-DD"|null, "date": "YYYY-MM-DD"|null, "address": string|null, "vendor": string|null,
           "amount": number|null, "psi": number|null, "thickness_in": number|null, "reinforcement": string|null,
           "dimensions": string[], "quantities": string[], "notes": string[]},
 "price_lines": [{"name": string, "sku": string|null, "unit": string|null, "unit_cost": number, "qty": number|null}],
 "vendor_details": {"name": string|null, "phone": string|null, "email": string|null, "address": string|null}|null,
 "tax_pct": number|null, "subtotal": number|null, "tax_amount": number|null}

Rules:
- summary: 1-3 plain sentences a contractor would want: what it is and what matters in it. No filler.
- Only what the file shows. Anything not shown is null or []. Never estimate a size, a price or a date.
- dimensions: as written ("24' x 30'", "6\\" slab"). quantities: as written ("42 CY 4000 psi", "310 LF curb").
- notes: at most 5 short items that would change a price or a schedule (access, demo, pump, prevailing wage, bonds, alternates, liquidated damages).
- For a photo: describe what is in it (existing concrete, damage, forms, a pour, a site), and anything written or measured on it.
- For a receipt: vendor, date and amount (the total paid).
- price_lines: ONLY for a vendor's quote, price list, receipt or invoice — every priced item, in order, as written (at most 200). name as written; sku = the vendor's product code / item number if shown (never a ticket, order or invoice number); unit as written (CY, EA, SF, LF, BAG, SHEET, STICK, DAY…); unit_cost = the price PER UNIT as written, never the line total and never a number you worked out; qty as written or null. Fees are lines too — delivery, short load, fuel, environmental, washout, standby — each with its own price as written (unit as written, or LOAD / EA for a flat fee). An add-on priced per yard (slump, fiber, accelerator, retarder, hot water) is its own line. When the same item appears on several tickets or loads, list each as it appears. Sales tax is NOT a line. Anything else: [].
- vendor_details: ONLY for a vendor's quote, price list, receipt or invoice — the business that issued it (the seller, not the customer, not "bill to" / "ship to"): name, phone, email and address exactly as printed. Anything not printed is null. Otherwise null.
- vendor_details.name: the business name as printed in the issuer block (e.g. "ACME CONCRETE GROUP, LLC"), not a logo tagline.
- tax_pct: the sales tax RATE only if it is printed as a percent (9.45% → 9.45). Never work it out from amounts. Otherwise null.
- subtotal and tax_amount: the pre-tax subtotal and the sales tax charged, as printed, for a quote, receipt or invoice. Otherwise null.`

const CATS = new Set(['photo', 'plan', 'spec', 'bid', 'vendor_quote', 'receipt', 'contract', 'other'])
const ISO = /^\d{4}-\d{2}-\d{2}$/

export interface Read {
  summary: string
  kind: string | null
  facts: Record<string, unknown>
  dropped: string[]
}

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null)
const list = (v: unknown, n: number, max = 120) =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n) : []

/** The numbers written in a document: "4,000" and "4000" alike, decimals kept. */
export function numbersIn(text: string): Set<number> {
  const out = new Set<number>()
  for (const m of text.replace(/(\d),(\d{3})/g, '$1$2').matchAll(/\d+(?:\.\d+)?/g)) out.add(Number(m[0]))
  return out
}

/**
 * The model's answer → what is stored. `text` is the document's own text
 * (null for a photo): with text, a number must appear in it to be kept.
 */
export function sanitizeRead(raw: unknown, text: string | null): Read | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const summary = str(r.summary, 600)
  if (!summary) return null
  const f = (r.facts && typeof r.facts === 'object' ? r.facts : {}) as Record<string, unknown>
  const dropped: string[] = []
  const nums = text ? numbersIn(text) : null
  const said = (n: number) => !nums || nums.has(n) || nums.has(Math.round(n * 100) / 100)
  const num = (k: string, min: number, max: number) => {
    const v = f[k]
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,]/g, ''))
    if (!Number.isFinite(n) || n < min || n > max) { dropped.push(`${k}: ${v}`); return null }
    if (!said(n)) { dropped.push(`${k}: ${n} is not written in the file`); return null }
    return n
  }
  const date = (k: string) => {
    const v = str(f[k], 10)
    if (!v) return null
    if (!ISO.test(v) || Number.isNaN(Date.parse(v))) { dropped.push(`${k}: ${v}`); return null }
    return v
  }
  const facts: Record<string, unknown> = {
    bid_due: date('bid_due'),
    date: date('date'),
    address: str(f.address, 160),
    vendor: str(f.vendor, 120),
    amount: num('amount', 0.01, 10_000_000),
    psi: num('psi', 1500, 12_000),
    thickness_in: num('thickness_in', 1, 48),
    reinforcement: str(f.reinforcement, 120),
    dimensions: list(f.dimensions, 12),
    quantities: list(f.quantities, 12),
    notes: list(f.notes, 5, 200),
  }
  for (const k of Object.keys(facts)) {
    const v = facts[k]
    if (v === null || (Array.isArray(v) && v.length === 0)) delete facts[k]
  }
  // Price lines (v2): a line is kept only with a name and a unit price that
  // is written in the document — never a total divided out, never a guess.
  // From a photo there is no text to check, so they are marked for Coy to
  // check each one; they are suggestions either way (§2b).
  const lines = Array.isArray(r.price_lines) ? r.price_lines.slice(0, 200) : []
  const kept: Array<Record<string, unknown>> = []
  let unwritten = 0
  for (const x of lines) {
    if (!x || typeof x !== 'object') continue
    const l = x as Record<string, unknown>
    const name = str(l.name, 120)
    const cost = typeof l.unit_cost === 'number' ? l.unit_cost : Number(String(l.unit_cost ?? '').replace(/[$,\s]/g, ''))
    if (!name || !Number.isFinite(cost) || cost <= 0 || cost > 1_000_000) continue
    if (!said(cost)) { unwritten++; continue }
    const q = l.qty === null || l.qty === undefined || l.qty === '' ? null : Number(String(l.qty).replace(/,/g, ''))
    kept.push({ name, sku: str(l.sku, 60), unit: str(l.unit, 20), unit_cost: cost, qty: q !== null && Number.isFinite(q) && q > 0 && said(q) ? q : null })
  }
  if (unwritten) dropped.push(`price_lines: ${unwritten} price${unwritten === 1 ? '' : 's'} not written in the file`)
  if (kept.length) {
    facts.price_lines = kept
    if (!text) facts.price_lines_from_photo = true
  }
  // Who issued it (v3): each detail kept only if it is printed — a phone's
  // digits, an email, the name's words must appear in the text. From a photo
  // there is no text to check; the receipt import shows them for Coy to confirm.
  const vd = readVendor(r.vendor_details, text, dropped)
  if (vd) facts.vendor_details = vd
  if (r.tax_pct !== null && r.tax_pct !== undefined && r.tax_pct !== '') {
    const t = typeof r.tax_pct === 'number' ? r.tax_pct : Number(String(r.tax_pct).replace(/[%\s]/g, ''))
    if (!Number.isFinite(t) || t <= 0 || t >= 50) dropped.push(`tax_pct: ${r.tax_pct}`)
    else if (!said(t)) dropped.push(`tax_pct: ${t} is not written in the file`)
    else facts.tax_pct = t
  }
  for (const k of ['subtotal', 'tax_amount'] as const) {
    const v = r[k]
    if (v === null || v === undefined || v === '') continue
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''))
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) dropped.push(`${k}: ${v}`)
    else if (!said(n)) dropped.push(`${k}: ${n} is not written in the file`)
    else facts[k] = n
  }
  const kind = typeof r.kind === 'string' && CATS.has(r.kind) ? r.kind : null
  return { summary, kind, facts, dropped }
}

const digits = (s: string) => s.replace(/\D/g, '')
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The issuer block, each field only if printed (when there is text to check). */
export function readVendor(v: unknown, text: string | null, dropped: string[]): Record<string, string> | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const out: Record<string, string> = {}
  const t = text ?? ''
  const tDigits = digits(t)
  const tFold = ' ' + fold(t) + ' '
  const name = str(o.name, 120)
  if (name) {
    if (!text || tFold.includes(' ' + fold(name) + ' ')) out.name = name
    else dropped.push(`vendor name: "${name}" is not written in the file`)
  }
  const phone = str(o.phone, 40)
  if (phone) {
    const d = digits(phone)
    if (d.length < 10) dropped.push(`vendor phone: ${phone}`)
    else if (text && !tDigits.includes(d.slice(-10))) dropped.push(`vendor phone: ${phone} is not written in the file`)
    else out.phone = phone
  }
  const email = str(o.email, 120)
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) dropped.push(`vendor email: ${email}`)
    else if (text && !t.toLowerCase().includes(email.toLowerCase())) dropped.push(`vendor email: ${email} is not written in the file`)
    else out.email = email
  }
  const address = str(o.address, 200)
  if (address) {
    // An address is kept when its street number and first word are printed.
    const num = address.match(/\d+/)?.[0]
    const word = fold(address).split(' ').find((w) => /^[a-z]{3,}$/.test(w))
    if (!text || ((!num || numbersIn(t).has(Number(num))) && (!word || tFold.includes(' ' + word + ' ')))) out.address = address
    else dropped.push(`vendor address: "${address}" is not written in the file`)
  }
  return Object.keys(out).length ? out : null
}

/** Pull the first JSON object out of a model reply. */
export function parseReply(raw: string): unknown {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

/** What Dusty can read today, and why not when he can't. */
export function readable(kind: string, mime: string | null, bytes: number | null): { ok: true; as: 'image' | 'pdf' } | { ok: false; why: string } {
  const m = (mime ?? '').toLowerCase()
  if (kind === 'image') {
    if (/heic|heif/.test(m)) return { ok: false, why: 'HEIC photo — Dusty can read JPEG and PNG; set the camera to "Most Compatible"' }
    if (!/jpe?g|png|gif|webp/.test(m)) return { ok: false, why: `can't read ${m || 'this image type'} yet` }
    if ((bytes ?? 0) > 5 * 1024 * 1024) return { ok: false, why: 'photo over 5 MB — too big for Dusty to look at' }
    return { ok: true, as: 'image' }
  }
  if (kind === 'pdf') return { ok: true, as: 'pdf' }
  return { ok: false, why: `Dusty can't read ${kind === 'video' ? 'video' : kind === 'sheet' ? 'spreadsheets' : 'this kind of file'} yet` }
}

/** Keep the model's input inside a budget: the start of a long document matters most (title, scope, dates). */
export function clipText(text: string, budget = 40_000): { text: string; clipped: boolean } {
  const t = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return t.length <= budget ? { text: t, clipped: false } : { text: t.slice(0, budget), clipped: true }
}
