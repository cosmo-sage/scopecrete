import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/** Remove a parish's rate (migration 057). Session client; org from the session. */

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { error, count } = await supabase.from("tax_parishes").delete({ count: "exact" }).eq("org_id", orgId).eq("id", id);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!count) return applyCookies(NextResponse.json({ error: "No such parish." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
