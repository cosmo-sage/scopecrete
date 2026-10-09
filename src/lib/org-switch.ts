/**
 * The org switcher (Coy, 2026-10-09: "an organization switcher in the settings
 * … Jeremy can switch between Gulfline Paving and Sacco Enterprises … I might
 * be doing the same thing with another concrete company"). The org is the one
 * the address names (<slug>.app.scopecrete.ai, src/proxy.ts), so switching is
 * opening the other org's address; one sign-in covers every org address (the
 * auth cookie is set for .app.scopecrete.ai). Pure — tested in
 * tests/org-switch.test.mjs.
 */
import { orgOrigin } from "./hosts.ts";

export interface SwitchOrg { id: string; name: string | null; slug: string | null; role: string | null }
export interface SwitchRow { id: string; name: string; role: string; href: string | null; current: boolean }

export const roleLabel = (role: string | null | undefined): string =>
  role === "owner" ? "Owner" : role === "field" ? "Onsite estimator" : role === "member" ? "Member" : "Member";

/** Every org this person belongs to, the open one first, then by name. */
export function switchRows(orgs: SwitchOrg[], currentId: string | null, path = "/dashboard"): SwitchRow[] {
  const seen = new Set<string>();
  const rows: SwitchRow[] = [];
  for (const o of orgs) {
    if (!o?.id || seen.has(o.id)) continue;
    seen.add(o.id);
    const origin = orgOrigin(o.slug);
    rows.push({ id: o.id, name: o.name?.trim() || "Unnamed company", role: roleLabel(o.role), href: origin ? `${origin}${path}` : null, current: o.id === currentId });
  }
  return rows.sort((a, b) => (a.current === b.current ? a.name.localeCompare(b.name) : a.current ? -1 : 1));
}
