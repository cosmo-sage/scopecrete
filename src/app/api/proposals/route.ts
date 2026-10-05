import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { publicOrigin } from "@/lib/hosts";
import { linkByToken, readExamples, sendableProposals } from "@/lib/proposal-send-server";

/**
 * Proposals to send from a thread (Coy, 2026-10-05).
 *
 * GET ?contact=<id>  — the person's jobs, and their customer's, that have a
 *                      proposal: version, draft / final, total, the live link
 *                      and how often it was opened; plus Coy's own past sends
 *                      (`examples`), which the send sheet starts from.
 * GET ?token=<token> — the link behind a /p/ link seen in a thread.
 *
 * Session client, org from the session (§7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const sp = req.nextUrl.searchParams;
  const token = sp.get("token");
  if (token) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return applyCookies(NextResponse.json({ link: null }));
    return applyCookies(NextResponse.json({ link: await linkByToken(supabase, orgId, token) }));
  }
  const contact = sp.get("contact");
  if (!contact || !UUID.test(contact)) return applyCookies(NextResponse.json({ error: "Not a contact id." }, { status: 400 }));
  const { data: who } = await supabase.from("contacts").select("id, name, customer_id").eq("org_id", orgId).eq("id", contact).maybeSingle();
  if (!who) return applyCookies(NextResponse.json({ error: "Contact not found." }, { status: 404 }));
  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);
  const [proposals, examples, { data: org }] = await Promise.all([
    sendableProposals(supabase, orgId, { contactIds: [contact], customerIds: who.customer_id ? [who.customer_id as string] : [] }, origin),
    readExamples(supabase, orgId, userId),
    supabase.from("orgs").select("name").eq("id", orgId).maybeSingle(),
  ]);
  return applyCookies(NextResponse.json({ proposals, examples, org: (org?.name as string | null) ?? null, name: (who.name as string | null) ?? null }));
}
