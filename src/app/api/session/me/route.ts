import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { orgView } from "@/lib/org-server";

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
    .select("id, name, logo_light_path, logo_dark_path")
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

  // The line the desktop top bar shows as live: the org's primary active
  // number. Null when none is marked primary — the bar then shows nothing
  // rather than picking one.
  const { data: line } = await supabase
    .from("org_phone_numbers")
    .select("phone_e164, label")
    .eq("org_id", orgId)
    .eq("is_primary", true)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const brand = org ? orgView(org) : null;
  return applyCookies(NextResponse.json({
    line: line?.phone_e164 ?? null,
    user_id: userId,
    email,
    name,
    org_id: orgId,
    org_name: org?.name ?? null,
    // The header's lockup (migration 056): which logos exist, served by
    // /api/org/logo/[variant]; the stamp changes when one is replaced.
    logo_light: brand?.logo_light ?? false,
    logo_dark: brand?.logo_dark ?? false,
    logo_stamp: brand?.logo_stamp ?? null,
    role: membership?.role ?? null,
  }));
}
