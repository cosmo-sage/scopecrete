import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * People in one bucket, for pickers — e.g. "add a vendor to this job".
 * Only people whose bucket is SHOWN (Coy put them there, or Dusty filed them).
 *
 * GET ?bucket=vendor|customer → { people: [{ id, name, phone, subtype }] }
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bucket = req.nextUrl.searchParams.get("bucket");
  if (bucket !== "vendor" && bucket !== "customer") {
    return applyCookies(NextResponse.json({ error: "bucket must be vendor or customer." }, { status: 400 }));
  }
  const { data, error } = await supabase.from("contacts")
    .select("id, name, phone, contact_subtype, classification_confirmed_at, auto_classified_at")
    .eq("org_id", orgId).eq("contact_type", bucket).is("merged_into_contact_id", null).is("archived_at", null)
    .or("classification_confirmed_at.not.is.null,auto_classified_at.not.is.null")
    .order("name", { ascending: true, nullsFirst: false }).limit(500);
  if (error) return applyCookies(NextResponse.json({ error: `contacts: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({
    people: ((data ?? []) as Array<{ id: string; name: string | null; phone: string | null; contact_subtype: string | null }>).map((c) => ({ id: c.id, name: c.name?.trim() || null, phone: c.phone, subtype: c.contact_subtype })),
  }));
}
