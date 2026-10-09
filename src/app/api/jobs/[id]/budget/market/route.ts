import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { lookupRates, searchRates } from "@/lib/draft/build-server";
import { marketView, missing094 } from "@/lib/budget-v3-server";

/**
 * The Market rate tab (Budget v3). Session client, org from the session.
 *   GET   the budget's lines by recipe step, the last going-rate lookup, past jobs.
 *   POST  look the going rates up again (Coy's tap): every step, the job's city
 *         only — never the customer. Kept in market_lookups (094); before 094,
 *         on the draft's latest build as the draft's own lookup does.
 * Nothing here changes a price: "Use" goes through the budget line's own PATCH.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, applyCookies } = r.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  return applyCookies(NextResponse.json(await marketView(supabase, orgId, id)));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, userId, applyCookies } = r.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const { error: probe } = await supabase.from("market_lookups").select("id").limit(1);
  if (missing094(probe)) {
    const l = await lookupRates(supabase, orgId, id);
    if (!l.ok) return applyCookies(NextResponse.json({ error: l.status === 409 ? "Build the draft budget first, or apply migration 094 to look rates up from here." : l.error }, { status: l.status }));
  } else {
    const found = await searchRates(supabase, orgId, id, []);
    const { error } = await supabase.from("market_lookups").insert({ org_id: orgId, job_id: id, lookup: found, created_by: userId });
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  }
  return applyCookies(NextResponse.json(await marketView(supabase, orgId, id)));
}
