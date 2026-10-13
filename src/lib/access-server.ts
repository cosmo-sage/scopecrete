import type { NextRequest } from "next/server";
import type { ApiSession } from "@/lib/api-auth";
import { readViewAs, VIEW_AS_COOKIE } from "@/lib/view-as";
import { accessFrom, FULL_ACCESS, type Access } from "@/lib/access";

/**
 * The caller's orgs and access (migration 081). An estimator can't read the
 * orgs row (it carries webhook_url and api_key_hash), so the org's name, slug
 * and logos come from sc_my_orgs(); their own access from sc_my_access().
 *
 * Until 081 is applied neither function exists: both fall back to what the
 * app read before (orgs under RLS; everyone full), so this ships ahead of the
 * migration without breaking anyone.
 */

type Sb = ApiSession["supabase"];

export interface MyOrg { id: string; slug: string | null; name: string | null; logo_light_path: string | null; logo_dark_path: string | null; role: string | null }

export async function myOrgs(sb: Sb): Promise<MyOrg[]> {
  const { data, error } = await sb.rpc("sc_my_orgs");
  if (!error && Array.isArray(data)) return data as MyOrg[];
  const { data: rows } = await sb.from("orgs").select("id, slug, name, logo_light_path, logo_dark_path").order("created_at");
  return ((rows ?? []) as Array<Omit<MyOrg, "role">>).map((r) => ({ ...r, role: null }));
}

export async function myAccess(sb: Sb, orgId: string): Promise<Access & { role: string | null }> {
  const { data, error } = await sb.rpc("sc_my_access", { p_org: orgId });
  if (error) return { ...FULL_ACCESS, role: null };
  const row = (Array.isArray(data) ? data[0] : data) as { role: string; pages: string[]; all_jobs: boolean; job_ids: string[] } | undefined;
  return { ...accessFrom(row), role: row?.role ?? null };
}

/**
 * View as a teammate (src/lib/view-as.ts): the person the owner is looking at, with their role
 * and access, or null — no cookie, the caller isn't an owner of this org, or the id isn't a
 * member of it. Read through sc_org_people / sc_org_access (owners only for access), under the
 * owner's own session.
 */
export interface ViewAs { user_id: string; name: string | null; email: string | null; role: string | null; access: Access }

export async function viewAsFor(req: NextRequest, s: Pick<ApiSession, "supabase" | "orgId" | "userId">): Promise<ViewAs | null> {
  const id = readViewAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  if (!id || id === s.userId) return null;
  const { data: me } = await s.supabase.from("org_members").select("role").eq("org_id", s.orgId).eq("user_id", s.userId).maybeSingle();
  if ((me?.role as string | undefined) !== "owner") return null;
  const [people, acc] = await Promise.all([
    s.supabase.rpc("sc_org_people", { p_org: s.orgId }),
    s.supabase.rpc("sc_org_access", { p_org: s.orgId }),
  ]);
  const p = ((people.data ?? []) as Array<{ user_id: string; name: string | null; email: string | null; role: string | null }>).find((x) => x.user_id === id);
  if (!p) return null;
  const a = ((acc.data ?? []) as Array<{ user_id: string; pages: string[] | null; all_jobs: boolean | null; job_ids: string[] | null }>).find((x) => x.user_id === id);
  return { user_id: id, name: p.name, email: p.email, role: p.role, access: accessFrom({ role: p.role, ...(a ?? {}) }) };
}
