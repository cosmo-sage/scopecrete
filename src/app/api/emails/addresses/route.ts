import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { loadBook } from "@/lib/contacts-server";
import { addressHits } from "@/lib/email-mention";

/**
 * Who an email's To or Cc row offers for what's typed (Coy, 2026-10-20: "drop down selections that pull
 * from … database emails"): people in Contacts by their email, then addresses on the inbox's mail that are
 * on no one, newest mail first. The inbox's own address never.
 *
 * GET ?q= → { hits: [{ email, name, role, contact_id }] }
 *
 * Session client; org from the session; RLS decides what is read.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  if (!q.trim()) return applyCookies(NextResponse.json({ hits: [] }));
  try {
    const [book, { data: mail }, { data: inb }] = await Promise.all([
      loadBook(supabase, orgId),
      supabase.from("emails").select("from_address, from_name, original_from_address, original_from_name, to_addresses, cc_addresses")
        .eq("org_id", orgId).order("created_at", { ascending: false }).limit(500),
      supabase.from("org_inbound_addresses").select("address").eq("org_id", orgId),
    ]);
    const ours = ((inb ?? []) as Array<{ address: string }>).map((x) => x.address);
    return applyCookies(NextResponse.json({ hits: addressHits(q, book, (mail ?? []) as never[], ours) }));
  } catch (e) {
    return applyCookies(NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }));
  }
}
