import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookieOptionsFor } from "@/lib/api-auth";

// PKCE callback for every Supabase Auth flow that lands here: Google
// OAuth, email OTP, and password recovery. All of them arrive as
// ?code=... to be exchanged for a session — recovery links are told
// apart by ?type=recovery and sent on to set a new password instead
// of straight into the dashboard.
//
// The old version of this file (page.tsx) did nothing but redirect to
// /dashboard-login without ever reading the code from the URL, so the
// session was silently discarded — every reset/sign-in link seemed to
// go nowhere. See DEBUG-AUTH.md for the history of that bug.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  // An invitee signing in from their invite link comes back to it (062).
  const asked = searchParams.get("next");
  const next = type === "recovery" ? "/auth/reset-password"
    : asked && /^\/invite\/[0-9a-f]{48}$/.test(asked) ? asked : "/dashboard";

  if (code) {
    const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: cookieOptionsFor(request),
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (toSet) => { cookiesToSet.push(...toSet); },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`);
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]));
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
