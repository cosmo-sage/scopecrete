import { NextResponse, type NextRequest } from "next/server";

// Only protect dashboard in production (not on localhost dev)
// On VPS: Next.js sees localhost:3000, but x-forwarded-host tells us the real domain
const IS_PRODUCTION = request.headers.get("x-forwarded-host")?.includes("scopecrete.ai");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard") && IS_PRODUCTION) {
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
  ],
};