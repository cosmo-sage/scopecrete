// Hardcoded credential-based login for dashboard
import { NextRequest, NextResponse } from "next/server";

const USERNAME = "admin";
const PASSWORD = "scopecrete2026";
const SESSION_COOKIE = "sc_session=scopecrete_dashboard_session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (username === USERNAME && password === PASSWORD) {
      const response = NextResponse.json({ success: true });
      response.cookies.set("sc_session", "scopecrete_dashboard_session", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24 hours
        path: "/",
      });
      return response;
    }

    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get("sc_session");
  if (session?.value === "scopecrete_dashboard_session") {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}