import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Spine drift — the alarm that did not exist on 21 August.
 *
 * On 2026-08-21 at 03:14 UTC SMS projection stopped in application code and
 * never ran again. 48 texts landed in the database and never reached the app,
 * and nothing was watching for a week. sc_spine_drift is the query that would
 * have caught it on day one.
 *
 * Zero means everything that arrived reached the app. Non-zero means something
 * landed and did not.
 *
 * IMPORTANT: a failure here must NOT report zero. An alarm that cannot read its
 * own source and says "fine" is worse than no alarm — it is the 21 August
 * failure with a green light on top. On error this returns count: null and an
 * `error` field, and the UI must render that as unknown, not as clear.
 *
 * sc_spine_drift is a view with no RLS of its own over tables that do have it,
 * so it filters to the caller's org through the session client.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;

  const { count, error } = await supabase
    .from("sc_spine_drift")
    .select("*", { count: "exact", head: true });

  if (error) {
    return applyCookies(NextResponse.json(
      { count: null, error: `sc_spine_drift: ${error.message}` },
      { status: 500 },
    ));
  }

  return applyCookies(NextResponse.json({ count: count ?? 0 }));
}
