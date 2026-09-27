import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Counts behind the Threads filter chips, and the footer's "replies owed" badge.
 *
 * Its own route rather than a field on /api/threads because two callers need it:
 * the chip row on the Threads screen, and the tab badge in the dashboard shell,
 * which has no reason to pull 4,000 message rows.
 *
 * EVERY KEY HERE IS A QUERY THAT RAN. A chip is rendered only for a key this
 * route returns, so a filter cannot appear on screen without a real number
 * behind it. Two consequences worth stating, because both look like omissions:
 *
 *   `drafts` is ABSENT. v34 has a Drafts chip; there is no outbox table in the
 *   schema — not a table with no rows, no table at all — so the system has no
 *   opinion to report and a 0 would be invented. It returns when there is
 *   somewhere for a draft to live. DECISIONS.md §10 parks outbound texting
 *   behind 10DLC registration, so that is not soon.
 *
 *   `today` is ABSENT, and is computed by the CLIENT. "Today" depends on the
 *   viewer's timezone; `orgs` carries no timezone column, so computing it here
 *   would mean UTC, which is the wrong day for five hours of every Baton Rouge
 *   evening. The browser knows the right answer, so the browser derives it from
 *   the `occurred_at` values /api/threads already returns.
 *
 * `vendors` counts CONFIRMED relations only — `relation IN ('vendor','sub')`
 * AND `relation_confirmed_at IS NOT NULL`. DECISIONS.md §2b: a machine opinion
 * changes what Coy is asked, never what he is shown. Counting unconfirmed
 * proposals here would put a model's guess into a number on the chrome.
 */

export const dynamic = "force-dynamic";

/** Only keys with a real source. See the header for why `drafts` and `today` are absent. */
export interface ThreadCounts {
  all: number;
  needs: number;
  unsorted: number;
  unscoped: number;
  quoted: number;
  progress: number;
  won: number;
  lost: number;
  vendors: number;
}

interface DirRow { contact_id: string | null; direction: string | null; occurred_at: string | null }
interface JobRow { id: string; status: string | null }

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  // `all` and `needs` both need the LATEST message per contact, so they share
  // one scan. Three narrow columns over ~1,500 rows, ordered newest-first: the
  // first row seen for a contact is that contact's latest message.
  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("contact_id, direction, occurred_at")
    .eq("org_id", orgId)
    .not("contact_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(4000);

  if (msgErr) {
    return applyCookies(NextResponse.json({ error: `messages: ${msgErr.message}` }, { status: 500 }));
  }

  const latestDir = new Map<string, string | null>();
  for (const m of (msgs ?? []) as DirRow[]) {
    const k = m.contact_id as string;
    if (!latestDir.has(k)) latestDir.set(k, m.direction);
  }
  const all = latestDir.size;
  // "Needs you" is a reply owed: the last thing that happened was them talking.
  const needs = [...latestDir.values()].filter((d) => d === "inbound").length;

  // Unsorted — a contact nobody has put a name to. `contacts` reads cleanly
  // through a session client since migration 024 moved its SELECT policy onto
  // get_user_org_ids(); verified as the `authenticated` role, 197 rows.
  // A contact merged into another (migration 028) is not a separate person any
  // more — it keeps its row so the merge can be undone, but it must not count.
  // `all` and `needs` already exclude it: its messages moved with the merge.
  const { data: contacts, error: cErr } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .is("merged_into_contact_id", null);

  if (cErr) {
    return applyCookies(NextResponse.json({ error: `contacts: ${cErr.message}` }, { status: 500 }));
  }
  const unsorted = (contacts ?? []).filter(
    (c: { name: string | null }) => !c.name || !c.name.trim(),
  ).length;

  // Jobs. Fetched whole rather than one head-count per status: five statuses
  // would be five round trips, and `jobs` is 0 rows today and small for a long
  // while yet. Revisit if it ever isn't.
  const { data: jobs, error: jErr } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("org_id", orgId);

  if (jErr) {
    return applyCookies(NextResponse.json({ error: `jobs: ${jErr.message}` }, { status: 500 }));
  }
  const jobRows = (jobs ?? []) as JobRow[];
  const byStatus = (s: string) => jobRows.filter((j) => j.status === s).length;

  // Unscoped — a job with no sections on it yet. A scope IS its job_sections
  // rows (DECISIONS.md §5.5: there is no `scopes` table), so "unscoped" is the
  // absence of those rows, not a status.
  const { data: sections, error: sErr } = await supabase
    .from("job_sections")
    .select("job_id")
    .eq("org_id", orgId);

  if (sErr) {
    return applyCookies(NextResponse.json({ error: `job_sections: ${sErr.message}` }, { status: 500 }));
  }
  const scopedJobIds = new Set((sections ?? []).map((s: { job_id: string }) => s.job_id));
  const unscoped = jobRows.filter((j) => !scopedJobIds.has(j.id)).length;

  // Vendors — confirmed only. See the header.
  const { count: vendorCount, error: vErr } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("relation", ["vendor", "sub"])
    .not("relation_confirmed_at", "is", null);

  if (vErr) {
    return applyCookies(NextResponse.json({ error: `customers: ${vErr.message}` }, { status: 500 }));
  }

  const counts: ThreadCounts = {
    all,
    needs,
    unsorted,
    unscoped,
    quoted: byStatus("quoted"),
    progress: byStatus("in_progress"),
    won: byStatus("won"),
    lost: byStatus("lost"),
    vendors: vendorCount ?? 0,
  };

  return applyCookies(NextResponse.json({ counts }));
}
