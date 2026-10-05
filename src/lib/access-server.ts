import type { ApiSession } from "@/lib/api-auth";
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
