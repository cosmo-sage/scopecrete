import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next.js 16 renamed middleware.ts -> proxy.ts; export function proxy
// replaces export function middleware. Same file location, same matcher
// config, same runtime behavior. See node_modules/next/dist/docs/01-app/
// 01-getting-started/16-proxy.md.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isProduction = forwardedHost?.includes("scopecrete.ai");

  // Protect /admin routes (but not /admin/login which is the auth page itself)
  // Unchanged: this is a separate, static-password admin system, not
  // contractor auth — out of scope of the Supabase Auth migration below.
  if (pathname.startsWith("/admin") && isProduction && pathname !== "/admin/login") {
    const session = request.cookies.get("sc_session");
    if (!session || session.value !== "scopecrete_dashboard_session") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Protect /dashboard routes with a real Supabase session — not the
  // static sc_session cookie. Uses getClaims() (fast, local JWT
  // verification) rather than getSession(), per Supabase's guidance that
  // getSession() is not safe to trust inside Proxy/middleware.
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
    "/admin/:path*",
    "/dashboard/:path*",
  ],
};
