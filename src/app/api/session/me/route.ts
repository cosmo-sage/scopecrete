import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Who is signed in, and which org they belong to.
 *
 * This replaces v34's `const USER = { name: "Coy Sacco", org: "Sacco Builders",
 * … }`. Everything here comes from the authenticated session and the database:
 * the email from auth, the org name from the `orgs` row reached through the
 * caller's own `org_members` membership under RLS.
 *
 * This is NOT the deleted /api/session/org. That route was unauthenticated and
 * handed an org id to anyone who asked, so the browser could send it back as a
 * query parameter. This one requires a session, returns only that session's own
 * org, and no route takes an org from the client.
 *
 * `name` is null when the profile has none. The UI shows the email in that case
 * rather than inventing a display name.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  const { data: org, error } = await supabase
    .from("orgs")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    return applyCookies(NextResponse.json({ error: `orgs: ${error.message}` }, { status: 500 }));
  }

  const { data: auth } = await supabase.auth.getUser();
  const email = auth?.user?.email ?? null;
  // user_metadata is whatever the identity provider supplied; it is often
  // empty for password accounts, which is why null is a normal answer.
  const meta = (auth?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.full_name === "string" && meta.full_name.trim()
    ? meta.full_name.trim()
    : typeof meta.name === "string" && meta.name.trim()
      ? meta.name.trim()
      : null;

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  return applyCookies(NextResponse.json({
    user_id: userId,
    email,
    name,
    org_id: orgId,
    org_name: org?.name ?? null,
    role: membership?.role ?? null,
  }));
}
