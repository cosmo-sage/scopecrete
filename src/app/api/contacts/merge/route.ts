import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Merge two contacts that are the same person — one human confirmation, one
 * pair at a time.
 *
 * Threads are keyed per phone number, so a person with two numbers reads as two
 * strangers (Amber: five calls on one number, her texts and photos on
 * another). This calls sc_merge_contacts() (migration 028), which moves
 * everything the second contact owns onto the first in one transaction and
 * records each moved row so the merge can be undone exactly.
 *
 * The system never merges on its own. Two contacts sharing a name is a
 * suggestion at most; the merge happens when Coy says so.
 *
 * Session-scoped. The function checks org membership itself (it has to run
 * with elevated rights — voip_calls and sms_threads have no user write policy,
 * so a merge under row security would leave calls behind), and a contact from
 * another org comes back as "not found", the same as one that does not exist.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres error codes raised by sc_merge_contacts, mapped to HTTP. */
function statusFor(code: string | undefined): number {
  if (code === "P0002") return 404;       // not found / not yours
  if (code === "22023") return 409;       // same contact, or already merged
  if (code === "42501") return 401;       // not signed in
  return 500;
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;

  let body: { winner_id?: string; loser_id?: string };
  try { body = await req.json(); }
  catch { return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 })); }

  const winner = body.winner_id?.trim();
  const loser = body.loser_id?.trim();
  if (!winner || !loser || !UUID.test(winner) || !UUID.test(loser)) {
    return applyCookies(NextResponse.json(
      { error: "Send winner_id (the contact to keep) and loser_id (the one merged into it)." },
      { status: 400 },
    ));
  }

  const { data, error } = await supabase.rpc("sc_merge_contacts", { p_winner: winner, p_loser: loser });
  if (error) {
    return applyCookies(NextResponse.json({ error: error.message, code: error.code }, { status: statusFor(error.code) }));
  }

  return applyCookies(NextResponse.json({ ok: true, merge_id: data as string, contact_id: winner }));
}
