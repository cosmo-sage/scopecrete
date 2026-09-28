import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Coy names a contact himself — the pencil next to the name.
 *
 * PATCH { name: string }
 *
 * Until this there was no way to correct a name. "Gary Davis" on Vance's
 * number came from the old enricher reading a contact card Vance texted
 * ("Gary Davis 19852855905") — someone else's name lifted from a message, the
 * same failure as Brad Chaney (DECISIONS §2). Coy's answer is load bearing:
 * name_source='human' with who and when, the shape
 * CHECK contacts_name_confirmed_is_human requires, and sc_guard_contact_identity
 * then stops any machine from writing over it.
 *
 * Session client, org from the session (§7).
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));

  let body: { name?: unknown };
  try { body = await req.json(); } catch { return fail("Body must be JSON."); }
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (!name) return fail("Type a name.");
  if (name.length > 80) return fail("Keep the name under 80 characters.");

  const { error, count } = await supabase
    .from("contacts")
    .update({
      name,
      name_source: "human",
      name_confirmed_at: new Date().toISOString(),
      name_confirmed_by: userId,
      name_claim_id: null,
    }, { count: "exact" })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) return fail(`contacts: ${error.message}`, 500);
  if (!count) return fail("Contact not found.", 404);

  return applyCookies(NextResponse.json({ ok: true, name }));
}
