/**
 * Threads v2 (Claude Design handoff, 2026-10-03; migration 073).
 *
 * Contact  — a person or desk with any number of numbers and emails (`contacts`).
 * Customer — a record built from contacts (migration 055).
 * Thread   — a saved SET of contacts. The five role buckets are system threads,
 *            worked out from contact_type (never stored); the ones Coy makes are
 *            `threads` + `thread_contacts`, optionally following a job or customer.
 * Channel  — one way to reach one contact: each phone number is its own channel
 *            (calls, voicemails and texts in one timeline), plus email and chat.
 *
 * Pure — tests/threads-v2.test.mjs runs it.
 */

/** The system threads, by the keys the list and /api/threads/counts already use. */
// "all" is everyone not archived and not spam (Coy, 2026-10-04: "an 'ALL' thread as a catchall").
export type SystemThreadKey = "all" | "customers" | "unsorted" | "vendors" | "personal" | "spam";
export const SYSTEM_KEYS: SystemThreadKey[] = ["all", "customers", "unsorted", "vendors", "personal", "spam"];
export const isSystemKey = (k: string | null | undefined): k is SystemThreadKey => !!k && (SYSTEM_KEYS as string[]).includes(k);

export const SYSTEM_DESCRIPTION: Record<SystemThreadKey, string> = {
  all: "Everyone — every bucket, unsorted too — except spam and the archived.",
  customers: "Everyone filed as a customer — the people who pay you.",
  unsorted: "The inbox: everyone nobody has filed yet.",
  vendors: "Suppliers, subs and anyone you pay.",
  personal: "Friends and family — kept out of the work.",
  spam: "Filed as spam. Never counted anywhere else.",
};

export interface CustomThread {
  id: string;
  name: string;
  job_id: string | null;
  customer_id: string | null;
  source: "job" | "customer" | "manual";
  /** "Wilson driveway · Estimating · 4411 Perkins Rd" for a job thread. */
  job_line: string | null;
  contact_ids: string[];
  count: number;
}

export type ContactRole = "customer" | "contact" | "vendor" | "sub" | "other" | "personal" | "spam" | "unsorted";

export const ROLE_LABEL: Record<ContactRole, string> = {
  customer: "Customer", contact: "Cust. contact", vendor: "Vendor", sub: "Sub",
  other: "Other", personal: "Personal", spam: "Spam", unsorted: "Unsorted",
};

/** The role order for "By role". */
export const ROLE_ORDER: ContactRole[] = ["customer", "contact", "vendor", "sub", "other", "personal", "unsorted", "spam"];

/**
 * A row's role, from its bucket and its place on its customer: the primary
 * person (or the only one) is the customer; anyone else on that customer is a
 * customer's contact. A vendor filed as a subcontractor is a sub.
 */
export function roleOf(r: { bucket: string | null; subtype: string | null; customer_id: string | null; is_primary_on_customer: boolean; customer_people: number }): ContactRole {
  switch (r.bucket) {
    case "customer": return r.customer_id && r.customer_people > 1 && !r.is_primary_on_customer ? "contact" : "customer";
    case "vendor": return r.subtype === "subcontractor" || r.subtype === "looking_for_work" ? "sub" : "vendor";
    case "personal": return "personal";
    case "spam": return "spam";
    default: return "unsorted";
  }
}

/** "WD" from "Wilson Driveway Repair"; "#" for no name. */
export function initials(name: string | null | undefined): string {
  const w = (name ?? "").replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "#";
  return (w[0][0] + (w[1]?.[0] ?? w[0][1] ?? "")).toUpperCase();
}

export type ThreadSort = "recent" | "az" | "role";
export const THREAD_SORTS: Array<{ k: ThreadSort; label: string }> = [
  { k: "recent", label: "Recent" }, { k: "az", label: "A–Z" }, { k: "role", label: "By role" },
];
export const nextSort = (s: ThreadSort): ThreadSort => (s === "recent" ? "az" : s === "az" ? "role" : "recent");

type Sortable = { display_name: string; name_is_phone: boolean; occurred_at: string | null; role?: ContactRole };
/** Recent: newest first. A–Z: by name, numbers last. By role: role order, then newest. */
export function sortRows<T extends Sortable>(rows: T[], s: ThreadSort): T[] {
  const out = [...rows];
  const recent = (a: T, b: T) => (b.occurred_at ?? "").localeCompare(a.occurred_at ?? "");
  if (s === "az") out.sort((a, b) => (a.name_is_phone === b.name_is_phone ? a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }) : a.name_is_phone ? 1 : -1));
  else if (s === "role") out.sort((a, b) => ROLE_ORDER.indexOf(a.role ?? "unsorted") - ROLE_ORDER.indexOf(b.role ?? "unsorted") || recent(a, b));
  else out.sort(recent);
  return out;
}

/** "notes" is the person's internal notes (Coy, 2026-10-04) — added by the page, never by buildChannels(). */
export type ChannelKind = "phone" | "email" | "chat" | "notes";
export interface Channel {
  key: string;                      // "phone:+12255550211" | "email:mark@…" | "chat"
  kind: ChannelKind;
  label: string;                    // "Mobile" | "Work" | "Phone 2" | "Email" | "Chat"
  value: string | null;             // the number / address
  calls: number; texts: number; emails: number;
  reachable: boolean;               // false → shown at half strength (no address, chat not joined)
}
export type ChannelFilter = "all" | "call" | "text";

