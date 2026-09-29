import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Coy's notes on a person (migration 041) — the composer's Note tab.
 *
 * POST { body } → { note }
 *
 * Coy, 2026-09-28: "Where do notes land? Dusty needs access to all customer
 * and vendor notes." They land here; the person's timeline shows them,
 * /api/dusty puts them in Dusty's context, and the background reader reads
 * them with the conversation. Session client, org from the session (§7).
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  const b = (await req.json().catch(() => ({}))) as { body?: unknown };
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body || body.length > 4000) {
    return applyCookies(NextResponse.json({ error: "A note needs some words (up to 4,000 characters)." }, { status: 400 }));
  }

  const { data: c } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", contactId).maybeSingle();
  if (!c) return applyCookies(NextResponse.json({ error: "Contact not found." }, { status: 404 }));

  const { data: note, error } = await supabase.from("contact_notes")
    .insert({ org_id: orgId, contact_id: contactId, body, created_by: userId })
    .select("id, body, created_at").single();
  if (error) return applyCookies(NextResponse.json({ error: `contact_notes: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ note }, { status: 201 }));
}
