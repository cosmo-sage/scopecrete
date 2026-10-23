import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getApiSession } from "@/lib/api-auth";
import { publicOrigin } from "@/lib/hosts";
import { FILES_BUCKET } from "@/lib/files";
import { linkAssets, newToken, pageFileIds, publicSnapshot, type LinkAssets } from "@/lib/proposal-links";
import { cleanPages, stampText } from "@/lib/proposal-pages";
import { POST as finalize } from "../final/route";
import { proposalNumbers } from "@/lib/proposal-number-server";

/**
 * The customer's link to a FINAL proposal (migration 075).
 *
 * GET  — this job's links, newest first, with how often each was opened.
 * POST — the link for the newest final version: the one already made for it,
 *        or a new one (older versions' links are retired — the customer sees
 *        "replaced"). Body: what the page shows beside the words — the cover
 *        photo and each area's photos (file ids, checked against this job),
 *        and the areas whose map the browser will upload as a picture; the
 *        reply carries a signed upload link for each map.
 *        `{auto: true}` (Threads and Dusty's send step, 2026-10-05): no browser
 *        drawing — the cover is the proposal's own, each area's photos are the
 *        job's photos filed on it, and no map pictures (the page shows the
 *        areas without them). With no final yet, the draft is frozen first, as
 *        Preview does when it sends. The reply also names who it is for.
 *
 * Session client, org from the session; every file id is checked against the
 * org and the job.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_COLS = "id, token, status, decided_name, decided_at, sent_at, sent_via, view_count, first_viewed_at, last_viewed_at, revoked_at, created_at, proposal_id, version:job_proposals(version)";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!UUID.test(id)) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const { data, error } = await supabase.from("documents").select(LINK_COLS)
    .eq("org_id", orgId).eq("job_id", id).not("proposal_id", "is", null).order("created_at", { ascending: false }).limit(20);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string; token: string }>;
  const ids = rows.map((d) => d.id);
  const [{ data: ev }, numbers] = await Promise.all([
    ids.length
      ? supabase.from("document_events").select("document_id, event, occurred_at, user_agent").eq("org_id", orgId).in("document_id", ids).order("occurred_at", { ascending: false }).limit(60)
      : Promise.resolve({ data: [] }),
    proposalNumbers(supabase, orgId),
  ]);
  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);
  // Each link's proposal number, SE-26-0001-A (src/lib/proposal-number.ts).
  const numberOf = (d: Record<string, unknown>) => {
    const v = (d.version as { version?: number } | null)?.version;
    return v ? numbers.number(id, v) : null;
  };
  return applyCookies(NextResponse.json({
    links: rows.map((d) => ({ ...d, number: numberOf(d), url: `${origin}/p/${d.token}`, events: ((ev ?? []) as Array<{ document_id: string }>).filter((e) => e.document_id === d.id).slice(0, 20) })),
  }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!UUID.test(id)) return bad("No such job.", 404);
  const body = (await req.json().catch(() => ({}))) as { cover_file_id?: unknown; photos?: unknown; maps?: unknown; auto?: unknown; version?: unknown };
  // A version picked on the Proposal tab — an older final sent again (Coy, 2026-10-11).
  const asked = typeof body.version === "number" && Number.isInteger(body.version) && body.version > 0 ? body.version : null;
  const auto = body.auto === true && asked === null;

  const { data: job } = await supabase.from("jobs").select("id, customer_id, contact_id, title").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!job) return bad("No such job.", 404);
  const latestFinal = () => supabase.from("job_proposals").select("id, version, project_type, snapshot, cover_file_id").eq("org_id", orgId).eq("job_id", id)
    .eq("status", "final").is("deleted_at", null).order("version", { ascending: false }).limit(1).maybeSingle();
  let { data: prop } = asked === null ? await latestFinal()
    : await supabase.from("job_proposals").select("id, version, project_type, snapshot, cover_file_id").eq("org_id", orgId).eq("job_id", id)
      .eq("status", "final").eq("version", asked).is("deleted_at", null).maybeSingle();
  if (asked !== null && !prop) return bad(`Version ${asked} isn't a final version of this job's proposal.`, 404);
  if (auto) {
    // A draft newer than the last final is what Coy is looking at: freeze it, as Preview's send does.
    const { data: draft } = await supabase.from("job_proposals").select("id, version").eq("org_id", orgId).eq("job_id", id).eq("status", "draft").maybeSingle();
    if (draft && (!prop || (draft.version as number) > (prop.version as number))) {
      const fin = await finalize(req, { params: Promise.resolve({ id }) });
      if (!fin.ok) {
        const e = (await fin.json().catch(() => ({}))) as { error?: string };
        return bad(`The proposal can't be frozen to send yet — ${e.error ?? `HTTP ${fin.status}`}`, 409);
      }
      ({ data: prop } = await latestFinal());
    }
  }
  if (!prop) return bad(auto ? "This job has no proposal yet — make one on the job's Proposal tab." : "Make the proposal final first — the link shows a frozen version.", 409);

  // Who it is for: the job's person, else the customer's primary; their phone and email.
  const recipient = await recipientOf(supabase, orgId, job.contact_id as string | null, job.customer_id as string | null);
  const extra = { recipient, job: { id, title: (job.title as string | null) ?? null }, version: prop.version };

  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);
  // Already a live link for this version: send that one again — with the photos filed on its areas
  // since it was made (Coy, 2026-10-11: "I'm not seeing the photos added to the section on the
  // proposal links"). The words and prices stay frozen; a signed link (097) stays exactly as signed.
  const { data: live } = await supabase.from("documents").select(`${LINK_COLS}, assets, shown, signed_at`).eq("org_id", orgId).eq("proposal_id", prop.id)
    .is("revoked_at", null).neq("status", "void").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (live) {
    const { assets: had, shown: liveShown, signed_at, ...row } = live as unknown as Record<string, unknown> & { id: string; token: string; assets: LinkAssets | null; shown: Record<string, unknown> | null; signed_at: string | null };
    const uploads: Array<{ area_id: string; path: string; token: string; signed_url: string }> = [];
    if (!signed_at && row.status !== "accepted") {
      const prev = had ?? { paths: [] };
      const disp = ((liveShown ?? {}).display ?? {}) as { hide_area_pics?: boolean; picsOff?: Record<string, boolean>; pages?: unknown };
      const shows = (area: string) => !disp.hide_area_pics && !disp.picsOff?.[area];
      const fresh = await areaPhotoPaths(supabase, orgId, id);
      const photos: Record<string, string[]> = {};
      for (const [area, ps] of Object.entries(fresh)) if (shows(area)) photos[area] = ps;
      // An area that has a map now and didn't when the link was made: the browser draws it again.
      const maps: Record<string, string> = { ...(prev.maps ?? {}) };
      const newMaps = Array.isArray(body.maps) ? (body.maps as unknown[]).filter((a): a is string => typeof a === "string" && UUID.test(a) && shows(a) && !maps[a]).slice(0, 40) : [];
      for (const a of newMaps) maps[a] = `${orgId}/proposal/${row.id}/map-${a}.jpg`;
      const files = await pageFilePaths(supabase, orgId, id, pageFileIds(cleanPages(disp.pages)));
      const assets = linkAssets(orgId, { logo: prev.logo ?? null, logo_dark: prev.logo_dark ?? null, cover: prev.cover ?? null, maps, photos, files });
      if (JSON.stringify(assets) !== JSON.stringify(prev)) {
        const { error: upErr } = await supabase.from("documents").update({ assets }).eq("org_id", orgId).eq("id", row.id);
        if (upErr) return bad(upErr.message, 500);
      }
      for (const a of newMaps) {
        const { data: up } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(maps[a], { upsert: true });
        if (up) uploads.push({ area_id: a, path: maps[a], token: up.token, signed_url: up.signedUrl });
      }
    }
    return applyCookies(NextResponse.json({ link: { ...row, url: `${origin}/p/${row.token}` }, uploads, ...extra }));
  }

  if (auto) {
    // What Preview would pick, read on the server: the proposal's cover, and up to four photos per area.
    body.photos = await areaPhotoIds(supabase, orgId, id);
    body.cover_file_id = (prop.cover_file_id as string | null) ?? null;
    body.maps = [];
  }
  // An older version sent again keeps its own cover unless the Preview named one.
  if (asked !== null && body.cover_file_id === undefined) body.cover_file_id = (prop.cover_file_id as string | null) ?? null;

  // What the page shows beside the words — only this job's files.
  const photos: Record<string, string[]> = {};
  const rawPhotos = body.photos && typeof body.photos === "object" ? (body.photos as Record<string, unknown>) : {};
  const want = new Set<string>();
  for (const [area, ids] of Object.entries(rawPhotos)) {
    if (!UUID.test(area) || !Array.isArray(ids)) continue;
    for (const f of ids.slice(0, 4)) if (typeof f === "string" && UUID.test(f)) want.add(f);
  }
  const cover = typeof body.cover_file_id === "string" && UUID.test(body.cover_file_id) ? body.cover_file_id : null;
  if (cover) want.add(cover);
  const paths = new Map<string, string>();
  if (want.size) {
    const { data: rows } = await supabase.from("files").select("id, storage_path").eq("org_id", orgId).eq("job_id", id).is("deleted_at", null).in("id", [...want]);
    for (const r of rows ?? []) if (r.storage_path) paths.set(r.id as string, r.storage_path as string);
  }
  for (const [area, ids] of Object.entries(rawPhotos)) {
    if (!UUID.test(area) || !Array.isArray(ids)) continue;
    const p = ids.map((f) => paths.get(String(f))).filter((x): x is string => !!x);
    if (p.length) photos[area] = p;
  }
  const { data: org } = await supabase.from("orgs").select("logo_light_path, logo_dark_path").eq("id", orgId).maybeSingle();
  const { data: type } = prop.project_type
    ? await supabase.from("org_project_types").select("label").eq("org_id", orgId).eq("key", prop.project_type as string).maybeSingle()
    : { data: null };
  // The customer's copy: what they see, never the cost side (publicSnapshot()).
  // The cover photo's camera stamp — when and where it was taken (Proposal Builder v2).
  let coverStamp: string | null = null;
  if (cover && paths.has(cover)) {
    const { data: cf } = await supabase.from("files").select("taken_at, lat, lng, created_at").eq("org_id", orgId).eq("id", cover).maybeSingle();
    if (cf) coverStamp = stampText((cf.taken_at as string | null) ?? (cf.created_at as string | null), cf.lat == null ? null : Number(cf.lat), cf.lng == null ? null : Number(cf.lng));
  }
  const shown = publicSnapshot((prop.snapshot ?? {}) as Record<string, unknown>, { project_type: (prop.project_type as string | null) ?? null, type_label: (type?.label as string | undefined) ?? "", cover_stamp: coverStamp });

  // An area whose map and photos Coy hid shows none — the browser leaves them out, and so does this.
  const disp = (shown.display ?? {}) as { hide_area_pics?: boolean; picsOff?: Record<string, boolean>; pages?: unknown };
  const pics = (area: string) => !disp.hide_area_pics && !disp.picsOff?.[area];
  for (const k of Object.keys(photos)) if (!pics(k)) delete photos[k];
  const token = newToken(randomBytes(24));
  const docId = crypto.randomUUID();
  const mapAreas = Array.isArray(body.maps) ? (body.maps as unknown[]).filter((a): a is string => typeof a === "string" && UUID.test(a) && pics(a)).slice(0, 40) : [];
  const maps: Record<string, string> = {};
  for (const a of mapAreas) maps[a] = `${orgId}/proposal/${docId}/map-${a}.jpg`;
  const assets = linkAssets(orgId, {
    logo: (org?.logo_light_path as string | null) ?? null, logo_dark: (org?.logo_dark_path as string | null) ?? null,
    cover: cover ? paths.get(cover) ?? null : null, maps, photos,
    files: await pageFilePaths(supabase, orgId, id, pageFileIds(cleanPages(disp.pages))),
  });

  // An older version can't go out beside a newer one the customer signed: two live links, one signed.
  const { data: signedNewer } = await supabase.from("documents").select("id, version").eq("org_id", orgId).eq("job_id", id)
    .not("proposal_id", "is", null).is("revoked_at", null).eq("status", "accepted").gt("version", prop.version as number).limit(1).maybeSingle();
  if (signedNewer) return bad(`The customer signed version ${signedNewer.version as number} — send that one, or start a new version.`, 409);
  // A new version's link retires the older ones: the customer sees "replaced". A signed one stays (097).
  await supabase.from("documents").update({ status: "void" }).eq("org_id", orgId).eq("job_id", id)
    .not("proposal_id", "is", null).is("revoked_at", null).not("status", "in", "(void,accepted)");
  const { data: doc, error } = await supabase.from("documents").insert({
    id: docId, org_id: orgId, job_id: id, customer_id: job.customer_id, doc_type: "quote", token,
    proposal_id: prop.id, version: prop.version, status: "draft", assets, shown, created_by: userId,
  }).select(LINK_COLS).single();
  if (error || !doc) return bad(error?.message ?? "not saved", 500);

  const uploads: Array<{ area_id: string; path: string; token: string; signed_url: string }> = [];
  for (const [area, path] of Object.entries(maps)) {
    const { data: up } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (up) uploads.push({ area_id: area, path, token: up.token, signed_url: up.signedUrl });
  }
  return applyCookies(NextResponse.json({ link: { ...doc, url: `${origin}/p/${token}` }, uploads, ...extra }));
}

type Sb = Extract<Awaited<ReturnType<typeof getApiSession>>, { ok: true }>["session"]["supabase"];

/** The person a proposal goes to, with their phone and email (the contact's, else their first listed). */
async function recipientOf(sb: Sb, orgId: string, contactId: string | null, customerId: string | null) {
  let cid = contactId;
  if (!cid && customerId) {
    const { data: c } = await sb.from("customers").select("primary_contact_id").eq("org_id", orgId).eq("id", customerId).maybeSingle();
    cid = (c?.primary_contact_id as string | null) ?? null;
  }
  if (!cid) return null;
  const [{ data: p }, { data: em }] = await Promise.all([
    sb.from("contacts").select("id, name, phone, email").eq("org_id", orgId).eq("id", cid).maybeSingle(),
    sb.from("contact_emails").select("email").eq("org_id", orgId).eq("contact_id", cid).limit(1),
  ]);
  if (!p) return null;
  return { contact_id: p.id as string, name: (p.name as string | null) ?? null, phone: (p.phone as string | null) ?? null,
    email: (p.email as string | null) ?? ((em ?? [])[0]?.email as string | undefined) ?? null };
}

