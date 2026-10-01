import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { EMAIL_COLS, emailView } from "@/lib/emails-server";

/**
 * The email mirror (migration 061): emails forwarded to the org's AgentMail
 * inbox, newest first — unfiled and quarantined ones first when asked for all.
 *
 * GET ?status=unfiled|quarantined|filed|all (default all) &customer= &job= &contact= &q= (words, websearch)
 * → { emails: [...] } with customer / job names and attachment counts.
 * Session client; org from the session; RLS on emails (DECISIONS §7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const p = req.nextUrl.searchParams;
  let q = supabase.from("emails").select(EMAIL_COLS).eq("org_id", orgId)
    .order("created_at", { ascending: false }).limit(200);
  const status = p.get("status");
  if (status && status !== "all") {
    if (!["unfiled", "quarantined", "filed"].includes(status)) return applyCookies(NextResponse.json({ error: "Bad status." }, { status: 400 }));
    q = q.eq("status", status);
  }
  for (const [k, col] of [["customer", "customer_id"], ["job", "job_id"], ["contact", "contact_id"]] as const) {
    const v = p.get(k);
    if (!v) continue;
    if (!UUID.test(v)) return applyCookies(NextResponse.json({ error: `Not a ${k} id.` }, { status: 400 }));
    q = q.eq(col, v);
  }
  const words = (p.get("q") ?? "").trim().slice(0, 200);
  if (words.length >= 2) q = q.textSearch("search_tsv", words, { type: "websearch", config: "english" });
  const { data, error } = await q;
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const emails = await emailView(supabase, orgId, rows);
  // Waiting on Coy first.
  const rank = (s: unknown) => (s === "unfiled" ? 0 : s === "quarantined" ? 1 : 2);
  emails.sort((a, b) => rank(a.status) - rank(b.status));
  return applyCookies(NextResponse.json({ emails }));
}
