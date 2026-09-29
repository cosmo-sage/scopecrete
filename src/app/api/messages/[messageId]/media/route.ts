import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { fetchFromProvider } from "@/lib/quo";

/**
 * The photos, videos, PDFs and contact cards on one text message — each as a
 * short-lived signed link to a private copy.
 *
 * Until migration 027 these were dropped at projection: the first URL landed
 * in messages.recording_url (a photo filed as a call recording) and the rest
 * vanished, so every picture a customer sent rendered as "(no text)". 027
 * writes one message_media row per file; this route serves them.
 *
 * CAPTURE IS LAZY. message_media.url is a share.quo.com link carrying a
 * `?sig=` signature, and Quo's audio links on the same host proved to be
 * useless to a browser. So the file is copied into the private message-media
 * bucket the first time anyone opens the thread, and signed from there. Doing
 * it on first view rather than in a batch needs no background job and no
 * invoke key — the thing that has kept the call-audio sweep from ever running.
 *
 * WHAT IS NOT KNOWN YET: whether the signature alone opens the file, or Quo
 * also wants its API key. The sandbox this was written in cannot reach
 * share.quo.com to find out. So capture tries the bare signed URL first and,
 * only if Quo refuses it AND a server-side QUO_API_KEY exists, once more with
 * the key. Whatever happens, a file that cannot be fetched comes back as
 * `state: "unavailable"` with the provider's status — never as a broken image,
 * and never as silence.
 *
 * Session-scoped (DECISIONS.md §7): message_media and storage.objects are both
 * under get_user_org_ids() policies, so a message id from another org signs
 * nothing and can store nothing. No service-role key on this path.
 */

export const dynamic = "force-dynamic";

const BUCKET = "message-media";
const EXPIRES_SECONDS = 60 * 30;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "image/heic": "heic", "video/3gpp": "3gp", "video/mp4": "mp4",
  "application/pdf": "pdf", "text/vcard": "vcf", "text/x-vcard": "vcf",
};

interface MediaRow {
  id: string;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  kind: string | null;
}

export interface MediaItem {
  id: string;
  kind: string;
  mime_type: string | null;
  /** "ready" carries a signed url. "unavailable" carries a reason instead. */
  state: "ready" | "unavailable";
  url: string | null;
  reason: string | null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data, error } = await supabase
    .from("message_media")
    .select("id, url, storage_path, mime_type, kind")
    .eq("org_id", orgId)
    .eq("message_id", messageId)
    .order("id");

  if (error) {
    return applyCookies(NextResponse.json({ error: `message_media: ${error.message}` }, { status: 500 }));
  }

  const items: MediaItem[] = [];

  for (const row of (data ?? []) as MediaRow[]) {
    const kind = row.kind ?? "other";
    let path = row.storage_path;

    if (!path) {
      if (!row.url) {
        items.push({ id: row.id, kind, mime_type: row.mime_type, state: "unavailable", url: null, reason: "no source link on record" });
        continue;
      }
      const got = await fetchFromProvider(row.url);
      if ("error" in got) {
        items.push({ id: row.id, kind, mime_type: row.mime_type, state: "unavailable", url: null, reason: got.error });
        continue;
      }

      const mime = row.mime_type ?? got.type ?? "application/octet-stream";
      // {org}/{message}/{media id}.{ext} — the org segment is what the storage
      // policy checks; the media id makes the path unique per file.
      const candidate = `${orgId}/${messageId}/${row.id}.${EXT[mime] ?? "bin"}`;
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(candidate, got.bytes, { contentType: mime, upsert: false });

      // Two people opening the same thread at once both try to store it. The
      // second upload finds the object already there, which is success, not
      // failure — so "already exists" falls through to stamping the path.
      if (upErr && !/exists|duplicate/i.test(upErr.message)) {
        items.push({ id: row.id, kind, mime_type: row.mime_type, state: "unavailable", url: null, reason: `store failed: ${upErr.message}` });
        continue;
      }

      const { error: stampErr } = await supabase
        .from("message_media")
        .update({ storage_path: candidate, byte_size: got.bytes.byteLength, mime_type: mime })
        .eq("id", row.id)
        .eq("org_id", orgId);
      if (stampErr) {
        // Stored but not recorded: still servable now, just re-captured next time.
        console.error(`[media] stored ${candidate} but could not stamp: ${stampErr.message}`);
      }
      path = candidate;
    }

    const { data: signed, error: signErr } = await supabase.storage.from(BUCKET)
      .createSignedUrl(path, EXPIRES_SECONDS);
    if (signErr || !signed?.signedUrl) {
      items.push({ id: row.id, kind, mime_type: row.mime_type, state: "unavailable", url: null, reason: `sign failed: ${signErr?.message ?? "no url"}` });
      continue;
    }
    items.push({ id: row.id, kind, mime_type: row.mime_type, state: "ready", url: signed.signedUrl, reason: null });
  }

  return applyCookies(NextResponse.json({ items, expires_in: EXPIRES_SECONDS }));
}
