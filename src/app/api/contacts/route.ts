import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { matchesBook, rankBook, readNewContact, sortBook } from "@/lib/contacts-book";
import { loadBook, ownerOf } from "@/lib/contacts-server";

/**
 * Contacts — the book (Coy, 2026-10-05: "Call it contacts"). Every person in
 * the org, whatever they are filed as, with every number and email. There is
 * no second table: this reads `contacts` + `contact_phones` + `contact_emails`.
 *
 * GET ?q=&role=&archived=1&limit=&sort=az|recent
 *   → { contacts: BookEntry[], total } — merged-away people never; spam
 *     never; the archived only with archived=1. `q` matches name, company,
 *     email, address, their customer and any run of digits in a number.
 * POST { name?, company?, phones: [{number, label}], emails: [{address,
 *   label}], address?, city?, state?, zip?, bucket?, subtype? }
 *   → 201 { contact } — someone who hasn't called yet. A number or email
 *     already on a person is not a second person: 409 { existing } names who.
 *     A bucket given is Coy's tap, filed through sc_classify_contact (the one
 *     writer); none leaves them Unsorted.
 *
 * Session client, org from the session (DECISIONS §7); RLS keeps an onsite
 * estimator out (081).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").slice(0, 80);
  const role = sp.get("role");
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 3000, 1), 3000);
  try {
    const book = await loadBook(supabase, orgId, { archived: sp.get("archived") === "1" });
    const hit = book.filter((e) => (!role || role === "all" || e.role === role) && matchesBook(e, q));
    const sorted = rankBook(sortBook(hit, sp.get("sort") === "recent" ? "recent" : "az"), q);
    return applyCookies(NextResponse.json({ contacts: sorted.slice(0, limit), total: hit.length }));
  } catch (e) {
    return applyCookies(NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }));
  }
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400, extra: Record<string, unknown> = {}) => applyCookies(NextResponse.json({ error: m, ...extra }, { status: s }));
  const read = readNewContact(await req.json().catch(() => null));
  if (!read.ok) return bad(read.error);
  const c = read.contact;

  // A number or email already on someone is them, not a new person.
  for (const p of c.phones) {
    const who = await ownerOf(supabase, orgId, "phone", p.number);
    if (who) return bad(`That number is already ${who.name ?? "one of your contacts"}.`, 409, { existing: who });
  }
  for (const e of c.emails) {
    const who = await ownerOf(supabase, orgId, "email", e.address);
    if (who) return bad(`${e.address} is already ${who.name ?? "one of your contacts"}.`, 409, { existing: who });
  }

  const now = new Date().toISOString();
  const name = c.name ?? c.company;
  const { data: made, error } = await supabase.from("contacts").insert({
    org_id: orgId, name, company_name: c.company,
    phone: c.phones[0]?.number ?? null, email: c.emails[0]?.address ?? null,
    address: c.address, city: c.city, state: c.state, zip: c.zip, address_source: c.address ? "coy" : null,
    ...(name ? { name_source: "human", name_confirmed_at: now, name_confirmed_by: userId } : {}),
    sources: ["manual"],
  }).select("id").single();
  if (error || !made) return bad(`Couldn't add them: ${error?.message ?? "no row"}`, 500);
  const id = made.id as string;
  const undo = async (m: string) => { await supabase.from("contacts").delete().eq("org_id", orgId).eq("id", id); return bad(m, 500); };

  // Every number and email in the lists email-intake and Threads read (the first is primary).
  if (c.phones.length) {
    const { error: pe } = await supabase.from("contact_phones").insert(c.phones.map((p, i) => ({ org_id: orgId, contact_id: id, phone_e164: p.number, label: p.label, is_primary: i === 0, source: "manual" })));
    if (pe) return undo(`Couldn't save their numbers: ${pe.message}`);
  }
  if (c.emails.length) {
    const { error: ee } = await supabase.from("contact_emails").insert(c.emails.map((e, i) => ({ org_id: orgId, contact_id: id, email: e.address, label: e.label, is_primary: i === 0, source: "manual" })));
    if (ee) return undo(`Couldn't save their emails: ${ee.message}`);
  }
  if (c.bucket) {
    const { error: ce } = await supabase.rpc("sc_classify_contact", { p_contact: id, p_bucket: c.bucket, p_subtype: c.subtype });
    if (ce) return undo(`Couldn't file them as ${c.bucket}: ${ce.message}`);
  }
  const [entry] = await loadBook(supabase, orgId, { ids: [id] });
  return applyCookies(NextResponse.json({ contact: entry ?? { id, name } }, { status: 201 }));
}
