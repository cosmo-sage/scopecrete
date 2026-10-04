import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { FILES_BUCKET, storagePath } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";
import { MEDIA_BUCKET, MEDIA_EXT, captureMedia, type MediaRow } from "@/lib/message-media-server";
import { textedPhotoName, textedMarker } from "@/lib/texted-photos";

/**
 * Photos the customer texted, brought onto their job (Coy, 2026-10-03: "she
 * texted pictures. I would like to be able to pull those pictures into the plan
 * room so that I can compare them to the aerial … into the budget and plan room
 * and proposal").
 *
 * GET  — the photos texted by the job's person and their customer's other
 *        people (newest first), each with `file_id` once it is on the job.
 * POST { media_ids: [...] | all: true } — each one copied into the job's files
 *        (`job-files`, a files row with source 'text', In plan room), so the
 *        Plan Room, a section's photos and the proposal's cover can use it. A
 *        photo not yet stored is first copied in from Quo. Already on the job →
 *        skipped. The text itself is untouched.
 *
 * Session client; the org from the session; every id checked against the job's people.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Sb = Parameters<typeof jobInOrg>[0];

interface Texted extends MediaRow { message_id: string; contact_id: string; sent_at: string | null; who: string | null }

async function people(sb: Sb, orgId: string, jobId: string): Promise<string[]> {
  const { data: j } = await sb.from("jobs").select("contact_id, customer_id").eq("org_id", orgId).eq("id", jobId).maybeSingle();
  const ids = new Set<string>();
  if (j?.contact_id) ids.add(j.contact_id as string);
  if (j?.customer_id) {
    const { data: cs } = await sb.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", j.customer_id as string).is("merged_into_contact_id", null);
    for (const c of (cs ?? []) as Array<{ id: string }>) ids.add(c.id);
  }
  return [...ids];
}

async function texted(sb: Sb, orgId: string, who: string[]): Promise<Texted[]> {
  if (!who.length) return [];
  const { data } = await sb.from("messages")
    .select("id, contact_id, occurred_at, contacts(name), message_media!inner(id, url, storage_path, mime_type, kind)")
    .eq("org_id", orgId).in("contact_id", who).eq("direction", "inbound").order("occurred_at", { ascending: false }).limit(80);
  type Row = { id: string; contact_id: string; occurred_at: string | null; contacts: { name: string | null } | null; message_media: MediaRow[] };
  return ((data ?? []) as unknown as Row[]).flatMap((m) => m.message_media
    .filter((x) => x.kind === "image" || (x.mime_type ?? "").startsWith("image/"))
    .map((x) => ({ ...x, message_id: m.id, contact_id: m.contact_id, sent_at: m.occurred_at, who: m.contacts?.name ?? null })));
}

async function onJob(sb: Sb, orgId: string, jobId: string): Promise<Map<string, string>> {
  const { data } = await sb.from("files").select("id, source_url").eq("org_id", orgId).eq("job_id", jobId).eq("source", "text").is("deleted_at", null);
  return new Map(((data ?? []) as Array<{ id: string; source_url: string | null }>).filter((f) => f.source_url).map((f) => [f.source_url as string, f.id]));
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const list = await texted(supabase, orgId, await people(supabase, orgId, id));
  const have = await onJob(supabase, orgId, id);
  const paths = list.filter((m) => m.storage_path).map((m) => m.storage_path as string);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 60 * 30);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  return applyCookies(NextResponse.json({
    photos: list.map((m) => ({
      id: m.id, message_id: m.message_id, who: m.who, sent_at: m.sent_at, mime_type: m.mime_type,
      url: m.storage_path ? signed.get(m.storage_path) ?? null : null,
      file_id: have.get(textedMarker(m.id)) ?? null,
    })),
  }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);

  let b: { media_ids?: unknown; all?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const wanted = Array.isArray(b.media_ids) ? b.media_ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 60) : [];
  if (!wanted.length && b.all !== true) return bad("Which photos?");

  // Only photos texted by this job's people can be brought onto it.
  const list = (await texted(supabase, orgId, await people(supabase, orgId, id))).filter((m) => b.all === true || wanted.includes(m.id));
  const have = await onJob(supabase, orgId, id);
  const made: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];
  for (const m of list) {
    if (have.has(textedMarker(m.id))) continue;
    const got = await captureMedia(supabase, orgId, m.message_id, m);
    if ("error" in got) { failed.push({ id: m.id, reason: got.error }); continue; }
    const { data: blob, error: dlErr } = await supabase.storage.from(MEDIA_BUCKET).download(got.path);
    if (dlErr || !blob) { failed.push({ id: m.id, reason: `couldn't open it: ${dlErr?.message ?? "missing"}` }); continue; }
    const mime = got.mime ?? blob.type ?? "image/jpeg";
    const name = textedPhotoName(m.who, m.sent_at, MEDIA_EXT[mime] ?? "jpg");
    const fileId = crypto.randomUUID();
    const path = storagePath(orgId, id, fileId, name);
    const up = await supabase.storage.from(FILES_BUCKET).upload(path, blob, { contentType: mime, upsert: false });
    if (up.error) { failed.push({ id: m.id, reason: `couldn't store it: ${up.error.message}` }); continue; }
    const { error } = await supabase.from("files").insert({
      id: fileId, org_id: orgId, job_id: id, contact_id: m.contact_id, message_id: m.message_id,
      name, kind: "image", category: "photo", mime_type: mime, byte_size: blob.size, storage_path: path,
      source: "text", source_url: textedMarker(m.id), fetch_state: "fetched", captured_at: new Date().toISOString(),
      in_plan_room: true, read_state: "waiting", created_by: userId,
    });
    if (error) { await supabase.storage.from(FILES_BUCKET).remove([path]); failed.push({ id: m.id, reason: error.message }); continue; }
    made.push(fileId);
  }
  let files: Array<Record<string, unknown>> = [];
  if (made.length) {
    const { data } = await supabase.from("files").select(FILE_COLUMNS).eq("org_id", orgId).in("id", made);
    files = await signFiles(supabase, (data ?? []) as Array<Record<string, unknown>>);
  }
  return applyCookies(NextResponse.json({ added: made.length, files, failed }));
}
