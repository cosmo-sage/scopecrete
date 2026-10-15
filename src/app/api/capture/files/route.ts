import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILES_BUCKET, storagePath } from "@/lib/files";
import { cleanCapture, extFor, shotName } from "@/lib/capture";
import { SHOT_COLUMNS, WAITING_113, missing113, signShots } from "@/lib/capture-server";

/**
 * Site photos and videos from the Camera page (migration 113; Coy, 2026-10-15:
 * "our own little company cam … take pictures on site really quickly").
 *
 * POST { client_id, mime, size, thumb_size?, taken_at, lat?, lng?, accuracy?,
 *        job_id?, section_id?, site_id?, tag?, note? }
 *   → the row and signed upload links for the file and its thumbnail. The
 *     phone's own id for the shot (client_id) makes it safe to retry: a second
 *     POST returns the same row (with fresh links while it hasn't arrived).
 *     POST /api/files/[id]/done confirms it, as for any upload.
 * GET  ?job=<id> | ?site=<id> | ?inbox=1 | (none: the last day's shots)
 *   → { shots } with signed thumbnails, newest first.
 *
 * Session client only; the org comes from the session and every id named is
 * checked against it (DECISIONS §7). Before 113 both answer 503 with why.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const sp = req.nextUrl.searchParams;
  let q = supabase.from("files").select(SHOT_COLUMNS).eq("org_id", orgId).eq("source", "capture").is("deleted_at", null)
    .order("taken_at", { ascending: false }).limit(200);
  const job = sp.get("job"), site = sp.get("site");
  if (job && UUID.test(job)) q = q.eq("job_id", job);
  else if (site && UUID.test(site)) q = q.eq("site_id", site);
  else if (sp.get("inbox") === "1") q = q.is("job_id", null).is("site_id", null);
  else q = q.gte("taken_at", new Date(Date.now() - 86_400_000).toISOString());
  const { data, error } = await q;
  if (missing113(error)) return applyCookies(NextResponse.json({ error: WAITING_113, waiting: true }, { status: 503 }));
  if (error) return applyCookies(NextResponse.json({ error: `files: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ shots: await signShots(supabase, (data ?? []) as Array<Record<string, unknown>>) }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400, extra: Record<string, unknown> = {}) => applyCookies(NextResponse.json({ error: m, ...extra }, { status: s }));

  let raw: Record<string, unknown>;
  try { raw = await req.json(); } catch { return bad("Body must be JSON."); }
  const b = cleanCapture(raw);
  if (typeof b === "string") return bad(b);

  const uploads = async (row: Record<string, unknown>) => {
    const main = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(row.storage_path as string, { upsert: true });
    const thumb = row.thumb_path ? await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(row.thumb_path as string, { upsert: true }) : null;
    if (main.error || !main.data) return null;
    return {
      upload: { path: main.data.path, token: main.data.token, signed_url: main.data.signedUrl },
      thumb_upload: thumb?.data ? { path: thumb.data.path, token: thumb.data.token, signed_url: thumb.data.signedUrl } : null,
    };
  };
  const answer = async (row: Record<string, unknown>, status: number) => {
    if (row.fetch_state === "fetched") return applyCookies(NextResponse.json({ file: row, done: true }, { status }));
    const up = await uploads(row);
    if (!up) return bad("Couldn't open an upload — try again.", 500);
    return applyCookies(NextResponse.json({ file: row, ...up }, { status }));
  };

  // A retry: the row is already there.
  const { data: had, error: hadErr } = await supabase.from("files").select(SHOT_COLUMNS).eq("org_id", orgId).eq("client_id", b.client_id).maybeSingle();
  if (missing113(hadErr)) return bad(WAITING_113, 503, { waiting: true });
  if (hadErr) return bad(`files: ${hadErr.message}`, 500);
  if (had) return answer(had as Record<string, unknown>, 200);

  // Where it goes. A site that became a job puts its shots on that job.
  let jobId = b.job_id, siteId = b.site_id;
  const sectionId = b.section_id;
  if (siteId) {
    const { data: s } = await supabase.from("sites").select("id, job_id").eq("org_id", orgId).eq("id", siteId).maybeSingle();
    if (!s) return bad("No such site.", 404);
    if (!jobId && s.job_id) jobId = s.job_id as string;
  }
  if (sectionId) {
    const { data: s } = await supabase.from("job_sections").select("id, job_id").eq("org_id", orgId).eq("id", sectionId).maybeSingle();
    if (!s) return bad("No such area.", 404);
    if (jobId && jobId !== s.job_id) return bad("That area is on another job.");
    jobId = s.job_id as string;
  }
  let contactId: string | null = null;
  if (jobId) {
    const { data: j } = await supabase.from("jobs").select("id, contact_id").eq("org_id", orgId).eq("id", jobId).maybeSingle();
    if (!j) return bad("No such job.", 404);
    contactId = (j.contact_id as string | null) ?? null;
    // Standing on a job that came from a site: keep the site on the shot too.
    if (!siteId) {
      const { data: s } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("job_id", jobId).is("archived_at", null).limit(1).maybeSingle();
      if (s) siteId = s.id as string;
    }
  }

  const fileId = crypto.randomUUID();
  const name = shotName(b.taken_at, b.kind, extFor(b.mime));
  const path = storagePath(orgId, jobId ?? siteId ?? "capture", fileId, name);
  const { data: row, error } = await supabase.from("files").insert({
    id: fileId, org_id: orgId, job_id: jobId, section_id: sectionId, site_id: siteId, contact_id: contactId,
    name, kind: b.kind, category: "photo", mime_type: b.mime, byte_size: b.size, storage_path: path,
    thumb_path: b.thumb_size ? `${path}.thumb.jpg` : null,
    source: "capture", fetch_state: "pending", created_by: userId, client_id: b.client_id,
    taken_at: b.taken_at, lat: b.lat, lng: b.lng, gps_accuracy_m: b.accuracy,
    note: b.note, tags: b.tag ? [b.tag] : [],
  }).select(SHOT_COLUMNS).single();
  if (missing113(error)) return bad(WAITING_113, 503, { waiting: true });
  if (error?.code === "23505") {
    // Two retries at once: the other one made it.
    const { data: again } = await supabase.from("files").select(SHOT_COLUMNS).eq("org_id", orgId).eq("client_id", b.client_id).maybeSingle();
    if (again) return answer(again as Record<string, unknown>, 200);
  }
  if (error || !row) return bad(`Couldn't record the shot: ${error?.message ?? "no row"}`, 500);
  return answer(row as Record<string, unknown>, 201);
}
