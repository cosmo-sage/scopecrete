import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { formatAddress } from "@/lib/customers-server";
import { findAddress } from "@/lib/aerial-server";
import { cityOf } from "@/lib/jobs/board-view";
import { STATUS_NAME, stageOf } from "@/lib/jobs/stages";
import { bidNote, layerForJob, type MapPin, type MapPinsResponse, type PickJob } from "@/lib/map";

/**
 * GET /api/map/pins — the Map page (src/lib/map.ts): every open job and every
 * vendor with an address, as pins, plus the jobs for the clip's "Which job?"
 * and how many have no address yet.
 *
 * A job's point is its own address, else its customer's; a vendor's is the
 * address on their contact. Points are looked up with the satellite's geocoder
 * (findAddress) and kept on the row (migration 090: lat, lng, geocode_query) so
 * each address is looked up once; before 090 they are looked up on each visit
 * (and remembered by this server process). At most LOOKUPS a request — the
 * rest arrive on the next load.
 *
 * Session client, org from the session; RLS decides what is read.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LOOKUPS = 30;
const memo = new Map<string, { lat: number; lng: number } | null>();

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "123 Main St, Baton Rouge, LA 70810" from a row's address parts, without saying the city twice. */
function fullAddress(line: string | null, city: string | null, state: string | null, zip: string | null): string | null {
  if (!line) return null;
  if (line.includes(",")) return line;
  return formatAddress(line, city, state, zip);
}

