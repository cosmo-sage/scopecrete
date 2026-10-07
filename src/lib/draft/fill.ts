/**
 * Job → draft budget, step 3: each open recipe step finds its items in Coy's
 * Price book (Coy, 2026-10-07: "intelligently find items in the budget for the
 * steps he outlined? And if he is unsure and/or needs to create the items, he
 * prompts me"). Pure; tests/draft-fill.test.mjs.
 *
 * Nothing here invents a price: a candidate is one of Coy's own items, at his
 * own price. One clear pick (priced, and used on his budgets more than any
 * other) goes onto a new draft by itself, the way an assembly would put it
 * there; a toss-up is a choice for Coy; nothing at all is a prompt to make the
 * item. And the job's own areas answer "how big" when they are measured.
 */

import { DRIVEWAY_STEPS, outcomeOf, stepsOf, type DraftOutcome, type StepState } from "./recipe.ts";
import type { AreaDraft, Extraction } from "./extract.ts";

export interface PriceItem {
  id: string;
  name: string;
  cost_type: string;
  qty_rule: string;
  unit: string | null;
  unit_cost: number | null;
  group_name: string | null;
  /** How many budget lines (any job) were made from it — Coy's habit. */
  used: number;
}

export interface ItemPick { id: string; name: string; unit: string | null; unit_cost: number | null; group_name: string | null; used: number; covers: string[] }

export interface StepPicks {
  key: string;
  /** auto: the one clear pick. choose: Coy picks. none: nothing in the Price book fits. */
  verdict: "auto" | "choose" | "none";
  picks: ItemPick[];
}

/** Steps whose items are for the whole job, not an area (a delivery fee, a day of a machine). */
export const WHOLE_JOB_STEPS = new Set(["mobilization", "equipment"]);

const asPick = (i: PriceItem): ItemPick => ({
  id: i.id, name: i.name, unit: i.unit, unit_cost: i.unit_cost, group_name: i.group_name, used: i.used,
  covers: stepsOf({ id: i.id, name: i.name, cost_type: i.cost_type, qty_rule: i.qty_rule, group_name: i.group_name }),
});

/** Coy's items that would cover a step, best first: his most used, then priced, then by name. */
export function candidatesFor(step: string, items: PriceItem[]): ItemPick[] {
  return items.map(asPick).filter((p) => p.covers.includes(step))
    .sort((a, b) => b.used - a.used || Number(b.unit_cost !== null) - Number(a.unit_cost !== null) || a.name.localeCompare(b.name));
}

/**
 * One step's verdict. "auto" only when the top item is priced and Coy has used
 * it more than any other candidate — or it is the only priced one and he has
 * used it. Anything less is his choice.
 */
export function verdictFor(step: string, items: PriceItem[], max = 4): StepPicks {
  const c = candidatesFor(step, items);
  if (!c.length) return { key: step, verdict: "none", picks: [] };
  const [top, next] = c;
  const priced = c.filter((p) => p.unit_cost !== null);
  const clear = top.unit_cost !== null && top.used > 0 && (!next || top.used > next.used || (priced.length === 1 && priced[0].id === top.id));
  return { key: step, verdict: clear ? "auto" : "choose", picks: c.slice(0, max) };
}

/**
 * Which items a fresh draft takes by itself for its open steps. An item that
 * covers two steps (Form up and Finish) is taken once and closes both.
 */
export function autoFill(open: string[], items: PriceItem[]): Array<{ step: string; item: ItemPick }> {
  const closed = new Set<string>();
  const out: Array<{ step: string; item: ItemPick }> = [];
  for (const s of DRIVEWAY_STEPS.map((x) => x.key)) {
    if (!open.includes(s) || closed.has(s)) continue;
    const v = verdictFor(s, items);
    if (v.verdict !== "auto") continue;
    const item = v.picks[0];
    out.push({ step: s, item });
    for (const k of item.covers) closed.add(k);
  }
  return out;
}

