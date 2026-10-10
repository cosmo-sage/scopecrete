/**
 * A colour per thread, Coy's to change (Coy, 2026-10-10: "a settings icon that
 * opens a side panel that allows me to change the color of any thread, which
 * will color all the contact boxes" — and "the color of the box to match the
 * thread … personal is purple").
 *
 * Kept on the account (`user_preferences.prefs.thread_colors`, no migration):
 * { customers: "#2F8A5B", "<thread id>": "#6A55B0", … }. A system thread's colour
 * is its bucket's (`--sc-bucket-*`), so changing it recolours its tags too; a
 * thread Coy made is the accent until he picks one. Pure — tests/thread-colors.test.mjs.
 */

/** The swatches offered: the initials' ten, then the accent's soft orange and red. */
export const THREAD_COLOR_CHOICES = ["#C2603F", "#D97757", "#C98A1B", "#6E8B3D", "#2F8A5B", "#2A8C8C", "#1E5AA8", "#4B5BB5", "#6A55B0", "#9B4F8C", "#B5412C", "#5B6B7A"] as const;

/** The system threads whose colour is a bucket's, and that bucket's variable. */
export const BUCKET_VARS: Record<string, string> = {
  customers: "--sc-bucket-customer", unsorted: "--sc-bucket-unsorted", vendors: "--sc-bucket-vendor",
  personal: "--sc-bucket-personal", spam: "--sc-bucket-spam",
};

export type ThreadColors = Record<string, string>;

const HEX = /^#[0-9a-f]{6}$/i;
const KEY = /^(customers|unsorted|vendors|personal|spam|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Only a known thread and a #rrggbb colour; 200 at most. */
export function cleanThreadColors(v: unknown): ThreadColors {
  const out: ThreadColors = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= 200) break;
    if (KEY.test(k) && typeof c === "string" && HEX.test(c)) out[k.toLowerCase()] = c.toUpperCase();
  }
  return out;
}

/** One change: a colour, or null back to the default. */
export function withThreadColor(colors: ThreadColors, key: string, color: string | null): ThreadColors {
  const next = { ...cleanThreadColors(colors) };
  if (color && HEX.test(color) && KEY.test(key)) next[key.toLowerCase()] = color.toUpperCase();
  else delete next[key.toLowerCase()];
  return next;
}

/** A person's bucket → the system thread that holds them. */
export function bucketThread(bucket: string | null | undefined): string {
  return bucket === "customer" ? "customers" : bucket === "vendor" ? "vendors" : bucket === "personal" ? "personal" : bucket === "spam" ? "spam" : "unsorted";
}

/**
 * The colour of a person's box in a list: the thread Coy made, when it is open
 * and has a colour; else the person's bucket (its variable, so the theme's or
 * Coy's own colour).
 */
export function boxColor(openThread: string, colors: ThreadColors, bucket: string | null | undefined): string {
  const own = colors[openThread.toLowerCase()];
  if (own && !BUCKET_VARS[openThread] && openThread !== "all" && openThread !== "archived") return own;
  return `var(${BUCKET_VARS[bucketThread(bucket)]})`;
}
