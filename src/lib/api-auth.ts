import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookieDomain, hostKind } from "./hosts";
import { myOrgs } from "./access-server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** The auth cookie's domain for this request's host — .app.scopecrete.ai on
 *  app and org subdomains, so a refresh written here is the same cookie the
 *  browser holds (src/lib/hosts.ts). Every server client passes it. */
export function cookieOptionsFor(req: NextRequest) {
  const domain = cookieDomain(req.headers.get("host"));
  return domain ? { domain } : undefined;
}

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
    cookieOptions: cookieOptionsFor(req),
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

  // On an org's own address (<slug>.app.scopecrete.ai) the org is the one the
  // address names — and only if this person is a member of it; RLS shows them
  // no other org. Elsewhere, their membership as before.
  let members = supabase.from("org_members").select("org_id").eq("user_id", user.id);
  const host = hostKind(req.headers.get("host"));
  if (host.kind === "org") {
    // sc_my_orgs (081): an onsite estimator can't read the orgs row itself.
    const here = (await myOrgs(supabase)).find((o) => o.slug === host.slug);
    members = members.eq("org_id", here?.id ?? "00000000-0000-0000-0000-000000000000");
  }
  const { data: membership, error: memberErr } = await members.limit(1).maybeSingle();

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

/**
 * Signed in, org or not — for the one place a person without an org may act:
 * accepting an invite (migration 062). Everything it can do goes through
 * SECURITY DEFINER functions that check the caller's own email; no table is
 * read by org here.
 */
export async function getUserSession(req: NextRequest): Promise<
  | { ok: true; session: { supabase: ReturnType<typeof createServerClient>; userId: string; email: string | null; applyCookies: (res: NextResponse) => NextResponse } }
  | { ok: false; response: NextResponse }> {
  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: cookieOptionsFor(req),
    cookies: { getAll: () => req.cookies.getAll(), setAll: (toSet) => { cookiesToSet.push(...toSet); } },
  });
  const applyCookies = (res: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]));
    return res;
  };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, response: applyCookies(NextResponse.json({ error: "Not authenticated" }, { status: 401 })) };
  return { ok: true, session: { supabase, userId: user.id, email: user.email ?? null, applyCookies } };
}

/**
 * Whoever is asking, signed in or not — for the ONE public door: a customer
 * opening a proposal link (migration 075). Anon when there is no session, so
 * RLS gives a stranger nothing; the route only calls the SECURITY DEFINER
 * function made for it (sc_shared_proposal) and signs the storage paths a live
 * link lists (the anon storage policy checks each one). Never the service role.
 */
export function getReaderClient(req: NextRequest) {
  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: cookieOptionsFor(req),
    cookies: { getAll: () => req.cookies.getAll(), setAll: (toSet) => { cookiesToSet.push(...toSet); } },
  });
  const applyCookies = (res: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]));
    return res;
  };
  return { supabase, applyCookies };
}