/**
 * A contact's channels: one per phone number (every number on them, and any
 * number their messages came from), then email, then chat (not joined — the
 * in-app chat isn't built). Counts come from the messages.
 */
export function buildChannels(input: {
  phones: Array<{ phone: string; label: string | null; is_primary: boolean }>;
  emails: Array<{ email: string; label: string | null }>;
  messages: Array<{ channel: string | null; counterparty: string | null }>;
  emailCount: number;
}): Channel[] {
  const per = new Map<string, { calls: number; texts: number }>();
  for (const m of input.messages) {
    if (!m.counterparty) continue;
    const e = per.get(m.counterparty) ?? { calls: 0, texts: 0 };
    if (m.channel === "call" || m.channel === "voicemail") e.calls++; else e.texts++;
    per.set(m.counterparty, e);
  }
  const phones = [...input.phones].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  for (const p of per.keys()) if (!phones.some((x) => x.phone === p)) phones.push({ phone: p, label: null, is_primary: false });
  // The busiest number first when none is primary.
  if (!phones.some((p) => p.is_primary)) phones.sort((a, b) => total(per.get(b.phone)) - total(per.get(a.phone)));
  const out: Channel[] = phones.map((p, i) => {
    const c = per.get(p.phone) ?? { calls: 0, texts: 0 };
    return { key: `phone:${p.phone}`, kind: "phone", label: p.label?.trim() || (i === 0 ? "Mobile" : `Phone ${i + 1}`), value: p.phone,
      calls: c.calls, texts: c.texts, emails: 0, reachable: true };
  });
  const email = input.emails[0];
  out.push({ key: email ? `email:${email.email}` : "email", kind: "email", label: "Email", value: email?.email ?? null,
    calls: 0, texts: 0, emails: input.emailCount, reachable: !!email || input.emailCount > 0 });
  out.push({ key: "chat", kind: "chat", label: "Chat", value: null, calls: 0, texts: 0, emails: 0, reachable: false });
  return out;
}
const total = (c: { calls: number; texts: number } | undefined) => (c ? c.calls + c.texts : 0);

/** Which messages a channel and filter show. Calls include voicemails. */
export function inChannel(m: { channel: string | null; counterparty: string | null }, ch: Channel | null, f: ChannelFilter): boolean {
  if (ch && ch.kind === "phone" && m.counterparty && m.counterparty !== ch.value) return false;
  if (ch && ch.kind !== "phone") return false;
  const isCall = m.channel === "call" || m.channel === "voicemail";
  return f === "all" || (f === "call" ? isCall : !isCall);
}

export type SearchScope = "channel" | "contact" | "thread";
export type SearchType = "msg" | "photo" | "file" | "link" | "call" | "vm";
export const SEARCH_TYPES: Array<{ k: "all" | SearchType; label: string }> = [
  { k: "all", label: "All" }, { k: "msg", label: "Messages" }, { k: "photo", label: "Photos" }, { k: "file", label: "Files" },
  { k: "link", label: "Links" }, { k: "call", label: "Calls" }, { k: "vm", label: "Voicemail" },
];
const PHOTO = new Set(["photo", "image", "video"]);
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+\.\w{2,}/i;

/** What a message is, for the search panel's chips: a voicemail, a call, a photo, a file, a link, or words. */
export function messageType(m: { channel: string | null; summary_source?: string | null; body_text: string | null; media_kinds?: string[] }): SearchType {
  if (m.channel === "voicemail" || m.summary_source === "quo_voicemail") return "vm";
  if (m.channel === "call") return "call";
  const kinds = m.media_kinds ?? [];
  if (kinds.some((k) => PHOTO.has(k))) return "photo";
  if (kinds.length) return "file";
  if (LINK.test(m.body_text ?? "")) return "link";
  return "msg";
}

/**
 * One search box, no scope or type buttons (Coy, 2026-10-05: "I don't need the 'this number,
 * john, whole thread' buttons … if the search features have intelligence built in"). A word that
 * names a kind of thing — photos, pictures, files, PDFs, links, calls, voicemail — picks the type
 * and is taken out of the words; whatever is left is searched for.
 */
const TYPE_WORDS: Array<[RegExp, SearchType]> = [
  [/^(photos?|pics?|pictures?|images?|videos?)$/i, "photo"],
  [/^(files?|pdfs?|docs?|documents?|attachments?)$/i, "file"],
  [/^(links?|urls?|websites?)$/i, "link"],
  [/^(voicemails?|vms?)$/i, "vm"],
  [/^(calls?|phonecalls?)$/i, "call"],
  [/^(texts?|messages?|sms)$/i, "msg"],
];
export function readThreadQuery(q: string): { words: string; type: "all" | SearchType } {
  let type: "all" | SearchType = "all";
  const keep: string[] = [];
  for (const w of q.trim().split(/\s+/).filter(Boolean)) {
    const hit: [RegExp, SearchType] | undefined = type === "all" ? TYPE_WORDS.find(([re]) => re.test(w.replace(/[.,!?]$/, ""))) : undefined;
    if (hit) type = hit[1]; else keep.push(w);
  }
  return { words: keep.join(" "), type };
}
