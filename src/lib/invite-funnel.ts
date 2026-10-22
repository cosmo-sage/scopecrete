/**
 * Invite tracking (migration 122; Coy, 2026-10-22: "Is there a way for me to see if a contractor
 * opens the link that I send to set up his organization? … how many times he clicked the link,
 * or if he got stuck in the process").
 *
 * The invite page reports each step (sc_invite_track); Admin shows the company's invites with
 * their opens and where each stopped (sc_admin_invite_funnel). Pure — tested in
 * tests/invite-funnel.test.mjs.
 */

/** The steps in the order a new owner goes through them. */
export const FUNNEL_STEPS = [
  { key: "opened", label: "Opened" },
  { key: "signed_in", label: "Signed in" },
  { key: "joined", label: "Joined" },
  { key: "password_set", label: "Password" },
  { key: "installed", label: "Home screen" },
] as const;

/** The browser in a few words, never more: "iPhone · Safari", "Android · Chrome", "Mac · Chrome". */
export function deviceLabel(ua: string | null | undefined): string | null {
  const s = ua ?? "";
  if (!s.trim()) return null;
  const os = /iPhone/.test(s) ? "iPhone"
    : /iPad/.test(s) ? "iPad"
    : /Android/.test(s) ? "Android"
    : /Windows/.test(s) ? "Windows"
    : /Mac OS X|Macintosh/.test(s) ? "Mac"
    : /CrOS/.test(s) ? "Chromebook"
    : /Linux/.test(s) ? "Linux"
    : "Other";
  const browser = /EdgA?\//.test(s) ? "Edge"
    : /SamsungBrowser\//.test(s) ? "Samsung Internet"
    : /OPR\//.test(s) ? "Opera"
    : /FBAN|FBAV|FB_IAB/.test(s) ? "Facebook"
    : /Instagram/.test(s) ? "Instagram"
    : /CriOS\/|Chrome\//.test(s) ? "Chrome"
    : /FxiOS\/|Firefox\//.test(s) ? "Firefox"
    : /Safari\//.test(s) ? "Safari"
    : "a browser";
  return `${os} · ${browser}`;
}

export interface FunnelRow {
  invite_id: string;
  email: string;
  role: string;
  sent_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  opens: number;
  first_opened: string | null;
  last_opened: string | null;
  steps: string[];
  last_step: string | null;
  last_at: string | null;
  last_device: string | null;
}

/** "2h ago", "3 days ago", "just now". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Where this invite stands, in a line Coy reads at a glance. */
export function funnelState(r: FunnelRow, now = Date.now()): { line: string; tone: "ok" | "warn" | "bad" | "quiet" } {
  const has = (k: string) => r.steps.includes(k);
  if (r.revoked_at && !r.accepted_at) return { line: "Withdrawn — this link no longer works", tone: "quiet" };
  const opened = r.opens > 0
    ? `Opened ${r.opens === 1 ? "once" : `${r.opens} times`}, last ${ago(r.last_opened, now)}`
    : "Not opened yet";
  if (r.accepted_at || has("joined")) {
    if (has("installed")) return { line: `Joined and opened it from the home screen`, tone: "ok" };
    if (has("password_set")) return { line: `Joined and set a password — hasn't opened it from the home screen`, tone: "ok" };
    return { line: `Joined ${ago(r.accepted_at, now)} — no password set yet`, tone: "ok" };
  }
  const expired = r.expires_at && new Date(r.expires_at).getTime() < now;
  if (expired) return { line: `${opened} — the link has expired; send a new one`, tone: "bad" };
  if (r.opens === 0) return { line: `Not opened yet · sent ${ago(r.sent_at, now)}`, tone: "warn" };
  if (has("wrong_email") && !has("signed_in")) return { line: `${opened} — signed in with a different email than the invite's`, tone: "bad" };
  if (has("signed_in")) return { line: `${opened} — signed in but hasn't tapped Join`, tone: "warn" };
  return { line: `${opened} — hasn't signed in`, tone: "warn" };
}
