import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { getApiSession } from "@/lib/api-auth";
import { BIDS_MISSING, composeFor, missing091 } from "@/lib/bids-server";
import { bidEmail, bidText, cleanRequirements, priorRates, shownScopes, type PriceLine, type ScopePick } from "@/lib/bids";
import { newToken } from "@/lib/proposal-links";
import { publicOrigin } from "@/lib/hosts";
import { orgRow } from "@/lib/org-server";
import { FILES_BUCKET } from "@/lib/files";

/**
 * Bid requests (migration 091; Claude Design, Vendors v2).
 *
 * GET ?job=<id> | ?vendor=<contact id>
 *   → { requests: [{ id, job_id, job_title, price_mode, price_by, pour_date, scopes, created_at,
 *        recipients: [{ id, contact_id, name, channel, url, sent_at, sent_via, opened_at, view_count,
 *                       answered_at, price_total, price_lines, answer_note, revoked_at }] }] }
 *
 * POST { job_id, pick: { scopes, lines?, supplied? }, packet: { files: [ids], quantities, address, dates },
 *        price_mode, price_by?, pour_date?, note?, follow_up?, recipients: [{ contact_id, channel }] }
 *   → { request, recipients: [{ id, contact_id, name, phone, email, channel, url, text, email_parts }] }
 *   The vendor's copy is built here from the job's own budget — shownScopes()
 *   copies names, sizes, quantities and units, never a cost. Every vendor gets
 *   their own link. Nothing is sent from here: the composer then texts each
 *   one through /api/texts (Coy's tap) and opens his mail app for email.
 *   follow_up adds a next step on each vendor, due on the price-by date; their
 *   answer marks it done (sc_answer_bid).
 *   maps: [section ids] — the sections whose takeoffs the browser draws on their
 *   sheet as a picture (as the proposal's link does); the reply carries a signed
 *   upload link for each (`uploads`), and the picture's path is in the
 *   request's assets, so the vendor's link can read it.
 *
 * Session client, org from the session, every id checked against it (§7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REC_COLS = "id, bid_request_id, contact_id, channel, token, sent_at, sent_via, opened_at, view_count, last_viewed_at, answered_at, answer_count, price_total, price_lines, answer_note, revoked_at, created_at";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  const job = req.nextUrl.searchParams.get("job"), vendor = req.nextUrl.searchParams.get("vendor");
  if ((job && !UUID.test(job)) || (vendor && !UUID.test(vendor))) return json({ error: "Not an id." }, 400);
  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);

  let reqIds: string[] | null = null;
  let recs: Array<Record<string, unknown>> = [];
  if (vendor) {
    const { data, error } = await supabase.from("bid_request_recipients").select(REC_COLS).eq("org_id", orgId).eq("contact_id", vendor).order("created_at", { ascending: false }).limit(100);
    if (missing091(error)) return json({ requests: [], missing: BIDS_MISSING });
    if (error) return json({ error: error.message }, 500);
    recs = (data ?? []) as Array<Record<string, unknown>>;
    reqIds = [...new Set(recs.map((r) => r.bid_request_id as string))];
  }
  let q = supabase.from("bid_requests").select("id, job_id, price_mode, price_by, pour_date, scopes, note, created_at, job:jobs(title, address)").eq("org_id", orgId);
  if (job) q = q.eq("job_id", job);
  if (reqIds) q = reqIds.length ? q.in("id", reqIds) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(60);
  if (missing091(error)) return json({ requests: [], missing: BIDS_MISSING });
  if (error) return json({ error: error.message }, 500);
  const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (!vendor && ids.length) {
    const { data } = await supabase.from("bid_request_recipients").select(REC_COLS).eq("org_id", orgId).in("bid_request_id", ids);
    recs = (data ?? []) as Array<Record<string, unknown>>;
  }
  const cids = [...new Set(recs.map((r) => r.contact_id as string))];
  const { data: people } = cids.length ? await supabase.from("contacts").select("id, name, company_name, phone").eq("org_id", orgId).in("id", cids) : { data: [] };
  const who = new Map(((people ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, (p.name as string | null)?.trim() || (p.company_name as string | null) || (p.phone as string | null) || "Vendor"]));
  const requests = ((rows ?? []) as unknown as Array<Record<string, unknown> & { id: string; job: { title: string | null; address: string | null } | null }>).map((r) => ({
    id: r.id, job_id: r.job_id, job_title: r.job?.title ?? null, job_address: r.job?.address ?? null, price_mode: r.price_mode, price_by: r.price_by, pour_date: r.pour_date,
    scopes: r.scopes, note: r.note, created_at: r.created_at,
    recipients: recs.filter((x) => x.bid_request_id === r.id).map(({ token, ...x }) => ({ ...x, name: who.get(x.contact_id as string) ?? "Vendor", url: `${origin}/b/${token}` })),
  }));
  return json({ requests });
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail("Body must be JSON.");

  const jobId = typeof b.job_id === "string" && UUID.test(b.job_id) ? b.job_id : null;
  if (!jobId) return fail("Pick the job.");
  const mode = ["lump", "per_item", "their_rates"].includes(b.price_mode as string) ? (b.price_mode as "lump" | "per_item" | "their_rates") : null;
  if (!mode) return fail("Say how they price it.");
  const day = (v: unknown) => (typeof v === "string" && DAY.test(v) ? v : null);
  const priceBy = day(b.price_by), pour = day(b.pour_date);
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null;
  const rawRecips = Array.isArray(b.recipients) ? (b.recipients as Array<Record<string, unknown>>) : [];
  const recips = [...new Map(rawRecips.filter((r) => typeof r.contact_id === "string" && UUID.test(r.contact_id))
    .map((r) => [r.contact_id as string, ["text", "email", "both"].includes(r.channel as string) ? (r.channel as string) : "text"])).entries()];
  if (!recips.length) return fail("Pick who gets it.");
  if (recips.length > 40) return fail("Forty vendors at a time, at most.");

  const job = await composeFor(supabase, orgId, jobId);
  if (!job) return fail("No such job.", 404);
  const p = (b.pick ?? {}) as Record<string, unknown>;
  const bools = (v: unknown) => Object.fromEntries(Object.entries((v && typeof v === "object" ? v : {}) as Record<string, unknown>).map(([k, x]) => [k, x === true]));
  const pk = (b.packet ?? {}) as Record<string, unknown>;
  const pick: ScopePick = { scopes: bools(p.scopes), lines: bools(p.lines), supplied: bools(p.supplied), quantities: pk.quantities !== false };
  const scopes = shownScopes(job.scopes, pick);
  if (!scopes.length) return fail("Tick at least one scope with a line in it.");

  const wantFiles = new Set(Array.isArray(pk.files) ? (pk.files as unknown[]).filter((x): x is string => typeof x === "string") : []);
  const files = job.files.filter((f) => wantFiles.has(f.id)).slice(0, 30);
  const packet = {
    address: pk.address === false ? null : job.address,
    access: pk.address === false ? null : job.access,
    dates: pk.dates !== false,
    quantities: pick.quantities !== false,
    files: files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, path: f.path, section: f.section ?? null })),
    maps: {} as Record<string, string>,
    requirements: cleanRequirements(pk.requirements),
  };
  // Each shown section's takeoffs on its sheet, as a picture the browser draws and uploads next.
  const reqId = randomUUID();
  const shownKeys = new Set(scopes.map((s) => s.key));
  const mapKeys = Array.isArray(b.maps) ? (b.maps as unknown[]).filter((k): k is string => typeof k === "string" && UUID.test(k) && shownKeys.has(k)).slice(0, 40) : [];
  for (const k of mapKeys) packet.maps[k] = `${orgId}/bid/${reqId}/map-${k}.jpg`;

  // The vendors: filed vendor in this org.
  const { data: people, error: pErr } = await supabase.from("contacts").select("id, name, company_name, phone, email, contact_type")
    .eq("org_id", orgId).in("id", recips.map(([id]) => id)).is("merged_into_contact_id", null);
  if (pErr) return fail(pErr.message, 500);
  const byId = new Map(((people ?? []) as Array<Record<string, unknown>>).map((x) => [x.id as string, x]));
  if (recips.some(([id]) => !byId.has(id))) return fail("One of those vendors isn't one of yours.", 404);

  // Their rates: the price per unit each gave last time for a line of the same name and unit.
  const allLines = scopes.flatMap((s) => s.lines);
  const rates = new Map<string, Record<string, number>>();
  if (mode === "their_rates") {
    const { data: past } = await supabase.from("bid_request_recipients").select("contact_id, answered_at, price_lines")
      .eq("org_id", orgId).in("contact_id", recips.map(([id]) => id)).not("answered_at", "is", null).not("price_lines", "is", null).limit(400);
    for (const [cid] of recips) {
      const mine = ((past ?? []) as Array<{ contact_id: string; answered_at: string; price_lines: PriceLine[] }>).filter((x) => x.contact_id === cid)
        .map((x) => ({ at: x.answered_at, lines: x.price_lines }));
      rates.set(cid, priorRates(allLines, mine));
    }
  }

  const { data: made, error } = await supabase.from("bid_requests").insert({
    id: reqId, org_id: orgId, job_id: jobId, price_mode: mode, price_by: priceBy, pour_date: pour, scopes, packet,
    assets: { paths: [...files.map((f) => f.path), ...Object.values(packet.maps)] }, note, created_by: userId,
  }).select("id, created_at").single();
  if (missing091(error)) return fail(BIDS_MISSING, 503);
  if (error || !made) return fail(`Couldn't save the bid request: ${error?.message ?? "no row"}`, 500);

  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);
  const org = await orgRow(supabase, orgId);
  const orgName = (org?.name as string | undefined) ?? null;
  const rows = recips.map(([cid, ch]) => {
    const c = byId.get(cid)!;
    const name = (c.name as string | null)?.trim() || (c.company_name as string | null) || null;
    return { org_id: orgId, bid_request_id: made.id, contact_id: cid, channel: ch === "text" || c.email ? ch : "text",
      token: newToken(randomBytes(24)), first_name: name ? name.split(/\s+/)[0] : null, rates: rates.get(cid) ?? null };
  });
  const { data: recRows, error: rErr } = await supabase.from("bid_request_recipients").insert(rows).select("id, contact_id, channel, token");
  if (rErr) return fail(`Couldn't make the links: ${rErr.message}`, 500);

  // A next step on each vendor: chase the price if it hasn't come by the date.
  if (b.follow_up === true) {
    const due = priceBy ?? new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    for (const r of (recRows ?? []) as Array<{ id: string; contact_id: string }>) {
      const c = byId.get(r.contact_id)!;
      const first = ((c.name as string | null)?.trim() || (c.company_name as string | null) || "their").split(/\s+/)[0];
      const { data: t } = await supabase.from("contact_tasks").insert({ org_id: orgId, contact_id: r.contact_id, job_id: jobId,
        title: `Get ${first}'s price for ${job.title ?? "the job"}`.slice(0, 200), due_on: due, source: "coy", created_by: userId }).select("id").single();
      if (t) await supabase.from("bid_request_recipients").update({ follow_up_task_id: t.id }).eq("org_id", orgId).eq("id", r.id);
    }
  }

  const sizes = scopes.map((s) => s.size).filter(Boolean);
  const out = ((recRows ?? []) as Array<{ id: string; contact_id: string; channel: string; token: string }>).map((r) => {
    const c = byId.get(r.contact_id)!;
    const name = (c.name as string | null)?.trim() || (c.company_name as string | null) || null;
    const url = `${origin}/b/${r.token}`;
    const words = { name, org: orgName, job: job.title, scopes: scopes.map((s) => s.title), size: sizes.length === 1 ? sizes[0] : null,
      street: packet.address ? job.street : null, pour: packet.dates ? pour : null, priceBy: packet.dates ? priceBy : null, url };
    return { id: r.id, contact_id: r.contact_id, name, phone: c.phone ?? null, email: c.email ?? null, channel: r.channel, url,
      text: bidText(words), email_parts: bidEmail(words) };
  });
  const uploads: Array<{ key: string; signed_url: string }> = [];
  for (const [key, path] of Object.entries(packet.maps)) {
    const { data: up } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (up) uploads.push({ key, signed_url: up.signedUrl });
  }
  return applyCookies(NextResponse.json({ request: { id: made.id, created_at: made.created_at }, recipients: out, uploads }, { status: 201 }));
}
