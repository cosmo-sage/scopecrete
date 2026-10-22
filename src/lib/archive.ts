/**
 * Archive and delete (migration 066; Coy, 2026-10-03). Pure rules, shared by the
 * API, the screens and Dusty's plans. tests/archive.test.mjs runs them.
 *
 * Coy's answers: Delete removes from every list and is restorable (calls, texts
 * and files stay on record); an archived number that gets in touch again comes
 * back, like email.
 */

export type ArchiveKind = "contact" | "customer" | "job";
export type ArchiveAction = "archive" | "delete";

/**
 * Is this thread out of the lists right now? Archived, and nothing has come IN
 * from them since — a call or text after archiving brings it back.
 */
export function isArchivedNow(archivedAt: string | null | undefined, lastInboundAt: string | null | undefined): boolean {
  if (!archivedAt) return false;
  const a = Date.parse(archivedAt);
  if (!Number.isFinite(a)) return false;
  const last = lastInboundAt ? Date.parse(lastInboundAt) : NaN;
  return !(Number.isFinite(last) && last > a);
}

/**
 * A thread where nothing was ever said: every message is a call with no words —
 * no summary, no voicemail, no transcript — and no text was sent either way.
 * These are the ones Coy archives by the dozen.
 */
export function isSilent(msgs: Array<{ channel: string | null; body_text?: string | null; summary?: string | null }>): boolean {
  if (!msgs.length) return false;
  return msgs.every((m) => m.channel === "call" && !(m.body_text ?? "").trim() && !(m.summary ?? "").trim());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** At most this many in one tap (the Threads list holds a few hundred people). */
export const MAX_IDS = 500;

export function cleanIds(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.length || v.length > MAX_IDS) return null;
  if (!v.every((x) => typeof x === "string" && UUID.test(x))) return null;
  return [...new Set((v as string[]).map((x) => x.toLowerCase()))];
}

export function archiveLabel(kind: ArchiveKind, action: ArchiveAction, n: number): string {
  const what = kind === "job" ? (n === 1 ? "job" : "jobs") : kind === "customer" ? (n === 1 ? "customer" : "customers")
    : action === "delete" ? (n === 1 ? "vendor" : "vendors") : (n === 1 ? "thread" : "threads");
  return `${action === "delete" ? "Deleted" : "Archived"} ${n} ${what}`;
}

/**
 * An internal note written when something was archived or deleted with a
 * reason ("Archived — wrong number"; archiveRecords()), so it can stand out
 * among the other notes (Coy, 2026-10-04: "make the archive note stand out").
 * Null for any other note.
 */
export function archiveNote(body: string | null | undefined): { verb: "Archived" | "Deleted"; reason: string; byDusty: boolean } | null {
  const m = /^(Archived|Deleted) — ([\s\S]+)$/.exec((body ?? "").trim());
  if (!m) return null;
  const byDusty = /\(Dusty's plan\)\s*$/.test(m[2]);
  return { verb: m[1] as "Archived" | "Deleted", reason: m[2].replace(/\s*\(Dusty's plan\)\s*$/, "").trim(), byDusty };
}

/**
 * The internal note left when a vendor is deleted but the contact is kept
 * (Coy, 2026-10-22): "Taken off Vendors — <why>". Null with no reason given.
 */
export function vendorRemovedNote(reason: string | null | undefined): string | null {
  const r = (reason ?? "").trim();
  return r ? `Taken off Vendors — ${r.slice(0, 300)}` : null;
}
