import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Artifacts for ONE message. Called on expand, never from the list.
 *
 * Transcripts reach ~10,600 characters. This endpoint exists so that cost is
 * paid once, deliberately, for the row a person actually opened.
 *
 * call_artifacts is authoritative; messages.summary is a display cache. Where
 * the two disagree the artifact wins, so an opened row shows the artifact's
 * summary rather than the cached one.
 *
 * The table is keyed (message_id, kind, source), which is why `source` is
 * returned: a Whisper transcript and a Quo transcript can coexist for the same
 * call, and the UI should be able to say which one it is showing.
 */

export const dynamic = "force-dynamic";

export interface Artifact {
  kind: string;
  source: string | null;
  content: string | null;
  /**
   * Set once the audio has been copied into Supabase Storage. `url` is a Quo
   * resource endpoint that a browser cannot fetch — no API key, cross-origin —
   * so `url` alone is NOT playable. Only storage_path means playback works.
   */
  storage_path: string | null;
  url: string | null;
  fetched_at: string | null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await ctx.params;

  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data, error } = await supabase
    .from("call_artifacts")
    .select("kind, source, content, storage_path, url, fetched_at")
    .eq("org_id", orgId)
    .eq("message_id", messageId)
    .order("kind", { ascending: true });

  if (error) {
    return applyCookies(NextResponse.json({ error: `call_artifacts: ${error.message}` }, { status: 500 }));
  }

  const artifacts = (data ?? []) as Artifact[];

  // Pulled out by kind so the UI does not have to filter. next_steps is the
  // closest thing the system has to "what did this person actually want", so it
  // is surfaced separately rather than buried in a list.
  const byKind = (k: string) => artifacts.find((a) => a.kind === k) ?? null;

  return applyCookies(NextResponse.json({
    message_id: messageId,
    artifacts,
    transcript: byKind("transcript"),
    summary: byKind("summary"),
    next_steps: byKind("next_steps"),
    recording: byKind("recording"),
    // A voicemail is what the caller actually SAID — one person talking to a
    // machine — as opposed to `summary`, which is Quo's paraphrase of a
    // two-party conversation. Different things, so it gets its own field rather
    // than being folded into transcript. It was already present in `artifacts`
    // below, but the UI reads the named fields, so without this line voicemail
    // content arrived and was never rendered.
    voicemail: byKind("voicemail"),
  }));
}
