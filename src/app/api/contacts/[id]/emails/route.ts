import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanEmail } from "@/lib/contacts-book";
import { ownerOf } from "@/lib/contacts-server";

/**
 * Add an email to a person (Contacts, 2026-10-05). POST `{email, label?}` —
 * onto `contact_emails`, which email-intake reads to file the next email from
 * that address on them by itself (§2h), and onto `contacts.email` when they
 * have none. Already theirs → the label is updated. Someone else's → 409
 * naming who. Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400, extra: Record<string, unknown> = {}) => applyCookies(NextResponse.json({ error: m, ...extra }, { status: s }));
  if (!UUID.test(id)) return bad("No such person.", 404);
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; label?: unknown };
  const email = cleanEmail(b.email);
  if (!email) return bad("That doesn't look like an email address.");
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 30) || null : null;
  const { data: who } = await supabase.from("contacts").select("id, name, email, merged_into_contact_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!who || who.merged_into_contact_id) return bad("No such person.", 404);

  const owner = await ownerOf(supabase, orgId, "email", email);
  if (owner && owner.id !== id) return bad(`${email} is already ${owner.name ?? "another contact"}.`, 409, { existing: owner });

  const { data: row } = await supabase.from("contact_emails").select("id").eq("org_id", orgId).eq("contact_id", id).eq("email", email).maybeSingle();
  if (row) {
    if (label !== null) await supabase.from("contact_emails").update({ label }).eq("org_id", orgId).eq("id", row.id as string);
  } else {
    const { count } = await supabase.from("contact_emails").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("contact_id", id);
    const { error } = await supabase.from("contact_emails").insert({ org_id: orgId, contact_id: id, email, label, is_primary: !count, source: "manual" });
    if (error) return bad(error.message, 500);
  }
  if (!who.email) await supabase.from("contacts").update({ email }).eq("org_id", orgId).eq("id", id);
  return applyCookies(NextResponse.json({ email, label, contact: { id, name: who.name ?? null } }));
}
