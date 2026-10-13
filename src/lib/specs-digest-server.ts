import type { ApiSession } from "@/lib/api-auth";
import { FILES_BUCKET, storagePath } from "@/lib/files";
import { DIGEST_NAME, DIGEST_SOURCE, buildDigest, pickPages, type DigestBook } from "@/lib/specs-digest";

/**
 * Makes (or remakes) a job's "Specs - read by Dusty" file: each spec book on the
 * job is opened here on Vercel — page by page, its text only, never drawn — its
 * concrete pages kept (specs-digest.ts), and the result saved as one Markdown
 * file on the job for the background reader. Session client: RLS decides which
 * files are read and where the new one may go.
 */
type Sb = ApiSession["supabase"];

export const DIGEST_COLUMNS = "id, name, byte_size, note, page_count, read_state, read_at, read_error, summary, facts, source_url, created_at";

export interface SpecBook { id: string; name: string; byte_size: number | null; storage_path: string | null; read_state: string | null; read_error: string | null }

/** The job's spec books: PDFs filed as specs, copied in, not deleted. */
export async function specBooks(sb: Sb, orgId: string, jobId: string): Promise<SpecBook[]> {
  const { data } = await sb.from("files").select("id, name, byte_size, storage_path, read_state, read_error, kind, source_url")
    .eq("org_id", orgId).eq("job_id", jobId).eq("category", "spec").eq("kind", "pdf").eq("fetch_state", "fetched")
    .is("deleted_at", null).order("created_at", { ascending: true });
  return ((data ?? []) as Array<SpecBook & { source_url: string | null }>).filter((f) => !(f.source_url ?? "").startsWith(DIGEST_SOURCE));
}

/** The job's current digest, if one was made. */
export async function currentDigest(sb: Sb, orgId: string, jobId: string) {
  const { data } = await sb.from("files").select(DIGEST_COLUMNS).eq("org_id", orgId).eq("job_id", jobId)
    .like("source_url", `${DIGEST_SOURCE}%`).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as Record<string, unknown> | null;
}

/** Every page's text, one string a page, letting go of each page as it is read. */
async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const out: string[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      out.push((tc.items as Array<{ str?: string; hasEOL?: boolean }>).map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " ")).join(""));
      page.cleanup();
    }
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
  return out;
}

export type DigestResult = { ok: true; file: Record<string, unknown>; pages: number; sections: string[]; books: number } | { ok: false; error: string };

export async function makeDigest(sb: Sb, orgId: string, userId: string, jobId: string): Promise<DigestResult> {
  const books = await specBooks(sb, orgId, jobId);
  if (!books.length) return { ok: false, error: "No spec book on this job — file a PDF as Spec in Files first." };

  const read: DigestBook[] = [];
  const failed: string[] = [];
  for (const b of books) {
    if (!b.storage_path) continue;
    const { data: blob, error } = await sb.storage.from(FILES_BUCKET).download(b.storage_path);
    if (error || !blob) { failed.push(b.name); continue; }
    try {
      const texts = await pageTexts(new Uint8Array(await blob.arrayBuffer()));
      read.push({ name: b.name, pages: texts.length, kept: pickPages(b.name, texts) });
    } catch {
      failed.push(b.name);
    }
  }
  if (!read.length) return { ok: false, error: `Couldn't open ${failed.join(", ") || "the spec book"}.` };
  if (!read.some((b) => b.kept.length)) return { ok: false, error: "No concrete pages found in its words — it may be a scan (no text to copy), or have no concrete sections." };

  const digest = buildDigest(read, new Date());
  const bytes = new TextEncoder().encode(digest.text);
  const fileId = crypto.randomUUID();
  const path = storagePath(orgId, jobId, fileId, DIGEST_NAME);
  const up = await sb.storage.from(FILES_BUCKET).upload(path, bytes, { contentType: "text/markdown; charset=utf-8", upsert: false });
  if (up.error) return { ok: false, error: `Couldn't save the file: ${up.error.message}` };

  const old = await currentDigest(sb, orgId, jobId);
  const { data: row, error } = await sb.from("files").insert({
    id: fileId, org_id: orgId, job_id: jobId, name: DIGEST_NAME, kind: "doc", category: "spec",
    mime_type: "text/markdown", byte_size: bytes.byteLength, storage_path: path,
    source: "upload", source_url: `${DIGEST_SOURCE}${books.map((b) => b.id).join(",")}`,
    fetch_state: "fetched", read_state: "waiting", extracted_text: digest.text.slice(0, 200_000),
    page_count: digest.pages, note: `${digest.pages} concrete page${digest.pages === 1 ? "" : "s"} of ${read.map((b) => b.name).join("; ")}${digest.sections.length ? ` — sections ${digest.sections.join(", ")}` : ""}${digest.left ? ` (${digest.left} more left out for room)` : ""}`.slice(0, 2000),
    created_by: userId,
  }).select(DIGEST_COLUMNS).single();
  if (error || !row) {
    await sb.storage.from(FILES_BUCKET).remove([path]);
    return { ok: false, error: `Couldn't save the file: ${error?.message ?? "no row"}` };
  }
  // One digest a job: the one before steps aside (kept, like any deleted file).
  if (old?.id) await sb.from("files").update({ deleted_at: new Date().toISOString(), read_state: null }).eq("org_id", orgId).eq("id", old.id as string);
  return { ok: true, file: row as Record<string, unknown>, pages: digest.pages, sections: digest.sections, books: read.length };
}
