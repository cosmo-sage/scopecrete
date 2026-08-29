import { NextRequest, NextResponse } from "next/server";

// These were literals in this file — "admin" / a password committed to a
// repository that was public until 2026-08-13. DECISIONS.md §9: anything that
// has touched that repo is compromised. They are now environment-only.
//
// Fails CLOSED. With no ADMIN_PASSWORD set, no credential is accepted at all,
// which is the safe direction for a gate whose old password is public. Set
// both vars in the Vercel project to re-enable /admin.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const { username = "", password = "" } = await request.json();

      if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        return NextResponse.json(
          { error: "Admin sign-in is not configured on this deployment." },
          { status: 503 },
        );
      }

      if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const response = NextResponse.json({ success: true, redirect: "/admin/dashboard" });
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