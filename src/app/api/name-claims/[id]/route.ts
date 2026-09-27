import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Keep or undo a name the system applied on its own.
 *
 * PATCH { action: "keep" | "undo" }
 *
 * Names are applied automatically only when the person introduced themselves
 * (src/app/api/enrich/route.ts, DECISIONS §2b). Each one carries a
 * contact_name_claims row with the line they said it in, and this is the way
 * back out of it:
 *
 * - keep: the name becomes Coy's — name_source='human', confirmed by him.
 * - undo: the name comes off and the claim is marked rejected, so the same
 *   name is never applied to that contact again. The suggestion stays in the
 *   row as a question.
 *
 * Both act only while the contact still carries THIS claim's name. If Coy has
 * since typed a different name, there is nothing here to keep or undo.
 * Session client; RLS on contacts and contact_name_claims is the enforcement.
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const fail = (code: string, error: string, status = 400) => applyCookies(NextResponse.json({ code, error }, { status }));

  let action: unknown;
  try { action = ((await req.json()) as { action?: unknown }).action; } catch { /* handled below */ }
  if (action !== "keep" && action !== "undo") return fail("bad_action", 'Send {"action":"keep"} or {"action":"undo"}.');

  const { data: claim, error: rErr } = await supabase.from("contact_name_claims")
    .select("id, contact_id, claimed_name, status")
    .eq("org_id", orgId).eq("id", id).maybeSingle();
  if (rErr) return fail("read_failed", `contact_name_claims: ${rErr.message}`, 500);
  if (!claim || !claim.contact_id) return fail("not_found", "No such name.", 404);
  if (claim.status !== "accepted") return fail("already_decided", `This name is already ${claim.status}.`, 409);

  const now = new Date().toISOString();
  if (action === "keep") {
    const { data, error } = await supabase.from("contacts")
      .update({ name_source: "human", name_confirmed_at: now, name_confirmed_by: userId })
      .eq("org_id", orgId).eq("id", claim.contact_id as string)
      .eq("name_claim_id", id).eq("name_source", "machine")
      .select("id");
    if (error) return fail("write_failed", `contacts: ${error.message}`, 500);
    if (!data?.length) return fail("stale", "This contact's name has changed since — nothing to keep.", 409);
    await supabase.from("contact_name_claims").update({ decided_by: userId, decided_at: now }).eq("org_id", orgId).eq("id", id);
    return applyCookies(NextResponse.json({ ok: true, kept: claim.claimed_name }));
  }

  const { data, error } = await supabase.from("contacts")
    .update({ name: null, name_source: "legacy", name_claim_id: null })
    .eq("org_id", orgId).eq("id", claim.contact_id as string)
    .eq("name_claim_id", id).eq("name_source", "machine")
    .select("id");
  if (error) return fail("write_failed", `contacts: ${error.message}`, 500);
  if (!data?.length) return fail("stale", "This contact's name has changed since — nothing to undo.", 409);
  const { error: cErr } = await supabase.from("contact_name_claims")
    .update({ status: "rejected", decided_by: userId, decided_at: now }).eq("org_id", orgId).eq("id", id);
  if (cErr) return fail("claim_write_failed", `contact_name_claims: ${cErr.message}`, 500);
  return applyCookies(NextResponse.json({ ok: true, undone: claim.claimed_name }));
}
