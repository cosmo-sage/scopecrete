import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { missing084, readFeedback, STATUSES, type RoadmapStatus } from "@/lib/roadmap";

/**
 * Feedback and the Roadmap (migration 084). Platform data: the same board for
 * every org, read and written only through the sc_roadmap_* functions, which
 * check the caller themselves (the tables have no grants).
 *
 * GET  → { items, admin } — the published board, your own feedback, and for
 *        Coy (platform_admins) every item. { missing: true } before 084.
 * POST { title?, body, kind, page }       → 201 { id } — feedback, status new.
 * POST { add: true, title, body, status } → 201 { id } — Coy's own item onto the board.
 *
 * Session client, org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const [list, admin] = await Promise.all([supabase.rpc("sc_roadmap_list"), supabase.rpc("sc_is_platform_admin")]);
  if (list.error) {
    if (missing084(list.error)) return applyCookies(NextResponse.json({ missing: true, items: [], admin: false }));
    return applyCookies(NextResponse.json({ error: list.error.message }, { status: 500 }));
  }
  return applyCookies(NextResponse.json({ items: list.data ?? [], admin: admin.data === true }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const b = await req.json().catch(() => null);
  const read = readFeedback(b);
  if (!read.ok) return bad(read.error);
  const f = read.feedback;
  const add = !!(b && typeof b === "object" && (b as Record<string, unknown>).add === true);
  const status = (b as Record<string, unknown>)?.status;
  const { data, error } = add
    ? await supabase.rpc("sc_roadmap_add", { p_title: f.title, p_body: f.body,
      p_status: STATUSES.some((s) => s.k === status) ? (status as RoadmapStatus) : "considering" })
    : await supabase.rpc("sc_roadmap_submit", { p_org: orgId, p_title: f.title, p_body: f.body, p_kind: f.kind, p_page: f.page });
  if (error) {
    if (missing084(error)) return bad("Feedback isn't switched on yet (migration 084).", 503);
    return bad(error.message, /only the platform admin/.test(error.message) ? 403 : 400);
  }
  return applyCookies(NextResponse.json({ id: data }, { status: 201 }));
}
