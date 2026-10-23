/**
 * The proposal's pages (Claude Design "Proposal Builder v2", 2026-10-23) — pure, tested in
 * tests/proposal-pages.test.mjs.
 *
 * A proposal is a list of pages the owner adds, orders, renames, switches off, duplicates and
 * deletes. Kept on the draft as `display.pages` (no migration: it freezes with the snapshot like
 * the rest of display). Pages built from the job (Title, At a glance, Scope, Pricing, If we find…,
 * Payments, Warranty, Terms, Authorization) appear once each and read the job; the owner's own
 * pages are text, photos and PDFs. A draft or final saved before pages existed reads as the old
 * sections in their old order, with the old switches (`display.off`).
 */

export type BuiltKind = "title" | "glance" | "scope" | "pricing" | "ifind" | "pay" | "warranty" | "terms" | "sign";
export type PageKind = BuiltKind | "text" | "photos" | "pdf";

export interface PagePhoto { id: string; caption?: string }
export interface ProposalPage {
  id: string;
  kind: PageKind;
  label: string;
  /** Switched off: kept here for next time, left out of what the customer sees. */
  off?: boolean;
  /** Added since the proposal was last opened, for the tag in the list. */
  isNew?: boolean;
  /** A text page's words: paragraphs split by a blank line, "# " a heading, "- " a bullet. */
  body?: string;
  /** A photos page's photos (job file ids) with their captions, and how many across. */
  photos?: PagePhoto[];
  across?: 1 | 2 | 3;
  /** A PDF page's file (a job file id) and the page numbers left out. */
  file?: string;
  skip?: number[];
}

/** A pre-priced unknown on "If we find…": shown with its unit price, never in the total. */
export interface IfFindLine { id: string; item_id?: string; name: string; note?: string; unit: string; sell: number }

/** The built pages, in the order a new proposal has them, and the old section keys they stand for. */
export const BUILT: Array<{ kind: BuiltKind; label: string; legacy: string[]; about: string }> = [
  { kind: "title", label: "Title", legacy: ["cover", "header"], about: "The cover, who it's from and who it's for" },
  { kind: "glance", label: "At a glance", legacy: [], about: "The price, payment and what's included, up front" },
  { kind: "scope", label: "Scope of work", legacy: ["scope"], about: "Each area, its size and its scope — from the Budget" },
  { kind: "pricing", label: "Pricing", legacy: ["pricing"], about: "The price, from the Budget" },
  { kind: "ifind", label: "If we find…", legacy: [], about: "Unit prices for what can't be seen yet, not in the total" },
  { kind: "pay", label: "Payments", legacy: ["pay"], about: "The draw schedule" },
  { kind: "warranty", label: "Warranty", legacy: ["warranty"], about: "Your warranty template, edited here" },
  { kind: "terms", label: "Terms", legacy: ["terms"], about: "Your contract template, edited here" },
  { kind: "sign", label: "Authorization", legacy: ["sign"], about: "Where the customer signs" },
];
const BUILT_KINDS = new Set<string>(BUILT.map((b) => b.kind));
export const isBuilt = (k: PageKind): k is BuiltKind => BUILT_KINDS.has(k);
const KINDS = new Set<string>([...BUILT_KINDS, "text", "photos", "pdf"]);

/** Where a page's content comes from, for the label over the editor. */
export function sourceOf(p: Pick<ProposalPage, "kind">): { label: string; tint: "live" | "job" | "own" } {
  switch (p.kind) {
    case "scope": case "pricing": return { label: "Budget · live", tint: "live" };
    case "ifind": return { label: "Price book", tint: "live" };
    case "glance": return { label: "Budget · live", tint: "live" };
    case "title": return { label: "Job", tint: "job" };
    case "photos": return { label: "Job photos", tint: "job" };
    case "sign": return { label: "Customer link", tint: "job" };
    case "pdf": return { label: "PDF", tint: "own" };
    default: return { label: "Text", tint: "own" };
  }
}

/** A new page's id: short, random, never one already in the list. */
export function newPageId(taken: Iterable<string> = []): string {
  const have = new Set(taken);
  for (;;) {
    const id = `p${Math.random().toString(36).slice(2, 9)}`;
    if (!have.has(id)) return id;
  }
}

