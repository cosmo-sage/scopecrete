import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const USERNAME = "admin";
  const PASSWORD = "scopecrete2026";

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      const username = body?.username ?? "";
      const password = body?.password ?? "";

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

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}