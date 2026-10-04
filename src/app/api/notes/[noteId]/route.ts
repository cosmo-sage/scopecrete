import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { settleCallNotes } from "@/lib/call-notes-server";

/**
 * One of Coy's notes — the call notes pad (src/components/v34/call-notes-pad.tsx).
 *
 * GET   → { note, call } — first attaches the person's loose notes to the calls
 *         they were written during (src/lib/call-notes-server.ts), so the pad can
 *         say "On the 3:54 pm call" once Quo has sent it.
 * PATCH { body } → { note } — the pad saves as Coy types.
 * Session client, org from the session (§7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, contact_id, body, created_at, message_id";

export async function GET(req: NextRequest, ctx: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await ctx.params;
  if (!UUID.test(noteId)) return NextResponse.json({ error: "Not a note id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const { data: n0 } = await sb.from("contact_notes").select(COLS).eq("org_id", orgId).eq("id", noteId).maybeSingle();
  if (!n0) return applyCookies(NextResponse.json({ error: "Note not found." }, { status: 404 }));
  if (!n0.message_id) await settleCallNotes(sb, orgId, [n0.contact_id as string]);
  const { data: note } = await sb.from("contact_notes").select(COLS).eq("org_id", orgId).eq("id", noteId).single();
  let call = null;
  if (note?.message_id) {
    const { data: m } = await sb.from("messages").select("id, occurred_at, summary, direction").eq("org_id", orgId).eq("id", note.message_id as string).maybeSingle();
    call = m ?? null;
  }
  return applyCookies(NextResponse.json({ note, call }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await ctx.params;
  if (!UUID.test(noteId)) return NextResponse.json({ error: "Not a note id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const b = (await req.json().catch(() => ({}))) as { body?: unknown };
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body || body.length > 4000) return applyCookies(NextResponse.json({ error: "A note needs some words (up to 4,000 characters)." }, { status: 400 }));
  const { data: note, error } = await sb.from("contact_notes").update({ body }).eq("org_id", orgId).eq("id", noteId).select(COLS).maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!note) return applyCookies(NextResponse.json({ error: "Note not found." }, { status: 404 }));
  return applyCookies(NextResponse.json({ note }));
}
