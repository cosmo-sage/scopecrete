import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeSteps, scopeWords, sectionVerdict, sectionPhrases } from "../src/lib/draft/scope.ts";
import { extract } from "../src/lib/draft/extract.ts";
import { outcomeOf } from "../src/lib/draft/recipe.ts";

const item = (id, name, unit_cost, used = 0, group_name = null) => ({ id, name, cost_type: "labor", qty_rule: "manual", unit: "LnFt", unit_cost, group_name, used });

test("a commercial job is drafted from its scope, not refused", () => {
  const x = extract([], "commercial", []);
  assert.equal(x.kind, "scope");
  assert.equal(outcomeOf(x), "ready_for_review");
});

test("scope words drop filler and stem", () => {
  assert.deepEqual(scopeWords("Remove existing curbs & trees"), ["curb", "tree"]);
});

test("a section's phrases: name, bullets, bid line; a heard size isn't one", () => {
  assert.deepEqual(sectionPhrases({ id: "a", name: "Curb removal", prep_notes: "• Saw cut curb\n• Haul off debris", source_ref: "C-2 · 120 LF curb and gutter" }),
    ["Curb removal", "Saw cut curb", "Haul off debris", "C-2 · 120 LF curb and gutter"]);
  assert.deepEqual(sectionPhrases({ id: "a", name: "Slab", source_ref: "Draft from customer, 2026-10-01: “30 by 40”" }), ["Slab"]);
});

test("each phrase takes Coy's clear priced match; toss-ups are offered", () => {
  const items = [item("1", "Curb removal", 4, 3), item("2", "Tree removal", 250, 1), item("3", "Haul off", null), item("4", "Driveway forming", 2)];
  const v = sectionVerdict("s:a", { id: "a", name: "Curb and tree removal", prep_notes: "Remove 2 trees\nHaul off debris" }, items);
  assert.equal(v.verdict, "auto");
  assert.deepEqual(v.auto.map((p) => p.id).sort(), ["1", "2"]);
  assert.ok(v.picks.some((p) => p.id === "3"), "unpriced haul-off offered, not auto");
  assert.ok(!v.picks.some((p) => p.id === "4"));
});

test("nothing matching is Make it", () => {
  assert.equal(sectionVerdict("s:a", { id: "a", name: "Bollards" }, [item("1", "Curb removal", 4)]).verdict, "none");
});

test("steps: a section with items is covered, Coy's reason excludes, else open", () => {
  const st = scopeSteps([{ id: "a", name: "Curbs", sort_order: 1 }, { id: "b", name: "Trees", sort_order: 0 }],
    [{ id: "l1", section_id: "a", name: "Curb removal" }], { "s:b": "owner removes them" });
  assert.deepEqual(st.map((s) => [s.key, s.state]), [["s:b", "excluded"], ["s:a", "covered"], ["mobilization", "open"]]);
});
