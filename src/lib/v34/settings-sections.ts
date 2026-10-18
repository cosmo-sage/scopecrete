/**
 * Settings, a page of its own (Coy, 2026-10-10: "its own dedicated full-screen
 * page with sub-pages for different categories of settings"). One list the
 * Settings page's category column, the phone's category list and the access
 * check read. Pure — tested in tests/settings-sections.test.mjs.
 *
 * `field`: an onsite estimator (081) sees it too. They saw only their own
 * details, Switch company, Install the app, Appearance and Sign out before.
 */

export interface SettingsSection { k: string; label: string; note: string; href: string; field?: boolean }

export const SETTINGS_HOME = "/dashboard/settings";

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { k: "account", label: "Account", note: "Your name, phone and email · switch company · sign out", href: `${SETTINGS_HOME}/account`, field: true },
  { k: "organization", label: "Organization", note: "Name, logo, office and radius · people, invites and permissions", href: `${SETTINGS_HOME}/organization` },
  { k: "lines", label: "Lines", note: "Your numbers, what runs them, and whether each is talking to the app", href: `${SETTINGS_HOME}/lines` },
  { k: "cost-book", label: "Cost book", note: "Margin, O.H., day minimum and parish tax · project types · importing prices", href: `${SETTINGS_HOME}/cost-book` },
  { k: "templates", label: "Templates", note: "Your contracts and warranties for proposals · edit them with Dusty", href: `${SETTINGS_HOME}/templates` },
  { k: "appearance", label: "Appearance", note: "The color scheme — some change the typeface too", href: `${SETTINGS_HOME}/appearance`, field: true },
  { k: "maps", label: "Maps", note: "Google Maps or Mapbox on the Map page", href: `${SETTINGS_HOME}/maps` },
  { k: "ai", label: "AI", note: "Dusty's thought line, on a phone and on a desktop", href: `${SETTINGS_HOME}/ai` },
  { k: "logs", label: "Logs", note: "What happened behind the scenes — calls, texts and webhooks as they arrived, Dusty's reads, price changes", href: `${SETTINGS_HOME}/logs` },
  { k: "roadmap", label: "Roadmap", note: "Send feedback, vote on what's next, see what's being built", href: `${SETTINGS_HOME}/roadmap`, field: true },
  { k: "menus", label: "Menus", note: "The order of your pages, the phone footer, and the icons' colors", href: `${SETTINGS_HOME}/menus` },
];

/** The sections someone may open: an onsite estimator only the `field` ones. */
export function settingsSections(limited: boolean): SettingsSection[] {
  return limited ? SETTINGS_SECTIONS.filter((s) => s.field) : SETTINGS_SECTIONS;
}

/** The section a path is on — "" for the Settings page itself, null when it isn't Settings. */
export function settingsSectionOf(path: string): string | null {
  const p = path.replace(/\/+$/, "");
  if (p === SETTINGS_HOME) return "";
  if (!p.startsWith(`${SETTINGS_HOME}/`)) return null;
  const k = p.slice(SETTINGS_HOME.length + 1).split("/")[0];
  return SETTINGS_SECTIONS.some((s) => s.k === k) ? k : null;
}
