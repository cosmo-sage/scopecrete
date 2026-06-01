import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const USERNAME = "admin";
  const PASSWORD = "scopecrete2026";

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
        // For form submissions, redirect to dashboard
        const response = NextResponse.redirect(new URL("/dashboard", request.url), {
          status: 302,
        });
        response.cookies.set("sc_session", "scopecrete_dashboard_session", {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
          path: "/",
        });
        return response;
      }
      // On failure, redirect back to login with error
      return NextResponse.redirect(new URL("/dashboard-login?error=invalid", request.url), {
        status: 302,
      });
    } catch {
      return NextResponse.redirect(new URL("/dashboard-login?error=invalid", request.url), {
        status: 302,
      });
    }
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}