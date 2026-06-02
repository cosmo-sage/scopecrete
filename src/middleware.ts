import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isProduction = forwardedHost?.includes("scopecrete.ai");

  // Root path → under construction page (site is down for maintenance)
  if (pathname === "/" && isProduction) {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }

  // Root path → under construction page in production
  if (pathname === "/" && isProduction) {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }

  // Protect dashboard routes
  if (pathname.startsWith("/dashboard") && isProduction) {
    const session = request.cookies.get("sc_session");
    if (!session || session.value !== "scopecrete_dashboard_session") {
      return NextResponse.redirect(new URL("/dashboard-login", request.url));
    }
  }

  // Protect admin routes — same simple session check
  if (pathname.startsWith("/admin") && isProduction) {
    const session = request.cookies.get("sc_session");
    if (!session || session.value !== "scopecrete_dashboard_session") {
      return NextResponse.redirect(new URL("/dashboard-login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
  ],
};