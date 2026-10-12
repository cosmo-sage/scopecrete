import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { orgView } from "@/lib/org-server";
import { myOrgs, myAccess, viewAsFor } from "@/lib/access-server";

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

  // Five independent reads, side by side — the header waits on this route
  // before it draws the org or asks for anything else (2026-10-05: they ran
  // one after another). sc_my_orgs (081): an onsite estimator reads the org's
  // name and logos, not its row.
  const [viewAs, orgs, access, { data: auth }, { data: membership }, { data: line }, { data: admin }] = await Promise.all([
    // An owner viewing as a teammate (src/lib/view-as.ts): their role and access stand in for the owner's.
    viewAsFor(req, result.session),
    myOrgs(supabase),
    myAccess(supabase, orgId),
    supabase.auth.getUser(),
    supabase.from("org_members").select("role").eq("user_id", userId).eq("org_id", orgId).maybeSingle(),
    // The line the desktop top bar shows as live: the org's primary active
    // number. Null when none is marked primary — the bar then shows nothing
    // rather than picking one.
    supabase.from("org_phone_numbers").select("phone_e164, label")
      .eq("org_id", orgId).eq("is_primary", true).eq("active", true).limit(1).maybeSingle(),
    // Runs ScopeCrete itself (084's platform_admins): Settings shows the admin.
    supabase.rpc("sc_is_platform_admin"),
  ]);
  const org = orgs.find((o) => o.id === orgId) ?? null;

  const email = auth?.user?.email ?? null;
  // user_metadata is whatever the identity provider supplied; it is often
  // empty for password accounts, which is why null is a normal answer.
  const meta = (auth?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.full_name === "string" && meta.full_name.trim()
    ? meta.full_name.trim()
    : typeof meta.name === "string" && meta.name.trim()
      ? meta.name.trim()
      : null;
  const phone = typeof meta.phone === "string" && meta.phone.trim() ? meta.phone.trim() : null;

  const brand = org ? orgView(org as unknown as Record<string, unknown>) : null;
  return applyCookies(NextResponse.json({
    line: line?.phone_e164 ?? null,
    user_id: userId,
    email,
    name,
    phone,
    org_id: orgId,
    org_name: org?.name ?? null,
    // Every org they belong to, for the switcher in Settings (2026-10-09).
    orgs: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, role: o.role })),
    // The header's lockup (migration 056): which logos exist, served by
    // /api/org/logo/[variant]; the stamp changes when one is replaced.
    logo_light: brand?.logo_light ?? false,
    logo_dark: brand?.logo_dark ?? false,
    logo_stamp: brand?.logo_stamp ?? null,
    role: viewAs ? viewAs.role : membership?.role ?? access.role ?? null,
    // What an onsite estimator may open (081); everyone else { limited: false }.
    admin: viewAs ? false : admin === true,
    access: viewAs
      ? { limited: viewAs.access.limited, pages: viewAs.access.pages, all_jobs: viewAs.access.all_jobs, job_ids: viewAs.access.job_ids }
      : { limited: access.limited, pages: access.pages, all_jobs: access.all_jobs, job_ids: access.job_ids },
    // The banner: who the owner is looking at. Null when it's their own view.
    viewing_as: viewAs ? { user_id: viewAs.user_id, name: viewAs.name ?? viewAs.email, role: viewAs.role } : null,
  }));
}
