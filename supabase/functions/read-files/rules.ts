/**
 * read-files — the rules. Pure: tests/read-files.test.mjs runs them.
 *
 * Dusty reads a file Coy uploaded (migration 045) and says what it is. What
 * comes back is a SUGGESTION (DECISIONS §2b): it is shown on the file, never
 * applied. And the same guarantee as dictation: from a document with text, a
 * number is kept only if it is written in the document.
 */

export const READ_PROMPT_VERSION = 'read-files-v1-2026-09-29'

export const SYSTEM_PROMPT = `You read one file for a concrete contractor (driveways, slabs, sidewalks, curbs; residential, commercial and government work). The file is a photo or a document: plans, a spec, a bid invite, a vendor's quote, a receipt, a contract.

Return ONLY a JSON object, no prose:
{"summary": string, "kind": "photo"|"plan"|"spec"|"bid"|"vendor_quote"|"receipt"|"contract"|"other",
 "facts": {"bid_due": "YYYY-MM-DD"|null, "date": "YYYY-MM-DD"|null, "address": string|null, "vendor": string|null,
           "amount": number|null, "psi": number|null, "thickness_in": number|null, "reinforcement": string|null,
           "dimensions": string[], "quantities": string[], "notes": string[]}}

Rules:
- summary: 1-3 plain sentences a contractor would want: what it is and what matters in it. No filler.
- Only what the file shows. Anything not shown is null or []. Never estimate a size, a price or a date.
- dimensions: as written ("24' x 30'", "6\\" slab"). quantities: as written ("42 CY 4000 psi", "310 LF curb").
- notes: at most 5 short items that would change a price or a schedule (access, demo, pump, prevailing wage, bonds, alternates, liquidated damages).
- For a photo: describe what is in it (existing concrete, damage, forms, a pour, a site), and anything written or measured on it.
- For a receipt: vendor, date and amount (the total paid).`

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
  const kind = typeof r.kind === 'string' && CATS.has(r.kind) ? r.kind : null
  return { summary, kind, facts, dropped }
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
