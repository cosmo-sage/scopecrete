// Which door a request came in by (Coy, 2026-10-04: "the dashboard login page
// to land on app.scopecrete.ai/login and … the Sacco Enterprises dashboard …
// at a subdomain of app.scopecrete.ai … each organization will have its own").
//
//   scopecrete.ai, www          apex   — the public site; sign-in moves to app
//   app.scopecrete.ai           app    — /login, and nothing else of an org's
//   <orgs.slug>.app.scopecrete.ai org  — that org's dashboard
//   anything else               other  — *.vercel.app, previews, localhost:
//                                        everything works as before, no hops
//
// Pure, so proxy.ts (edge), the browser and the tests share it.

export const ROOT_DOMAIN = "scopecrete.ai";
export const APP_HOST = `app.${ROOT_DOMAIN}`;

/** One DNS label: what orgs.slug must look like to be a subdomain. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type HostKind =
  | { kind: "apex" }
  | { kind: "app" }
  | { kind: "org"; slug: string }
  | { kind: "other" };

export function bareHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function hostKind(host: string | null | undefined): HostKind {
  const h = bareHost(host);
  if (h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}`) return { kind: "apex" };
  if (h === APP_HOST) return { kind: "app" };
  const suffix = `.${APP_HOST}`;
  if (h.endsWith(suffix)) {
    const slug = h.slice(0, -suffix.length);
    if (SLUG_RE.test(slug)) return { kind: "org", slug };
  }
  return { kind: "other" };
}

/** The org's own address, or null for a slug that can't be a subdomain. */
export function orgOrigin(slug: string | null | undefined): string | null {
  return slug && SLUG_RE.test(slug) ? `https://${slug}.${APP_HOST}` : null;
}

export const APP_ORIGIN = `https://${APP_HOST}`;
export const LOGIN_URL = `${APP_ORIGIN}/login`;

/**
 * The sign-in cookie is shared by app.scopecrete.ai and every org under it,
 * so signing in on /login carries over to sbuild.app.scopecrete.ai. Elsewhere
 * (previews, localhost) the cookie stays on its own host, as before.
 */
export function cookieDomain(host: string | null | undefined): string | undefined {
  const k = hostKind(host).kind;
  return k === "app" || k === "org" ? `.${APP_HOST}` : undefined;
}

/** A path to come back to after signing in: same-site paths only. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next.startsWith("/dashboard") || /^\/invite\/[0-9a-f]{48}$/.test(next) ? next : null;
}

/** Where a customer's link (/p/…) should point: the public scopecrete.ai —
 *  never an org's dashboard address, and never a *.vercel.app preview, which
 *  sits behind Vercel's own login (a customer, or Dusty, opening one got
 *  "log in to Vercel" — 2026-10-07). Every deployment shares one database, so
 *  the token opens on scopecrete.ai. Only localhost keeps its own host. */
export function publicOrigin(host: string | null | undefined, fallback: string): string {
  const h = bareHost(host);
  if (hostKind(host).kind === "other" && (h === "localhost" || h === "127.0.0.1" || h === "")) return fallback;
  return `https://${ROOT_DOMAIN}`;
}
