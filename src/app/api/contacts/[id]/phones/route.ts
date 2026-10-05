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
  const b = (await req.json().catch(() => ({}))) as { phone?: unknown; label?: unknown };
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  if (!E164.test(phone)) return bad("Which number?");
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 30) || null : null;
  const { data: who } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!who) return bad("No such person.", 404);
  const { data: row } = await supabase.from("contact_phones").select("id").eq("org_id", orgId).eq("contact_id", id).eq("phone_e164", phone).maybeSingle();
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
  return applyCookies(NextResponse.json({ phone, label }));
}
