/**
 * Contacts — the book (Coy, 2026-10-05: "a Rolodex or contacts book of some
 * kind for pure contact info that can be pulled into any thread and any
 * channel and any vendor contact and any customer contact" — "Call it
 * contacts").
 *
 * There is no second table: the book IS `contacts` (one row per person), with
 * their extra numbers in `contact_phones` and emails in `contact_emails`.
 * Customer, vendor, personal and spam stay what they were — how a person is
 * filed. This module is the pure part: reading a new contact from the
 * browser, matching a search, sorting. Tested in tests/contacts-book.test.mjs.
 */

import { roleOf, ROLE_LABEL, type ContactRole } from "./v34/threads.ts";

export interface BookPhone { number: string; label: string | null }
export interface BookEmail { address: string; label: string | null }

/** One person in the book, as /api/contacts returns them. */
export interface BookEntry {
  id: string;
  name: string | null;
  company: string | null;
  phones: BookPhone[];
  emails: BookEmail[];
  address: string | null;
  role: ContactRole;
  role_label: string;
  customer_id: string | null;
  customer_name: string | null;
  last_contacted: string | null;
  created_at: string | null;
  archived: boolean;
}

export const BOOK_ROLES: ContactRole[] = ["customer", "contact", "vendor", "sub", "personal", "unsorted"];

/** The role the book shows: only a bucket Coy (or Dusty) actually filed counts; anyone else is Unsorted. */
export function bookRole(c: {
  contact_type: string | null; contact_subtype: string | null; shown: boolean;
  customer_id: string | null; is_primary_on_customer: boolean; customer_people: number;
}): ContactRole {
  return roleOf({
    bucket: c.shown ? c.contact_type : null, subtype: c.contact_subtype, customer_id: c.customer_id,
    is_primary_on_customer: c.is_primary_on_customer, customer_people: c.customer_people,
  });
}
export const roleLabel = (r: ContactRole) => ROLE_LABEL[r];

/** A US number as E.164, or null. */
export function phoneE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+")) return digits.length >= 10 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export const cleanEmail = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return EMAIL_RE.test(e) && e.length <= 160 ? e : null;
};

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const label = (v: unknown) => text(v, 30);

export interface NewContact {
  name: string | null;
  company: string | null;
  phones: BookPhone[];
  emails: BookEmail[];
  address: string | null; city: string | null; state: string | null; zip: string | null;
  /** File them on the way in — Coy's tap, so a human confirmation. Null = Unsorted. */
  bucket: "customer" | "vendor" | "personal" | null;
  subtype: string | null;
}

/**
 * A new contact from the browser, cleaned. A person needs a name or a way to
 * reach them; every number and email has to read as one (a bad one is an
 * error by name, never dropped quietly); duplicates within the form fold.
 */
export function readNewContact(b: unknown): { ok: true; contact: NewContact } | { ok: false; error: string } {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const name = text(o.name, 120), company = text(o.company, 120);
  const phones: BookPhone[] = [], emails: BookEmail[] = [];
  const rawPhones = Array.isArray(o.phones) ? o.phones : o.phone ? [{ number: o.phone }] : [];
  for (const p of rawPhones.slice(0, 8)) {
    const raw = typeof p === "string" ? p : (p as Record<string, unknown>)?.number;
    if (typeof raw !== "string" || !raw.trim()) continue;
    const n = phoneE164(raw);
    if (!n) return { ok: false, error: `"${raw.trim()}" doesn't look like a phone number.` };
    if (!phones.some((x) => x.number === n)) phones.push({ number: n, label: typeof p === "object" ? label((p as Record<string, unknown>).label) : null });
  }
  const rawEmails = Array.isArray(o.emails) ? o.emails : o.email ? [{ address: o.email }] : [];
  for (const e of rawEmails.slice(0, 8)) {
    const raw = typeof e === "string" ? e : (e as Record<string, unknown>)?.address;
    if (typeof raw !== "string" || !raw.trim()) continue;
    const a = cleanEmail(raw);
    if (!a) return { ok: false, error: `"${raw.trim()}" doesn't look like an email address.` };
    if (!emails.some((x) => x.address === a)) emails.push({ address: a, label: typeof e === "object" ? label((e as Record<string, unknown>).label) : null });
  }
  if (!name && !company && !phones.length && !emails.length) return { ok: false, error: "Give them a name, a number or an email." };
  const bucket = o.bucket === "customer" || o.bucket === "vendor" || o.bucket === "personal" ? o.bucket : null;
  const state = text(o.state, 20);
  return {
    ok: true,
    contact: {
      name, company, phones, emails,
      address: text(o.address, 200), city: text(o.city, 80), state: state ? state.toUpperCase() : null, zip: text(o.zip, 12),
      bucket, subtype: bucket === "vendor" ? text(o.subtype, 40) : null,
    },
  };
}

/** What a new contact's row is called: their name, else the company's. */
export const displayName = (e: { name: string | null; company: string | null; phones: BookPhone[]; emails: BookEmail[] }) =>
  e.name || e.company || (e.phones[0] ? formatNumber(e.phones[0].number) : e.emails[0]?.address ?? "No name");

export function formatNumber(n: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(n);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
}

/**
 * Does this person match what was typed? Every word must be found in their
 * name, company, emails, address, customer or role; a run of 3+ digits also
 * matches inside any of their numbers ("4462" finds (225) 446-2212).
 */
export function matchesBook(e: Pick<BookEntry, "name" | "company" | "emails" | "phones" | "address" | "customer_name" | "role_label">, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [e.name, e.company, e.address, e.customer_name, e.role_label, ...e.emails.map((x) => x.address), ...e.phones.map((x) => x.label)]
    .filter(Boolean).join(" ").toLowerCase();
  const nums = e.phones.map((p) => p.number.replace(/\D/g, ""));
  return s.split(/\s+/).every((w) => {
    if (hay.includes(w)) return true;
    const d = w.replace(/\D/g, "");
    return d.length >= 3 && d.length === w.replace(/[\s().+-]/g, "").length && nums.some((n) => n.includes(d));
  });
}

export type BookSort = "az" | "recent";

/** A–Z by name (no name last), or most recently in touch first. */
export function sortBook<T extends Pick<BookEntry, "name" | "company" | "last_contacted" | "created_at">>(rows: T[], sort: BookSort): T[] {
  const key = (r: T) => (r.name || r.company || "").toLowerCase();
  return [...rows].sort((a, b) => {
    if (sort === "recent") {
      const ta = a.last_contacted ?? a.created_at ?? "", tb = b.last_contacted ?? b.created_at ?? "";
      if (ta !== tb) return ta < tb ? 1 : -1;
    }
    const ka = key(a), kb = key(b);
    if (!ka !== !kb) return ka ? -1 : 1;
    return ka.localeCompare(kb);
  });
}

/** Does a match rank higher: a name that starts with what was typed first. */
export function rankBook<T extends Pick<BookEntry, "name" | "company">>(rows: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  const starts = (r: T) => ((r.name ?? "").toLowerCase().startsWith(s) || (r.company ?? "").toLowerCase().startsWith(s) ? 0 : 1);
  return [...rows].sort((a, b) => starts(a) - starts(b));
}
