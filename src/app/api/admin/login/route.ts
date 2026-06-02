import { NextRequest, NextResponse } from "next/server";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "scopecrete2026";

export async function POST(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const baseUrl = forwardedHost ? `https://${forwardedHost}` : request.url.replace(/\/api\/admin\/login.*/, "");

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const { username = "", password = "" } = await request.json();

      if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const response = NextResponse.json({ success: true, redirect: "/admin/dashboard" });
        response.cookies.set("sc_admin_session", "scopecrete_admin_session", {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
          path: "/",
        });
        // Also set sc_session for compatibility with existing contractor auth
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

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}