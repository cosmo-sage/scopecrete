import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookieDomain, hostKind } from "./hosts";
import { myOrgs } from "./access-server";
import { VIEW_AS_COOKIE, writeBlocked } from "./view-as";
import { readViewCompany, VIEW_COMPANY_COOKIE, VIEW_COMPANY_HEADER, viewWriteBlocked } from "./view-company";

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
  /** A ScopeCrete admin looking at another company read only (migration 121): orgId is that company. */
  viewingCompany?: ViewingCompany | null;
}

export interface ViewingCompany { org_id: string; name: string | null; slug: string | null; expires_at: string | null }

export type ApiSessionResult =
  | { ok: true; session: ApiSession }
  | { ok: false; response: NextResponse };

export async function getApiSession(req: NextRequest): Promise<ApiSessionResult> {
  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];

  // View company (src/lib/view-company.ts): the company rides on every query as a header, and the
  // database honours it only for an admin with an open view, in a read-only transaction (121).
  const viewOrg = readViewCompany(req.cookies.get(VIEW_COMPANY_COOKIE)?.value);
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: cookieOptionsFor(req),
    ...(viewOrg ? { global: { headers: { [VIEW_COMPANY_HEADER]: viewOrg } } } : {}),
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

  // getClaims() checks the token's signature locally against the project's
  // published keys (cached per instance) — getUser() was a round trip to
  // Supabase Auth on every API call (p90 ~180 ms, measured 2026-10-05). The
  // database checks the same signature again on every query, so RLS is
  // unchanged. A token that has expired is refreshed first, as before.
  const { data: claimsData, error: authErr } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (authErr || !userId) {
    return { ok: false, response: applyCookies(NextResponse.json({ error: "Not authenticated" }, { status: 401 })) };
  }

  // Viewing a company: the database says whether this admin has an open view of it. If so that
  // company is the session's org, and nothing but ending the view may write.
  if (viewOrg) {
    const { data } = await supabase.rpc("sc_admin_viewing");
    const row = (Array.isArray(data) ? data[0] : data) as ViewingCompany | null | undefined;
    if (row?.org_id === viewOrg) {
      if (viewWriteBlocked(req.method, req.nextUrl.pathname, true)) {
        return {
          ok: false,
          response: applyCookies(NextResponse.json({
            code: "view_company",
            error: `You're viewing ${row.name ?? "another company"} read only — end the view (the banner at the top) to make changes.`,
          }, { status: 403 })),
        };
      }
      return { ok: true, session: { supabase, orgId: row.org_id, userId, applyCookies, viewingCompany: row } };
    }
  }

  // On an org's own address (<slug>.app.scopecrete.ai) the org is the one the
  // address names — and only if this person is a member of it; RLS shows them
  // no other org. sc_my_orgs (081) already joins their org_members rows, so a
  // row for this slug IS the membership — one round trip, not two. (An
  // estimator can't read the orgs row itself.) Elsewhere, their membership as before.
  let membership: { org_id: string } | null = null;
  let memberErr: unknown = null;
  const host = hostKind(req.headers.get("host"));
  const here = host.kind === "org" ? (await myOrgs(supabase)).find((o) => o.slug === host.slug) : undefined;
  if (here?.role) {
    membership = { org_id: here.id };
  } else {
    let members = supabase.from("org_members").select("org_id").eq("user_id", userId);
    if (host.kind === "org") members = members.eq("org_id", here?.id ?? "00000000-0000-0000-0000-000000000000");
    const r = await members.limit(1).maybeSingle();
    membership = r.data as { org_id: string } | null;
    memberErr = r.error;
  }

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

  // Viewing as a teammate (src/lib/view-as.ts): a preview — nothing changes until the owner switches back.
  if (writeBlocked(req.method, req.nextUrl.pathname, !!req.cookies.get(VIEW_AS_COOKIE)?.value)) {
    return {
      ok: false,
      response: applyCookies(NextResponse.json({
        code: "view_as",
        error: "You're viewing as a teammate — switch back (the banner at the top) to make changes.",
      }, { status: 403 })),
    };
  }

  return {
    ok: true,
    session: { supabase, orgId: membership.org_id, userId, applyCookies },
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
