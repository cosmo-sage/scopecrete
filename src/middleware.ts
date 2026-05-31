import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_SESSIONS = new Set(["scopecrete_dashboard_session"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Hardcoded session check
  const session = request.cookies.get("sc_session");
  const isValidSession = session && ALLOWED_SESSIONS.has(session.value);

  // Protect /dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!isValidSession) {
      return NextResponse.redirect(new URL("/dashboard-login", request.url));
    }
  }

  // If at dashboard-login and already authenticated, redirect to dashboard
  if (pathname === "/dashboard-login" && isValidSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
  ],
};