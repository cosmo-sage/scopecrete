import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * One timeline for a customer: every call and text from all of its contacts,
 * oldest first (the page opens at the bottom). Calls carry which artifacts
 * exist (summary / next steps are small and come inline; the transcript is
 * fetched on expand from /api/messages/[id]/artifacts) and Coy's notes on that
 * call. Email is not connected yet — there is none to return, and the page
 * says so rather than showing an empty filter as if email had been checked.
 *
 * GET ?limit= (default 400, newest kept) → { items, contacts: {id,name}[] }
 * Session client; org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TimelineItem {
  id: string; contact_id: string; channel: "call" | "text"; direction: "in" | "out"; at: string;
  body: string | null; duration_s: number | null; status: string | null; media_count: number;
  summary: string | null; next_steps: string | null; has_transcript: boolean; has_recording: boolean; has_voicemail: boolean;
  notes: Array<{ id: string; body: string; created_at: string }>;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await ctx.params;
  if (!UUID.test(customerId)) return NextResponse.json({ error: "Not a customer id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 400, 20), 1500);

  const { data: cs, error: cErr } = await sb.from("contacts").select("id, name, phone")
    .eq("org_id", orgId).eq("customer_id", customerId).is("merged_into_contact_id", null);
  if (cErr) return applyCookies(NextResponse.json({ error: cErr.message }, { status: 500 }));
  const contacts = (cs ?? []) as Array<{ id: string; name: string | null; phone: string | null }>;
  if (!contacts.length) return applyCookies(NextResponse.json({ items: [], contacts: [] }));
  const ids = contacts.map((c) => c.id);

  const { data: rows, error } = await sb.from("messages")
    .select("id, contact_id, channel, direction, occurred_at, body_text, summary, duration_seconds, status")
    .eq("org_id", orgId).in("contact_id", ids).order("occurred_at", { ascending: false }).limit(limit);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  type M = { id: string; contact_id: string; channel: string | null; direction: string | null; occurred_at: string | null; body_text: string | null; summary: string | null; duration_seconds: number | null; status: string | null };
  const msgs = ((rows ?? []) as M[]).filter((m) => m.occurred_at && (m.channel === "call" || m.channel === "sms" || m.channel === "text" || m.channel === "mms"));
  const callIds = msgs.filter((m) => m.channel === "call").map((m) => m.id);
  const allIds = msgs.map((m) => m.id);

  const [arts, notes, media] = await Promise.all([
    callIds.length ? sb.from("call_artifacts").select("message_id, kind, content").eq("org_id", orgId).in("message_id", callIds)
      .in("kind", ["summary", "next_steps", "transcript", "recording", "voicemail"]) : Promise.resolve({ data: [], error: null }),
    callIds.length ? sb.from("contact_notes").select("id, body, created_at, message_id").eq("org_id", orgId).in("message_id", callIds).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    allIds.length ? sb.from("message_media").select("message_id").eq("org_id", orgId).in("message_id", allIds) : Promise.resolve({ data: [], error: null }),
  ]);
  // Transcripts are long: only whether one exists crosses the wire here.
  const art = new Map<string, Record<string, string | null>>();
  for (const a of (arts.data ?? []) as Array<{ message_id: string; kind: string; content: string | null }>) {
    const o = art.get(a.message_id) ?? {};
    o[a.kind] = a.kind === "transcript" || a.kind === "recording" ? "1" : a.content;
    art.set(a.message_id, o);
  }
  const notesBy = new Map<string, Array<{ id: string; body: string; created_at: string }>>();
  for (const n of (notes.data ?? []) as Array<{ id: string; body: string; created_at: string; message_id: string }>) {
    notesBy.set(n.message_id, [...(notesBy.get(n.message_id) ?? []), { id: n.id, body: n.body, created_at: n.created_at }]);
  }
  const mediaBy = new Map<string, number>();
  for (const x of (media.data ?? []) as Array<{ message_id: string }>) mediaBy.set(x.message_id, (mediaBy.get(x.message_id) ?? 0) + 1);

  const items: TimelineItem[] = msgs.reverse().map((m) => {
    const a = art.get(m.id) ?? {};
    return {
      id: m.id, contact_id: m.contact_id, channel: m.channel === "call" ? "call" : "text",
      direction: m.direction === "outbound" ? "out" : "in", at: m.occurred_at as string,
      body: m.body_text, duration_s: m.duration_seconds, status: m.status, media_count: mediaBy.get(m.id) ?? 0,
      summary: a.summary ?? m.summary ?? null, next_steps: a.next_steps ?? null,
      has_transcript: !!a.transcript, has_recording: !!a.recording, has_voicemail: !!a.voicemail,
      notes: notesBy.get(m.id) ?? [],
    };
  });
  return applyCookies(NextResponse.json({ items, contacts: contacts.map((c) => ({ id: c.id, name: c.name?.trim() || c.phone })) }));
}
