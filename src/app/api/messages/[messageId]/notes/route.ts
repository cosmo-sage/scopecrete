import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Notes on one call (migration 055: contact_notes.message_id). The note is
 * also the person's note, so Dusty and their timeline see it as before.
 * POST { body } → { note }. Session client; org from the session; the message
 * must be the org's.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await ctx.params;
  if (!UUID.test(messageId)) return NextResponse.json({ error: "Not a message id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, userId, applyCookies } = result.session;
  const b = await req.json().catch(() => ({})) as { body?: unknown };
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 4000) : "";
  if (!body) return applyCookies(NextResponse.json({ error: "Write the note first." }, { status: 400 }));
  const { data: m } = await sb.from("messages").select("id, contact_id, job_id").eq("org_id", orgId).eq("id", messageId).maybeSingle();
  if (!m?.contact_id) return applyCookies(NextResponse.json({ error: "Call not found." }, { status: 404 }));
  const { data, error } = await sb.from("contact_notes")
    .insert({ org_id: orgId, contact_id: m.contact_id, job_id: m.job_id ?? null, message_id: messageId, body, created_by: userId })
    .select("id, body, created_at, message_id").single();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ note: data }));
}
