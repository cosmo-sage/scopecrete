import type { ApiSession } from "@/lib/api-auth";
import { myOrgs } from "@/lib/access-server";

/**
 * The org itself (migration 056): its name, lives once in orgs.name; its logo,
 * two paths in the private org-branding bucket. Session client only — the
 * rename and logo functions check the caller is an owner themselves.
 */

type Sb = ApiSession["supabase"];

export const BRANDING_BUCKET = "org-branding";
export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" };
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export type Variant = "light" | "dark";
export const isVariant = (v: unknown): v is Variant => v === "light" || v === "dark";

export interface OrgView { id: string; name: string; logo_light: boolean; logo_dark: boolean; logo_stamp: string | null }

/** Logos are served by /api/org/logo/[variant]; the stamp busts the cache when one changes. */
export function orgView(row: Record<string, unknown>): OrgView {
  const l = (row.logo_light_path as string | null) ?? null;
  const d = (row.logo_dark_path as string | null) ?? null;
  const stamp = [l, d].map((p) => (p ? p.replace(/^.*logo-(light|dark)-/, "").replace(/\..*$/, "") : "")).join("-");
  return { id: row.id as string, name: row.name as string, logo_light: !!l, logo_dark: !!d, logo_stamp: l || d ? stamp : null };
}

export async function orgRow(sb: Sb, orgId: string) {
  // sc_my_orgs (081), so an onsite estimator gets the name and logos too.
  const o = (await myOrgs(sb)).find((x) => x.id === orgId);
  return (o ?? null) as Record<string, unknown> | null;
}

export async function isOwner(sb: Sb, orgId: string, userId: string) {
  const { data } = await sb.from("org_members").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  return (data?.role as string | undefined) === "owner";
}
