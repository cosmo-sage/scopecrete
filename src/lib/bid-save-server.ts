import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import type { ApiSession } from "@/lib/api-auth";
import { BIDS_MISSING, composeFor, missing091 } from "@/lib/bids-server";
import { bidEmail, bidText, bidUpdateText, cleanRequirements, priorRates, shownScopes, type PriceLine, type ScopePick } from "@/lib/bids";
import { newToken } from "@/lib/proposal-links";
import { publicOrigin } from "@/lib/hosts";
import { orgRow } from "@/lib/org-server";
import { FILES_BUCKET } from "@/lib/files";
import { cleanWeeks } from "@/lib/bid-weeks";

/**
 * Saves a bid request: a new one (POST /api/bid-requests) or a sent one edited
 * (PATCH /api/bid-requests/[id], migration 124). See the POST's comment in
 * src/app/api/bid-requests/route.ts for the body. Editing keeps the job and
 * every vendor's link: the request is rebuilt from the job's budget with the
 * ticks sent, replaced in place (packet.edited_at stamped), vendors added get
 * their own new link, and the reply carries every vendor — the new ones with
 * the request's words, the ones already on it (not turned off) with words
 * saying it changed (`new: false`). Nothing is sent from here.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const EDIT_MISSING = "Editing a sent bid request needs migration 124 — say \"apply 124\".";

export async function saveBidRequest(req: NextRequest, session: ApiSession, editId: string | null): Promise<NextResponse> {
  const { supabase, orgId, userId, applyCookies } = session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail("Body must be JSON.");

  // Editing: the request as it is, its job kept, its vendors kept with their links.
  type Was = { id: string; job_id: string; packet: Record<string, unknown> | null; created_at: string };
  let was: Was | null = null;
  let had: Array<{ id: string; contact_id: string; token: string; channel: string; answered_at: string | null; revoked_at: string | null }> = [];
  if (editId) {
    const { data, error } = await supabase.from("bid_requests").select("id, job_id, packet, created_at").eq("org_id", orgId).eq("id", editId).maybeSingle();
    if (missing091(error)) return fail(BIDS_MISSING, 503);
    if (error) return fail(error.message, 500);
    if (!data) return fail("No such bid request.", 404);
    was = data as Was;
    const { data: rs } = await supabase.from("bid_request_recipients").select("id, contact_id, token, channel, answered_at, revoked_at").eq("org_id", orgId).eq("bid_request_id", editId);
    had = (rs ?? []) as typeof had;
  }

  const jobId = was ? was.job_id : typeof b.job_id === "string" && UUID.test(b.job_id) ? b.job_id : null;
  if (!jobId) return fail("Pick the job.");
  const mode = ["lump", "per_item", "their_rates"].includes(b.price_mode as string) ? (b.price_mode as "lump" | "per_item" | "their_rates") : null;
  if (!mode) return fail("Say how they price it.");
  const day = (v: unknown) => (typeof v === "string" && DAY.test(v) ? v : null);
  const priceBy = day(b.price_by), pour = day(b.pour_date);
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null;
  const rawRecips = Array.isArray(b.recipients) ? (b.recipients as Array<Record<string, unknown>>) : [];
  const hadIds = new Set(had.map((r) => r.contact_id));
  const recips = [...new Map(rawRecips.filter((r) => typeof r.contact_id === "string" && UUID.test(r.contact_id))
    .map((r) => [r.contact_id as string, ["text", "email", "both"].includes(r.channel as string) ? (r.channel as string) : "text"])).entries()].filter(([id]) => !hadIds.has(id));
  if (!recips.length && !was) return fail("Pick who gets it.");
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
  // Photos picked from the company's Files that aren't on the job (2026-10-23): checked as the
  // org's own photos under RLS, then their paths listed like the job's so the vendor's link signs them.
  const onJob = new Set(job.files.map((f) => f.id));
  const others = [...wantFiles].filter((id) => UUID.test(id) && !onJob.has(id)).slice(0, Math.max(0, 30 - files.length));
  if (others.length) {
    const { data: rows } = await supabase.from("files").select("id, name, mime_type, storage_path").eq("org_id", orgId).in("id", others)
      .is("deleted_at", null).not("storage_path", "is", null);
    for (const r of (rows ?? []) as Array<{ id: string; name: string | null; mime_type: string | null; storage_path: string }>) {
      if (!String(r.mime_type ?? "").startsWith("image/")) continue;
      files.push({ id: r.id, name: r.name ?? "Photo", path: r.storage_path, kind: "photo", section: null });
    }
  }
  const packet = {
    address: pk.address === false ? null : job.address,
    access: pk.address === false ? null : job.access,
    dates: pk.dates !== false,
    quantities: pick.quantities !== false,
    files: files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, path: f.path, section: f.section ?? null })),
    maps: {} as Record<string, string>,
    requirements: cleanRequirements(pk.requirements),
    weeks: cleanWeeks(pk.weeks),
    ...(was ? { edited_at: new Date().toISOString(), edits: (Number(was.packet?.edits) || 0) + 1 } : {}),
  };
  // Each shown section's takeoffs on its sheet, as a picture the browser draws and uploads next.
  const reqId = was ? was.id : randomUUID();
  const shownKeys = new Set(scopes.map((s) => s.key));
  const mapKeys = Array.isArray(b.maps) ? (b.maps as unknown[]).filter((k): k is string => typeof k === "string" && UUID.test(k) && shownKeys.has(k)).slice(0, 40) : [];
  for (const k of mapKeys) packet.maps[k] = `${orgId}/bid/${reqId}/map-${k}.jpg`;

  // The vendors: filed vendor in this org.
  const everyone = [...recips.map(([id]) => id), ...had.map((r) => r.contact_id)];
  const { data: people, error: pErr } = everyone.length ? await supabase.from("contacts").select("id, name, company_name, phone, email, contact_type")
    .eq("org_id", orgId).in("id", everyone).is("merged_into_contact_id", null) : { data: [], error: null };
  if (pErr) return fail(pErr.message, 500);
  const byId = new Map(((people ?? []) as Array<Record<string, unknown>>).map((x) => [x.id as string, x]));
  if (recips.some(([id]) => !byId.has(id))) return fail("One of those vendors isn't one of yours.", 404);

  // Their rates: the price per unit each gave last time for a line of the same name and unit.
  const allLines = scopes.flatMap((s) => s.lines);
  const rates = new Map<string, Record<string, number>>();
  if (mode === "their_rates" && recips.length) {
    const { data: past } = await supabase.from("bid_request_recipients").select("contact_id, answered_at, price_lines")
      .eq("org_id", orgId).in("contact_id", recips.map(([id]) => id)).not("answered_at", "is", null).not("price_lines", "is", null).limit(400);
    for (const [cid] of recips) {
      const mine = ((past ?? []) as Array<{ contact_id: string; answered_at: string; price_lines: PriceLine[] }>).filter((x) => x.contact_id === cid)
        .map((x) => ({ at: x.answered_at, lines: x.price_lines }));
      rates.set(cid, priorRates(allLines, mine));
    }
  }

  const fields = { price_mode: mode, price_by: priceBy, pour_date: pour, scopes, packet,
    assets: { paths: [...files.map((f) => f.path), ...Object.values(packet.maps)] }, note };
  const { data: made, error } = was
    ? await supabase.from("bid_requests").update(fields).eq("org_id", orgId).eq("id", was.id).select("id, created_at").maybeSingle()
    : await supabase.from("bid_requests").insert({ id: reqId, org_id: orgId, job_id: jobId, ...fields, created_by: userId }).select("id, created_at").single();
  if (was && (error?.code === "42501" || (!error && !made))) return fail(EDIT_MISSING, 503);
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
  const { data: recRows, error: rErr } = rows.length ? await supabase.from("bid_request_recipients").insert(rows).select("id, contact_id, channel, token") : { data: [], error: null };
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
      text: bidText(words), email_parts: bidEmail(words), new: true };
  });
  // The vendors already on an edited request: the same link, and words saying it changed.
  for (const r of had.filter((x) => !x.revoked_at)) {
    const c = byId.get(r.contact_id);
    if (!c) continue;
    const name = (c.name as string | null)?.trim() || (c.company_name as string | null) || null;
    const url = `${origin}/b/${r.token}`;
    const words = { name, org: orgName, job: job.title, scopes: scopes.map((s) => s.title), size: null, street: null, pour: null,
      priceBy: packet.dates ? priceBy : null, url, answered: !!r.answered_at };
    const text = bidUpdateText(words);
    out.push({ id: r.id, contact_id: r.contact_id, name, phone: (c.phone as string | null) ?? null, email: (c.email as string | null) ?? null, channel: r.channel, url,
      text, email_parts: { subject: `Updated bid request${job.title ? ` — ${job.title}` : ""}${orgName ? ` (${orgName})` : ""}`, body: text }, new: false });
  }
  const uploads: Array<{ key: string; signed_url: string }> = [];
  for (const [key, path] of Object.entries(packet.maps)) {
    const { data: up } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (up) uploads.push({ key, signed_url: up.signedUrl });
  }
  return applyCookies(NextResponse.json({ request: { id: made.id, created_at: made.created_at }, recipients: out, uploads }, { status: was ? 200 : 201 }));
}
