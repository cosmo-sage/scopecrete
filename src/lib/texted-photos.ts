/**
 * Texted photos brought onto a job (2026-10-03). Pure — tests/texted-photos.test.mjs.
 */

/** files.source_url for a copy of one texted file: which message_media row it came from. */
export const textedMarker = (mediaId: string) => `message_media:${mediaId}`;

/** "Texted by Johnette Wilson · Oct 2 3.41 PM.jpg" — who sent it and when (Central). */
export function textedPhotoName(who: string | null | undefined, sentAt: string | null | undefined, ext: string): string {
  const name = (who ?? "").replace(/[^\p{L}\p{N} .'-]+/gu, " ").replace(/\s+/g, " ").trim();
  const sender = name && /\p{L}/u.test(name) ? name : "customer";
  let when = "";
  const t = sentAt ? Date.parse(sentAt) : NaN;
  if (Number.isFinite(t)) {
    const d = new Date(t);
    const day = d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).replace(":", ".");
    when = ` · ${day} ${time}`;
  }
  return `Texted by ${sender}${when}.${ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg"}`.slice(0, 160);
}
