import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { MEDIA_BUCKET as BUCKET, captureMedia, type MediaRow } from "@/lib/message-media-server";

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

const EXPIRES_SECONDS = 60 * 30;

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
    const got = await captureMedia(supabase, orgId, messageId, row);
    if ("error" in got) {
      items.push({ id: row.id, kind, mime_type: row.mime_type, state: "unavailable", url: null, reason: got.error });
      continue;
    }
    const path = got.path;

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
