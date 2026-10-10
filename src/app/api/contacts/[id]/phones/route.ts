import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { toE164 } from "@/lib/texting";

/**
 * Name one of a person's numbers (Coy, 2026-10-03: "instead of 'phone 2' it
 * can say 'office'"). PATCH `{phone, label}` — the label on that number in
 * `contact_phones` (1–30 characters; blank clears it, back to Cell / Phone 2).
 * A number they called or texted from that isn't listed yet is added to them
 * with its name — and + Number adds a new one by hand (Coy, 2026-10-04: "the
 * + number button should also allow me create a new phone number and save it
 * and label it"). A number that is already someone else's thread is not added
 * twice: the reply names them (409), so the page offers "Same person as…".
 * `{phone, to}` changes the number itself (Coy, 2026-10-10: "I can't actually
 * edit the phone number in the contact") — a typo fixed: the same row and
 * label, the contact's main number too when it was that one. Their calls and
 * texts stay on them; new ones from the corrected number land here. Never
 * someone else's number, never one of the org's own lines.
 * Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164 = /^\+[1-9][0-9]{7,14}$/;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!UUID.test(id)) return bad("No such person.", 404);
  const b = (await req.json().catch(() => ({}))) as { phone?: unknown; label?: unknown; add?: unknown; to?: unknown };
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  if (!E164.test(phone)) return bad("Which number?");
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 30) || null : null;
  const { data: who } = await supabase.from("contacts").select("id, phone").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!who) return bad("No such person.", 404);
  const { data: row } = await supabase.from("contact_phones").select("id").eq("org_id", orgId).eq("contact_id", id).eq("phone_e164", phone).maybeSingle();
  if (b.to !== undefined) {
    const to = toE164(b.to);
    if (!to) return bad("That isn't a phone number — 10 digits.");
    if (to === phone) return applyCookies(NextResponse.json({ phone, label }));
    if (!row && who.phone !== phone) return bad("That number isn't on them.", 404);
    const [{ data: line }, { data: c1 }, { data: c2 }] = await Promise.all([
      supabase.from("org_phone_numbers").select("id").eq("org_id", orgId).eq("phone_e164", to).limit(1).maybeSingle(),
      supabase.from("contacts").select("id, name").eq("org_id", orgId).eq("phone", to).limit(1).maybeSingle(),
      supabase.from("contact_phones").select("contact_id, contacts!inner(id, name)").eq("org_id", orgId).eq("phone_e164", to).limit(1).maybeSingle(),
    ]);
    if (line) return bad("That's one of your own lines.");
    const o2 = (c2 as unknown as { contacts?: { id: string; name: string | null } } | null)?.contacts;
    const other = c1 ?? o2 ?? null;
    if (other) {
      if (other.id === id) return bad("They already have that number.");
      return applyCookies(NextResponse.json({ error: `That number is already ${other.name ? `${other.name}'s` : "another"} thread.`, other }, { status: 409 }));
    }
    if (row) {
      const { error } = await supabase.from("contact_phones").update({ phone_e164: to }).eq("org_id", orgId).eq("id", row.id as string);
      if (error) return bad(error.message, 500);
    }
    if (who.phone === phone) {
      const { error } = await supabase.from("contacts").update({ phone: to }).eq("org_id", orgId).eq("id", id);
      if (error) return bad(error.message, 500);
    }
    return applyCookies(NextResponse.json({ phone: to }));
  }
  // + Number adds; it never quietly renames a number they already have.
  if (row && b.add === true) return applyCookies(NextResponse.json({ error: "That number is already on them — ✎ beside its tab renames it.", same: true }, { status: 409 }));
  if (!row && b.add === true && who.phone === phone) return applyCookies(NextResponse.json({ error: "That number is already on them — ✎ beside its tab renames it.", same: true }, { status: 409 }));
  if (!row) {
    // Someone else's number? Their thread, not a second copy of it.
    const [{ data: c1 }, { data: c2 }] = await Promise.all([
      supabase.from("contacts").select("id, name").eq("org_id", orgId).eq("phone", phone).is("merged_into_contact_id", null).neq("id", id).limit(1).maybeSingle(),
      supabase.from("contact_phones").select("contact_id, contacts!inner(id, name, merged_into_contact_id)").eq("org_id", orgId).eq("phone_e164", phone).neq("contact_id", id).limit(1).maybeSingle(),
    ]);
    const o2 = (c2 as unknown as { contacts?: { id: string; name: string | null; merged_into_contact_id: string | null } } | null)?.contacts;
    const other = c1 ?? (o2 && !o2.merged_into_contact_id ? { id: o2.id, name: o2.name } : null);
    if (other) return applyCookies(NextResponse.json({ error: `That number is already ${other.name ? `${other.name}'s` : "another"} thread.`, other }, { status: 409 }));
  }
  const { error } = row
    ? await supabase.from("contact_phones").update({ label }).eq("org_id", orgId).eq("id", row.id as string)
    : await supabase.from("contact_phones").insert({ org_id: orgId, contact_id: id, phone_e164: phone, label, source: "manual" });
  if (error) return bad(error.message, 500);
  // Adding a second number lists the first one too, so it stays their main number.
  const main = who.phone as string | null;
  if (!row && main && main !== phone) {
    const { data: rows } = await supabase.from("contact_phones").select("phone_e164, is_primary").eq("org_id", orgId).eq("contact_id", id);
    const list = (rows ?? []) as Array<{ phone_e164: string; is_primary: boolean }>;
    if (!list.some((r) => r.phone_e164 === main))
      await supabase.from("contact_phones").insert({ org_id: orgId, contact_id: id, phone_e164: main, label: null, is_primary: !list.some((r) => r.is_primary), source: "manual" });
  }
  return applyCookies(NextResponse.json({ phone, label }));
}
