import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILES_BUCKET } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";

/**
 * The browser finished sending a file straight to storage. Confirm the object
 * is really there (and its size), then queue it for Dusty's reader.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data: f } = await supabase.from("job_files").select("id, storage_path, fetch_state").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!f) return applyCookies(NextResponse.json({ error: "No such file." }, { status: 404 }));
  const path = f.storage_path as string;
  const slash = path.lastIndexOf("/");
  const { data: listed } = await supabase.storage.from(FILES_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  const obj = (listed ?? []).find((o: { name: string }) => o.name === path.slice(slash + 1));
  if (!obj) {
    await supabase.from("job_files").update({ fetch_state: "failed", fetch_error: "upload never arrived" }).eq("id", id).eq("org_id", orgId);
    return applyCookies(NextResponse.json({ error: "The upload never arrived — try again." }, { status: 409 }));
  }
  const size = (obj.metadata as { size?: number } | null)?.size ?? null;
  const { data: row, error } = await supabase.from("job_files")
    .update({ fetch_state: "fetched", captured_at: new Date().toISOString(), read_state: "waiting", ...(size ? { byte_size: size } : {}) })
    .eq("id", id).eq("org_id", orgId).select(FILE_COLUMNS).single();
  if (error || !row) return applyCookies(NextResponse.json({ error: error?.message ?? "not saved" }, { status: 500 }));
  const [signed] = await signFiles(supabase, [row as Record<string, unknown>]);
  return applyCookies(NextResponse.json({ file: signed }));
}
