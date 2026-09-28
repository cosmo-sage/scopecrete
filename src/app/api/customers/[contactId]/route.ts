import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * One person: who they are, what they are to the business (confirmed or
 * unclassified — see ../route.ts), their numbers and their jobs. The
 * conversation itself is /api/threads/[contactId].
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data: c, error } = await supabase
    .from("contacts")
    .select("id, name, phone, email, address, city, state, zip, customer_id, merged_into_contact_id, name_confirmed_at, created_at")
    .eq("id", contactId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) return applyCookies(NextResponse.json({ error: `contacts: ${error.message}` }, { status: 500 }));
  if (!c) return applyCookies(NextResponse.json({ error: "No such contact in your organisation.", code: "not_found" }, { status: 404 }));
  if (c.merged_into_contact_id) return applyCookies(NextResponse.json({ redirect_to: c.merged_into_contact_id }));

  const [cust, phones, jobs] = await Promise.all([
    c.customer_id
      ? supabase.from("customers").select("relation, relation_confirmed_at, relation_source").eq("id", c.customer_id).eq("org_id", orgId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("contact_phones").select("phone_e164").eq("org_id", orgId).eq("contact_id", contactId),
    supabase.from("jobs").select("id, title, status, created_at").eq("org_id", orgId).eq("contact_id", contactId).is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (cust.error) return applyCookies(NextResponse.json({ error: `customers: ${cust.error.message}` }, { status: 500 }));
  if (jobs.error) return applyCookies(NextResponse.json({ error: `jobs: ${jobs.error.message}` }, { status: 500 }));

  const confirmed = !!cust.data?.relation_confirmed_at;
  const numbers = [...new Set([c.phone, ...((phones.data ?? []) as Array<{ phone_e164: string }>).map((p) => p.phone_e164)].filter(Boolean))] as string[];

  return applyCookies(NextResponse.json({
    contact_id: c.id,
    name: (c.name as string | null)?.trim() || null,
    name_confirmed: !!c.name_confirmed_at,
    numbers,
    email: c.email ?? null,
    address: [c.address, c.city, c.state, c.zip].filter((v) => typeof v === "string" && v.trim()).join(", ") || null,
    relation: confirmed ? cust.data!.relation : "unclassified",
    relation_confirmed_at: cust.data?.relation_confirmed_at ?? null,
    jobs: jobs.data ?? [],
  }));
}