/**
 * The pages to draw. Saved pages win; with none saved, the old sections in their old order (a
 * final made before pages, or a draft not opened since) — At a glance and If we find… off there,
 * so an old proposal reads as it did. `fresh` (a draft opened in the builder) turns At a glance on.
 */
export function pagesOf(display: { pages?: unknown; off?: Record<string, boolean> } | null | undefined, opts: { fresh?: boolean } = {}): ProposalPage[] {
  const saved = cleanPages(display?.pages);
  if (saved) return saved;
  const off = display?.off ?? {};
  return BUILT.map((b) => ({
    id: b.kind, kind: b.kind, label: b.label,
    off: b.kind === "glance" ? !opts.fresh : b.kind === "ifind" ? true
      : b.legacy.length > 0 && b.legacy.every((k) => off[k]) ? true : undefined,
  })).map((p) => (p.off ? p : { id: p.id, kind: p.kind, label: p.label }));
}

const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pages as they may be saved: known kinds, each built page once, real ids, short words. Nothing usable → undefined. */
export function cleanPages(x: unknown): ProposalPage[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out: ProposalPage[] = [];
  const ids = new Set<string>(), built = new Set<string>();
  for (const r of x.slice(0, 60)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.kind !== "string" || !KINDS.has(o.kind)) continue;
    const kind = o.kind as PageKind;
    if (isBuilt(kind)) { if (built.has(kind)) continue; built.add(kind); }
    const id = typeof o.id === "string" && ID.test(o.id) && !ids.has(o.id) ? o.id : newPageId(ids);
    ids.add(id);
    const p: ProposalPage = { id, kind, label: str(o.label, 80).replace(/[\r\n\t]+/g, " ") };
    if (o.off === true) p.off = true;
    if (o.isNew === true) p.isNew = true;
    if (kind === "text") p.body = str(o.body, 12000);
    if (kind === "photos") {
      p.photos = (Array.isArray(o.photos) ? o.photos : []).slice(0, 48).flatMap((f) => {
        const q = (f ?? {}) as Record<string, unknown>;
        if (typeof q.id !== "string" || !UUID.test(q.id)) return [];
        const cap = str(q.caption, 300).replace(/[\r\n\t]+/g, " ");
        return [cap ? { id: q.id, caption: cap } : { id: q.id }];
      });
      p.across = o.across === 1 || o.across === 3 ? o.across : 2;
    }
    if (kind === "pdf") {
      if (typeof o.file === "string" && UUID.test(o.file)) p.file = o.file;
      const skip = (Array.isArray(o.skip) ? o.skip : []).filter((n): n is number => Number.isInteger(n) && n > 0 && n <= 500);
      if (skip.length) p.skip = [...new Set(skip)].sort((a, b) => a - b).slice(0, 200);
    }
    out.push(p);
  }
  return out.length ? out : undefined;
}

/** "If we find…" lines as they may be saved. */
export function cleanIfFind(x: unknown): IfFindLine[] {
  if (!Array.isArray(x)) return [];
  const ids = new Set<string>();
  return x.slice(0, 30).flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const name = str(o.name, 120).trim(), sell = Number(o.sell);
    if (!name || !Number.isFinite(sell) || sell < 0 || sell > 1e7) return [];
    const id = typeof o.id === "string" && ID.test(o.id) && !ids.has(o.id) ? o.id : newPageId(ids);
    ids.add(id);
    const line: IfFindLine = { id, name, unit: str(o.unit, 20).trim(), sell: Math.round(sell * 100) / 100 };
    if (typeof o.item_id === "string" && UUID.test(o.item_id)) line.item_id = o.item_id;
    const note = str(o.note, 200).trim();
    if (note) line.note = note;
    return [line];
  });
}

/** A Price book item's price to the customer: cost with the job's O.H., then its margin, up to the cent. */
export function sellOf(unitCost: number, overheadPct: number | null, marginPct: number | null): number | null {
  if (!Number.isFinite(unitCost) || overheadPct === null || marginPct === null || marginPct >= 100) return null;
  return Math.ceil(unitCost * (1 + overheadPct / 100) / (1 - marginPct / 100) * 100 - 1e-6) / 100;
}

// ── Edits: each returns a new list, never changes the one given.

/** Puts `page` after the page `afterId` (at the end when it isn't there). */
export function insertAfter(pages: ProposalPage[], afterId: string | null, page: ProposalPage): ProposalPage[] {
  const i = afterId ? pages.findIndex((p) => p.id === afterId) : -1;
  const at = i < 0 ? pages.length : i + 1;
  return [...pages.slice(0, at), page, ...pages.slice(at)];
}

