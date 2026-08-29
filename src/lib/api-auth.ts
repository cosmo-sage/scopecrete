import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Session-scoped Supabase client plus the caller's org, for browser-reachable
 * API routes.
 *
 * DECISIONS.md §7: no route under src/app/api may hold the service-role key on
 * a path a browser can reach, and org_id is never taken from a query param,
 * body, or header. It is resolved from the authenticated user's org_members
 * row, so a caller can only ever reach their own org's data and RLS is the
 * enforcement rather than our own filtering.
 *
 * This is the pattern already used by api/dashboard/cashflow/route.ts, lifted
 * into one place so the next route cannot get it subtly wrong. The cookie
 * plumbing is the fiddly part: @supabase/ssr may rotate the auth cookie during
 * getUser(), and those Set-Cookie headers have to reach the response or the
 * session silently expires early.
 */
export interface ApiSession {
  supabase: ReturnType<typeof createServerClient>;
  orgId: string;
  userId: string;
  /** Copies any refreshed auth cookies onto the outgoing response. */
  applyCookies: (res: NextResponse) => NextResponse;
}

export type ApiSessionResult =
  | { ok: true; session: ApiSession }
  | { ok: false; response: NextResponse };

export async function getApiSession(req: NextRequest): Promise<ApiSessionResult> {
  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => { cookiesToSet.push(...toSet); },
    },
  });

  const applyCookies = (res: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]));
    return res;
  };

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: applyCookies(NextResponse.json({ error: "Not authenticated" }, { status: 401 })) };
  }

  const { data: membership, error: memberErr } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  // A signed-in user with no org row is NOT the same as a user with an empty
  // inbox, and the UI must never render them identically — an authenticated
  // account seeing zero threads would otherwise look exactly like a broken
  // query. `code` is what the client keys off; `error` is the sentence a
  // person reads.
  if (memberErr || !membership) {
    return {
      ok: false,
      response: applyCookies(NextResponse.json({
        code: "no_org",
        error: "This account isn't a member of any organisation.",
      }, { status: 403 })),
    };
  }

  return {
    ok: true,
    session: { supabase, orgId: membership.org_id as string, userId: user.id, applyCookies },
  };
}
