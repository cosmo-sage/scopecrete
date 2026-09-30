import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * The Customers list (migration 055): every customer with at least one contact
 * filed as customer (by Coy, or by Dusty on an earned streak — shown "auto"),
 * or with a live job. One row per customer, not per person: Art Apartments is
 * one row however many of its people call.
 *
 * GET → { customers: [{ id, name, customer_type, status, address, contacts,
 *         jobs, last_at, summary, auto }] }
 * Session client; org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;

  const [{ data: cs, error: cErr }, { data: js, error: jErr }] = await Promise.all([
    sb.from("contacts").select("id, customer_id, contact_type, classification_confirmed_at, auto_classified_at, last_contacted, status_summary")
      .eq("org_id", orgId).is("merged_into_contact_id", null).not("customer_id", "is", null),
    sb.from("jobs").select("id, customer_id, contact_id").eq("org_id", orgId).is("archived_at", null),
  ]);
  if (cErr || jErr) return applyCookies(NextResponse.json({ error: (cErr ?? jErr)!.message }, { status: 500 }));
  type C = { id: string; customer_id: string; contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null; last_contacted: string | null; status_summary: string | null };
  const contacts = (cs ?? []) as C[];
  const byContact = new Map(contacts.map((c) => [c.id, c.customer_id]));
  const jobsBy = new Map<string, number>();
  for (const j of (js ?? []) as Array<{ customer_id: string | null; contact_id: string | null }>) {
    const cid = j.customer_id ?? (j.contact_id ? byContact.get(j.contact_id) : undefined);
    if (cid) jobsBy.set(cid, (jobsBy.get(cid) ?? 0) + 1);
  }
  const filed = (c: C) => c.contact_type === "customer" && !!(c.classification_confirmed_at || c.auto_classified_at);
  const agg = new Map<string, { contacts: number; last_at: string | null; auto: boolean; summary: string | null; filed: boolean }>();
  for (const c of contacts) {
    const a = agg.get(c.customer_id) ?? { contacts: 0, last_at: null, auto: true, summary: null, filed: false };
    a.contacts += 1;
    if (c.last_contacted && (!a.last_at || c.last_contacted > a.last_at)) { a.last_at = c.last_contacted; a.summary = c.status_summary ?? a.summary; }
    if (filed(c)) { a.filed = true; if (c.classification_confirmed_at) a.auto = false; }
    agg.set(c.customer_id, a);
  }
  const ids = [...agg.entries()].filter(([id, a]) => a.filed || (jobsBy.get(id) ?? 0) > 0).map(([id]) => id);
  if (!ids.length) return applyCookies(NextResponse.json({ customers: [] }));
  const { data: rows, error } = await sb.from("customers")
    .select("id, name, customer_type, status, address_formatted, merged_into_customer_id")
    .eq("org_id", orgId).in("id", ids).is("merged_into_customer_id", null);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const out = ((rows ?? []) as Array<{ id: string; name: string | null; customer_type: string | null; status: string | null; address_formatted: string | null }>).map((r) => {
    const a = agg.get(r.id)!;
    return { id: r.id, name: r.name?.trim() || null, customer_type: r.customer_type, status: r.status, address: r.address_formatted,
      contacts: a.contacts, jobs: jobsBy.get(r.id) ?? 0, last_at: a.last_at, summary: a.summary, auto: a.auto && a.filed };
  }).sort((x, y) => (y.last_at ?? "").localeCompare(x.last_at ?? ""));
  return applyCookies(NextResponse.json({ customers: out }));
}
