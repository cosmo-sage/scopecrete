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
