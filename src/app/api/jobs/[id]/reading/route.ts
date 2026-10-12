import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";

/**
 * What Dusty is reading on one job (Coy, 2026-10-12) — for the reading card in
 * his chat: each file's reader state, the plan sheets' OCR stamps, and the
 * background reader's last pulse. Session client, org from the session; the
 * heartbeat row carries no tenant data (as on /api/activity).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const job = await jobInOrg(supabase, orgId, id);
  if (!job) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));

  const [files, sheets, beat] = await Promise.all([
    supabase.from("files").select("id, name, category, kind, read_state, read_at, read_attempts, read_error, page_count, byte_size, fetch_state, created_at, in_plan_room")
      .eq("org_id", orgId).eq("job_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
    supabase.from("plan_sheets").select("file_id, number, title, number_source, page_w, page_h, scale_ft_per_pt, scale_method, ocr_title_at, ocr_at")
      .eq("org_id", orgId).eq("job_id", id).limit(2000),
    supabase.from("sc_worker_heartbeats").select("status, detail, ticked_at").eq("worker", "read-files").maybeSingle(),
  ]);
  if (files.error) return applyCookies(NextResponse.json({ error: files.error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({
    files: files.data ?? [],
    sheets: ((sheets.data ?? []) as Array<Record<string, unknown>>).map((s) => ({ ...s, page_w: Number(s.page_w), page_h: Number(s.page_h), scale_ft_per_pt: s.scale_ft_per_pt === null ? null : Number(s.scale_ft_per_pt) })),
    reader: beat.data ?? null,
  }));
}
