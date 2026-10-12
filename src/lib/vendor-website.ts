/**
 * A vendor's website (Coy, 2026-10-12: "Vendors need website fields"; migration 105,
 * contacts.website). Typed as people write it — "teaguerental.com", "www.x.com/rentals" —
 * and kept as a full http(s) address, or nothing.
 */
export function cleanWebsite(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/[)\].,;]+$/, "");
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z]+:/i.test(s) || s.includes("@")) return null; // mailto:, tel:, an email
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // A host with a dot and a real ending: not "localhost", not "teague".
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname)) return null;
    const out = u.toString();
    return out.length <= 300 ? (u.pathname === "/" && !u.search && !u.hash ? out.replace(/\/$/, "") : out) : null;
  } catch { return null; }
}

/** The website column isn't there yet (before migration 105). */
export const missingWebsite = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === "42703" || e.code === "PGRST204") && /website/.test(e.message ?? "website");

/** How a website shows: the host and path, no scheme or www. */
export const websiteLabel = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
