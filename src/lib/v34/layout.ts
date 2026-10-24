/**
 * The org's layout, shared with every internal user (migration 114; Coy, 2026-10-21: "The
 * Organization work space is shared by default for all internal users … but it's also
 * customizable per user"). The layout keys a person hasn't set themselves come from the org's;
 * one they set is theirs. Tested in tests/layout.test.mjs.
 */
export const LAYOUT_KEYS = ["shelves", "spaces_pins", "spaces_rail", "spaces_collections", "spaces_col_members", "spaces_col_shelves", "space_layouts", "email_templates"] as const;

export const isLayoutKey = (k: string): boolean => (LAYOUT_KEYS as readonly string[]).includes(k);

/** A person's prefs with the org's layout under them, key by key; their own value always wins. */
export function withOrgLayout(mine: Record<string, unknown>, org: Record<string, unknown> | null): Record<string, unknown> {
  if (!org) return mine;
  const out = { ...mine };
  for (const k of LAYOUT_KEYS) if (!(k in out) && k in org) out[k] = org[k];
  return out;
}