/** Moves page `id` to sit before `beforeId` (null: to the end). */
export function movePage(pages: ProposalPage[], id: string, beforeId: string | null): ProposalPage[] {
  const p = pages.find((x) => x.id === id);
  if (!p || id === beforeId) return pages;
  const rest = pages.filter((x) => x.id !== id);
  const at = beforeId ? rest.findIndex((x) => x.id === beforeId) : -1;
  return at < 0 ? [...rest, p] : [...rest.slice(0, at), p, ...rest.slice(at)];
}

/** Moves page `id` one place up (-1) or down (+1). */
export function stepPage(pages: ProposalPage[], id: string, by: -1 | 1): ProposalPage[] {
  const i = pages.findIndex((x) => x.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= pages.length) return pages;
  const out = [...pages];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** A copy of an own page under it, "(copy)" on its name. Built pages appear once and aren't copied. */
export function duplicatePage(pages: ProposalPage[], id: string): { pages: ProposalPage[]; id: string | null } {
  const p = pages.find((x) => x.id === id);
  if (!p || isBuilt(p.kind)) return { pages, id: null };
  const copy: ProposalPage = { ...structuredCopy(p), id: newPageId(pages.map((x) => x.id)), label: `${p.label || "Page"} (copy)`.slice(0, 80), isNew: true };
  return { pages: insertAfter(pages, id, copy), id: copy.id };
}
function structuredCopy(p: ProposalPage): ProposalPage {
  return { ...p, ...(p.photos ? { photos: p.photos.map((f) => ({ ...f })) } : {}), ...(p.skip ? { skip: [...p.skip] } : {}) };
}

export const patchPage = (pages: ProposalPage[], id: string, patch: Partial<ProposalPage>) =>
  pages.map((p) => (p.id === id ? { ...p, ...patch } : p));
/** A page without its New tag. */
export function withoutNew(p: ProposalPage): ProposalPage {
  const c = { ...p };
  delete c.isNew;
  return c;
}
export const removePage = (pages: ProposalPage[], id: string) => pages.filter((p) => p.id !== id);

/** The built pages not in the list, to add back. */
export const missingBuilt = (pages: ProposalPage[]) => BUILT.filter((b) => !pages.some((p) => p.kind === b.kind));

/** A new page of a kind, named for it. */
export function makePage(kind: PageKind, taken: Iterable<string>, extra: Partial<ProposalPage> = {}): ProposalPage {
  const b = BUILT.find((x) => x.kind === kind);
  const label = b?.label ?? (kind === "photos" ? "Photos" : kind === "pdf" ? "Attached document" : "New page");
  return cleanPages([{ id: newPageId(taken), kind, label, isNew: true, ...extra }])![0];
}

// ── At a glance

/** The payment line: "Nothing due until it's done" when every draw is due at completion. */
export function paymentLine(draws: Array<{ label?: string; when?: string; pct?: number | null; amount?: number | null }>): string {
  if (!draws.length) return "Payment terms on the Payments page";
  const done = (d: { label?: string; when?: string }) => /complet|finish|done|final/i.test(`${d.label ?? ""} ${d.when ?? ""}`);
  if (draws.every(done)) return "Nothing due until it's done";
  if (draws.length === 1) return `One payment — ${draws[0].label || draws[0].when || "on completion"}`;
  const first = draws[0];
  const pct = typeof first.pct === "number" ? `${first.pct}%` : null;
  return `${draws.length} payments${pct ? ` — ${pct} ${first.label || first.when || "to start"}` : ""}`;
}

/** "Valid until Nov 22, 2026", or null when the date isn't a real one. */
export function validLabel(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

// ── The check before sending

export interface SendFinding { page: string | null; tone: "red" | "amber"; what: string }

export interface SendCheckInput {
  pages: ProposalPage[];
  /** Priced lines shown to the customer: name, qty and unit. */
  lines?: Array<{ name: string; qty: number | null; unit: string | null }>;
  ifind?: IfFindLine[];
  valid_until?: string | null;
  /** Today, YYYY-MM-DD (Central) — a Valid until in the past is a finding. */
  today?: string;
}

const UNTITLED = /^(new page|untitled|new section|page \d*|photos|attached document)?$/i;

/** What to look at before sending: an untitled or near-empty page, a line with no unit, no Valid until. */
export function sendCheck(i: SendCheckInput): SendFinding[] {
  const out: SendFinding[] = [];
  const on = i.pages.filter((p) => !p.off);
  for (const p of on) {
    const name = p.label.trim();
    if (!isBuilt(p.kind) && UNTITLED.test(name)) out.push({ page: p.id, tone: "amber", what: name ? `"${name}" still has its starting name` : "A page has no title" });
    if (p.kind === "text") {
      const words = (p.body ?? "").replace(/[#*_\-\s]+/g, " ").trim();
      if (words.length < 40) out.push({ page: p.id, tone: "amber", what: `"${name || "Untitled"}" is ${words ? "nearly" : ""} empty`.replace("  ", " ") });
    }
    if (p.kind === "photos" && !(p.photos ?? []).length) out.push({ page: p.id, tone: "amber", what: `"${name || "Photos"}" has no photos` });
    if (p.kind === "pdf" && !p.file) out.push({ page: p.id, tone: "red", what: `"${name || "Attached document"}" has no file` });
    if (p.kind === "ifind" && !(i.ifind ?? []).length) out.push({ page: p.id, tone: "amber", what: "If we find… has no prices on it" });
  }
  if (on.some((p) => p.kind === "pricing")) {
    for (const l of i.lines ?? []) if (l.qty !== null && !(l.unit ?? "").trim()) out.push({ page: on.find((p) => p.kind === "pricing")!.id, tone: "amber", what: `"${l.name}" has a quantity and no unit` });
  }
  if (on.some((p) => p.kind === "ifind")) {
    for (const l of i.ifind ?? []) if (!l.unit) out.push({ page: on.find((p) => p.kind === "ifind")!.id, tone: "amber", what: `"${l.name}" on If we find… has no unit` });
  }
  const glance = on.find((p) => p.kind === "glance");
  if (!validLabel(i.valid_until)) out.push({ page: glance?.id ?? null, tone: "amber", what: "No Valid until date" });
  else if (i.today && i.valid_until! < i.today) out.push({ page: glance?.id ?? null, tone: "red", what: `Valid until ${validLabel(i.valid_until)} has already passed` });
  return out;
}

/** A text page's body as blocks to draw: headings, bullets and paragraphs. */
export function textBlocks(body: string | undefined): Array<{ t: "h" | "p" | "ul"; text?: string; items?: string[] }> {
  const out: Array<{ t: "h" | "p" | "ul"; text?: string; items?: string[] }> = [];
  for (const chunk of (body ?? "").replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    let para: string[] = [];
    const flush = () => { if (para.length) out.push({ t: "p", text: para.join(" ") }); para = []; };
    for (const l of lines) {
      const t = l.trim();
      if (/^#{1,3}\s+/.test(t)) { flush(); out.push({ t: "h", text: t.replace(/^#{1,3}\s+/, "") }); }
      else if (/^[-•*]\s+/.test(t)) {
        flush();
        const last = out[out.length - 1];
        const item = t.replace(/^[-•*]\s+/, "");
        if (last?.t === "ul") last.items!.push(item); else out.push({ t: "ul", items: [item] });
      } else para.push(t);
    }
    flush();
  }
  return out;
}

/** The cover photo's camera stamp: "Oct 14, 2026 · 30.3864° N, 91.0710° W" — the parts known, else null. */
export function stampText(takenAt: string | null | undefined, lat: number | null | undefined, lng: number | null | undefined): string | null {
  const t = takenAt ? new Date(takenAt) : null;
  const day = t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" }) : null;
  const ok = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max && v !== 0;
  const where = ok(lat, 90) && ok(lng, 180)
    ? `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}` : null;
  return [day, where].filter(Boolean).join(" · ") || null;
}

/** Bold (**x**) and italic (_x_) inside a line of a text page, as runs to draw. */
export function inlineRuns(text: string): Array<{ t: string; b?: boolean; i?: boolean }> {
  const out: Array<{ t: string; b?: boolean; i?: boolean }> = [];
  const re = /\*\*([^*]+)\*\*|(?:^|(?<=\s))_([^_]+)_(?=\s|$|[.,;:!?)])/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push({ t: text.slice(at, m.index) });
    out.push(m[1] !== undefined ? { t: m[1], b: true } : { t: m[2], i: true });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out;
}
