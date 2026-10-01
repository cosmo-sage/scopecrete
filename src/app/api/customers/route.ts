import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { e164 } from "@/lib/sources-server";
import { stageOf } from "@/lib/jobs/stages";

/**
 * The Customers list (migration 055): every customer with at least one contact
 * filed as customer (by Coy, or by Dusty on an earned streak — shown "auto"),
 * or with a live job. One row per customer, not per person: Art Apartments is
 * one row however many of its people call.
 *
 * No unnamed customers (Coy, 2026-10-01: "If the person doesn't have a name
 * they can't be considered a customer"). A customer's name is its own, else
 * its people's (a name that is only a phone number is no name — that is how
 * sc_classify_contact names a customer it makes for an unnamed number). With
 * neither it is left out of `customers` and counted in `unnamed`, with the
 * contacts to name, so nothing disappears silently.
 *
 * GET → { customers: [{ id, name, customer_type, status, address, city, state,
 *         zip, contacts, jobs, stages, first_at, last_at, summary, recent,
 *         person, phone, email, lead_source, since, auto }],
 *         unnamed: [{ customer_id, contact_id, phone }] }
 * POST { name, customer_type?, person?, phone?, email?, address?, city?,
 *        state?, zip? } → { customer } — Coy's tap ("+ New customer"). Makes
 *   the person (a contact, filed customer through sc_classify_contact, the one
 *   writer) and their customer, named. A phone or email already on a contact
 *   returns 409 naming them instead of a duplicate.
 * Session client; org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

const PHONEISH = /^[+\d\s().-]{7,}$/;
const named = (s: string | null | undefined) => (s && s.trim() && !PHONEISH.test(s.trim()) ? s.trim() : null);

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;

  const [{ data: cs, error: cErr }, { data: js, error: jErr }] = await Promise.all([
    sb.from("contacts").select("id, name, phone, email, customer_id, contact_type, classification_confirmed_at, auto_classified_at, created_at, last_contacted, status_summary, recent_summary, is_primary")
      .eq("org_id", orgId).is("merged_into_contact_id", null).not("customer_id", "is", null),
    sb.from("jobs").select("id, customer_id, contact_id, job_type, status, lead_source").eq("org_id", orgId).is("archived_at", null),
  ]);
  if (cErr || jErr) return applyCookies(NextResponse.json({ error: (cErr ?? jErr)!.message }, { status: 500 }));
  type C = { id: string; name: string | null; phone: string | null; email: string | null; customer_id: string; contact_type: string | null;
    classification_confirmed_at: string | null; auto_classified_at: string | null; created_at: string | null; last_contacted: string | null;
    status_summary: string | null; recent_summary: string | null; is_primary: boolean | null };
  type J = { customer_id: string | null; contact_id: string | null; job_type: string | null; status: string | null; lead_source: string | null };
  const contacts = (cs ?? []) as C[];
  const byContact = new Map(contacts.map((c) => [c.id, c.customer_id]));
  const jobsBy = new Map<string, J[]>();
  for (const j of (js ?? []) as J[]) {
    const cid = j.customer_id ?? (j.contact_id ? byContact.get(j.contact_id) : undefined);
    if (cid) jobsBy.set(cid, [...(jobsBy.get(cid) ?? []), j]);
  }
  const filed = (c: C) => c.contact_type === "customer" && !!(c.classification_confirmed_at || c.auto_classified_at);
  type A = { people: C[]; last_at: string | null; first_at: string | null; auto: boolean; filed: boolean; latest: C | null };
  const agg = new Map<string, A>();
  for (const c of contacts) {
    const a = agg.get(c.customer_id) ?? { people: [], last_at: null, first_at: null, auto: true, filed: false, latest: null };
    a.people.push(c);
    if (c.last_contacted && (!a.last_at || c.last_contacted > a.last_at)) { a.last_at = c.last_contacted; a.latest = c; }
    if (c.created_at && (!a.first_at || c.created_at < a.first_at)) a.first_at = c.created_at;
    if (filed(c)) { a.filed = true; if (c.classification_confirmed_at) a.auto = false; }
    agg.set(c.customer_id, a);
  }
  const ids = [...agg.entries()].filter(([id, a]) => a.filed || (jobsBy.get(id)?.length ?? 0) > 0).map(([id]) => id);
  if (!ids.length) return applyCookies(NextResponse.json({ customers: [], unnamed: [] }));
  const { data: rows, error } = await sb.from("customers")
    .select("id, name, customer_type, status, address_formatted, address_line1, city, state, zip, lead_source, since, primary_contact_id")
    .eq("org_id", orgId).in("id", ids).is("merged_into_customer_id", null);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));

  type R = { id: string; name: string | null; customer_type: string | null; status: string | null; address_formatted: string | null; address_line1: string | null;
    city: string | null; state: string | null; zip: string | null; lead_source: string | null; since: string | null; primary_contact_id: string | null };
  const out: Array<Record<string, unknown>> = [];
  const unnamed: Array<{ customer_id: string; contact_id: string; phone: string | null }> = [];
  for (const r of (rows ?? []) as R[]) {
    const a = agg.get(r.id)!;
    const primary = a.people.find((p) => p.id === r.primary_contact_id) ?? a.people.find((p) => p.is_primary) ?? a.people[0] ?? null;
    const person = named(primary?.name) ?? a.people.map((p) => named(p.name)).find(Boolean) ?? null;
    const name = named(r.name) ?? person;
    if (!name) {
      for (const p of a.people) unnamed.push({ customer_id: r.id, contact_id: p.id, phone: p.phone });
      continue;
    }
    const jobs = jobsBy.get(r.id) ?? [];
    const type = r.customer_type ?? jobs.map((j) => j.job_type).find((t) => t === "residential" || t === "commercial" || t === "public") ?? null;
    out.push({
      id: r.id, name, customer_type: type, status: r.status, address: r.address_formatted ?? r.address_line1,
      city: r.city, state: r.state, zip: r.zip, contacts: a.people.length, jobs: jobs.length,
      // The Jobs board's stage of each live job — the list's stage filter.
      stages: [...new Set(jobs.map((j) => stageOf(j.status).k))],
      first_at: a.first_at, last_at: a.last_at,
      summary: a.latest?.status_summary ?? primary?.status_summary ?? null,
      recent: a.latest?.recent_summary ?? primary?.recent_summary ?? null,
      person: person && person !== name ? person : null,
      phone: primary?.phone ?? a.people.find((p) => p.phone)?.phone ?? null,
      email: primary?.email ?? a.people.find((p) => p.email)?.email ?? null,
      lead_source: r.lead_source ?? jobs.find((j) => j.lead_source)?.lead_source ?? null,
      since: r.since, auto: a.auto && a.filed,
    });
  }
  out.sort((x, y) => String(y.last_at ?? "").localeCompare(String(x.last_at ?? "")));
  return applyCookies(NextResponse.json({ customers: out, unnamed }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

  const name = text(b.name, 120);
  if (!name || PHONEISH.test(name)) return bad("A customer needs a name — a household, a business or a school.");
  const type = text(b.customer_type, 20);
  if (type && !["residential", "commercial", "public"].includes(type)) return bad("Type is residential, commercial or government.");
  const person = text(b.person, 120);
  const rawPhone = text(b.phone, 40);
  const phone = rawPhone ? e164(rawPhone) : null;
  if (rawPhone && !phone) return bad("That phone number doesn't look like a US number.");
  const email = text(b.email, 120)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return bad("That email doesn't look right.");
  const line1 = text(b.address, 200), city = text(b.city, 80), state = text(b.state, 2)?.toUpperCase() ?? null, zip = text(b.zip, 10);

  // Already one of his contacts? Then it isn't new.
  for (const [col, val] of [["phone", phone], ["email", email]] as const) {
    if (!val) continue;
    const { data: hit } = await supabase.from("contacts").select("id, name, contact_type, customer_id, merged_into_contact_id").eq("org_id", orgId).eq(col, val).maybeSingle();
    if (hit) {
      const id = (hit.merged_into_contact_id as string | null) ?? (hit.id as string);
      return applyCookies(NextResponse.json({ error: `That ${col} is already ${hit.name ?? "one of your contacts"}.`,
        existing: { id, name: hit.name, bucket: hit.contact_type, customer_id: hit.customer_id } }, { status: 409 }));
    }
  }

  const now = new Date().toISOString();
  const company = type === "commercial" || type === "public";
  const { data: made, error } = await supabase.from("contacts").insert({
    org_id: orgId, name: person ?? name, company_name: company ? name : null, phone, email,
    name_source: "human", name_confirmed_at: now, name_confirmed_by: userId, sources: ["manual"],
  }).select("id").single();
  if (error || !made) return bad(`Couldn't add the customer: ${error?.message ?? "no row"}`, 500);
  const { error: cErr } = await supabase.rpc("sc_classify_contact", { p_contact: made.id, p_bucket: "customer", p_subtype: null });
  if (cErr) {
    await supabase.from("contacts").delete().eq("org_id", orgId).eq("id", made.id);
    return bad(`Couldn't file them as a customer: ${cErr.message}`, 500);
  }
  const { data: c } = await supabase.from("contacts").select("customer_id").eq("org_id", orgId).eq("id", made.id).single();
  const customerId = c?.customer_id as string | null;
  if (!customerId) return bad("The customer wasn't made.", 500);
  const addr = [line1, [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ") || null;
  const { error: uErr } = await supabase.from("customers").update({
    name, kind: company ? "company" : "person", customer_type: type, primary_contact_id: made.id,
    address_line1: line1, city, state, zip, address_formatted: addr, address_source: addr ? "coy" : null,
  }).eq("org_id", orgId).eq("id", customerId);
  if (uErr) return bad(`Made the customer but couldn't save its details: ${uErr.message}`, 500);
  await supabase.from("contacts").update({ is_primary: true }).eq("org_id", orgId).eq("id", made.id);
  return applyCookies(NextResponse.json({ customer: { id: customerId, name } }, { status: 201 }));
}
