/**
 * Files Coy uploads (migration 045) — the pure parts: what kind a file is,
 * a storage-safe name, and the path it is stored under. Pure, so
 * tests/files.test.mjs runs it under node --test.
 *
 * Storage lives behind this module and the files routes only: today Supabase
 * Storage (bucket job-files), later S3 (Coy, 2026-09-29) — the move is here.
 */

export const FILES_BUCKET = "job-files";
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export const CATEGORIES = ["photo", "plan", "spec", "bid", "vendor_quote", "receipt", "contract", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  photo: "Photo", plan: "Plans", spec: "Spec", bid: "Bid invite", vendor_quote: "Vendor quote",
  receipt: "Receipt", contract: "Contract", other: "Other",
};

export type FileKind = "pdf" | "image" | "video" | "doc" | "sheet" | "other";

/** What kind of file this is, from its type, falling back to its name. */
export function kindOf(mime: string | null | undefined, name: string): FileKind {
  const m = (mime ?? "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(ext)) return "image";
  if (m.startsWith("video/") || ["mp4", "mov", "3gp", "webm"].includes(ext)) return "video";
  if (/spreadsheet|excel|csv/.test(m) || ["xlsx", "xls", "csv"].includes(ext)) return "sheet";
  if (/word|document|rtf|text\/plain/.test(m) || ["doc", "docx", "rtf", "txt"].includes(ext)) return "doc";
  return "other";
}

/** A first guess at what the file is to Coy. He can change it; Dusty may suggest another. */
export function categoryGuess(kind: FileKind, name: string): Category {
  const n = name.toLowerCase();
  if (/receipt|invoice/.test(n)) return "receipt";
  if (/plan|drawing|sheet|dwg/.test(n) && kind === "pdf") return "plan";
  if (/spec/.test(n)) return "spec";
  if (/bid|itb|rfp|rfq/.test(n)) return "bid";
  if (/contract|agreement/.test(n)) return "contract";
  if (kind === "image") return "photo";
  return "other";
}

/** A name safe for a storage key: letters, digits, dot, dash, underscore; keeps the extension. */
export function safeName(name: string): string {
  const trimmed = name.trim().replace(/[/\\]+/g, "_");
  const dot = trimmed.lastIndexOf(".");
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "file";
  const ext = dot > 0 ? trimmed.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return ext ? `${base}.${ext}` : base;
}

/** {org}/{job or contact}/{file id}/{safe name} — the org segment is what the storage policy checks. */
export function storagePath(orgId: string, ownerId: string, fileId: string, name: string): string {
  return `${orgId}/${ownerId}/${fileId}/${safeName(name)}`;
}

export function sizeLabel(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
