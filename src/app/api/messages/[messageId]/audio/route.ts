import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { fetchFromProvider, freshAudioUrl } from "@/lib/quo";

/**
 * A short-lived signed URL for one call's audio — a recording or a voicemail.
 *
 * GET ?kind=recording|voicemail → { url, expires_in } or { url: null, reason }
 *
 * `call_artifacts.url` is a Quo link (share.quo.com/…). A browser can't play
 * it — cross-origin, and it may expire — which is why the old players sat at
 * 0:00. So the audio is COPIED ON FIRST PLAY (Coy, 2026-09-28: "get the audio
 * recording of phone calls from quo into the customer/vendor pages"):
 *
 *   1. a stored copy (storage_path) is signed and returned;
 *   2. otherwise a fresh link is asked of the Quo API (QUO_API_KEY, server
 *      side), falling back to the link on record;
 *   3. the file is copied into the private call-audio bucket at
 *      {org_id}/{message_id}-{kind}.{ext}, storage_path is stamped, and the
 *      copy is signed.
 *
 * Nothing runs until Coy taps play, so there is no batch job and no key in a
 * browser. Session-scoped (DECISIONS §7): the artifact and the message are read
 * through the caller's org under RLS, and the storage insert policy
 * (migration 041) only admits paths under the caller's own org folder.
 */

export const dynamic = "force-dynamic";
// Downloading a long call can take a while.
export const maxDuration = 60;

const BUCKET = "call-audio";
const EXPIRES_SECONDS = 60 * 10;
const KINDS = ["recording", "voicemail"] as const;
const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg" };

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await ctx.params;
  const k = new URL(req.url).searchParams.get("kind") ?? "recording";
  if (!(KINDS as readonly string[]).includes(k)) {
    return NextResponse.json({ error: `kind must be ${KINDS.join(" or ")}` }, { status: 400 });
  }
  const kind = k as (typeof KINDS)[number];

  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const none = (reason: string, status = 404) => applyCookies(NextResponse.json({ url: null, reason }, { status }));

  const { data: rows, error } = await supabase
    .from("call_artifacts")
    .select("id, storage_path, url")
    .eq("org_id", orgId)
    .eq("message_id", messageId)
    .eq("kind", kind)
    .order("storage_path", { ascending: true, nullsFirst: false })
    .limit(1);
  if (error) return none(`call_artifacts: ${error.message}`, 500);
  const artifact = ((rows ?? []) as Array<{ id: string; storage_path: string | null; url: string | null }>)[0];

  let path = artifact?.storage_path ?? null;
  if (!path) {
    // No stored copy yet: get the file from Quo.
    const { data: msg } = await supabase.from("messages").select("provider_message_id, channel")
      .eq("org_id", orgId).eq("id", messageId).maybeSingle();
    if (!msg) return none("call not found");
    if (!artifact && msg.channel !== "call") return none(`no ${kind} for this message`);

    const fresh = await freshAudioUrl((msg.provider_message_id as string | null) ?? "", kind);
    const sources = [fresh, artifact?.url ?? null].filter((u): u is string => !!u);
    if (!sources.length) return none(`Quo has no ${kind} for this call`);

    let got: Awaited<ReturnType<typeof fetchFromProvider>> = { error: "not tried" };
    for (const src of sources) {
      got = await fetchFromProvider(src);
      if (!("error" in got)) break;
    }
    if ("error" in got) return none(`Recording unavailable — ${got.error}`, 502);

    const mime = (got.type ?? "audio/mpeg").split(";")[0].trim();
    if (!mime.startsWith("audio/") && mime !== "application/octet-stream") {
      return none(`Quo sent ${mime}, not audio`, 502);
    }
    const candidate = `${orgId}/${messageId}-${kind}.${EXT[mime] ?? "mp3"}`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(candidate, got.bytes, { contentType: mime.startsWith("audio/") ? mime : "audio/mpeg", upsert: false });
    // Two taps at once both try to store it; "already exists" is success.
    if (upErr && !/exists|duplicate/i.test(upErr.message)) return none(`store failed: ${upErr.message}`, 500);

    if (artifact) {
      const { error: stampErr } = await supabase.from("call_artifacts")
        .update({ storage_path: candidate, fetched_at: new Date().toISOString() })
        .eq("org_id", orgId).eq("id", artifact.id);
      // Stored but not recorded: still playable now, re-copied (as a no-op) next time.
      if (stampErr) console.error(`[audio] stored ${candidate} but could not stamp: ${stampErr.message}`);
    }
    path = candidate;
  }

  const { data: signed, error: signErr } = await supabase
    .storage.from(BUCKET)
    .createSignedUrl(path, EXPIRES_SECONDS);
  if (signErr || !signed?.signedUrl) return none(`sign: ${signErr?.message ?? "no url returned"}`, 500);

  return applyCookies(NextResponse.json({ url: signed.signedUrl, expires_in: EXPIRES_SECONDS }));
}
