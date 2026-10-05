import type { ApiSession } from "@/lib/api-auth";
import { callForNote, windowFromPayload, type CallWindow } from "@/lib/call-notes";

type Sb = ApiSession["supabase"];

/**
 * Attaches the person's loose notes from the last three days to the call each
 * was written during (src/lib/call-notes.ts), now that the finished calls have
 * arrived. Idempotent — only notes with no call yet are touched — and run by
 * the reads that show them (the notes pad, the person and customer timelines),
 * under the session. A call's window is read from Quo's own call.completed
 * event (raw log, §2a); a call without one gets no notes.
 */
export async function settleCallNotes(sb: Sb, orgId: string, contactIds: string[]): Promise<number> {
  if (!contactIds.length) return 0;
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data: loose } = await sb.from("contact_notes").select("id, created_at")
    .eq("org_id", orgId).in("contact_id", contactIds).is("message_id", null).gte("created_at", since).limit(50);
  const notes = (loose ?? []) as Array<{ id: string; created_at: string }>;
  if (!notes.length) return 0;

  const first = Math.min(...notes.map((n) => Date.parse(n.created_at)));
  const { data: rows } = await sb.from("messages").select("id, provider_message_id, occurred_at")
    .eq("org_id", orgId).in("contact_id", contactIds).eq("channel", "call")
    .gte("occurred_at", new Date(first - 3 * 3600_000).toISOString()).limit(60);
  const msgs = ((rows ?? []) as Array<{ id: string; provider_message_id: string | null; occurred_at: string }>).filter((m) => m.provider_message_id);
  if (!msgs.length) return 0;

  const { data: evs } = await sb.from("quo_events").select("raw_payload")
    .eq("org_id", orgId).eq("event_type", "call.completed").in("raw_payload->>id", msgs.map((m) => m.provider_message_id as string));
  const win = new Map<string, { start: string; end: string }>();
  for (const e of (evs ?? []) as Array<{ raw_payload: Record<string, unknown> | null }>) {
    const id = typeof e.raw_payload?.id === "string" ? e.raw_payload.id : null;
    const w = windowFromPayload(e.raw_payload);
    if (id && w) win.set(id, w);
  }
  const calls: CallWindow[] = msgs.flatMap((m) => { const w = win.get(m.provider_message_id as string); return w ? [{ id: m.id, ...w }] : []; });

  let n = 0;
  for (const note of notes) {
    const call = callForNote(note.created_at, calls);
    if (!call) continue;
    const { error } = await sb.from("contact_notes").update({ message_id: call }).eq("org_id", orgId).eq("id", note.id).is("message_id", null);
    if (!error) n++;
  }
  return n;
}
