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
  const { supabase, orgId, applyCookies } = result.session;

  // Two kinds of row (2026-09-28). `unprojected_raw_event` is the alarm: an
  // event landed and never became a message. `open_defect` is a note on a
  // message that DID land (e.g. Quo's direction disagreed with our lines) — a
  // thing to review on More → Logs, not an outage. `count` is the alarm only.
  // The view is not security_invoker (DECISIONS §9), so the org is filtered
  // here explicitly, from the session.
  const [{ count, error }, { count: review }] = await Promise.all([
    supabase.from("sc_spine_drift").select("*", { count: "exact", head: true })
      .eq("org_id", orgId).eq("issue", "unprojected_raw_event"),
    supabase.from("sc_spine_drift").select("*", { count: "exact", head: true })
      .eq("org_id", orgId).eq("issue", "open_defect"),
  ]);

  if (error) {
    return applyCookies(NextResponse.json(
      { count: null, error: `sc_spine_drift: ${error.message}` },
      { status: 500 },
    ));
  }

  // A null count is "the query returned nothing to count", not "all clear".
  // Reporting 0 there would render the green state from an absent answer, which
  // is the exact failure the drift alarm exists to prevent.
  return applyCookies(NextResponse.json({
    count: typeof count === "number" ? count : null,
    review: typeof review === "number" ? review : null,
    ...(typeof count === "number" ? {} : { error: "sc_spine_drift returned no count" }),
  }));
}
