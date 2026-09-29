import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * A person says what this contact is: customer, vendor or sub.
 *
 * This is the human confirmation DECISIONS §2b makes load-bearing. Since
 * migration 032 it goes through sc_classify_contact(), the one writer: the
 * contact's bucket (sub = vendor / subcontractor) and `customers.relation`,
 * `relation_source='manual'`, `relation_confirmed_at` in step. A confirmed vendor or sub STOPS quo-intake
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
  const { supabase, orgId, applyCookies } = result.session;

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

  // One writer since migration 032: sc_classify_contact() sets the contact's
  // bucket and keeps customers.relation (the lead guard's input) in step.
  // A sub is a vendor whose type is subcontractor.
  const [bucket, subtype] = relation === null ? [null, null]
    : relation === "sub" ? ["vendor", "subcontractor"] : [relation as string, null];
  const { data, error } = await supabase.rpc("sc_classify_contact", { p_contact: contactId, p_bucket: bucket, p_subtype: subtype });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const row = ((data ?? []) as Array<{ customer_created: boolean }>)[0];

  return applyCookies(NextResponse.json({ ok: true, relation: relation ?? "unclassified", customer_created: !!row?.customer_created }));
}
