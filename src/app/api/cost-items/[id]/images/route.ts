import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILES_BUCKET, MAX_FILE_BYTES, kindOf, storagePath } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";

/**
 * Pictures on a Price book item (Coy, 2026-10-22: "add images to cost items
 * from the cost book"). No migration: each is a `files` row on no job or
 * person, marked `source_url = cost_item:<id>`, the bytes in job-files under
 * {org}/cost-item/… like any upload, confirmed by /api/files/[id]/done.
 *
 * GET   the item's pictures, signed
 * POST  { name, mime, size } → the row and a signed upload link
 */
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const costItemMarker = (id: string) => `cost_item:${id}`;

async function item(sb: Parameters<typeof signFiles>[0], orgId: string, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await sb.from("cost_items").select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
  return data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { id } = await params;
  if (!(await item(supabase, orgId, id))) return NextResponse.json({ error: "No such item." }, { status: 404 });
  const { data: rows } = await supabase.from("files").select(FILE_COLUMNS).eq("org_id", orgId).eq("source_url", costItemMarker(id))
    .is("deleted_at", null).order("created_at");
  return applyCookies(NextResponse.json({ images: await signFiles(supabase, (rows ?? []) as Array<Record<string, unknown>>) }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const { id } = await params;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await item(supabase, orgId, id))) return bad("No such item.", 404);
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; mime?: unknown; size?: unknown };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 200) : "";
  const mime = typeof b.mime === "string" ? b.mime.slice(0, 120) : "";
  const size = typeof b.size === "number" && Number.isFinite(b.size) ? Math.round(b.size) : NaN;
  if (!name) return bad("The picture needs a name.");
  if (kindOf(mime, name) !== "image") return bad("Only pictures go on an item.");
  if (!(size > 0 && size <= MAX_FILE_BYTES)) return bad("That picture is too big.");
  const fileId = crypto.randomUUID();
  const path = storagePath(orgId, "cost-item", fileId, name);
  const { data: row, error } = await supabase.from("files").insert({
    id: fileId, org_id: orgId, name, kind: "image", category: "photo", mime_type: mime || null, byte_size: size, storage_path: path,
    source: "upload", source_url: costItemMarker(id), fetch_state: "pending", created_by: userId,
  }).select(FILE_COLUMNS).single();
  if (error || !row) return bad(`Couldn't record the picture: ${error?.message ?? "no row"}`, 500);
  const { data: up, error: upErr } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
  if (upErr || !up) {
    await supabase.from("files").delete().eq("id", fileId).eq("org_id", orgId);
    return bad(`Couldn't open an upload: ${upErr?.message ?? "no url"}`, 500);
  }
  return applyCookies(NextResponse.json({ file: { ...row, url: null }, upload: { signed_url: up.signedUrl } }, { status: 201 }));
}