/** The panel's view: choices for every step still open. */
export function picksForOpen(steps: StepState[], items: PriceItem[]): Record<string, StepPicks> {
  const out: Record<string, StepPicks> = {};
  for (const s of steps) if (s.state === "open") out[s.key] = verdictFor(s.key, items);
  return out;
}

// ------------------------------------------------------------------ the job's own areas

export interface JobArea { id: string; name: string | null; work_type: string | null; length_ft: number | null; width_ft: number | null; sqft_override: number | null; depth_in: number | null; count_qty?: number | null }

const sqftOf = (s: JobArea) => (s.sqft_override ?? null) !== null ? Number(s.sqft_override)
  : s.length_ft !== null && s.width_ft !== null ? Number(s.length_ft) * Number(s.width_ft) : null;

/** The job's area a heard area stands for: the same kind, or the only one of each. */
export function areaFor(a: Pick<AreaDraft, "work_type">, heard: number, sections: JobArea[]): JobArea | null {
  return sections.find((s) => s.work_type === a.work_type) ?? (sections.length === 1 && heard === 1 ? sections[0] : null);
}

export interface OnJob { section_id: string; section: string; sqft: number | null; depth_in: number | null }

/**
 * A heard area with no size said, on a job whose area is already measured
 * (the Plan Room, or typed): the job's size answers it, so the question goes.
 * The heard facts are kept as they were; nothing is written.
 */
export function withJobAreas<X extends Pick<Extraction, "areas" | "questions">>(x: X, sections: JobArea[]):
  X & { areas: Array<AreaDraft & { on_job?: OnJob }> } {
  const drop = new Set<string>();
  const areas = x.areas.map((a) => {
    const s = areaFor(a, x.areas.length, sections);
    if (!s) return a;
    const sq = sqftOf(s);
    const depth = s.depth_in === null || s.depth_in === undefined ? null : Number(s.depth_in);
    if (sq !== null) drop.add(`${a.name}: how big is it? (length and width, or the square feet)`);
    if (depth !== null) drop.add(`${a.name}: how thick should the new concrete be?`);
    return { ...a, on_job: { section_id: s.id, section: s.name ?? a.name, sqft: sq, depth_in: depth } };
  });
  return { ...x, areas, questions: x.questions.filter((q) => !drop.has(q)) };
}

/** The outcome with the job's measured areas counted as said. */
export function outcomeOnJob(x: Omit<Extraction, "areas"> & { areas: Array<AreaDraft & { on_job?: OnJob }> }): DraftOutcome {
  return outcomeOf({ ...x, areas: x.areas.map((a) => a.on_job
    ? { ...a, sqft: a.sqft ?? a.on_job.sqft, depth_in: a.depth_in ?? a.on_job.depth_in } : a) });
}

/**
 * What a new Price book item for a step starts as when Coy has none ("make
 * it"): a name the recipe recognises, a unit that counts itself from the area,
 * and his own price or none. Coy changes any of it before it is saved.
 */
export const STEP_NEW: Record<string, { name: string; unit: string; cost_type: string; qty_rule: string }> = {
  demo: { name: "Concrete tear-out", unit: "SqFt", cost_type: "labor", qty_rule: "per_sqft" },
  haul: { name: "Haul-off and dumping", unit: "SqFt", cost_type: "other", qty_rule: "per_sqft" },
  base: { name: "Base and grading", unit: "SqFt", cost_type: "material", qty_rule: "per_sqft" },
  forming: { name: "Forming", unit: "LnFt", cost_type: "labor", qty_rule: "per_lf_perimeter" },
  reinforcement: { name: "Wire mesh", unit: "SqFt", cost_type: "material", qty_rule: "per_sqft" },
  concrete: { name: "Ready mix concrete", unit: "CuYd", cost_type: "material", qty_rule: "per_cy" },
  finishing: { name: "Place and finish labor", unit: "SqFt", cost_type: "labor", qty_rule: "per_sqft" },
  equipment: { name: "Equipment rental", unit: "Days", cost_type: "equipment", qty_rule: "per_day" },
  mobilization: { name: "Mobilization", unit: "Lump Sum", cost_type: "other", qty_rule: "per_job" },
};
