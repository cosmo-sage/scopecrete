/**
 * A customer's camera link (migration 128) — scopecrete.ai/cam/<token>, no
 * login. Coy texts it; the customer's phone opens a camera and every photo and
 * video lands in the job's (and their) Files. Pure rules here; the page is
 * src/components/v34/camera/camera-link-page.tsx, the doors sc_camera_link /
 * sc_camera_upload_ok / sc_camera_shot.
 */

export const CAMERA_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

/** The storage path a shot goes to — the only folder sc_camera_upload_ok lets anon write. */
export function cameraPath(orgId: string, linkId: string, clientId: string, ext: string): string {
  const e = /^[a-z0-9]{2,5}$/.test(ext) ? ext : "bin";
  return `${orgId}/camera/${linkId}/${clientId}.${e}`;
}
export const thumbPathFor = (path: string) => `${path}.thumb.jpg`;

/** The words Coy sends with the link. */
export function cameraMessage(o: { first: string | null; org: string; job: string | null; section?: string | null; url: string }): string {
  const what = o.section ? `the ${o.section}` : o.job ? `the ${o.job.replace(/^the\s+/i, "")} job` : "the job";
  return `Hi${o.first ? ` ${o.first}` : ""}, here's a camera link from ${o.org}. Tap it and take photos or short videos of ${what} — they come straight to us, no app or login needed.\n${o.url}`;
}

/** "Opened 3 times · 12 photos and videos" for Coy's card. */
export function linkLine(l: { view_count: number; shot_count: number; last_shot_at?: string | null }, rel: (iso: string) => string): string {
  const opened = l.view_count ? `Opened ${l.view_count} time${l.view_count === 1 ? "" : "s"}` : "Not opened yet";
  const shots = l.shot_count ? ` · ${l.shot_count} shot${l.shot_count === 1 ? "" : "s"} sent${l.last_shot_at ? `, last ${rel(l.last_shot_at)}` : ""}` : "";
  return opened + shots;
}

/** Days left on a link, in words. */
export function expiresLine(expiresAt: string, now = Date.now()): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  if (!(days > 0)) return "Expired";
  return days === 1 ? "Works for 1 more day" : `Works for ${days} more days`;
}
