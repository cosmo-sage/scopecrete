import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Who a proposal can go to (Coy, 2026-10-10: "select which of the customer contacts I send the quote to
 * via text … select multiple contacts inside the customer or internal users").
 *
 * GET → { contacts, members }
 *   contacts — the job's person and every person on its customer (not merged, not archived), each with
 *              their phone (the contact's) and email (the contact's, else their first listed); the
 *              job's person first, then the customer's primary.
 *   members  — the org's people (sc_org_people: name, email); a member who is also a contact (an onsite
 *              estimator, org_members.contact_id) carries that contact's phone so they can be texted.
 *
 * Session client; the org from the session, the job checked against it (DECISIONS §7).
 */
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, userId, applyCookies } = result.session;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return applyCookies(NextResponse.json({ error: "Not a job id." }, { status: 400 }));
  const { data: job } = await sb.from("jobs").select("id, contact_id, customer_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!job) return applyCookies(NextResponse.json({ error: "Job not found." }, { status: 404 }));

  const jobContact = (job.contact_id as string | null) ?? null;
  const customerId = (job.customer_id as string | null) ?? null;
  const [cust, people, mem, members] = await Promise.all([
    customerId ? sb.from("customers").select("primary_contact_id").eq("org_id", orgId).eq("id", customerId).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("contacts").select("id, name, phone, email, role, customer_id, merged_into_contact_id, archived_at")
      .eq("org_id", orgId)
      .or([customerId ? `customer_id.eq.${customerId}` : null, jobContact ? `id.eq.${jobContact}` : null].filter(Boolean).join(",") || "id.is.null"),
    sb.from("org_members").select("user_id, contact_id").eq("org_id", orgId),
    sb.rpc("sc_org_people", { p_org: orgId }),
  ]);
  const primary = ((cust.data as { primary_contact_id?: string | null } | null)?.primary_contact_id) ?? null;
  const rows = ((people.data ?? []) as Array<Record<string, unknown>>).filter((p) => !p.merged_into_contact_id && (!p.archived_at || p.id === jobContact));

  // Contacts of members too, for their phones.
  const memberContact = new Map(((mem.data ?? []) as Array<{ user_id: string; contact_id: string | null }>).filter((m) => m.contact_id).map((m) => [m.user_id, m.contact_id as string]));
  const extraIds = [...new Set(memberContact.values())].filter((c) => !rows.some((r) => r.id === c));
  const extra = extraIds.length
    ? ((await sb.from("contacts").select("id, name, phone, email").eq("org_id", orgId).in("id", extraIds)).data ?? []) as Array<Record<string, unknown>>
    : [];
  const ids = rows.map((r) => r.id as string);
  const { data: em } = ids.length ? await sb.from("contact_emails").select("contact_id, email").eq("org_id", orgId).in("contact_id", ids) : { data: [] };
  const firstEmail = new Map<string, string>();
  for (const e of (em ?? []) as Array<{ contact_id: string; email: string }>) if (!firstEmail.has(e.contact_id)) firstEmail.set(e.contact_id, e.email);

  const rank = (r: Record<string, unknown>) => (r.id === jobContact ? 0 : r.id === primary ? 1 : 2);
  const contacts = rows.sort((a, b) => rank(a) - rank(b) || String(a.name ?? "").localeCompare(String(b.name ?? ""))).map((r) => ({
    contact_id: r.id as string, name: (r.name as string | null) ?? null, phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? firstEmail.get(r.id as string) ?? null,
    role: r.id === jobContact ? "On the job" : r.id === primary ? "Primary" : ((r.role as string | null) ?? null),
  }));
  const byId = new Map([...rows, ...extra].map((r) => [r.id as string, r]));
  const membersOut = ((members.data ?? []) as Array<{ user_id: string; name: string | null; email: string | null; role: string }>)
    .filter((m) => m.user_id !== userId)
    .map((m) => {
      const c = memberContact.get(m.user_id);
      const cr = c ? byId.get(c) : undefined;
      return { user_id: m.user_id, name: m.name ?? (cr?.name as string | null) ?? null, email: m.email, role: m.role,
        contact_id: cr ? c! : null, phone: (cr?.phone as string | null) ?? null };
    });
  return applyCookies(NextResponse.json({ contacts, members: membersOut }));
}
