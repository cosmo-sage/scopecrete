import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const USERNAME = "admin";
  const PASSWORD = "scopecrete2026";

  // Determine base URL — use x-forwarded-host if present (Caddy proxy), else request.url
  const forwardedHost = request.headers.get("x-forwarded-host");
  const baseUrl = forwardedHost
    ? `https://${forwardedHost}`
    : request.url.replace(/\/api\/auth\/login.*/, "");

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      const { username = "", password = "" } = body;

      if (username === USERNAME && password === PASSWORD) {
        const response = NextResponse.json({ success: true });
        response.cookies.set("sc_session", "scopecrete_dashboard_session", {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
          path: "/",
        });
        return response;
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const body = await request.text();
      const params = new URLSearchParams(body);
      const username = params.get("username") || "";
      const password = params.get("password") || "";

      if (username === USERNAME && password === PASSWORD) {
        const redirectUrl = new URL("/dashboard", baseUrl);
        const response = NextResponse.redirect(redirectUrl, { status: 302 });
        response.cookies.set("sc_session", "scopecrete_dashboard_session", {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
          path: "/",
        });
        return response;
      }
      return NextResponse.redirect(new URL("/dashboard-login?error=1", baseUrl), {
        status: 302,
      });
    } catch {
      return NextResponse.redirect(new URL("/dashboard-login?error=1", baseUrl), {
        status: 302,
      });
    }
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}