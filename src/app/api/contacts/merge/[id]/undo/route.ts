import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Undo a contact merge.
 *
 * sc_unmerge_contacts() (migration 028) moves back exactly the rows the merge
 * recorded — and only those still on the merged contact — removes the phone
 * rows it added, restores a copied name if nobody has changed it since, and
 * stamps the merge undone. A merge Coy cannot take back is not one he should
 * be asked to make.
 */

export const dynamic = "force-dynamic";

function statusFor(code: string | undefined): number {
  if (code === "P0002") return 404;
  if (code === "22023") return 409;   // already undone
  if (code === "42501") return 401;
  return 500;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;

  const { error } = await supabase.rpc("sc_unmerge_contacts", { p_merge_id: id });
  if (error) {
    return applyCookies(NextResponse.json({ error: error.message, code: error.code }, { status: statusFor(error.code) }));
  }
  return applyCookies(NextResponse.json({ ok: true, merge_id: id }));
}
