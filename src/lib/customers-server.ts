import type { ApiSession } from "@/lib/api-auth";
import { jobValues } from "@/lib/job-totals";

/**
 * A customer is not a contact (migration 055): a household, school or business
 * that owns the address and the jobs, with the people who speak for it as its
 * contacts. Server helpers for the customer routes — session client only; every
 * query filters the org from the session as well as RLS.
 */

type Sb = ApiSession["supabase"];

export const CUSTOMER_COLS = "id, name, kind, customer_type, subtype, lead_source, status, notes, since, primary_contact_id, address_line1, city, state, zip, address_formatted, lat, lng, geocoded_at, address_source, relation, relation_confirmed_at, created_at, merged_into_customer_id, archived_at, archived_reason";

export interface Method { kind: "mobile" | "office" | "home" | "phone" | "email"; value: string; can_text: boolean | null; primary: boolean }
export interface CustomerContact {
  id: string; name: string | null; role: string | null; primary: boolean;
  bucket: string | null; status_summary: string | null; recent_summary: string | null;
  last_contacted: string | null; methods: Method[];
}

const PHONE_KIND: Record<string, Method["kind"]> = { mobile: "mobile", cell: "mobile", office: "office", work: "office", main: "office", home: "home" };

export async function customerRow(sb: Sb, orgId: string, id: string) {
  const { data } = await sb.from("customers").select(CUSTOMER_COLS).eq("org_id", orgId).eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function customerContacts(sb: Sb, orgId: string, customerId: string, primaryId: string | null): Promise<CustomerContact[]> {
  const { data: cs } = await sb.from("contacts")
    .select("id, name, phone, email, role, contact_type, classification_confirmed_at, auto_classified_at, status_summary, recent_summary, last_contacted, created_at")
    .eq("org_id", orgId).eq("customer_id", customerId).is("merged_into_contact_id", null).order("created_at");
  const rows = (cs ?? []) as Array<Record<string, string | null>>;
  if (!rows.length) return [];
  const { data: ph } = await sb.from("contact_phones").select("contact_id, phone_e164, label, is_primary, can_text")
    .eq("org_id", orgId).in("contact_id", rows.map((r) => r.id as string));
  const phones = (ph ?? []) as Array<{ contact_id: string; phone_e164: string; label: string | null; is_primary: boolean | null; can_text: boolean | null }>;
  return rows.map((c) => {
    const mine = phones.filter((p) => p.contact_id === c.id);
    const methods: Method[] = [];
    const seen = new Set<string>();
    for (const p of [...mine].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))) {
      if (seen.has(p.phone_e164)) continue;
      seen.add(p.phone_e164);
      methods.push({ kind: PHONE_KIND[(p.label ?? "").toLowerCase()] ?? "phone", value: p.phone_e164, can_text: p.can_text, primary: !!p.is_primary });
    }
    if (c.phone && !seen.has(c.phone)) methods.unshift({ kind: "phone", value: c.phone, can_text: null, primary: methods.length === 0 });
    if (c.email?.trim()) methods.push({ kind: "email", value: c.email.trim(), can_text: false, primary: false });
    const shown = !!(c.classification_confirmed_at || c.auto_classified_at);
    return {
      id: c.id as string, name: c.name?.trim() || null, role: c.role, primary: c.id === primaryId,
      bucket: shown ? c.contact_type : null,
      status_summary: c.status_summary, recent_summary: c.recent_summary, last_contacted: c.last_contacted, methods,
    };
  }).sort((a, b) => Number(b.primary) - Number(a.primary));
}

export interface CustomerJob {
  id: string; title: string | null; status: string | null; job_type: string | null; address: string | null;
  scheduled_start: string | null; scheduled_end: string | null; won_at: string | null;
  quote: number | null; quote_basis: string | null; paid: number; invoiced: number;
}

export async function customerJobs(sb: Sb, orgId: string, customerId: string, contactIds: string[]): Promise<CustomerJob[]> {
  // A job belongs to the customer; older jobs may only carry the contact.
  const or = [`customer_id.eq.${customerId}`, ...(contactIds.length ? [`contact_id.in.(${contactIds.join(",")})`] : [])].join(",");
  const { data } = await sb.from("jobs")
    .select("id, title, status, job_type, address, scheduled_start, scheduled_end, won_at, duration_days, created_at")
    .eq("org_id", orgId).is("archived_at", null).or(or).order("created_at", { ascending: false });
  const jobs = (data ?? []) as Array<Record<string, unknown>>;
  if (!jobs.length) return [];
  const ids = jobs.map((j) => j.id as string);
  const [values, pays, invs] = await Promise.all([
    jobValues(sb, orgId, jobs.map((j) => ({ id: j.id as string, duration_days: j.duration_days }))),
    sb.from("payments").select("job_id, amount").eq("org_id", orgId).in("job_id", ids),
    sb.from("invoices").select("job_id, amount").eq("org_id", orgId).in("job_id", ids),
  ]);
  const sum = (rows: unknown, id: string) => ((rows ?? []) as Array<{ job_id: string; amount: unknown }>)
    .filter((r) => r.job_id === id).reduce((a, r) => a + Number(r.amount || 0), 0);
  return jobs.map((j) => {
    const v = values.get(j.id as string);
    return {
      id: j.id as string, title: (j.title as string | null) ?? null, status: (j.status as string | null) ?? null,
      job_type: (j.job_type as string | null) ?? null, address: (j.address as string | null) ?? null,
      scheduled_start: (j.scheduled_start as string | null) ?? null, scheduled_end: (j.scheduled_end as string | null) ?? null,
      won_at: (j.won_at as string | null) ?? null,
      quote: v?.total ?? null, quote_basis: v?.basis ?? null,
      paid: sum(pays.data, j.id as string), invoiced: sum(invs.data, j.id as string),
    };
  });
}

/** "3170 Church St, Zachary, LA 70791" from the parts, or null. */
export function formatAddress(line1: string | null, city: string | null, state: string | null, zip: string | null): string | null {
  const t = (s: string | null) => (s ?? "").trim();
  const tail = [t(state), t(zip)].filter(Boolean).join(" ");
  const out = [t(line1), t(city), tail].filter(Boolean).join(", ");
  return out || null;
}

/**
 * Lat/lng for street view — only when a server key is set (GOOGLE_MAPS_GEOCODE_KEY,
 * never sent to the browser). No key, or no match: null, and the page says so.
 */
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_GEOCODE_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`, { cache: "no-store" });
    const b = await r.json();
    const loc = b?.results?.[0]?.geometry?.location;
    return typeof loc?.lat === "number" && typeof loc?.lng === "number" ? { lat: loc.lat, lng: loc.lng } : null;
  } catch { return null; }
}
