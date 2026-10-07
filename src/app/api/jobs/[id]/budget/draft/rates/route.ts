import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { draftState, lookupRates } from "@/lib/draft/build-server";

/**
 * POST — look up going rates for the draft's open steps (Coy's tap). Session
 * client, org from the session. The web search sends only the kind of work
 * and the job's city; what comes back is kept as sourced reference ranges on
 * the build and never changes a price.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, applyCookies } = r.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const l = await lookupRates(supabase, orgId, id);
  if (!l.ok) return applyCookies(NextResponse.json({ error: l.error }, { status: l.status }));
  const s = await draftState(supabase, orgId, id);
  if (!s.ready) return applyCookies(NextResponse.json({ ready: false, error: s.error }));
  const { _lines, _res, ...rest } = s;
  void _lines; void _res;
  return applyCookies(NextResponse.json(rest));
}
