// Draft budget step 3 — each open recipe step finds Coy's Price book items.
// Synthetic items and prices, not Coy's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoFill, verdictFor, withJobAreas, outcomeOnJob, STEP_NEW, picksForOpen } from "../src/lib/draft/fill.ts";
import { stepsOf } from "../src/lib/draft/recipe.ts";

const item = (id, name, o = {}) => ({ id, name, cost_type: "material", qty_rule: "manual", unit: "EA", unit_cost: 10, group_name: null, used: 0, ...o });
const book = [
  item("ff", "Form up and Finish", { cost_type: "labor", qty_rule: "per_sqft", unit: "SqFt", unit_cost: 1.43, used: 6 }),
  item("c3", "3000 PSI Concrete Mix", { qty_rule: "per_cy", unit: "CuYd", unit_cost: 150, used: 4 }),
  item("c4", "4000 PSI Concrete Mix", { qty_rule: "per_cy", unit: "CuYd", unit_cost: 160, used: 1 }),
  item("m1", "Wire mesh 6x6 W1.4", { used: 1 }),
  item("m2", "Wire mesh 6x6 W2.9", { used: 1 }),
  item("d1", "Demo and haul", { cost_type: "labor", unit_cost: null, used: 3 }),
];

test("a clear habit is taken; a toss-up is a choice; nothing is a prompt", () => {
  assert.equal(verdictFor("forming", book).verdict, "auto");
  assert.equal(verdictFor("concrete", book).verdict, "auto");
  assert.equal(verdictFor("concrete", book).picks[0].id, "c3");
  assert.equal(verdictFor("reinforcement", book).verdict, "choose");
  assert.equal(verdictFor("demo", book).verdict, "choose", "an unpriced item is never taken by itself");
  assert.equal(verdictFor("mobilization", book).verdict, "none");
});

test("an item covering two steps is taken once", () => {
  const got = autoFill(["forming", "finishing", "concrete", "reinforcement"], book);
  assert.deepEqual(got.map((g) => g.item.id), ["ff", "c3"]);
});

test("picks only for open steps", () => {
  const p = picksForOpen([{ key: "forming", state: "covered" }, { key: "base", state: "open" }], book);
  assert.deepEqual(Object.keys(p), ["base"]);
  assert.equal(p.base.verdict, "none");
});

test("the job's measured area answers how big and how thick", () => {
  const x = {
    kind: "driveway", conflicts: [], demo: null,
    areas: [{ key: "a", name: "Driveway", work_type: "driveway", length_ft: null, width_ft: null, sqft: null, depth_in: null, facts: [] }],
    questions: ["Driveway: how big is it? (length and width, or the square feet)", "Driveway: how thick should the new concrete be?", "Other"],
  };
  const sec = { id: "s1", name: "Front of Driveway", work_type: "slab", length_ft: null, width_ft: null, sqft_override: 894.1, depth_in: 4 };
  const y = withJobAreas(x, [sec]);
  assert.deepEqual(y.questions, ["Other"]);
  assert.equal(y.areas[0].on_job.sqft, 894.1);
  assert.equal(outcomeOnJob(y), "ready_for_review");
  assert.equal(withJobAreas(x, [sec, { ...sec, id: "s2" }]).questions.length, 3, "two areas of another kind: not guessed");
});

test("a new item for a step is one the recipe recognises", () => {
  for (const [k, d] of Object.entries(STEP_NEW))
    assert.ok(stepsOf({ id: "n", name: d.name, cost_type: d.cost_type, qty_rule: d.qty_rule }).includes(k), k);
});
