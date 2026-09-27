import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * The types inside each bucket — org_contact_subtypes. "Buckets are code,
 * subtypes are data" (synopsis §5.3): the four buckets are fixed, the types
 * under them (subcontractor, supplier, looking for work, …) are rows.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("org_contact_subtypes")
    .select("bucket, slug, label, sort_order")
    .eq("org_id", orgId).eq("active", true)
    .order("bucket").order("sort_order");
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ subtypes: data ?? [] }));
}
