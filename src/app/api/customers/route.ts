import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Everyone the business has heard from, as people — one row per contact that
 * has not been merged into another (DECISIONS §2c: one contact is one person).
 *
 * THE RELATION IS REPORTED AS IT IS, NOT AS IT DEFAULTS. `customers.relation`
 * is NOT NULL DEFAULT 'customer', so all 135 customer rows read "customer"
 * without anyone having said so, and 63 contacts have no customer row at all.
 * A row is only called a customer, vendor or sub when `relation_confirmed_at`
 * is set. Everything else is `unclassified` — the majority state, and its own
 * state (docs/design/README.md §2).
 */

export const dynamic = "force-dynamic";

export interface Person {
  contact_id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  /** Confirmed relation, or 'unclassified'. Never the column default. */
  relation: "customer" | "vendor" | "sub" | "unclassified";
  texts: number;
  calls: number;
  last_at: string | null;
  jobs: number;
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  // PostgREST caps a response at the project's max-rows (1,000 by default),
  // and there are 1,504 messages. Paged, so the counts are not silently cut.
  type Msg = { contact_id: string | null; channel: string | null; occurred_at: string | null };
  async function allMessages(): Promise<{ data: Msg[]; error: { message: string } | null }> {
    const out: Msg[] = [];
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await supabase.from("messages").select("contact_id, channel, occurred_at")
        .eq("org_id", orgId).order("id").range(from, from + 999);
      if (error) return { data: out, error };
      out.push(...((data ?? []) as Msg[]));
      if (!data || data.length < 1000) break;
    }
    return { data: out, error: null };
  }

  const [contacts, customers, jobs, msgs] = await Promise.all([
    supabase.from("contacts").select("id, name, phone, address, customer_id")
      .eq("org_id", orgId).is("merged_into_contact_id", null).limit(5000),
    supabase.from("customers").select("id, relation, relation_confirmed_at").eq("org_id", orgId).limit(5000),
    supabase.from("jobs").select("id, contact_id").eq("org_id", orgId).limit(5000),
    allMessages(),
  ]);

  for (const [label, r] of [["contacts", contacts], ["customers", customers], ["jobs", jobs], ["messages", msgs]] as const) {
    if (r.error) return applyCookies(NextResponse.json({ error: `${label}: ${r.error.message}` }, { status: 500 }));
  }

  const rel = new Map<string, Person["relation"]>();
  for (const c of (customers.data ?? []) as Array<{ id: string; relation: string; relation_confirmed_at: string | null }>) {
    rel.set(c.id, c.relation_confirmed_at ? (c.relation as Person["relation"]) : "unclassified");
  }
  const jobCount = new Map<string, number>();
  for (const j of (jobs.data ?? []) as Array<{ contact_id: string | null }>) {
    if (j.contact_id) jobCount.set(j.contact_id, (jobCount.get(j.contact_id) ?? 0) + 1);
  }
  const traffic = new Map<string, { texts: number; calls: number; last: string | null }>();
  for (const m of msgs.data) {
    if (!m.contact_id) continue;
    const t = traffic.get(m.contact_id) ?? { texts: 0, calls: 0, last: null };
    if (m.channel === "call") t.calls++; else t.texts++;
    if (m.occurred_at && (!t.last || m.occurred_at > t.last)) t.last = m.occurred_at;
    traffic.set(m.contact_id, t);
  }

  const people: Person[] = ((contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string | null; address: string | null; customer_id: string | null }>)
    .map((c) => {
      const t = traffic.get(c.id);
      return {
        contact_id: c.id,
        name: c.name?.trim() || null,
        phone: c.phone,
        address: c.address?.trim() || null,
        relation: (c.customer_id && rel.get(c.customer_id)) || "unclassified",
        texts: t?.texts ?? 0,
        calls: t?.calls ?? 0,
        last_at: t?.last ?? null,
        jobs: jobCount.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));

  return applyCookies(NextResponse.json({ people, messages_counted: msgs.data.length }));
}
