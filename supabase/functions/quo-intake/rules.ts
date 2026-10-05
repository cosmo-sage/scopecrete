// Pure helpers for quo-intake, kept apart from index.ts so `npm test` can load
// them under Node (index.ts imports from deno.land / esm.sh).

type Obj = Record<string, unknown>

const FOLLOW_UPS = new Set([
  'call.recording.completed',
  'call.transcript.completed',
  'call.summary.completed',
])

/**
 * The quo_events.event_id a webhook is stored under. Must match what the
 * handlers use, so a rescue write and a normal write of the same event collide
 * on the (org_id, event_id) unique index instead of storing it twice.
 *
 * call.completed / message.* key on the object id (voip_calls.quo_call_id and
 * sms_threads.quo_message_id join on it). The call follow-ups key on the
 * webhook ENVELOPE id, because three of them arrive about one call and would
 * otherwise collide with the call.completed row (see v7 in index.ts).
 */
export function eventIdFor(eventType: string, payload: Obj, data: Obj): string | null {
  if (FOLLOW_UPS.has(eventType)) {
    const callId = (data.callId as string) ?? (data.id as string) ?? null
    return (payload.id as string) ?? (callId ? `${callId}:${eventType}` : null)
  }
  return (data.id as string) ?? (payload.id as string) ?? null
}

/**
 * Best-effort direction for an event saved by the rescue path, where the
 * handler did not get far enough to work it out. Null when unknown; the
 * projection decides direction from line ownership anyway.
 */
export function rescueDirection(
  eventType: string,
  data: Obj,
  fromPhone: string | null,
  ourPhone: string,
): 'inbound' | 'outbound' | null {
  if (eventType === 'message.delivered') return 'outbound'
  if (eventType === 'message.received') return fromPhone === ourPhone ? 'outbound' : 'inbound'
  if (eventType === 'call.completed') {
    const d = data.direction
    return d === 'incoming' || d === 'inbound' ? 'inbound' : 'outbound'
  }
  return null
}
