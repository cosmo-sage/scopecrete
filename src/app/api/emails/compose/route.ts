import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { signatureOf } from "@/lib/email-client";
import { myOrgs } from "@/lib/access-server";
import { agentMailConfigured } from "@/lib/mail-server";

/**
 * What a new email starts from (migration 100): the inbox it goes out from,
 * whether sending is on, the signature, a saved draft, and — given a person —
 * their address and customer.
 *
 * GET ?contact=<id> &draft=<id> → { ready, can_send, inboxes, signature, draft, draft_files, to, filing }
 *
 * Session client; org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const json = (b: unknown, status = 200) => applyCookies(NextResponse.json(b, { status }));
  const p = req.nextUrl.searchParams;
  const contact = UUID.test(p.get("contact") ?? "") ? p.get("contact")! : null;
  const draftId = UUID.test(p.get("draft") ?? "") ? p.get("draft")! : null;

  const [{ data: inb }, user, orgs, drafts] = await Promise.all([
    supabase.from("org_inbound_addresses").select("address").eq("org_id", orgId).order("created_at"),
    supabase.auth.getUser(),
    myOrgs(supabase),
    supabase.from("email_drafts").select("id, conversation, mode, to_addresses, cc_addresses, subject, body, file_ids, by, reply_to_email_id, contact_id, customer_id, job_id, updated_at")
      .eq("org_id", orgId).eq("id", draftId ?? "00000000-0000-0000-0000-000000000000").maybeSingle(),
  ]);
  if (drafts.error && /email_drafts/.test(drafts.error.message)) return json({ ready: false, error: "Email switches on with migration 100." }, 409);
  const draft = drafts.data ?? null;
  if (draftId && !draft) return json({ error: "That draft isn't here any more." }, 404);

  let to: string[] = [];
  let filing = { customer_id: (draft?.customer_id as string | null) ?? null, contact_id: (draft?.contact_id as string | null) ?? contact, job_id: (draft?.job_id as string | null) ?? null };
  if (contact && !draft) {
    const [{ data: c }, { data: ce }] = await Promise.all([
      supabase.from("contacts").select("id, email, customer_id").eq("org_id", orgId).eq("id", contact).maybeSingle(),
      supabase.from("contact_emails").select("email, is_primary").eq("org_id", orgId).eq("contact_id", contact),
    ]);
    if (!c) return json({ error: "Contact not found." }, 404);
    const list = ((ce ?? []) as Array<{ email: string; is_primary: boolean | null }>).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary)).map((x) => x.email.toLowerCase());
    const first = (c.email as string | null)?.toLowerCase() ?? list[0];
    if (first) to = [first];
    filing = { customer_id: (c.customer_id as string | null) ?? null, contact_id: contact, job_id: null };
  }
  const ids = ((draft?.file_ids as string[] | null) ?? []);
  const { data: draftFiles } = ids.length ? await supabase.from("files").select("id, name, byte_size, mime_type").eq("org_id", orgId).in("id", ids) : { data: [] };
  const meta = (user.data.user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
  return json({
    ready: true, can_send: agentMailConfigured(),
    inboxes: ((inb ?? []) as Array<{ address: string }>).map((x) => x.address.toLowerCase()),
    signature: signatureOf({ name: meta.full_name ?? null, org: orgs.find((o) => o.id === orgId)?.name ?? null, phone: meta.phone ?? null }),
    draft, draft_files: draftFiles ?? [], to, filing,
  });
}
