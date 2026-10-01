import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { GROUP_COLORS, PARAM_COLS } from "@/lib/plans-server";

/**
 * A takeoff group on this job (migration 059): POST { name, kind:
 * area|linear|count, color?, depth_in? }. Its unit follows its kind (SF, LF,
 * EA); a depth lets an area group count yards too — never assumed.
 */

export const dynamic = "force-dynamic";
const KINDS = ["area", "linear", "count"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!name) return bad("Name the group — Slab on grade, Curb & gutter…");
  if (!KINDS.includes(String(b.kind))) return bad("Area, linear or count?");
  const { count } = await supabase.from("takeoff_parameters").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("job_id", id);
  const n = count ?? 0;
  if (n >= 60) return bad("Sixty groups is the most on one job.");
  const color = typeof b.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(b.color) ? b.color : GROUP_COLORS[n % GROUP_COLORS.length];
  const depth = b.depth_in === null || b.depth_in === undefined || b.depth_in === "" ? null : Number(b.depth_in);
  if (depth !== null && !(depth > 0 && depth <= 120)) return bad("Depth is in inches, 0 to 120.");
  if (depth !== null && b.kind !== "area") return bad("Only an area has a depth.");
  const { data, error } = await supabase.from("takeoff_parameters").insert({ org_id: orgId, job_id: id, name, kind: b.kind, color, depth_in: depth, sort_order: n })
    .select(PARAM_COLS).single();
  if (error || !data) return bad(error?.message ?? "not saved", 500);
  return applyCookies(NextResponse.json({ parameter: data }, { status: 201 }));
}
