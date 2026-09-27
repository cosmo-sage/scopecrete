import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * A person says what this contact is: customer, vendor or sub.
 *
 * This is the human confirmation DECISIONS §2b makes load-bearing. It writes
 * `customers.relation`, `relation_source='manual'`, `relation_confirmed_at`
 * and `relation_confirmed_by`. A confirmed vendor or sub STOPS quo-intake
 * creating new leads for the contact — the screen says so before the tap.
 *
 * 63 contacts have no customer row. One is created here, as the proposals
 * route does, and the response says so. `{ relation: null }` clears the
 * confirmation (back to unclassified) without touching the column default.
 */

export const dynamic = "force-dynamic";

const RELATIONS = ["customer", "vendor", "sub"] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  const relation = body.relation;
  if (relation !== null && !(RELATIONS as readonly unknown[]).includes(relation)) {
    return applyCookies(NextResponse.json({ error: `relation must be one of ${RELATIONS.join(", ")}, or null to clear.` }, { status: 400 }));
  }

  const { data: contact, error: cErr } = await supabase
    .from("contacts")
    .select("id, name, phone, customer_id, merged_into_contact_id")
    .eq("id", contactId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (cErr) return applyCookies(NextResponse.json({ error: `contacts: ${cErr.message}` }, { status: 500 }));
  if (!contact) return applyCookies(NextResponse.json({ error: "No such contact in your organisation.", code: "not_found" }, { status: 404 }));
  if (contact.merged_into_contact_id) {
    return applyCookies(NextResponse.json({ error: "This contact was merged into another. Classify that one.", redirect_to: contact.merged_into_contact_id }, { status: 409 }));
  }

  const now = new Date().toISOString();
  const confirmed = relation === null
    ? { relation_confirmed_at: null, relation_confirmed_by: null, relation_source: "default" }
    : { relation, relation_confirmed_at: now, relation_confirmed_by: userId, relation_source: "manual" };

  let created = false;
  if (!contact.customer_id) {
    if (relation === null) return applyCookies(NextResponse.json({ ok: true, relation: "unclassified" }));
    const { data: cust, error: insErr } = await supabase
      .from("customers")
      .insert({ org_id: orgId, name: (contact.name as string | null) || (contact.phone as string | null), ...confirmed })
      .select("id")
      .single();
    if (insErr) return applyCookies(NextResponse.json({ error: `customers: ${insErr.message}` }, { status: 500 }));
    const { error: linkErr } = await supabase.from("contacts").update({ customer_id: cust.id }).eq("id", contactId).eq("org_id", orgId);
    if (linkErr) return applyCookies(NextResponse.json({ error: `contacts: ${linkErr.message}` }, { status: 500 }));
    created = true;
  } else {
    const { error: upErr, count } = await supabase
      .from("customers")
      .update(confirmed, { count: "exact" })
      .eq("id", contact.customer_id)
      .eq("org_id", orgId);
    if (upErr) return applyCookies(NextResponse.json({ error: `customers: ${upErr.message}` }, { status: 500 }));
    if (!count) return applyCookies(NextResponse.json({ error: "The customer record for this contact is not in your organisation." }, { status: 404 }));
  }

  return applyCookies(NextResponse.json({ ok: true, relation: relation ?? "unclassified", customer_created: created }));
}
