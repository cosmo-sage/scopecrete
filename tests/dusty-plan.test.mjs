// Dusty's budget plans (src/lib/dusty/plan.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlan, cleanAction, describe } from "../src/lib/dusty/plan.ts";

const answer = `Here's the walk and the drive.

\`\`\`scopecrete-plan
[{"do":"add","item":"3F2A91C0","area":"bc237d33"},
 {"do":"add","item":"3f2a91c0","area":"job","qty":8},
 {"do":"new_item","name":"Detectable warning panel","unit":"EA","cost_type":"material","unit_cost":null,"qty_rule":"manual","group":"Sidewalk","area":"535310a1","qty":8},
 {"do":"update_item","item":"aaaaaaaa","unit_cost":18.5},
 {"do":"new_group","name":"Sidewalk","cost_type":"labor"},
 {"do":"add","item":"not-a-ref","area":"bc237d33"},
 {"do":"rm -rf"}]
\`\`\`
`;

test("a plan rides at the end of an answer and is taken off what's shown", () => {
  const p = parsePlan(answer);
  assert.equal(p.shown, "Here's the walk and the drive.");
  assert.equal(p.actions.length, 5);
  assert.equal(p.dropped, 2, "a made-up ref and an unknown step are dropped, not run");
  assert.deepEqual(p.actions[0], { do: "add", item: "3f2a91c0", area: "bc237d33", qty: null });
  assert.equal(p.actions[1].area, null, "job = the whole job");
  assert.equal(p.actions[2].unit_cost, null, "no cost stays no cost");
});

test("an answer without a plan is left alone; a broken one shows nothing to apply", () => {
  assert.deepEqual(parsePlan("Just words."), { shown: "Just words.", actions: [], dropped: 0 });
  const bad = parsePlan("Words\n```scopecrete-plan\n[{oops\n```");
  assert.equal(bad.shown, "Words"); assert.equal(bad.actions.length, 0); assert.equal(bad.dropped, 1);
});

test("nothing odd gets through", () => {
  assert.equal(cleanAction({ do: "update_item", item: "aaaaaaaa" }), null, "a change that changes nothing");
  assert.equal(cleanAction({ do: "update_item", item: "aaaaaaaa", unit_cost: -4 }), null);
  assert.equal(cleanAction({ do: "new_item", name: "X", unit: "SY", cost_type: "magic", qty_rule: "manual" }), null);
  assert.equal(cleanAction({ do: "add", item: "aaaaaaaa", area: "../etc" }), null);
});

test("steps read in plain words", () => {
  const names = { item: (r) => (r === "3f2a91c0" ? "Walk labor" : null), area: (r) => (r ? "Concrete Walk" : "the whole job") };
  const p = parsePlan(answer);
  assert.equal(describe(p.actions[0], names), "Add Walk labor to Concrete Walk");
  assert.match(describe(p.actions[2], names), /New Price book item “Detectable warning panel” — EA, material, no cost yet, in Sidewalk → on Concrete Walk, qty 8/);
  assert.equal(describe(p.actions[3], names), "Change item aaaaaaaa (not found): unit cost $18.5");
});
