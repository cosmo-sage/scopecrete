import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { inTab, matchesMail, tabCounts, MAIL_TABS, type MailTab } from "@/lib/email-client";
import { conversationsOf, loadMailBox, mailNames, agentMailConfigured } from "@/lib/mail-server";

/**
 * Email in Threads — the folders (migration 100; Claude Design "Email Client v2").
 *
 * GET ?tab=inbox|reply|sent|drafts|unfiled &q= words
 *   → { tab, counts, conversations | drafts, inboxes, can_send, ready }
 *   A conversation is every message sharing `emails.conversation`; Needs reply
 *   = the last word came in and nobody marked it FYI or archived it.
 *
 * Session client; org from the session; RLS on emails, email_conversations and
 * email_drafts (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const json = (b: unknown, status = 200) => applyCookies(NextResponse.json(b, { status }));
  const p = req.nextUrl.searchParams;
  const tab = (MAIL_TABS.find((t) => t.k === p.get("tab"))?.k ?? "inbox") as MailTab;
  const q = (p.get("q") ?? "").slice(0, 80);
  try {
    const box = await loadMailBox(supabase, orgId);
    if (!box.ready) return json({ tab, ready: false, conversations: [], drafts: [], counts: tabCounts([], 0), inboxes: box.inboxes, can_send: false });
    const convs = conversationsOf(box);
    const names = await mailNames(supabase, orgId, convs);
    const { data: draftRows } = await supabase.from("email_drafts")
      .select("id, conversation, mode, to_addresses, cc_addresses, subject, body, file_ids, by, contact_id, customer_id, job_id, updated_at, created_by")
      .eq("org_id", orgId).order("updated_at", { ascending: false }).limit(100);
    const drafts = (draftRows ?? []) as Array<Record<string, unknown>>;
    const view = convs
      .map((c) => ({
        ...c,
        customer_name: c.customer_id ? names.customers.get(c.customer_id) ?? null : null,
        job_title: c.job_id ? names.jobs.get(c.job_id) ?? null : null,
        contact_name: c.contact_id ? names.people.get(c.contact_id) ?? null : null,
        bucket: c.contact_id ? names.bucket.get(c.contact_id) ?? null : c.customer_id ? "customer" : null,
      }))
      .filter((c) => matchesMail(c, q, [c.customer_name, c.job_title, c.contact_name].filter(Boolean) as string[]));
    const wordsIn = (d: Record<string, unknown>) => [d.subject, d.body, ...((d.to_addresses as string[]) ?? [])].filter(Boolean).join(" ").toLowerCase();
    const shownDrafts = q.trim() ? drafts.filter((d) => q.toLowerCase().split(/\s+/).every((w) => wordsIn(d).includes(w))) : drafts;
    return json({
      tab, ready: true, inboxes: box.inboxes, can_send: agentMailConfigured(),
      counts: tabCounts(convs, drafts.length),
      conversations: tab === "drafts" ? [] : view.filter((c) => inTab(c, tab)),
      drafts: tab === "drafts" ? shownDrafts : [],
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