/**
 * Each area's photos, up to four, oldest first: a photo filed on the area, or on one of its takeoff
 * shapes (as the Preview's areaVisuals reads them). Plan clips are not photos.
 */
async function areaPhotoIds(sb: Sb, orgId: string, jobId: string): Promise<Record<string, string[]>> {
  const rows = await areaPhotoRows(sb, orgId, jobId);
  const per: Record<string, string[]> = {};
  for (const f of rows) { const list = (per[f.area] ??= []); if (list.length < 4) list.push(f.id); }
  return per;
}

/** The same photos as storage paths, for a link already made. */
async function areaPhotoPaths(sb: Sb, orgId: string, jobId: string): Promise<Record<string, string[]>> {
  const rows = await areaPhotoRows(sb, orgId, jobId);
  const per: Record<string, string[]> = {};
  for (const f of rows) { if (!f.path) continue; const list = (per[f.area] ??= []); if (list.length < 4) list.push(f.path); }
  return per;
}

async function areaPhotoRows(sb: Sb, orgId: string, jobId: string) {
  // One .or() only: the plan-clip filter. Whether a file is on an area or a shape is checked here.
  const { data: pics } = await sb.from("files").select("id, storage_path, section_id, takeoff_measurement_id, mime_type").eq("org_id", orgId).eq("job_id", jobId)
    .is("deleted_at", null).or("category.is.null,category.neq.plan").order("created_at", { ascending: true }).limit(400);
  const all = ((pics ?? []) as Array<{ id: string; storage_path: string | null; section_id: string | null; takeoff_measurement_id: string | null; mime_type: string | null }>)
    .filter((f) => /^image\//.test(f.mime_type ?? "") && (f.section_id || f.takeoff_measurement_id));
  const shapeIds = [...new Set(all.map((f) => f.takeoff_measurement_id).filter((x): x is string => !!x))];
  const shapeArea = new Map<string, string>();
  if (shapeIds.length) {
    const { data: shapes } = await sb.from("takeoff_measurements").select("id, section_id").eq("org_id", orgId).in("id", shapeIds);
    for (const m of (shapes ?? []) as Array<{ id: string; section_id: string | null }>) if (m.section_id) shapeArea.set(m.id, m.section_id);
  }
  const out: Array<{ id: string; path: string | null; area: string }> = [];
  for (const f of all) {
    const area = f.section_id ?? (f.takeoff_measurement_id ? shapeArea.get(f.takeoff_measurement_id) : undefined);
    if (area) out.push({ id: f.id, path: f.storage_path, area });
  }
  return out;
}

/** The storage paths of the job files the proposal's own pages name (photos and PDF pages) — this job's only. */
async function pageFilePaths(supabase: Sb, orgId: string, jobId: string, ids: string[]): Promise<Record<string, string>> {
  const ok = ids.filter((f) => UUID.test(f));
  if (!ok.length) return {};
  const { data } = await supabase.from("files").select("id, storage_path").eq("org_id", orgId).eq("job_id", jobId).is("deleted_at", null).in("id", ok);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.storage_path) out[r.id as string] = r.storage_path as string;
  return out;
}
