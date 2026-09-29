import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * The org's phone lines (migration 035): number, label, provider, and the lead
 * source a tracking number stands for — with how many messages each carried.
 *
 * A contact is keyed by the other person's number, so the same person calling
 * two of these lines is still one thread; each message records its line.
 * Session client; org_phone_numbers is org-scoped by RLS.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data: lines, error } = await supabase.from("org_phone_numbers")
    .select("id, phone_e164, label, is_primary, active, provider, provider_number_id, default_lead_source, ai_enabled")
    .eq("org_id", orgId).order("is_primary", { ascending: false }).order("created_at");
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));

  const counts = await Promise.all(((lines ?? []) as Array<{ id: string }>).map(async (l) => {
    const { count } = await supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("phone_number_id", l.id);
    return count ?? 0;
  }));
  return applyCookies(NextResponse.json({
    lines: ((lines ?? []) as Array<Record<string, unknown>>).map((l, i) => ({ ...l, messages: counts[i] })),
  }));
}
