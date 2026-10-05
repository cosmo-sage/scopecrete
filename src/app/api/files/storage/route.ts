import { NextRequest, NextResponse } from "next/server";
import { getApiSession, type ApiSession } from "@/lib/api-auth";
import { storageLimitBytes } from "@/lib/files-view";

/**
 * How much storage the org's files take (Coy, 2026-10-05: "show the amount of
 * remaining storage"), for the foot of the Files page's folder column.
 *
 * GET → { used_bytes, files_bytes, texted_bytes, limit_bytes }
 *   files_bytes   every file not deleted (`files.byte_size`; a delete removes
 *                 the object, so a deleted row takes no room)
 *   texted_bytes  texted photos and files copied into `message-media`
 *                 (`message_media.byte_size`, only once stored)
 *   limit_bytes   STORAGE_LIMIT_GB (server side), default 1 — Supabase's free
 *                 plan. Call recordings, logos and proposal pictures are not
 *                 counted: nothing records their size.
 *
 * Session client; org from the session; RLS on both tables (DECISIONS §7).
 * Sums are paged in the app: PostgREST aggregates are off on this project.
 */

export const dynamic = "force-dynamic";

const PAGE = 1000, MAX_PAGES = 100;

async function sum(sb: ApiSession["supabase"], orgId: string, table: "files" | "message_media"): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    let q = sb.from(table).select("byte_size").eq("org_id", orgId).not("byte_size", "is", null);
    q = table === "files" ? q.is("deleted_at", null) : q.not("storage_path", "is", null);
    const { data, error } = await q.order("id").range(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ byte_size: number | string | null }>;
    for (const r of rows) total += Number(r.byte_size) || 0;
    if (rows.length < PAGE) break;
  }
  return total;
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  try {
    const [files, texted] = await Promise.all([sum(supabase, orgId, "files"), sum(supabase, orgId, "message_media")]);
    return applyCookies(NextResponse.json({
      used_bytes: files + texted, files_bytes: files, texted_bytes: texted, limit_bytes: storageLimitBytes(process.env.STORAGE_LIMIT_GB),
    }));
  } catch (e) {
    return applyCookies(NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }));
  }
}
