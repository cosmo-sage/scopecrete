import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect dashboard in production (not on localhost dev)
  const isProduction = request.headers.get("x-forwarded-host")?.includes("scopecrete.ai");

  if (pathname.startsWith("/dashboard") && isProduction) {
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