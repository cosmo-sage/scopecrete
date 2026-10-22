/**
 * The menu's icon colours (Claude Design "Rail Icon Colors", Coy 2026-10-10).
 * Each page's icon may take one colour from the book. A saved colour is a ROLE
 * ("green"), never a hex, so it follows every theme: the role names the theme
 * variable it reads. "ink" is no colour. Saved on the account as
 * `user_preferences.prefs.menu_colors` ({ [pageKey]: role }); never saved means
 * the Suggested preset.
 */

export const ICON_BOOK = {
  ink: "--sc-rail-ink", hiviz: "--sc-hiviz", chalk: "--sc-chalk", green: "--sc-green", teal: "--sc-teal",
  violet: "--sc-violet", red: "--sc-red", reply: "--sc-work-dot-reply", unsorted: "--sc-bucket-unsorted",
} as const;
export type IconRole = keyof typeof ICON_BOOK;
export const ICON_ROLES = Object.keys(ICON_BOOK) as IconRole[];

export const BOOK_LABEL: Record<IconRole, string> = {
  ink: "Ink (none)", hiviz: "Accent", chalk: "Chalk blue", green: "Green", teal: "Teal",
  violet: "Violet", red: "Red", reply: "Amber", unsorted: "Unsorted orange",
};

export type MenuColors = Record<string, IconRole>;

export const BOOK_PRESETS: Record<string, MenuColors> = {
  Mono: {},
  Suggested: { dashboard: "hiviz", threads: "chalk", scopebuilder: "teal", scope: "green", map: "violet", camera: "reply", contacts: "chalk", customers: "green", pricebook: "reply", vendors: "unsorted", admin: "red", roadmap: "violet" },
  "By kind": { threads: "chalk", scopebuilder: "hiviz", scope: "hiviz", map: "hiviz", camera: "hiviz", contacts: "chalk", customers: "chalk", pricebook: "green", vendors: "green", admin: "red" },
};

/** A saved book made safe: only known roles on page-like keys; "ink" is dropped (it is the default).
 *  Nothing saved (null / not an object) is the Suggested preset. */
export function cleanMenuColors(v: unknown): MenuColors {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...BOOK_PRESETS.Suggested };
  const out: MenuColors = {};
  for (const [k, r] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z]{1,24}$/.test(k) || typeof r !== "string" || !(r in ICON_BOOK) || r === "ink") continue;
    out[k] = r as IconRole;
  }
  return out;
}

/** The CSS colour a role draws in. */
export const iconVar = (role?: IconRole) => `var(${ICON_BOOK[role ?? "ink"]})`;

/** Which preset the book matches, if any. */
export function presetOf(colors: MenuColors): string | null {
  const same = (a: MenuColors, b: MenuColors) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  };
  return Object.keys(BOOK_PRESETS).find((n) => same(colors, BOOK_PRESETS[n])) ?? null;
}
