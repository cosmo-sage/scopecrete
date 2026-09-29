import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg, workingEstimate } from "@/lib/budget-server";

/**
 * Good / better / best (Coy, 2026-09-29). POST { label?, description? } adds a
 * tier to the job's working estimate. The first two taps name themselves
 * Good and Better unless Coy types a name; a line with no option is in every
 * tier.
 */

export const dynamic = "force-dynamic";
const DEFAULT_LABELS = ["Good", "Better", "Best"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  let b: { label?: unknown; description?: unknown } = {};
  try { b = await req.json(); } catch { /* empty is fine */ }
  const est = await workingEstimate(supabase, orgId, id, true);
  if (!est) return bad("Couldn't open the budget.", 500);
  const { data: existing } = await supabase.from("estimate_options").select("id, label").eq("org_id", orgId).eq("estimate_id", est.id as string);
  const n = (existing ?? []).length;
  if (n >= 5) return bad("Five options is the most a customer can weigh up.");
  const taken = new Set(((existing ?? []) as Array<{ label: string }>).map((o) => String(o.label).toLowerCase()));
  const typed = typeof b.label === "string" ? b.label.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  const label = typed || DEFAULT_LABELS.find((l) => !taken.has(l.toLowerCase())) || `Option ${n + 1}`;
  const { data, error } = await supabase.from("estimate_options").insert({
    org_id: orgId, estimate_id: est.id, label, sort_order: n,
    description: typeof b.description === "string" && b.description.trim() ? b.description.trim().slice(0, 500) : null,
  }).select("id, label, description, sort_order").single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ option: data }, { status: 201 }));
}
