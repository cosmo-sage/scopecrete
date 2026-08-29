import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * A short-lived signed URL for one call's stored audio.
 *
 * Why this exists: `call_artifacts.url` is a Quo resource endpoint
 * (share.quo.com/v1/resource/…). A browser hitting it directly has no API key
 * and is cross-origin, so it returns nothing — which is why both players on
 * Coy's screen read 0:00 / 0:00. The URL is only usable server-side, with the
 * Quo credential.
 *
 * `storage_path` is the fix: the backfill copies the audio into Supabase
 * Storage, and this route hands the browser a signed link to that copy. The
 * bucket stays private; the signature expires.
 *
 * Session-scoped, per DECISIONS.md §7 — the artifact is looked up through the
 * caller's own org under RLS before anything is signed, so a message id from
 * another org signs nothing.
 */

export const dynamic = "force-dynamic";

const BUCKET = "call-audio";
const EXPIRES_SECONDS = 60 * 10;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await ctx.params;
  const kind = new URL(req.url).searchParams.get("kind") ?? "voicemail";

  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data: artifact, error } = await supabase
    .from("call_artifacts")
    .select("storage_path")
    .eq("org_id", orgId)
    .eq("message_id", messageId)
    .eq("kind", kind)
    .not("storage_path", "is", null)
    .maybeSingle();

  if (error) {
    return applyCookies(NextResponse.json({ error: `call_artifacts: ${error.message}` }, { status: 500 }));
  }
  if (!artifact?.storage_path) {
    // Not an error: the audio simply has not been copied out of Quo yet. The UI
    // renders no player in this case rather than a dead one.
    return applyCookies(NextResponse.json(
      { url: null, reason: "no_stored_audio" },
      { status: 404 },
    ));
  }

  const { data: signed, error: signErr } = await supabase
    .storage.from(BUCKET)
    .createSignedUrl(artifact.storage_path, EXPIRES_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return applyCookies(NextResponse.json(
      { error: `sign: ${signErr?.message ?? "no url returned"}` },
      { status: 500 },
    ));
  }

  return applyCookies(NextResponse.json({ url: signed.signedUrl, expires_in: EXPIRES_SECONDS }));
}
