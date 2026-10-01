import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { CATEGORIES, MAX_FILE_BYTES, FILES_BUCKET, categoryGuess, kindOf, storagePath } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";

/**
 * Files on a job or a person (migration 045). Coy, 2026-09-29: "I need to be
 * able to upload documents and photos for Dusty to parse."
 *
 * POST  { name, mime, size, job_id?, section_id?, contact_id?, category? }
 *   → the row, plus a signed upload URL. The browser sends the bytes straight
 *     to storage, so a 60 MB plan set never passes through a Vercel function.
 *     POST /api/files/[id]/done confirms it arrived.
 *   A receipt or vendor quote may be sent with none of these (migration 051):
 *   it waits unfiled ("inbox") while Dusty reads who it is from, and is filed
 *   on that vendor by PATCH /api/files/[id] { contact_id } once Coy confirms.
 * GET   ?job_id= | ?contact_id= | ?inbox=1 (unfiled receipts and quotes)
 *   → { files, texted } — uploads with short-lived signed links, and the
 *     photos that person texted (message_media), which the thread's media
 *     route copies in lazily when they have not been opened yet.
 *
 * Session client only; the org comes from the session and every id the
 * browser names is checked against it (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_SECONDS = 60 * 30;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const jobId = req.nextUrl.searchParams.get("job_id");
  const contactId = req.nextUrl.searchParams.get("contact_id");
  if (req.nextUrl.searchParams.get("inbox") === "1") {
    const { data: rows, error } = await supabase.from("job_files").select(FILE_COLUMNS).eq("org_id", orgId).is("deleted_at", null)
      .is("job_id", null).is("contact_id", null).in("category", ["receipt", "vendor_quote"])
      .order("created_at", { ascending: false }).limit(50);
    if (error) return applyCookies(NextResponse.json({ error: `job_files: ${error.message}` }, { status: 500 }));
    return applyCookies(NextResponse.json({ files: await signFiles(supabase, (rows ?? []) as Array<Record<string, unknown>>), texted: [] }));
  }
  if ((!jobId || !UUID.test(jobId)) && (!contactId || !UUID.test(contactId))) {
    return applyCookies(NextResponse.json({ error: "Name a job_id or a contact_id." }, { status: 400 }));
  }

  // Whose texts count: the person, or the job's customer.
  let people: string[] = [];
  let q = supabase.from("job_files").select(FILE_COLUMNS).eq("org_id", orgId).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(300);
  if (jobId) {
    const { data: job } = await supabase.from("jobs").select("id, contact_id").eq("org_id", orgId).eq("id", jobId).maybeSingle();
    if (!job) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
    q = q.eq("job_id", jobId);
    if (job.contact_id) people = [job.contact_id as string];
  } else {
    q = q.eq("contact_id", contactId as string);
    people = [contactId as string];
  }
  const { data: rows, error } = await q;
  if (error) return applyCookies(NextResponse.json({ error: `job_files: ${error.message}` }, { status: 500 }));
  const files = await signFiles(supabase, (rows ?? []) as Array<Record<string, unknown>>);

  // Photos they texted. Only what has been copied can be signed here; the
  // rest name their message so the panel can open it through the media route.
  let texted: Array<Record<string, unknown>> = [];
  if (people.length) {
    const { data: msgs } = await supabase.from("messages")
      .select("id, occurred_at, message_media!inner(id, kind, mime_type, storage_path)")
      .eq("org_id", orgId).in("contact_id", people).order("occurred_at", { ascending: false }).limit(60);
    type M = { id: string; kind: string | null; mime_type: string | null; storage_path: string | null };
    const list = ((msgs ?? []) as unknown as Array<{ id: string; occurred_at: string | null; message_media: M[] }>)
      .flatMap((m) => m.message_media.map((x) => ({ ...x, message_id: m.id, received_at: m.occurred_at })));
    const paths = list.filter((m) => m.storage_path).map((m) => m.storage_path as string);
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data } = await supabase.storage.from("message-media").createSignedUrls(paths, SIGN_SECONDS);
      for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
    }
    texted = list.map((m) => ({ id: m.id, message_id: m.message_id, kind: m.kind, mime_type: m.mime_type,
      received_at: m.received_at, url: m.storage_path ? signed.get(m.storage_path) ?? null : null }));
  }
  return applyCookies(NextResponse.json({ files, texted }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));

  let b: { name?: unknown; mime?: unknown; size?: unknown; job_id?: unknown; section_id?: unknown; contact_id?: unknown; category?: unknown; in_plan_room?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 200) : "";
  const mime = typeof b.mime === "string" ? b.mime.slice(0, 120) : "";
  const size = typeof b.size === "number" && Number.isFinite(b.size) ? Math.round(b.size) : NaN;
  if (!name) return bad("A file needs a name.");
  if (!(size > 0)) return bad("Empty file.");
  if (size > MAX_FILE_BYTES) return bad("That file is over 100 MB.");
  const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
  let jobId = id(b.job_id);
  const sectionId = id(b.section_id);
  let contactId = id(b.contact_id);
  const unfiled = !jobId && !contactId && !sectionId;
  if (unfiled && b.category !== "receipt" && b.category !== "vendor_quote") return bad("Say what the file belongs to: a job, an area or a person.");

  // Everything named must be this org's.
  if (sectionId) {
    const { data: s } = await supabase.from("job_sections").select("id, job_id").eq("org_id", orgId).eq("id", sectionId).maybeSingle();
    if (!s) return bad("No such area.", 404);
    if (jobId && jobId !== s.job_id) return bad("That area is on another job.");
    jobId = s.job_id as string;
  }
  if (jobId) {
    const { data: j } = await supabase.from("jobs").select("id, contact_id").eq("org_id", orgId).eq("id", jobId).maybeSingle();
    if (!j) return bad("No such job.", 404);
    if (!contactId && j.contact_id) contactId = j.contact_id as string;
  }
  if (contactId) {
    const { data: c } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", contactId).maybeSingle();
    if (!c) return bad("No such person.", 404);
  }

  const kind = kindOf(mime, name);
  const fileId = crypto.randomUUID();
  const path = storagePath(orgId, jobId ?? contactId ?? sectionId ?? "inbox", fileId, name);
  const { data: row, error } = await supabase.from("job_files").insert({
    id: fileId, org_id: orgId, job_id: jobId, section_id: sectionId, contact_id: contactId, name, kind,
    // The Price book's vendor-quote import says what it is; otherwise a first guess from the name.
    category: (CATEGORIES as readonly string[]).includes(String(b.category)) ? b.category : categoryGuess(kind, name), mime_type: mime || null, byte_size: size, storage_path: path,
    source: "upload", fetch_state: "pending", created_by: userId,
    // Dropped into the Plan Room (059): it is a plan from the start.
    ...(b.in_plan_room === true && jobId ? { in_plan_room: true } : {}),
  }).select(FILE_COLUMNS).single();
  if (error || !row) return bad(`Couldn't record the file: ${error?.message ?? "no row"}`, 500);

  const { data: up, error: upErr } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
  if (upErr || !up) {
    await supabase.from("job_files").delete().eq("id", fileId).eq("org_id", orgId);
    return bad(`Couldn't open an upload: ${upErr?.message ?? "no url"}`, 500);
  }
  return applyCookies(NextResponse.json({ file: { ...row, url: null }, upload: { path: up.path, token: up.token, signed_url: up.signedUrl } }, { status: 201 }));
}
