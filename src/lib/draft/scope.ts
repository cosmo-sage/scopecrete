/**
 * Job → draft budget for any kind of work (Coy, 2026-10-11: "It needs to be
 * able to draft any type of budget from the scope. It starts with the scope of
 * work then drafts a budget from costs associated with that"). Pure;
 * tests/draft-scope.test.mjs.
 *
 * The driveway recipe is a fixed checklist; most jobs aren't driveways. Here
 * the checklist IS the job's own scope: one step per section (its name, its
 * scope-of-work bullets, the bid's line), plus mobilization for the whole job.
 * A step is covered when the section has cost items, left off with Coy's
 * reason, or open. An open section looks for Coy's own Price book items whose
 * name shares the scope's words — his price, never an invented one. One clear,
 * priced match per phrase goes on a fresh draft by itself; anything less is a
 * choice for him, and nothing at all is "Make it".
 */

import type { StepState } from "./recipe.ts";
import type { ItemPick, PriceItem, StepPicks } from "./fill.ts";
import { sowLines } from "../scope-of-work.ts";

export interface ScopeSection {
  id: string;
  name: string | null;
  prep_notes?: string | null;
  source_ref?: string | null;
  sort_order?: number | null;
}

export interface ScopeLine { id: string; section_id: string | null; name: string; group_name?: string | null; cost_type?: string; qty_rule?: string }

export const SECTION_STEP = "s:";
export const isSectionStep = (k: string) => k.startsWith(SECTION_STEP);
export const sectionOfStep = (k: string) => (isSectionStep(k) ? k.slice(SECTION_STEP.length) : null);

const MOBILIZE = /mobiliz|delivery|\btrip\b|short ?load|travel|minimum/i;

/** The job's scope as steps, held against the budget's lines. */
export function scopeSteps(sections: ScopeSection[], lines: ScopeLine[], exclusions: Record<string, string>): StepState[] {
  const sorted = [...sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const steps: Array<{ key: string; label: string; ids: string[] }> = sorted.map((s) => ({
    key: SECTION_STEP + s.id, label: s.name?.trim() || "Section",
    ids: lines.filter((l) => l.section_id === s.id).map((l) => l.id),
  }));
  steps.push({ key: "mobilization", label: "Mobilization, delivery or trip charge",
    ids: lines.filter((l) => MOBILIZE.test(`${l.name} ${l.group_name ?? ""}`)).map((l) => l.id) });
  return steps.map((s) => s.ids.length
    ? { key: s.key, label: s.label, state: "covered" as const, line_ids: s.ids, reason: null, by: null }
    : exclusions[s.key]
      ? { key: s.key, label: s.label, state: "excluded" as const, line_ids: [], reason: exclusions[s.key], by: "coy" as const }
      : { key: s.key, label: s.label, state: "open" as const, line_ids: [], reason: null, by: null });
}

// ------------------------------------------------------------------ words

const STOP = new Set(("the and for with from per each all any new old this that into onto over under per job site work area areas section sections " +
  "install installed installation provide furnish place placed placing including include includes inc remove existing " +
  "shall will per plan plans sheet spec specs item items see note notes lump sum total qty unit units ea sf sy lf cy psi " +
  "inch inches feet foot thick wide long deep min max approx approximately typical typ").split(" "));

const stem = (w: string) => w.replace(/ies$/, "y").replace(/(s|x|z|ch|sh)es$/, "$1").replace(/([^s])s$/, "$1").replace(/(ing|ed)$/, "");

/** The meaningful words of a phrase, stemmed. "Curb & gutter removal" → curb, gutter, removal. */
export function scopeWords(t: string): string[] {
  const out = new Set<string>();
  for (const raw of t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    const s = stem(raw);
    if (s.length >= 3 && !STOP.has(s)) out.add(s);
  }
  return [...out];
}

/** What a section says it is: its name, each scope bullet, the bid's line — one phrase each. */
export function sectionPhrases(s: ScopeSection): string[] {
  const out: string[] = [];
  if (s.name?.trim()) out.push(s.name.trim());
  out.push(...sowLines(s.prep_notes ?? null));
  const bid = (s.source_ref ?? "").replace(/^Draft from[^:]*:\s*/i, "").replace(/[“”"]/g, "").trim();
  if (bid && !/^draft from/i.test(s.source_ref ?? "")) out.push(bid);
  return [...new Set(out)].slice(0, 30);
}

const pick = (i: PriceItem, covers: string[]): ItemPick =>
  ({ id: i.id, name: i.name, unit: i.unit, unit_cost: i.unit_cost, group_name: i.group_name, used: i.used, covers });

/** How well an item's name (and group, weaker) matches a phrase's words. */
export function matchScore(phrase: string[], item: Pick<PriceItem, "name" | "group_name">): number {
  if (!phrase.length) return 0;
  const own = scopeWords(item.name);
  const grp = scopeWords(item.group_name ?? "");
  let n = 0;
  for (const w of own) if (phrase.includes(w)) n += 2;
  for (const w of grp) if (phrase.includes(w) && !own.includes(w)) n += 1;
  return n;
}

/** Coy's items for one phrase, best first; at least one word of the item's own name must match. */
export function itemsForPhrase(phrase: string, items: PriceItem[]): Array<{ item: PriceItem; score: number }> {
  const w = scopeWords(phrase);
  return items.map((item) => ({ item, score: matchScore(w, item) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || b.item.used - a.item.used || Number(b.item.unit_cost !== null) - Number(a.item.unit_cost !== null) || a.item.name.localeCompare(b.item.name));
}

/**
 * One section's verdict. Each phrase whose best match is priced and clearly
 * ahead (a higher score, or the same score and used more) is an "auto" item;
 * the rest are offered. auto when at least one phrase was clear.
 */
export function sectionVerdict(stepKey: string, s: ScopeSection, items: PriceItem[], max = 6): StepPicks & { auto: ItemPick[] } {
  const auto = new Map<string, ItemPick>();
  const offered = new Map<string, { p: ItemPick; score: number }>();
  for (const ph of sectionPhrases(s)) {
    const c = itemsForPhrase(ph, items);
    if (!c.length) continue;
    const [top, next] = c;
    const clear = top.item.unit_cost !== null && (!next || top.score > next.score || (top.score === next.score && top.item.used > next.item.used));
    if (clear) auto.set(top.item.id, pick(top.item, [stepKey]));
    for (const x of c.slice(0, 3)) {
      const was = offered.get(x.item.id);
      if (!was || was.score < x.score) offered.set(x.item.id, { p: pick(x.item, [stepKey]), score: x.score });
    }
  }
  const picks = [...auto.values(), ...[...offered.values()].filter((o) => !auto.has(o.p.id)).sort((a, b) => b.score - a.score).map((o) => o.p)].slice(0, max);
  return { key: stepKey, verdict: auto.size ? "auto" : picks.length ? "choose" : "none", picks, auto: [...auto.values()] };
}

/** The panel's choices for each open scope step. */
export function scopePicks(steps: StepState[], sections: ScopeSection[], items: PriceItem[],
  wholeJob: (step: string, items: PriceItem[]) => StepPicks): Record<string, StepPicks> {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const out: Record<string, StepPicks> = {};
  for (const st of steps) {
    if (st.state !== "open") continue;
    const sid = sectionOfStep(st.key);
    if (!sid) { out[st.key] = wholeJob(st.key, items); continue; }
    const s = byId.get(sid);
    if (s) { const v = sectionVerdict(st.key, s, items); out[st.key] = { key: v.key, verdict: v.verdict, picks: v.picks }; }
  }
  return out;
}
