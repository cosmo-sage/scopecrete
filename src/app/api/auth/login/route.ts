import { NextRequest, NextResponse } from "next/server";

const USERNAME = "admin";
const PASSWORD = "scopecrete2026";

export async function POST(request: NextRequest) {
  let username = "";
  let password = "";

  // Try JSON first
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.text();
      const data = JSON.parse(body);
      username = data.username || "";
      password = data.password || "";
    } else {
      // Try form data
      const body = await request.text();
      const params = new URLSearchParams(body);
      username = params.get("username") || "";
      password = params.get("password") || "";
    }
  } catch {
    // Fallback: try JSON anyway
    try {
      const body = await request.text();
      const data = JSON.parse(body);
      username = data.username || "";
      password = data.password || "";
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  }

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
}