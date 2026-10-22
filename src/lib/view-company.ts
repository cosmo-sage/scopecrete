/**
 * View company (migration 121; Coy, 2026-10-22: "I want a view company button in Admin").
 *
 * A ScopeCrete admin opens another company's app read only. The cookie names the company; every
 * server client then sends it as the x-sc-view-org header, and the database answers
 * get_user_org_ids() with that company alone — only for an admin with an open view of it
 * (sc_admin_view_start, audited) and only inside a READ ONLY transaction, so no insert, update
 * or delete can reach it whatever the app does. getApiSession also refuses every write but
 * ending the view (viewWriteBlocked). Pure — tested in tests/view-company.test.mjs.
 */
export const VIEW_COMPANY_COOKIE = "sc_view_company";
/** The header the database reads (121's get_user_org_ids). */
export const VIEW_COMPANY_HEADER = "x-sc-view-org";
/** Eight hours, as the database's own expiry. */
export const VIEW_COMPANY_MAX_AGE = 60 * 60 * 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The company id in the cookie, or null. */
export function readViewCompany(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return UUID.test(s) ? s.toLowerCase() : null;
}

/** The one write allowed while viewing: ending the view. */
const OPEN = ["/api/admin/view"];

export function viewWriteBlocked(method: string, path: string, viewing: boolean): boolean {
  if (!viewing) return false;
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  const p = path.replace(/\/+$/, "");
  return !OPEN.some((o) => p === o || p.startsWith(`${o}/`));
}

/** The banner's words: "Viewing Gulfline Paving · read only · until 4:18 PM". */
export function viewCompanyLine(name: string | null, expiresAt: string | null): string {
  const who = name?.trim() || "a company";
  const t = expiresAt ? new Date(expiresAt) : null;
  const until = t && !Number.isNaN(t.getTime())
    ? ` · until ${t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}`
    : "";
  return `Viewing ${who} · read only${until}`;
}
