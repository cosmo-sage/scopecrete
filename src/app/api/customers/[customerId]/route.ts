import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { customerRow, customerContacts, customerJobs, formatAddress, geocode } from "@/lib/customers-server";
import { settleHeardAddress } from "@/lib/address-server";

/**
 * One customer (migration 055): the customer's own facts and address, its
 * contacts with their numbers and emails, its jobs with quote / paid, and the
 * counts the header shows. The map shows only when the browser key is set; the
 * page is told whether it is, never the key itself beyond the public embed key.
 *
 * GET   → { customer, contacts, jobs, maps: { embed: boolean }, heard_address }
 *   — a customer with no address whose person said one on a call (071) has it
 *   checked against Mapbox: a sure match is saved (`address_source='geocode'`),
 *   anything less comes back as `heard_address` for Coy's one tap.
 * PATCH { name?, customer_type?, subtype?, lead_source?, status?, notes?,
 *         address_line1?, city?, state?, zip?, primary_contact_id? }
 *   — the address is Coy's (`address_source='coy'`), re-geocoded when a server
 *   key exists; the primary contact must be one of this customer's contacts.
 *
 * Session client; org from the session; every id checked (DECISIONS §7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["residential", "commercial", "public"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await ctx.params;
  if (!UUID.test(customerId)) return NextResponse.json({ error: "Not a customer id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;

  let cu = await customerRow(sb, orgId, customerId);
  if (!cu) return applyCookies(NextResponse.json({ error: "Customer not found." }, { status: 404 }));
  if (cu.merged_into_customer_id) return applyCookies(NextResponse.json({ redirect_to: cu.merged_into_customer_id }));
  let heard: Awaited<ReturnType<typeof settleHeardAddress>> = null;
  if (!cu.address_line1 && !cu.address_formatted && !cu.address_source) {
    heard = await settleHeardAddress(sb, orgId, customerId);
    if (heard?.sure) { cu = (await customerRow(sb, orgId, customerId)) ?? cu; heard = null; }
  }
  const contacts = await customerContacts(sb, orgId, customerId, (cu.primary_contact_id as string | null) ?? null);
  const jobs = await customerJobs(sb, orgId, customerId, contacts.map((c) => c.id));
  // Type: Coy's, else what its jobs say (all the same kind), else unknown.
  const jobTypes = [...new Set(jobs.map((j) => j.job_type).filter(Boolean))];
  const type = (cu.customer_type as string | null) ?? (jobTypes.length === 1 && TYPES.has(jobTypes[0] as string) ? jobTypes[0] : null);
  return applyCookies(NextResponse.json({
    customer: { ...cu, customer_type: type, customer_type_source: cu.customer_type ? "coy" : type ? "jobs" : null },
    contacts, jobs,
    maps: { embed: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY, geocode: !!process.env.GOOGLE_MAPS_GEOCODE_KEY },
    heard_address: heard ? { hint: heard.hint, match: heard.match } : null,
  }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await ctx.params;
  if (!UUID.test(customerId)) return NextResponse.json({ error: "Not a customer id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const cu = await customerRow(sb, orgId, customerId);
  if (!cu) return bad("Customer not found.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const text = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const patch: Record<string, unknown> = {};
  if ("name" in b) { const n = text(b.name, 160); if (!n) return bad("A customer needs a name."); patch.name = n; }
  if ("customer_type" in b) {
    if (b.customer_type !== null && !TYPES.has(String(b.customer_type))) return bad("Type is residential, commercial or public.");
    patch.customer_type = b.customer_type ?? null;
  }
  for (const k of ["subtype", "lead_source", "status"]) if (k in b) patch[k] = text(b[k], 120);
  if ("notes" in b) patch.notes = text(b.notes, 4000);
  const addrKeys = ["address_line1", "city", "state", "zip"];
  if (addrKeys.some((k) => k in b)) {
    const next = Object.fromEntries(addrKeys.map((k) => [k, k in b ? text(b[k], 160) : (cu[k] as string | null)]));
    Object.assign(patch, next);
    const formatted = formatAddress(next.address_line1, next.city, next.state, next.zip);
    patch.address_formatted = formatted;
    patch.address_source = formatted ? "coy" : null;
    const loc = formatted ? await geocode(formatted) : null;
    patch.lat = loc?.lat ?? null; patch.lng = loc?.lng ?? null; patch.geocoded_at = loc ? new Date().toISOString() : null;
  }
  if ("primary_contact_id" in b) {
    const pid = String(b.primary_contact_id ?? "");
    if (!UUID.test(pid)) return bad("Pick one of this customer's contacts.");
    const { data: ok } = await sb.from("contacts").select("id").eq("org_id", orgId).eq("id", pid).eq("customer_id", customerId).maybeSingle();
    if (!ok) return bad("That person is not a contact of this customer.");
    patch.primary_contact_id = pid;
  }
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  patch.updated_at = new Date().toISOString();
  const { error } = await sb.from("customers").update(patch).eq("org_id", orgId).eq("id", customerId);
  if (error) return bad(error.message, 500);
  return applyCookies(NextResponse.json({ ok: true, geocoded: "lat" in patch ? patch.lat !== null : undefined }));
}
