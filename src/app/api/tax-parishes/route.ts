import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * The org's sales tax rate for each parish it works in (migration 057). Coy
 * enters them (state + parish + local, as one %); a job's rate is its
 * parish's (src/lib/tax.ts). Nothing is loaded from an unverified source.
 *
 * GET → { parishes }   POST { parish, rate_pct, note? } → adds or replaces that parish's rate.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("tax_parishes").select("id, state, parish, rate_pct, note, updated_at").eq("org_id", orgId).order("parish");
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ parishes: ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({ ...p, rate_pct: Number(p.rate_pct) })) }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const b = await req.json().catch(() => ({}));
  const parish = typeof b?.parish === "string" ? b.parish.trim().replace(/\s+parish$/i, "").slice(0, 60) : "";
  const rate = Number(b?.rate_pct);
  if (!parish) return applyCookies(NextResponse.json({ error: "Name the parish." }, { status: 400 }));
  if (!Number.isFinite(rate) || rate < 0 || rate >= 30) return applyCookies(NextResponse.json({ error: "The rate is a % under 30." }, { status: 400 }));
  const { data, error } = await supabase.from("tax_parishes")
    .upsert({ org_id: orgId, state: "LA", parish, rate_pct: rate, note: typeof b?.note === "string" ? b.note.slice(0, 200) : null, updated_at: new Date().toISOString() },
      { onConflict: "org_id,state,parish" })
    .select("id, state, parish, rate_pct, note, updated_at").single();
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ parish: { ...data, rate_pct: Number(data.rate_pct) } }, { status: 201 }));
}
