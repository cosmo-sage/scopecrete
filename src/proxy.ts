import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { APP_ORIGIN, LOGIN_URL, cookieDomain, hostKind, orgOrigin, type HostKind } from "@/lib/hosts";
import { myOrgs } from "@/lib/access-server";

// Next.js 16 renamed middleware.ts -> proxy.ts; export function proxy
// replaces export function middleware. Same file location, same matcher
// config, same runtime behavior. See node_modules/next/dist/docs/01-app/
// 01-getting-started/16-proxy.md.
//
// The /admin block is gone, and with it the last reader of the sc_session
// cookie. It gated a route group that does not exist — there is no
// src/app/admin — and redirected failures to /admin/login, itself a 404.
// Its password was a literal committed to a repo that was public until
// 2026-08-13. Removing a gate that stood in front of nothing is not a
// loosening; the only thing it protected was itself.
//
// Doors (src/lib/hosts.ts, DECISIONS §8): sign-in is app.scopecrete.ai/login,
// an org's dashboard is <orgs.slug>.app.scopecrete.ai. Any other host
// (*.vercel.app, previews, localhost) keeps the old single-host behaviour.
// /p/ (proposal links), /auth, /invite and /api pass through on every host.

/** Session check. getClaims() verifies the JWT locally — Supabase's advice
 *  for proxy code, where getSession() is not to be trusted. */
async function sessionFor(request: NextRequest, host: string | null) {
  let response = NextResponse.next({ request });
  const domain = cookieDomain(host);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: domain ? { domain } : undefined,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const { data } = await supabase.auth.getClaims();
  return { supabase, signedIn: !!data?.claims, response: () => response };
}

/** A redirect that keeps any refreshed auth cookies. */
function go(url: string | URL, from: NextResponse) {
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

/** The org this browser last opened (the switcher, 2026-10-09): sign-in goes back
 *  there, not to whichever membership comes first. Only a slug; membership is
 *  still checked on every request. */
const LAST_ORG = "sc_org";
function homeOf(mine: Array<{ slug: string | null }>, request: NextRequest) {
  const last = request.cookies.get(LAST_ORG)?.value;
  return orgOrigin((mine.find((o) => o.slug && o.slug === last) ?? mine[0])?.slug);
}

function loginWithNext(path: string) {
  const u = new URL(LOGIN_URL);
  if (path.startsWith("/dashboard") && path !== "/dashboard") u.searchParams.set("next", path);
  return u;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host");
  const kind: HostKind = hostKind(host);
  const isDash = pathname.startsWith("/dashboard");

  // ── scopecrete.ai: the public site — the landing page (src/app/welcome) at /.
  //    Sign-in and the dashboard live on app.
  if (kind.kind === "apex") {
    if (pathname === "/") return NextResponse.rewrite(new URL("/welcome", request.url));
    if (pathname === "/login") return NextResponse.redirect(LOGIN_URL);
    if (isDash) return NextResponse.redirect(`${APP_ORIGIN}${pathname}${search}`);
    return NextResponse.next();
  }

  // ── app.scopecrete.ai: the login, then off to your org's own address.
  if (kind.kind === "app") {
    if (pathname === "/") return NextResponse.redirect(LOGIN_URL);
    if (pathname !== "/login" && !isDash) return NextResponse.next();
    const s = await sessionFor(request, host);
    if (!s.signedIn) return isDash ? go(loginWithNext(pathname), s.response()) : s.response();
    // Only the orgs this person belongs to (sc_my_orgs — estimators included, 081).
    const home = homeOf(await myOrgs(s.supabase), request);
    if (home) return go(`${home}${isDash ? pathname : "/dashboard"}${isDash ? search : ""}`, s.response());
    // Signed in but no org with an address: the dashboard here says what's missing.
    return pathname === "/login" ? go(new URL("/dashboard", request.url), s.response()) : s.response();
  }

  // ── <slug>.app.scopecrete.ai: that org's dashboard, members only.
  if (kind.kind === "org") {
    if (pathname === "/login") return NextResponse.redirect(LOGIN_URL);
    if (pathname === "/") return NextResponse.redirect(new URL("/dashboard", request.url));
    if (!isDash) return NextResponse.next();
    const s = await sessionFor(request, host);
    if (!s.signedIn) return go(loginWithNext(pathname), s.response());
    const mine = await myOrgs(s.supabase);
    if (mine.some((o) => o.slug === kind.slug)) {
      const res = s.response();
      if (request.cookies.get(LAST_ORG)?.value !== kind.slug) {
        const domain = cookieDomain(host);
        res.cookies.set(LAST_ORG, kind.slug, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: true, ...(domain ? { domain } : {}) });
      }
      return res;
    }
    // Not a member here (or no such org): send them to their own, else to sign-in.
    const home = homeOf(mine, request);
    return go(home ? `${home}/dashboard` : LOGIN_URL, s.response());
  }

  // ── Everything else (vercel.app, previews, localhost): as before.
  if (isDash) {
    const s = await sessionFor(request, host);
    if (!s.signedIn) return go(new URL("/", request.url), s.response());
    return s.response();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*"],
};
