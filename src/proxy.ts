import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next.js 16 renamed middleware.ts -> proxy.ts; export function proxy
// replaces export function middleware. Same file location, same matcher
// config, same runtime behavior. See node_modules/next/dist/docs/01-app/
// 01-getting-started/16-proxy.md.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The /admin block is gone, and with it the last reader of the sc_session
  // cookie. It gated a route group that does not exist — there is no
  // src/app/admin — and redirected failures to /admin/login, itself a 404.
  // Its password was a literal committed to a repo that was public until
  // 2026-08-13. Removing a gate that stood in front of nothing is not a
  // loosening; the only thing it protected was itself.

  // Protect /dashboard with a real Supabase session. Uses getClaims() (fast,
  // local JWT verification) rather than getSession(), per Supabase's guidance
  // that getSession() is not safe to trust inside Proxy/middleware.
  if (pathname.startsWith("/dashboard")) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
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
    if (!data?.claims) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
  ],
};
