/**
 * Incoming alerts (Coy, 2026-10-06: "There needs to be a way for me to be
 * notified inside the scopecrete app for incoming emails, text messages and
 * phone calls. And if there is an active phone call I would like that thread
 * channel to show it's active.")
 *
 * Pure shaping, shared by /api/alerts and the bell / pop-ups
 * (src/components/v34/incoming-alerts.tsx). Tested in tests/alerts.test.mjs.
 */

export type AlertKind = "text" | "call" | "email" | "bid";

export interface Alert {
  /** "m:<message id>", "e:<email id>" or "b:<recipient id>:<when opened>" — stable, so a re-read never doubles one. */
  id: string;
  kind: AlertKind;
  /** When it reached ScopeCrete (not when it was sent). */
  at: string;
  title: string;
  body: string;
  href: string | null;
  contact_id: string | null;
}

export interface LiveCall {
  id: string;
  call_id: string;
  contact_id: string | null;
  /** The other party's number. */
  phone: string | null;
  name: string | null;
  direction: "inbound" | "outbound" | null;
  status: "ringing" | "answered";
  started_at: string;
  answered_at: string | null;
  line: string | null;
  href: string | null;
}

/** A ring with no completion after this long is taken as lost, not live. */
export const LIVE_MAX_MS = 2 * 60 * 60 * 1000;

export function prettyPhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return raw ?? "";
}

/** A name that is only a phone number is no name. */
export function who(name: string | null | undefined, phone: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n && /[a-z]/i.test(n)) return n;
  return prettyPhone(phone) || "Unknown number";
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export interface MessageRow {
  id: string;
  contact_id: string | null;
  channel: string;
  body_text: string | null;
  summary: string | null;
  created_at: string;
  media?: number;
}

export interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  contact_type: string | null;
  classification_confirmed_at: string | null;
  auto_classified_at: string | null;
}

/** Someone filed as spam (by Coy or Dusty) raises no alert. */
export function isFiledSpam(c: ContactRow | undefined): boolean {
  return !!c && c.contact_type === "spam" && !!(c.classification_confirmed_at || c.auto_classified_at);
}

export function messageAlert(m: MessageRow, c: ContactRow | undefined): Alert | null {
  if (isFiledSpam(c)) return null;
  const name = who(c?.name, c?.phone);
  const href = m.contact_id ? `/dashboard/messages/${m.contact_id}` : null;
  if (m.channel === "call" || m.channel === "voicemail") {
    const said = (m.summary ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    return { id: `m:${m.id}`, kind: "call", at: m.created_at, title: `Call from ${name}`, body: said ? clip(said, 140) : "Tap to open the thread", href, contact_id: m.contact_id };
  }
  const text = (m.body_text ?? "").trim();
  const body = text ? clip(text, 140) : m.media ? (m.media === 1 ? "Sent a photo or file" : `Sent ${m.media} photos or files`) : "Sent a text";
  return { id: `m:${m.id}`, kind: "text", at: m.created_at, title: `Text from ${name}`, body, href, contact_id: m.contact_id };
}

export interface EmailRow {
  id: string;
  created_at: string;
  original_from_name: string | null;
  original_from_address: string | null;
  from_name: string | null;
  from_address: string | null;
  subject: string | null;
  contact_id: string | null;
  status: string | null;
}

export function emailAlert(e: EmailRow): Alert {
  const from = (e.original_from_name ?? "").trim() || (e.original_from_address ?? "").trim() || (e.from_name ?? "").trim() || (e.from_address ?? "").trim() || "someone";
  const subject = (e.subject ?? "").replace(/^\s*(fwd?|fw)\s*:\s*/i, "").trim() || "(no subject)";
  const filed = e.status === "filed" ? "" : " · not filed yet";
  return { id: `e:${e.id}`, kind: "email", at: e.created_at, title: `Email from ${from}`, body: clip(subject, 120) + filed, href: `/dashboard/files?email=${e.id}`, contact_id: e.contact_id };
}

/** A vendor's bid request link, opened (Coy, 2026-10-23: "a notification of when they open the
 *  document"). Each vendor's row keeps only its last opening (migration 091), so an opening is that
 *  row at that moment — a later one is a new alert. */
export interface BidOpenRow {
  id: string;
  bid_request_id: string;
  view_count: number;
  last_viewed_at: string;
  answered_at: string | null;
  vendor: { name: string | null; phone: string | null } | null;
  request: { job_id: string | null; job: { title: string | null } | null } | null;
}

export function bidOpenAlert(r: BidOpenRow): Alert {
  const name = who(r.vendor?.name, r.vendor?.phone);
  const job = (r.request?.job?.title ?? "").trim();
  const times = r.view_count > 1 ? `opened ${r.view_count} times` : "first time opened";
  const href = r.request?.job_id ? `/dashboard/scope/${r.request.job_id}/summary?bid=${r.bid_request_id}` : null;
  return {
    id: `b:${r.id}:${r.last_viewed_at}`, kind: "bid", at: r.last_viewed_at,
    title: `${name} opened your bid request`,
    body: clip(`${job || "A job"} · ${times}${r.answered_at ? " · already priced" : " · no price yet"}`, 140),
    href, contact_id: null,
  };
}

export interface BidMessageRow {
  id: string;
  bid_request_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  vendor: { name: string | null; phone: string | null } | null;
  request: { job_id: string | null; job: { title: string | null } | null } | null;
}

/** A vendor writing on their bid link's chat (migration 130). */
export function bidMessageAlert(r: BidMessageRow): Alert {
  const name = who(r.vendor?.name || r.author_name, r.vendor?.phone);
  const job = (r.request?.job?.title ?? "").trim();
  return {
    id: `bm:${r.id}`, kind: "bid", at: r.created_at,
    title: `${name} wrote on your bid request${job ? ` · ${job}` : ""}`,
    body: clip(r.body, 140),
    href: r.request?.job_id ? `/dashboard/scope/${r.request.job_id}/summary?bid=${r.bid_request_id}` : null,
    contact_id: null,
  };
}

/** Newest first, one per id. */
export function mergeAlerts(a: Alert[], b: Alert[], max = 40, c: Alert[] = [], d: Alert[] = []): Alert[] {
  const seen = new Set<string>();
  return [...a, ...b, ...c, ...d]
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
    .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
    .slice(0, max);
}

export function unreadCount(items: Alert[], seenAt: string | null): number {
  if (!seenAt) return items.length;
  return items.filter((x) => x.at > seenAt).length;
}

const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

/** The live call on this person — and, given a number, on that number only. */
export function liveCallFor(calls: LiveCall[], contactId: string | null | undefined, phone?: string | null): LiveCall | null {
  const p = digits(phone);
  return calls.find((c) => {
    if (p) return digits(c.phone) === p && (!contactId || !c.contact_id || c.contact_id === contactId);
    return !!contactId && c.contact_id === contactId;
  }) ?? null;
}

/** "Ringing" until answered (when Quo says so), then "On a call · 3:07". */
export function liveLabel(c: LiveCall, now: number): string {
  if (c.status === "ringing") {
    const since = now - Date.parse(c.started_at);
    // Quo may never say a call was answered: after a minute of "ringing" it is a call.
    if (!(since > 60_000)) return c.direction === "outbound" ? "Calling…" : "Ringing";
  }
  const from = Date.parse(c.answered_at ?? c.started_at);
  const s = Math.max(0, Math.floor((now - from) / 1000));
  return `On a call · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
