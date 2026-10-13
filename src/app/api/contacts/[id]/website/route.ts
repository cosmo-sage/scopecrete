import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanWebsite } from "@/lib/vendor-website";
import { writeWebsite } from "@/lib/vendor-website-server";

/**
 * A person's website, from their contact card (Coy, 2026-10-12: "Where is the
 * website field?"). PATCH `{website}` — blank clears it. Saved on
 * `contacts.website` (migration 105); before 105, kept as a "Website: …" note
 * on them, which the card reads back. Session client, org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!UUID.test(id)) return bad("No such person.", 404);
  const b = (await req.json().catch(() => ({}))) as { website?: unknown };
  const typed = typeof b.website === "string" ? b.website.trim() : "";
  const url = cleanWebsite(typed);
  if (typed && !url) return bad("That doesn't look like a web address.");
  const { data: who } = await supabase.from("contacts").select("id, merged_into_contact_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!who || who.merged_into_contact_id) return bad("No such person.", 404);
  const r = await writeWebsite(supabase, orgId, userId, id, url);
  if (!r.ok) return bad(r.error ?? "Couldn't save the website.", 500);
  return applyCookies(NextResponse.json({ ok: true, website: url, noted: !!r.noted }));
}
