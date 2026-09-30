import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { OVERHEAD_SELECT, readOverheadFields } from "./fields";

/** Add a line of recurring overhead (the Cash page's burn rate). Listing is part of GET /api/settings/money. */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  const fields = readOverheadFields(body, true);
  if (!fields.ok) return applyCookies(NextResponse.json({ error: fields.error }, { status: 400 }));

  const { data, error } = await supabase
    .from("overhead_items")
    .insert({ ...fields.patch, org_id: orgId })
    .select(OVERHEAD_SELECT)
    .single();

  if (error) return applyCookies(NextResponse.json({ error: `overhead_items insert: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ item: data }, { status: 201 }));
}