async function pool<T>(items: T[], k: number, f: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) await f(items[i++]); }));
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const fail = (m: string) => applyCookies(NextResponse.json({ error: m }, { status: 500 }));

  const JOB = "id, title, status, job_type, address, city, state, zip, customer_id, contact_id, created_at, bid_due_at";
  const VEND = "id, name, company_name, phone, email, address, city, state, zip, contact_subtype, service_area";
  let stored = true;
  let jr = await sb.from("jobs").select(`${JOB}, lat, lng, geocode_query`).eq("org_id", orgId).is("archived_at", null).limit(2000);
  let vr = await sb.from("contacts").select(`${VEND}, lat, lng, geocode_query`).eq("org_id", orgId).eq("contact_type", "vendor")
    .is("merged_into_contact_id", null).is("archived_at", null).limit(2000);
  if (jr.error?.code === "42703" || vr.error?.code === "42703") {
    stored = false; // migration 090 not applied yet
    jr = await sb.from("jobs").select(JOB).eq("org_id", orgId).is("archived_at", null).limit(2000) as typeof jr;
    vr = await sb.from("contacts").select(VEND).eq("org_id", orgId).eq("contact_type", "vendor")
      .is("merged_into_contact_id", null).is("archived_at", null).limit(2000) as typeof vr;
  }
  if (jr.error) return fail(`jobs: ${jr.error.message}`);
  if (vr.error) return fail(`vendors: ${vr.error.message}`);
  const jobs = (jr.data ?? []) as unknown as Row[];
  const vendors = (vr.data ?? []) as unknown as Row[];

  const custIds = [...new Set(jobs.map((j) => s(j.customer_id)).filter((x): x is string => !!x))];
  const contactIds = [...new Set(jobs.map((j) => s(j.contact_id)).filter((x): x is string => !!x))];
  const jobIds = jobs.map((j) => j.id as string);
  const [cr, pr, dr, allCust] = await Promise.all([
    custIds.length ? sb.from("customers").select("id, name, address_line1, city, state, zip, address_formatted, lat, lng").eq("org_id", orgId).in("id", custIds) : Promise.resolve({ data: [], error: null }),
    contactIds.length ? sb.from("contacts").select("id, name, phone").eq("org_id", orgId).in("id", contactIds) : Promise.resolve({ data: [], error: null }),
    jobIds.length ? sb.from("documents").select("job_id, sent_at, view_count").eq("org_id", orgId).in("job_id", jobIds).not("proposal_id", "is", null).not("sent_at", "is", null).is("revoked_at", null) : Promise.resolve({ data: [], error: null }),
    // Customers with no address of their own and no job with one: the banner's count.
    sb.from("customers").select("id, name, address_line1, address_formatted").eq("org_id", orgId).is("archived_at", null).is("merged_into_customer_id", null).limit(5000),
  ]);
  const cust = new Map(((cr.data ?? []) as Row[]).map((c) => [c.id as string, c]));
  const people = new Map(((pr.data ?? []) as Row[]).map((c) => [c.id as string, c]));
  const sent = new Map<string, number>();
  for (const d of (dr.data ?? []) as Row[]) sent.set(d.job_id as string, Math.max(sent.get(d.job_id as string) ?? 0, n(d.view_count) ?? 0));

  // Every point we need, and which are looked up now.
  // tried: this address was looked up before (090) and nothing was found — not asked again until it changes.
  type Want = { key: string; query: string; table: "jobs" | "contacts" | null; id: string; have: { lat: number; lng: number } | null; tried?: boolean };
  const wants: Want[] = [];
  const point = new Map<string, { lat: number; lng: number }>();
  let unJobs = 0, unVend = 0;

  const jobAddr = new Map<string, { addr: string | null; city: string | null }>();
  for (const j of jobs) {
    const id = j.id as string;
    const own = fullAddress(s(j.address), s(j.city), s(j.state), s(j.zip));
    const c = j.customer_id ? cust.get(j.customer_id as string) : undefined;
    const theirs = c ? (s(c.address_formatted) ?? formatAddress(s(c.address_line1), s(c.city), s(c.state), s(c.zip))) : null;
    const addr = own ?? theirs;
    jobAddr.set(id, { addr, city: cityOf({ city: s(j.city) ?? (own ? null : s(c?.city)), address: addr }) });
    if (!addr) { unJobs++; continue; }
    const kept = n(j.lat) != null && n(j.lng) != null && s(j.geocode_query) === addr ? { lat: j.lat as number, lng: j.lng as number } : null;
    // The customer's own point, when the job is at the customer's address.
    const custPt = !own && c && n(c.lat) != null && n(c.lng) != null ? { lat: c.lat as number, lng: c.lng as number } : null;
    wants.push({ key: `job:${id}`, query: addr, table: "jobs", id, have: kept ?? custPt, tried: s(j.geocode_query) === addr });
  }
  for (const v of vendors) {
    const id = v.id as string;
    const addr = fullAddress(s(v.address), s(v.city), s(v.state), s(v.zip));
    if (!addr) { unVend++; continue; }
    const kept = n(v.lat) != null && n(v.lng) != null && s(v.geocode_query) === addr ? { lat: v.lat as number, lng: v.lng as number } : null;
    wants.push({ key: `vendor:${id}`, query: addr, table: "contacts", id, have: kept, tried: s(v.geocode_query) === addr });
  }

  const look: Want[] = [];
  for (const w of wants) {
    if (w.have) { point.set(w.key, w.have); continue; }
    if (w.tried) continue;
    if (memo.has(w.query)) { const m = memo.get(w.query); if (m) point.set(w.key, m); if (m || !stored) continue; }
    look.push(w);
  }
  const now = new Date().toISOString();
  await pool(look.slice(0, LOOKUPS), 6, async (w) => {
    const f = memo.has(w.query) ? memo.get(w.query) ?? null : await findAddress(w.query).then((x) => (x ? { lat: x.lat, lng: x.lng } : null));
    memo.set(w.query, f);
    if (f) point.set(w.key, f);
    // Kept even when nothing was found (no point), so a bad address isn't looked up every visit.
    if (stored && w.table) {
      await sb.from(w.table).update({ lat: f?.lat ?? null, lng: f?.lng ?? null, geocoded_at: now, geocode_query: w.query }).eq("org_id", orgId).eq("id", w.id);
    }
  });
  // Addresses the map couldn't place (the rest of a long first load arrive next time).
  const notFound = wants.filter((w) => !point.has(w.key)).length - Math.max(0, look.length - LOOKUPS);

  const pins: MapPin[] = [];
  const pick: PickJob[] = [];
  for (const j of jobs) {
    const id = j.id as string;
    const status = s(j.status);
    const c = j.customer_id ? cust.get(j.customer_id as string) : undefined;
    const who = j.contact_id ? people.get(j.contact_id as string) : undefined;
    const customer = s(c?.name) ?? s(who?.name);
    const layer = layerForJob(status, sent.has(id));
    const stage = status === "invited" ? "Bid invite" : stageOf(status).label;
    const a = jobAddr.get(id)!;
    const pt = point.get(`job:${id}`) ?? null;
    const title = s(j.title) ?? "Untitled job";
    if (status !== "lost" && status !== "complete" && status !== "closed") pick.push({ id, title, customer, addr: a.addr, stage, lat: pt?.lat ?? null, lng: pt?.lng ?? null });
    if (!pt) continue;
    const views = sent.get(id);
    const bid = status === "invited" ? bidNote(s(j.bid_due_at)) : null;
    pins.push({
      id, kind: "job", layer, lat: pt.lat, lng: pt.lng, name: title, addr: a.addr ?? "", city: a.city,
      customer, customerId: s(j.customer_id), type: s(j.job_type), stage: STATUS_NAME[status ?? ""] && layer === "active" ? STATUS_NAME[status ?? ""] : stage,
      note: layer === "sent" ? (views ? `Opened ${views} time${views === 1 ? "" : "s"}` : "Not opened yet") : bid?.note ?? null,
      urgent: bid?.urgent ?? false, createdAt: s(j.created_at), phone: s(who?.phone),
    });
  }
  for (const v of vendors) {
    const id = v.id as string;
    const pt = point.get(`vendor:${id}`);
    if (!pt) continue;
    const sub = s(v.contact_subtype);
    pins.push({
      id, kind: "vendor", layer: "vendor", lat: pt.lat, lng: pt.lng, name: s(v.company_name) ?? s(v.name) ?? "Vendor",
      addr: fullAddress(s(v.address), s(v.city), s(v.state), s(v.zip)) ?? "", city: s(v.city),
      vendorKind: sub ? sub.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase()) : "Vendor",
      phone: s(v.phone), email: s(v.email), deliverLabel: s(v.service_area) ? `Delivers: ${s(v.service_area)}` : null,
    });
  }

  // Customers with no address anywhere: none of their own, and no job with one.
  const jobHasAddr = new Set(jobs.filter((j) => s(j.customer_id) && jobAddr.get(j.id as string)?.addr).map((j) => j.customer_id as string));
  const customers = ((allCust.data ?? []) as Row[]).filter((c) => s(c.name) && !/^[\d\s()+.-]+$/.test(s(c.name)!)
    && !s(c.address_line1) && !s(c.address_formatted) && !jobHasAddr.has(c.id as string)).length;

  const body: MapPinsResponse = { pins, jobs: pick, unmapped: { customers, jobs: unJobs, vendors: unVend, notFound }, stored };
  return applyCookies(NextResponse.json(body));
}
