import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { callIdOf } from "@/lib/lines";

/**
 * One provider event, for the drawer in Logs: the payload exactly as it
 * arrived, the processing trace (received → filed, or the error and any
 * defect noted), and the contact and message it became.
 * Session client; quo_events, projection_defects and messages are org-scoped.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!UUID.test(id)) return applyCookies(NextResponse.json({ error: "No such event." }, { status: 404 }));
  const { data: ev } = await supabase.from("quo_events")
    .select("id, event_type, event_id, provider, direction, from_phone, to_phone, received_at, created_at, projected_at, projection_error, contact_id, raw_payload")
    .eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!ev) return applyCookies(NextResponse.json({ error: "No such event." }, { status: 404 }));
  const payload = (ev.raw_payload ?? {}) as Record<string, unknown>;
  const key = callIdOf(ev.event_type, payload) ?? (typeof payload.id === "string" ? payload.id : null);
  const [defects, msg, contact] = await Promise.all([
    supabase.from("projection_defects").select("defect, detail, created_at, resolved_at").eq("org_id", orgId).eq("raw_event_id", id).order("created_at"),
    key ? supabase.from("messages").select("id, contact_id, channel, occurred_at").eq("org_id", orgId).eq("provider_message_id", key).maybeSingle() : Promise.resolve({ data: null }),
    ev.contact_id ? supabase.from("contacts").select("id, name, phone").eq("org_id", orgId).eq("id", ev.contact_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return applyCookies(NextResponse.json({
    event: { ...ev, raw_payload: undefined },
    payload,
    defects: defects.data ?? [],
    message: msg.data ?? null,
    contact: contact.data ?? null,
  }));
}
