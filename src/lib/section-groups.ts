/**
 * The cost groups a budget section starts with (Coy, 2026-10-21: "Any time a budget section is
 * created it needs to default with cost groups: Labor, materials, equipment … a place to set the
 * default groups … this same grouping transposes directly into the job totals"). A section's lines
 * are grouped by their cost type — the same split Cost analysis totals the job by — and the
 * default groups show on every section even with nothing in them. Kept for the company
 * (`org_money_settings.section_groups`, migration 118), set in Settings → Cost book.
 */
import { COST_TYPES, type CostType } from "./cost-cards.ts";

export const DEFAULT_SECTION_GROUPS: CostType[] = ["labor", "material", "equipment"];

/** A saved list, cleaned: known cost types, once each, in its order; anything else is the default. */
export function sectionGroups(v: unknown): CostType[] {
  if (!Array.isArray(v)) return [...DEFAULT_SECTION_GROUPS];
  const out: CostType[] = [];
  for (const t of v) if ((COST_TYPES as readonly string[]).includes(t as string) && !out.includes(t as CostType)) out.push(t as CostType);
  return out;
}

/** The groups a section shows: the defaults first (empty or not), then any other type it has lines of. */
export function groupOrder(defaults: CostType[], present: string[]): CostType[] {
  const out = [...defaults];
  for (const t of COST_TYPES) if (!out.includes(t) && present.includes(t)) out.push(t);
  return out;
}
