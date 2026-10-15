import type { ApiSession } from "@/lib/api-auth";
import { FILES_BUCKET } from "@/lib/files";
import { siteLabel } from "@/lib/capture";

/** Server-only helpers for the site photo capture routes (migration 113). */

/** True when an error says migration 113 isn't applied (no `sites` table, or no capture column on files). */
export function missing113(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const m = err.message ?? "";
  return err.code === "42P01" || err.code === "42703" || err.code === "PGRST205" || err.code === "PGRST204"
    || (/sites|client_id|thumb_path|site_id|taken_at|gps_accuracy_m|storage_provider/.test(m) && /does not exist|could not find|schema cache/i.test(m));
}
export const WAITING_113 = "Site photos switch on with migration 113 — waiting for Coy's word to apply it.";

/** The columns a shot is read with (never FILE_COLUMNS, which must not name 113's columns before it is applied). */
export const SHOT_COLUMNS = "id, job_id, section_id, site_id, contact_id, name, kind, category, mime_type, byte_size, storage_path, thumb_path, source, note, tags, taken_at, lat, lng, gps_accuracy_m, client_id, fetch_state, created_at, created_by";
export const SITE_COLUMNS = "id, name, address, lat, lng, job_id, customer_id, created_at, updated_at, archived_at";

type Row = Record<string, unknown>;

/** Signs each shot's thumbnail and its file (30 minutes). A shot not yet arrived has neither. */
export async function signShots(sb: ApiSession["supabase"], rows: Row[]): Promise<Row[]> {
  const ready = rows.filter((r) => r.fetch_state === "fetched");
  const paths = [...new Set(ready.flatMap((r) => [r.storage_path, r.thumb_path]).filter((p): p is string => typeof p === "string" && !!p))];
  const urls = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await sb.storage.from(FILES_BUCKET).createSignedUrls(paths.slice(i, i + 100), 60 * 30);
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return rows.map((r) => {
    const url = r.fetch_state === "fetched" ? urls.get(r.storage_path as string) ?? null : null;
    return { ...r, url, thumb_url: r.fetch_state === "fetched" ? urls.get(r.thumb_path as string) ?? url : null };
  });
}

/** A site row as the pages read it: its label, and its job's title when it became one. */
export function siteOut(s: Row, extra: Row = {}): Row {
  return { ...s, label: siteLabel(s as { name?: string | null; address?: string | null; lat: number; lng: number }), ...extra };
}
