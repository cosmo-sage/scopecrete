import type { ApiSession } from "@/lib/api-auth";
import { fetchFromProvider } from "@/lib/quo";

type Sb = ApiSession["supabase"];

/**
 * A texted file's private copy (migration 027): message_media rows are copied
 * from Quo into the `message-media` bucket the first time anyone needs them.
 * Shared by the thread's media route and the "bring texted photos onto the
 * job" route. Session client: storage and message_media policies scope it to
 * the caller's org.
 */
export const MEDIA_BUCKET = "message-media";

export const MEDIA_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "image/heic": "heic", "video/3gpp": "3gp", "video/mp4": "mp4",
  "application/pdf": "pdf", "text/vcard": "vcf", "text/x-vcard": "vcf",
};

export interface MediaRow { id: string; url: string | null; storage_path: string | null; mime_type: string | null; kind: string | null }

/** The stored path of one texted file, copying it in from Quo when it isn't stored yet. */
export async function captureMedia(sb: Sb, orgId: string, messageId: string, row: MediaRow): Promise<{ path: string; mime: string | null } | { error: string }> {
  if (row.storage_path) return { path: row.storage_path, mime: row.mime_type };
  if (!row.url) return { error: "no source link on record" };
  const got = await fetchFromProvider(orgId, row.url);
  if ("error" in got) return { error: got.error };

  const mime = row.mime_type ?? got.type ?? "application/octet-stream";
  // {org}/{message}/{media id}.{ext} — the org segment is what the storage
  // policy checks; the media id makes the path unique per file.
  const path = `${orgId}/${messageId}/${row.id}.${MEDIA_EXT[mime] ?? "bin"}`;
  const { error: upErr } = await sb.storage.from(MEDIA_BUCKET).upload(path, got.bytes, { contentType: mime, upsert: false });
  // Two people opening the same thread at once both try to store it. The
  // second upload finds the object already there, which is success.
  if (upErr && !/exists|duplicate/i.test(upErr.message)) return { error: `store failed: ${upErr.message}` };

  const { error: stampErr } = await sb.from("message_media")
    .update({ storage_path: path, byte_size: got.bytes.byteLength, mime_type: mime })
    .eq("id", row.id).eq("org_id", orgId);
  // Stored but not recorded: still usable now, just re-captured next time.
  if (stampErr) console.error(`[media] stored ${path} but could not stamp: ${stampErr.message}`);
  return { path, mime };
}
