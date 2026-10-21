/**
 * @email in a thread's text box (Coy, 2026-10-20: "writing emails just by typing @email and then it makes
 * the to: address rows with drop down selections that pull from both database emails … and possibly device
 * contacts", the way Google Docs puts an email draft in a doc). The box becomes an email: To and Cc rows, a
 * subject, the words as its body, sent from the org's inbox on two taps through /api/emails/send.
 *
 * Pure rules here; tested in tests/email-mention.test.mjs.
 */

/** "@email" (or "@mail") as the last word typed, at the start or after a space. */
const AT_EMAIL = /(^|\s)@e?mail$/i;

/** Did the box just get "@email" typed at its end? Returns the words without it, else null. */
export function atEmail(text: string): string | null {
  if (!AT_EMAIL.test(text)) return null;
  return text.replace(AT_EMAIL, "$1").replace(/\s+$/, "");
}

export interface AddressHit {
  email: string;
  name: string | null;
  /** Customer, Vendor … for a person in Contacts; "Emailed before" for an address only seen on mail. */
  role: string;
  contact_id: string | null;
}

interface BookLike { id: string; name: string | null; company: string | null; role_label: string; emails: Array<{ address: string }> }
interface MailLike {
  from_address: string | null; from_name: string | null;
  original_from_address: string | null; original_from_name: string | null;
  to_addresses: string[] | null; cc_addresses: string[] | null;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9@.+_-]+/).filter(Boolean);

/** Every part of the query is in the name, company or address. */
function hits(q: string, ...fields: Array<string | null>): boolean {
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return words(q).every((w) => hay.includes(w));
}

/**
 * Who an address field offers for what's typed: people in Contacts first (by their email), then addresses
 * that wrote to or were written to from the inbox and are on no one, newest mail first. Our own inboxes never.
 */
export function addressHits(q: string, book: BookLike[], mail: MailLike[], ours: string[], limit = 8): AddressHit[] {
  const query = q.trim();
  if (query.length < 1) return [];
  const own = new Set(ours.map((a) => a.toLowerCase()));
  const out: AddressHit[] = [];
  const seen = new Set<string>();
  const add = (h: AddressHit) => {
    const e = h.email.toLowerCase();
    if (!e.includes("@") || own.has(e) || seen.has(e)) return;
    seen.add(e);
    out.push({ ...h, email: e });
  };
  for (const c of book) {
    for (const e of c.emails) {
      if (hits(query, c.name, c.company, e.address)) add({ email: e.address, name: c.name, role: c.role_label, contact_id: c.id });
    }
  }
  const named = new Map<string, string | null>();
  for (const m of mail) {
    const pairs: Array<[string | null, string | null]> = [
      [m.original_from_address, m.original_from_name], [m.from_address, m.from_name],
      ...(m.to_addresses ?? []).map((a): [string, null] => [a, null]),
      ...(m.cc_addresses ?? []).map((a): [string, null] => [a, null]),
    ];
    for (const [a, n] of pairs) {
      if (!a) continue;
      const e = a.toLowerCase();
      if (!named.has(e) || (n && !named.get(e))) named.set(e, n);
    }
  }
  for (const [e, n] of named) if (hits(query, n, e)) add({ email: e, name: n, role: "Emailed before", contact_id: null });
  return out.slice(0, limit);
}
