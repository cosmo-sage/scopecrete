/**
 * Contacts — the book, read on the server (src/app/api/contacts). Session
 * client only: RLS decides who is in it. See src/lib/contacts-book.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookRole, roleLabel, type BookEntry } from "@/lib/contacts-book";

const COLS = "id, name, company_name, phone, email, address, city, state, zip, contact_type, contact_subtype, classification_confirmed_at, auto_classified_at, customer_id, is_primary, last_contacted, created_at, archived_at";

interface Row {
  id: string; name: string | null; company_name: string | null; phone: string | null; email: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  contact_type: string | null; contact_subtype: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null;
  customer_id: string | null; is_primary: boolean | null; last_contacted: string | null; created_at: string | null; archived_at: string | null;
}

/** Everyone in the org as book entries (≤ 3,000). */
export async function loadBook(supabase: SupabaseClient, orgId: string, opts: { archived?: boolean; ids?: string[] } = {}): Promise<BookEntry[]> {
  let q = supabase.from("contacts").select(COLS).eq("org_id", orgId).is("merged_into_contact_id", null);
  if (!opts.archived) q = q.is("archived_at", null);
  if (opts.ids) q = q.in("id", opts.ids);
  const [{ data: rows, error }, { data: ph }, { data: em }, { data: cu }] = await Promise.all([
    q.order("created_at", { ascending: false }).limit(3000),
    supabase.from("contact_phones").select("contact_id, phone_e164, label, is_primary").eq("org_id", orgId).limit(10000),
    supabase.from("contact_emails").select("contact_id, email, label, is_primary").eq("org_id", orgId).limit(10000),
    supabase.from("customers").select("id, name, primary_contact_id").eq("org_id", orgId).limit(5000),
  ]);
  if (error) throw new Error(`contacts: ${error.message}`);
  const people = (rows ?? []) as Row[];
  const phones = new Map<string, Array<{ number: string; label: string | null; primary: boolean }>>();
  for (const p of (ph ?? []) as Array<{ contact_id: string; phone_e164: string; label: string | null; is_primary: boolean }>) {
    const l = phones.get(p.contact_id) ?? []; l.push({ number: p.phone_e164, label: p.label, primary: p.is_primary }); phones.set(p.contact_id, l);
  }
  const emails = new Map<string, Array<{ address: string; label: string | null; primary: boolean }>>();
  for (const e of (em ?? []) as Array<{ contact_id: string; email: string; label: string | null; is_primary: boolean }>) {
    const l = emails.get(e.contact_id) ?? []; l.push({ address: String(e.email).toLowerCase(), label: e.label, primary: e.is_primary }); emails.set(e.contact_id, l);
  }
  const custs = new Map(((cu ?? []) as Array<{ id: string; name: string | null; primary_contact_id: string | null }>).map((c) => [c.id, c]));
  const custPeople = new Map<string, number>();
  for (const p of people) if (p.customer_id && !p.archived_at) custPeople.set(p.customer_id, (custPeople.get(p.customer_id) ?? 0) + 1);

  return people.flatMap((p): BookEntry[] => {
    const shown = !!(p.classification_confirmed_at || p.auto_classified_at);
    if (shown && p.contact_type === "spam") return [];
    // The main number first, then the rest; the same number once.
    const nums = [...(phones.get(p.id) ?? [])].sort((a, b) => Number(b.primary) - Number(a.primary));
    const allPhones = [...(p.phone ? [{ number: p.phone, label: nums.find((n) => n.number === p.phone)?.label ?? null }] : []),
      ...nums.filter((n) => n.number !== p.phone).map((n) => ({ number: n.number, label: n.label }))];
    const mails = [...(emails.get(p.id) ?? [])].sort((a, b) => Number(b.primary) - Number(a.primary));
    const own = p.email?.toLowerCase() ?? null;
    const allEmails = [...(own ? [{ address: own, label: mails.find((m) => m.address === own)?.label ?? null }] : []),
      ...mails.filter((m) => m.address !== own).map((m) => ({ address: m.address, label: m.label }))];
    const cust = p.customer_id ? custs.get(p.customer_id) : undefined;
    const role = bookRole({
      contact_type: p.contact_type, contact_subtype: p.contact_subtype, shown, customer_id: p.customer_id,
      is_primary_on_customer: cust ? cust.primary_contact_id === p.id || !!p.is_primary : false, customer_people: p.customer_id ? custPeople.get(p.customer_id) ?? 1 : 0,
    });
    const name = p.name?.trim() && !/^\+?[\d\s().-]{7,}$/.test(p.name.trim()) ? p.name.trim() : null;
    return [{
      id: p.id, name, company: p.company_name?.trim() && p.company_name.trim() !== name ? p.company_name.trim() : null,
      phones: allPhones, emails: allEmails,
      address: placeLine(p),
      role, role_label: roleLabel(role),
      customer_id: p.customer_id, customer_name: cust?.name?.trim() || null,
      last_contacted: p.last_contacted, created_at: p.created_at, archived: !!p.archived_at,
    }];
  });
}

/** "4411 Perkins Rd, Baton Rouge, LA 70808" — the city added only when the line doesn't already say it. */
function placeLine(p: { address: string | null; city: string | null; state: string | null; zip: string | null }): string | null {
  const line = p.address?.trim();
  if (!line) return null;
  const tail = [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter((x) => x && !line.toLowerCase().includes(x.toLowerCase()));
  return [line, ...tail].join(", ");
}

/** The person a number or email already belongs to, following merges — or null. */
export async function ownerOf(supabase: SupabaseClient, orgId: string, kind: "phone" | "email", value: string): Promise<{ id: string; name: string | null } | null> {
  const [own, extra] = kind === "phone"
    ? [supabase.from("contacts").select("id, name, merged_into_contact_id").eq("org_id", orgId).eq("phone", value).limit(1).maybeSingle(),
      supabase.from("contact_phones").select("contact_id").eq("org_id", orgId).eq("phone_e164", value).limit(1).maybeSingle()]
    : [supabase.from("contacts").select("id, name, merged_into_contact_id").eq("org_id", orgId).ilike("email", value).limit(1).maybeSingle(),
      supabase.from("contact_emails").select("contact_id").eq("org_id", orgId).eq("email", value).limit(1).maybeSingle()];
  const [{ data: a }, { data: b }] = await Promise.all([own, extra]);
  const id = (a?.merged_into_contact_id as string | null) ?? (a?.id as string | undefined) ?? (b?.contact_id as string | undefined);
  if (!id) return null;
  const { data: who } = await supabase.from("contacts").select("id, name, merged_into_contact_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!who) return null;
  const real = (who.merged_into_contact_id as string | null) ?? (who.id as string);
  if (real !== who.id) {
    const { data: w2 } = await supabase.from("contacts").select("id, name").eq("org_id", orgId).eq("id", real).maybeSingle();
    return w2 ? { id: w2.id as string, name: (w2.name as string | null) ?? null } : null;
  }
  return { id: who.id as string, name: (who.name as string | null) ?? null };
}

