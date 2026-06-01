import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const USERNAME = "admin";
  const PASSWORD = "scopecrete2026";

  const text = await request.text();

  let data: { username?: string; password?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { username = "", password = "" } = data;

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