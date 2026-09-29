import type { ApiSession } from "@/lib/api-auth";
import { FILES_BUCKET } from "@/lib/files";

/** Server-only helpers for the files routes (a route file may only export its handlers). */

export const FILE_COLUMNS = "id, job_id, contact_id, section_id, name, kind, category, mime_type, byte_size, storage_path, source, note, show_on_proposal, page_count, fetch_state, read_state, read_at, read_error, summary, facts, created_at";

const SIGN_SECONDS = 60 * 30;

/** Adds a short-lived signed link to every file whose bytes have arrived. */
export async function signFiles(sb: ApiSession["supabase"], rows: Array<Record<string, unknown>>) {
  const paths = rows.filter((r) => r.fetch_state === "fetched" && r.storage_path).map((r) => r.storage_path as string);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await sb.storage.from(FILES_BUCKET).createSignedUrls(paths, SIGN_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  return rows.map((r) => ({ ...r, url: signed.get(r.storage_path as string) ?? null }));
}
