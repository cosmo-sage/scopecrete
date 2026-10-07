/**
 * Job → draft budget, step 2: the driveway replacement recipe — a checklist
 * of what such a job costs, held against the lines the job's budget really
 * has (Coy's own assembly and Price book items). Pure; tests/draft.test.mjs.
 *
 * The recipe prices nothing. Every step is either on the budget (covered by
 * named lines), left off with a reason (Coy's, or "new work — nothing to tear
 * out" from a quoted line), or open. An open step, a line the engine can't
 * price, or an area with no size means the total is partial, and the budget
 * can't be approved until each is dealt with.
 */

import type { Extraction } from "./extract.ts";

export const RECIPE_VERSION = "driveway-replacement-v1";

export interface RecipeStep {
  key: string;
  label: string;
  /** Not needed when the work is new (nothing to tear out). */
  demoOnly?: boolean;
}

export const DRIVEWAY_STEPS: RecipeStep[] = [
  { key: "demo", label: "Tear-out (demolition)", demoOnly: true },
  { key: "haul", label: "Loading, haul-off and dumping", demoOnly: true },
  { key: "base", label: "Base and grading", },
  { key: "forming", label: "Forming" },
  { key: "reinforcement", label: "Reinforcement (mesh, rebar or fiber)" },
  { key: "concrete", label: "Concrete" },
  { key: "finishing", label: "Placing and finishing labor" },
  { key: "equipment", label: "Equipment" },
  { key: "mobilization", label: "Delivery, short load or mobilization" },
];

/** What a budget line is, as far as the recipe can tell. */
export interface RecipeLine {
  id: string;
  name: string;
  cost_type: string;
  qty_rule: string;
  section_role?: string | null;
  group_name?: string | null;
}

/** Which recipe steps a line covers — by its own words, its group and how it is counted. */
export function stepsOf(l: RecipeLine): string[] {
  const t = `${l.name} ${l.group_name ?? ""}`.toLowerCase();
  const out = new Set<string>();
  if (/\bdemo|tear ?out|remov|break ?out|bust ?out|saw ?cut/.test(t)) out.add("demo");
  if (/haul|dump|disposal|debris|load ?out|tipping|roll ?off|dumpster/.test(t)) out.add("haul");
  if (/\bbase\b|gravel|limestone|crush|\bsand\b|grad(e|ing)|compact|\bfill\b|sub ?grade|\bprep\b/.test(t)) out.add("base");
  if (/\bform/.test(t)) out.add("forming");
  if (l.section_role === "reinforcement" || /mesh|rebar|fiber|fibre|wire|reinforc|dowel/.test(t)) out.add("reinforcement");
  // Concrete by the item's own name only: a group called "2800 Concrete" also holds the mesh.
  const own = l.name.toLowerCase();
  if ((l.qty_rule === "per_cy" && !/fiber|fibre/.test(own)) || (l.cost_type === "material" && /concrete|ready ?mix|\bpsi\b|\bmix\b/.test(own) && !/pump/.test(own))) out.add("concrete");
  if (l.cost_type === "labor" && /finish|plac|pour|\blabor\b|crew/.test(t)) out.add("finishing");
  if (/\bform (&|and|\+) finish|form.?up/.test(t)) { out.add("forming"); out.add("finishing"); }
  if (l.cost_type === "equipment" || /pump|bobcat|skid ?steer|excavat|rental|equipment|\bsaw\b/.test(t)) out.add("equipment");
  if (/mobiliz|delivery|\btrip\b|fuel|short ?load|travel|minimum/.test(t)) out.add("mobilization");
  return [...out];
}

export interface StepState {
  key: string;
  label: string;
  state: "covered" | "excluded" | "open";
  line_ids: string[];
  /** Why it was left off: Coy's words, or the quoted line that says the work is new. */
  reason: string | null;
  by: "coy" | "recipe" | null;
}

/**
 * The recipe against the budget. `exclusions` are Coy's ("no haul-off — he's
 * keeping the broken concrete"), saved on the draft run.
 */
export function checkRecipe(x: Pick<Extraction, "demo">, lines: RecipeLine[],
  exclusions: Record<string, string>): StepState[] {
  const covered = new Map<string, string[]>();
  for (const l of lines) for (const k of stepsOf(l)) covered.set(k, [...(covered.get(k) ?? []), l.id]);
  return DRIVEWAY_STEPS.map((s) => {
    const ids = covered.get(s.key) ?? [];
    if (ids.length) return { key: s.key, label: s.label, state: "covered", line_ids: ids, reason: null, by: null };
    if (exclusions[s.key]) return { key: s.key, label: s.label, state: "excluded", line_ids: [], reason: exclusions[s.key], by: "coy" };
    if (s.demoOnly && x.demo?.value === false) {
      return { key: s.key, label: s.label, state: "excluded", line_ids: [], reason: `new work — "${x.demo.quote}"`, by: "recipe" };
    }
    return { key: s.key, label: s.label, state: "open", line_ids: [], reason: null, by: null };
  });
}

export type DraftOutcome = "ready_for_review" | "needs_information" | "manual_review";

/** What a draft comes to, before prices: manual review, waiting on answers, or ready for Coy to look at. */
export function outcomeOf(x: Extraction): DraftOutcome {
  if (x.kind === "unsupported") return "manual_review";
  if (x.kind === "unknown" || x.conflicts.length) return "needs_information";
  const unsized = x.areas.some((a) => (a.length_ft === null || a.width_ft === null) && a.sqft === null);
  const thin = x.areas.some((a) => a.depth_in === null);
  return unsized || thin || !x.areas.length ? "needs_information" : "ready_for_review";
}

export const OUTCOME_LABEL: Record<DraftOutcome, string> = {
  ready_for_review: "Ready for your review",
  needs_information: "Needs information",
  manual_review: "Needs you — not a driveway job",
};

/**
 * Can Coy approve the budget now? Never while a line has no price, an area has
 * no size, or a recipe step is still open. Approving is internal: it saves a
 * copy and sends nothing.
 */
export function approvalBlocks(input: {
  steps: StepState[];
  blockedLines: Array<{ name: string; reasons: string[] }>;
  lineCount: number;
  manualReview: boolean;
}): string[] {
  const out: string[] = [];
  if (!input.lineCount) out.push("The budget has no lines yet.");
  for (const b of input.blockedLines) out.push(`${b.name} isn't priced: ${b.reasons.join("; ")}`);
  if (!input.manualReview) {
    for (const s of input.steps) if (s.state === "open") out.push(`${s.label}: add it from the Price book, or mark it not on this job.`);
  }
  return out;
}
