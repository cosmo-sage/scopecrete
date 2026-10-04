import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { refreshJobTax } from "@/lib/tax-lookup-server";

/**
 * POST → look this job's sales tax up again by its address (TaxLocus), and
 * keep it on the job. A typed rate still wins; a picked parish is replaced —
 * Coy asked for the address's rate. Session client; org from the session.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const r = await refreshJobTax(supabase, orgId, id, true);
  return applyCookies(NextResponse.json(r, { status: r.ok ? 200 : 422 }));
}
