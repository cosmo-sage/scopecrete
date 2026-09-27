import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { OVERHEAD_SELECT, readOverheadFields } from "../fields";

/** Edit or remove one line of the monthly nut. */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  const fields = readOverheadFields(body, false);
  if (!fields.ok) return applyCookies(NextResponse.json({ error: fields.error }, { status: 400 }));
  if (Object.keys(fields.patch).length === 0) return applyCookies(NextResponse.json({ error: "Nothing to change." }, { status: 400 }));

  const { data, error } = await supabase
    .from("overhead_items")
    .update(fields.patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select(OVERHEAD_SELECT)
    .maybeSingle();

  if (error) return applyCookies(NextResponse.json({ error: `overhead_items update: ${error.message}` }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "No such item.", code: "not_found" }, { status: 404 }));
  return applyCookies(NextResponse.json({ item: data }));
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data, error } = await supabase
    .from("overhead_items")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id")
    .maybeSingle();

  if (error) return applyCookies(NextResponse.json({ error: `overhead_items delete: ${error.message}` }, { status: 500 }));
  if (!data) return applyCookies(NextResponse.json({ error: "No such item.", code: "not_found" }, { status: 404 }));
  return applyCookies(NextResponse.json({ deleted: data.id }));
}
