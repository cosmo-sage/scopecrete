import type { SupabaseClient } from "@supabase/supabase-js";
import { quoVoicemail } from "@/lib/quo";

/**
 * Voicemails on missed calls (Coy, 2026-10-11: Elena's 9-second voicemail was
 * in Quo but the thread said only "Missed call").
 *
 * Quo's call.completed carries the voicemail's audio link in
 * `raw_payload.voicemail` and nothing else; the projection never made a
 * call_artifacts row of it, and no webhook brings the transcript. So when a
 * thread is opened, each missed call whose raw event has a voicemail gets its
 * `voicemail` artifact (the link), and its words are asked of Quo's API
 * (/v1/call-voicemails/{callId}) until they come — a few calls per open, so a
 * long thread never waits on many lookups. Under the session: members may
 * write call_artifacts in their own org (policy call_artifacts_write).
 */

export interface VoicemailCall {
  messageId: string;
  callId: string;
  url: string | null;
  duration: number | null;
}

export interface VoicemailShown {
  text: string | null;
  duration: number | null;
}

const ASK_QUO_PER_OPEN = 4;

export async function fillVoicemails(supabase: SupabaseClient, orgId: string, calls: VoicemailCall[]): Promise<Map<string, VoicemailShown>> {
  const out = new Map<string, VoicemailShown>();
  if (!calls.length) return out;
  const { data: have } = await supabase.from("call_artifacts")
    .select("id, message_id, content")
    .eq("org_id", orgId).eq("kind", "voicemail")
    .in("message_id", calls.map((c) => c.messageId));
  const byMsg = new Map(((have ?? []) as Array<{ id: string; message_id: string; content: string | null }>).map((a) => [a.message_id, a]));

  // Newest first (the caller passes them that way): the ones Coy is looking at get asked first.
  let asked = 0;
  await Promise.all(calls.map(async (c) => {
    const row = byMsg.get(c.messageId);
    let text = row?.content?.trim() || null;
    if (!text && asked < ASK_QUO_PER_OPEN) {
      asked++;
      const vm = await quoVoicemail(orgId, c.callId);
      if (vm?.transcript) text = vm.transcript;
      const url = vm?.url ?? c.url;
      if (row) {
        if (text) await supabase.from("call_artifacts").update({ content: text, fetched_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", row.id);
      } else {
        await supabase.from("call_artifacts").upsert({
          org_id: orgId, message_id: c.messageId, kind: "voicemail", source: "quo",
          content: text, url, fetched_at: new Date().toISOString(),
        }, { onConflict: "message_id,kind,source" });
      }
    } else if (!row) {
      await supabase.from("call_artifacts").upsert({
        org_id: orgId, message_id: c.messageId, kind: "voicemail", source: "quo",
        content: null, url: c.url, fetched_at: new Date().toISOString(),
      }, { onConflict: "message_id,kind,source" });
    }
    out.set(c.messageId, { text, duration: c.duration });
  }));
  return out;
}
