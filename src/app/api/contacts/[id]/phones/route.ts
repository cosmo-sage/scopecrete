import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Name one of a person's numbers (Coy, 2026-10-03: "instead of 'phone 2' it
 * can say 'office'"). PATCH `{phone, label}` — the label on that number in
 * `contact_phones` (1–30 characters; blank clears it, back to Cell / Phone 2).
 * A number they called or texted from that isn't listed yet is added to them
 * with its name — and + Number adds a new one by hand (Coy, 2026-10-04: "the
 * + number button should also allow me create a new phone number and save it
 * and label it"). A number that is already someone else's thread is not added
 * twice: the reply names them (409), so the page offers "Same person as…".
 * `{phone, new_phone, label}` changes the number itself (Coy, 2026-10-10: "I
 * need to be able to edit the phone number") — a typo fixed, a new cell. Its
 * row in `contact_phones` (and `contacts.phone` when it is their main number)
 * becomes the new one; calls and texts already on the old number stay on the
 * thread under it. Refused, naming them, when the new number is someone else's
 * thread, already theirs, or one of the org's own lines.
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
  const b = (await req.json().catch(() => ({}))) as { phone?: unknown; label?: unknown; add?: unknown; new_phone?: unknown };
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  if (!E164.test(phone)) return bad("Which number?");
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 30) || null : null;
  const { data: who } = await supabase.from("contacts").select("id, phone").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!who) return bad("No such person.", 404);
  const { data: row } = await supabase.from("contact_phones").select("id").eq("org_id", orgId).eq("contact_id", id).eq("phone_e164", phone).maybeSingle();
  if (typeof b.new_phone === "string") {
    const next = b.new_phone.trim();
    if (!E164.test(next)) return bad("A 10-digit number, like (225) 555-0100.");
    if (next !== phone) {
      const { data: mine } = await supabase.from("contact_phones").select("id").eq("org_id", orgId).eq("contact_id", id).eq("phone_e164", next).maybeSingle();
      if (mine || who.phone === next) return applyCookies(NextResponse.json({ error: "That number is already on them.", same: true }, { status: 409 }));
      const other = await otherOwner(supabase, orgId, id, next);
      if (other) return applyCookies(NextResponse.json({ error: `That number is already ${other.name ? `${other.name}'s` : "another"} thread.`, other }, { status: 409 }));
      const { data: line } = await supabase.from("org_phone_numbers").select("id").eq("org_id", orgId).eq("phone_e164", next).limit(1).maybeSingle();
      if (line) return bad("That's one of your own lines.");
      const { error: e1 } = row
        ? await supabase.from("contact_phones").update({ phone_e164: next, label }).eq("org_id", orgId).eq("id", row.id as string)
        : await supabase.from("contact_phones").insert({ org_id: orgId, contact_id: id, phone_e164: next, label, is_primary: who.phone === phone, source: "manual" });
      if (e1) return bad(e1.message, 500);
      if (who.phone === phone) {
        const { error: e2 } = await supabase.from("contacts").update({ phone: next }).eq("org_id", orgId).eq("id", id);
        if (e2) return bad(e2.message, 500);
      }
    }
    return applyCookies(NextResponse.json({ phone: next, label }));
  }
  // + Number adds; it never quietly renames a number they already have.
  if (row && b.add === true) return applyCookies(NextResponse.json({ error: "That number is already on them — ✎ beside its tab renames it.", same: true }, { status: 409 }));
  if (!row && b.add === true && who.phone === phone) return applyCookies(NextResponse.json({ error: "That number is already on them — ✎ beside its tab renames it.", same: true }, { status: 409 }));
  if (!row) {
    // Someone else's number? Their thread, not a second copy of it.
    const other = await otherOwner(supabase, orgId, id, phone);
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

type Db = Extract<Awaited<ReturnType<typeof getApiSession>>, { ok: true }>["session"]["supabase"];

/** Whose thread a number already is, other than this person's (merges followed). */
async function otherOwner(supabase: Db, orgId: string, id: string, phone: string): Promise<{ id: string; name: string | null } | null> {
  const [{ data: c1 }, { data: c2 }] = await Promise.all([
    supabase.from("contacts").select("id, name").eq("org_id", orgId).eq("phone", phone).is("merged_into_contact_id", null).neq("id", id).limit(1).maybeSingle(),
    supabase.from("contact_phones").select("contact_id, contacts!inner(id, name, merged_into_contact_id)").eq("org_id", orgId).eq("phone_e164", phone).neq("contact_id", id).limit(1).maybeSingle(),
  ]);
  const o2 = (c2 as unknown as { contacts?: { id: string; name: string | null; merged_into_contact_id: string | null } } | null)?.contacts;
  return (c1 as { id: string; name: string | null } | null) ?? (o2 && !o2.merged_into_contact_id ? { id: o2.id, name: o2.name } : null);
}
