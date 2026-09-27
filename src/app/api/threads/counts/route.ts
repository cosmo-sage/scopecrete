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
 * BUCKETS (migration 032). A contact counts in customers / vendors / personal
 * / spam only when Coy put it there, or Dusty filed it (spam, with Undo) —
 * `classification_confirmed_at` or `auto_classified_at`. Everyone else is
 * `unsorted`. The 'customer' column default on 190 legacy rows is a default,
 * not a classification; counting it would put a guess into a number on the
 * chrome (DECISIONS §2b). `all` leaves spam out, as the list does.
 *
 * `unnamed` is the desktop header's counter: people with no name yet. It used
 * to be what "Unsorted" meant; sorting and naming are separate questions now.
 *
 * Job stages (quoted, won, …) are not here any more — they are the Jobs board.
 */

export const dynamic = "force-dynamic";

/** Only keys with a real source. See the header for why `drafts` and `today` are absent. */
export interface ThreadCounts {
  all: number;
  needs: number;
  customers: number;
  vendors: number;
  personal: number;
  spam: number;
  unsorted: number;
  unnamed: number;
}

interface DirRow { contact_id: string | null; direction: string | null; occurred_at: string | null }
interface ContactRow {
  id: string; name: string | null; contact_type: string | null;
  classification_confirmed_at: string | null; auto_classified_at: string | null;
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  // The LATEST message per contact: the first row seen, newest-first, is it.
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

  // Merged-away contacts keep their rows so a merge can be undone; they are
  // not separate people and never count (migration 028).
  const { data: contacts, error: cErr } = await supabase
    .from("contacts")
    .select("id, name, contact_type, classification_confirmed_at, auto_classified_at")
    .eq("org_id", orgId)
    .is("merged_into_contact_id", null);
  if (cErr) {
    return applyCookies(NextResponse.json({ error: `contacts: ${cErr.message}` }, { status: 500 }));
  }

  const counts: ThreadCounts = { all: 0, needs: 0, customers: 0, vendors: 0, personal: 0, spam: 0, unsorted: 0, unnamed: 0 };
  const KEY: Record<string, keyof ThreadCounts> = { customer: "customers", vendor: "vendors", personal: "personal", spam: "spam" };
  for (const c of (contacts ?? []) as ContactRow[]) {
    if (!latestDir.has(c.id)) continue; // a thread is a contact with messages
    if (!c.name?.trim()) counts.unnamed++;
    const counted = (c.classification_confirmed_at || c.auto_classified_at) && KEY[c.contact_type ?? ""];
    if (counted) counts[counted]++;
    else counts.unsorted++;
    if (counted === "spam") continue;
    counts.all++;
    // "Needs you" is a reply owed: the last thing that happened was them talking.
    if (latestDir.get(c.id) === "inbound") counts.needs++;
  }

  return applyCookies(NextResponse.json({ counts }));
}
