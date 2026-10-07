/**
 * Photos Dusty looks at himself (Coy, 2026-10-04: "I shared a screenshot … he
 * said it will take a couple of minutes to read the screenshot and never
 * responded"). A photo attached in the chat that the background reader hasn't
 * read yet goes to the model as an image in the same request, so he answers
 * about it now. Only the formats the model takes, and not too big to send.
 */

export const SEE_MAX_BYTES = 5 * 1024 * 1024;
export const SEE_MAX_IMAGES = 4;
const SEEABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** The image type to send it as, or null when Dusty can't look at it here. */
export function seeableMime(mime: string | null | undefined, name: string, bytes: number | null | undefined): string | null {
  if (bytes != null && bytes > SEE_MAX_BYTES) return null;
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (SEEABLE.has(m)) return m;
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png" || ext === "webp" || ext === "gif") return `image/${ext}`;
  return null;
}

/**
 * PDFs Dusty reads himself (Coy, 2026-10-07: he attached icon-budget.pdf and
 * Dusty answered that it was "not read yet" — the background reader read it
 * 34 s later). A PDF attached in the chat that the reader hasn't read yet has
 * its text pulled out here, in the same request, so he answers from it now.
 * The background reader's own limit (12 MB, `MAX_PDF_BYTES` in read-files)
 * holds here too; a bigger one, or a scan with no text, waits for it.
 */
export const READ_PDF_MAX_BYTES = 12 * 1024 * 1024;
export const READ_PDF_MAX_CHARS = 30_000;
const READ_PDF_MS = 8_000;

export function isPdf(mime: string | null | undefined, name: string, bytes: number | null | undefined): boolean {
  if (bytes != null && bytes > READ_PDF_MAX_BYTES) return false;
  return (mime ?? "").toLowerCase().startsWith("application/pdf") || /\.pdf$/i.test(name);
}

/** The PDF's text, clipped, or null when it has none (a scan) or won't open in time. */
export async function pdfTextNow(bytes: Uint8Array): Promise<{ text: string; pages: number; clipped: boolean } | null> {
  if (bytes.byteLength > READ_PDF_MAX_BYTES) return null;
  const read = (async () => {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const out = await extractText(pdf, { mergePages: true });
    const text = (Array.isArray(out.text) ? out.text.join("\n\n") : out.text) ?? "";
    return { text, pages: out.totalPages };
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((res) => { timer = setTimeout(() => res(null), READ_PDF_MS); });
  try {
    const got = await Promise.race([read, timeout]);
    if (!got || got.text.replace(/\s/g, "").length < 40) return null;
    const clipped = got.text.length > READ_PDF_MAX_CHARS;
    return { text: clipped ? got.text.slice(0, READ_PDF_MAX_CHARS) : got.text, pages: got.pages, clipped };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
