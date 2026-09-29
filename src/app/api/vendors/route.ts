import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { e164 } from "@/lib/sources-server";

/**
 * Vendors (migration 051) — the Vendors page. A vendor is a contact filed as
 * vendor (Coy put them there, or Dusty did); the page is about business: what
 * they price, their receipts, where they deliver.
 *
 * GET  → { vendors: [{ id, name, company_name, subtype, phone, email, address,
 *          service_area, items, defaults, newest_price, files }] }
 * POST { name, subtype?, phone?, email?, address?, service_area? }
 *      → { vendor } — Coy's tap, so the bucket is his (a human confirmation,
 *        via sc_classify_contact, the one writer). No phone is needed: a
 *        vendor can come from a receipt alone. A phone or email already on
 *        one of his contacts is not a new vendor: 409 { existing } names who,
 *        so the screen can offer to file that contact as vendor instead.
 *
 * Session client, org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";
const COLS = "id, name, company_name, contact_subtype, phone, email, address, service_area, classification_confirmed_at, auto_classified_at";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const [{ data: people, error }, { data: sources }, { data: defaults }, { data: files }] = await Promise.all([
    supabase.from("contacts").select(COLS).eq("org_id", orgId).eq("contact_type", "vendor").is("merged_into_contact_id", null)
      .or("classification_confirmed_at.not.is.null,auto_classified_at.not.is.null").order("name", { ascending: true, nullsFirst: false }).limit(500),
    supabase.from("cost_item_sources").select("vendor_contact_id, price_as_of").eq("org_id", orgId).eq("active", true).limit(5000),
    supabase.from("cost_items").select("default_source_id, cost_item_sources!cost_items_default_source_id_fkey(vendor_contact_id)")
      .eq("org_id", orgId).eq("active", true).not("default_source_id", "is", null).limit(5000),
    supabase.from("job_files").select("contact_id").eq("org_id", orgId).is("deleted_at", null).in("category", ["receipt", "vendor_quote"]).not("contact_id", "is", null).limit(5000),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: `contacts: ${error.message}` }, { status: 500 }));
  const count = new Map<string, number>(), newest = new Map<string, string>(), def = new Map<string, number>(), fc = new Map<string, number>();
  for (const s of (sources ?? []) as Array<{ vendor_contact_id: string; price_as_of: string | null }>) {
    count.set(s.vendor_contact_id, (count.get(s.vendor_contact_id) ?? 0) + 1);
    if (s.price_as_of && (newest.get(s.vendor_contact_id) ?? "") < s.price_as_of) newest.set(s.vendor_contact_id, s.price_as_of);
  }
  for (const d of (defaults ?? []) as unknown as Array<{ cost_item_sources: { vendor_contact_id: string } | null }>) {
    const v = d.cost_item_sources?.vendor_contact_id;
    if (v) def.set(v, (def.get(v) ?? 0) + 1);
  }
  for (const f of (files ?? []) as Array<{ contact_id: string }>) fc.set(f.contact_id, (fc.get(f.contact_id) ?? 0) + 1);
  const vendors = ((people ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id, name: (c.name as string | null)?.trim() || null, company_name: c.company_name ?? null, subtype: c.contact_subtype ?? null,
    phone: c.phone ?? null, email: c.email ?? null, address: c.address ?? null, service_area: c.service_area ?? null,
    auto: !c.classification_confirmed_at && !!c.auto_classified_at,
    items: count.get(c.id as string) ?? 0, defaults: def.get(c.id as string) ?? 0, newest_price: newest.get(c.id as string) ?? null, files: fc.get(c.id as string) ?? 0,
  }));
  return applyCookies(NextResponse.json({ vendors }));
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
  if (!name) return bad("A vendor needs a name.");
  const rawPhone = text(b.phone, 40);
  const phone = rawPhone ? e164(rawPhone) : null;
  if (rawPhone && !phone) return bad("That phone number doesn't look like a US number.");
  const email = text(b.email, 120)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return bad("That email doesn't look right.");
  const subtype = text(b.subtype, 40);

  // Already one of his contacts? Then it isn't new.
  for (const [col, val] of [["phone", phone], ["email", email]] as const) {
    if (!val) continue;
    const { data: hit } = await supabase.from("contacts").select("id, name, contact_type, merged_into_contact_id").eq("org_id", orgId).eq(col, val).maybeSingle();
    if (hit) {
      const id = (hit.merged_into_contact_id as string | null) ?? (hit.id as string);
      return applyCookies(NextResponse.json({ error: `That ${col} is already ${hit.name ?? "one of your contacts"}.`, existing: { id, name: hit.name, bucket: hit.contact_type } }, { status: 409 }));
    }
  }

  const now = new Date().toISOString();
  const { data: made, error } = await supabase.from("contacts").insert({
    org_id: orgId, name, company_name: name, phone, email, address: text(b.address, 200), service_area: text(b.service_area, 120),
    name_source: "human", name_confirmed_at: now, name_confirmed_by: userId, sources: ["manual"],
  }).select("id").single();
  if (error || !made) return bad(`Couldn't add the vendor: ${error?.message ?? "no row"}`, 500);
  const { error: cErr } = await supabase.rpc("sc_classify_contact", { p_contact: made.id, p_bucket: "vendor", p_subtype: subtype });
  if (cErr) {
    await supabase.from("contacts").delete().eq("org_id", orgId).eq("id", made.id);
    return bad(`Couldn't file them as a vendor: ${cErr.message}`, 500);
  }
  const { data: vendor } = await supabase.from("contacts").select(COLS).eq("org_id", orgId).eq("id", made.id).single();
  return applyCookies(NextResponse.json({ vendor }, { status: 201 }));
}
