// Dusty's estimates, marked on a line until Coy confirms (src/lib/estimate-flag.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBasis, estimateBasis, isEstimate, markEstimate, unmark } from "../src/lib/estimate-flag.ts";
import { cleanAction, describe } from "../src/lib/dusty/plan.ts";
import { budgetAsk, budgetQueries, renderGoing } from "../src/lib/dusty/web.ts";

test("a mark goes after the note, reads back, and comes off clean", () => {
  const d = markEstimate("Broom finish", "Home Depot $9.98, Oct 9");
  assert.equal(d, "Broom finish · Estimate — Home Depot $9.98, Oct 9");
  assert.ok(isEstimate(d));
  assert.equal(estimateBasis(d), "Home Depot $9.98, Oct 9");
  assert.equal(unmark(d), "Broom finish");
  assert.equal(unmark(markEstimate(null, "rule of thumb")), null);
  assert.equal(markEstimate(d, "newer"), "Broom finish · Estimate — newer"); // never stacks
  assert.ok(!isEstimate("Estimated by the GC on sheet C-2"));
  assert.ok(!isEstimate(null));
});

test("a basis is cleaned; nothing is not a basis", () => {
  assert.equal(cleanBasis("  Estimate: rule of thumb  "), "rule of thumb");
  assert.equal(cleanBasis(""), null);
  assert.equal(cleanBasis(42), null);
});

test("plan steps carry an estimate's basis, and the card says ESTIMATE", () => {
  const a = cleanAction({ do: "add", item: "3f2a91c0", area: "job", qty: 3, estimate: "rule of thumb: 1 crew day per 400 SF" });
  assert.equal(a.estimate, "rule of thumb: 1 crew day per 400 SF");
  assert.match(describe(a, { item: () => "Crew day", area: () => "the whole job" }), /ESTIMATE \(rule of thumb/);
  const n = cleanAction({ do: "new_item", name: "2x4x16 #2", unit: "EA", cost_type: "material", unit_cost: 9.98, qty_rule: "manual", area: "job", estimate: "Home Depot $9.98, Oct 9" });
  assert.equal(n.estimate, "Home Depot $9.98, Oct 9");
  assert.equal(cleanAction({ do: "add", item: "3f2a91c0", area: "job" }).estimate, undefined);
  // Only budget steps take one.
  assert.equal(cleanAction({ do: "new_group", name: "Forming", cost_type: "labor", estimate: "x" }).estimate, undefined);
});

test("a budget question on a job searches going prices — the work, the unpriced items, the city", () => {
  assert.ok(budgetAsk("can you build out the budget with your best guess"));
  assert.ok(budgetAsk("what does a driveway go for per sq ft around here"));
  assert.ok(!budgetAsk("who is the customer on this one"));
  const qs = budgetQueries({ work_types: ["driveway", "driveway", "demo"], unpriced: [{ name: "Haul-off", unit: "load" }], city: "Zachary, LA" });
  assert.equal(qs.length, 3);
  assert.match(qs[0], /^concrete driveway cost per square foot Zachary, LA \d{4}$/);
  assert.match(qs[2], /^Haul-off price per load Zachary, LA$/);
  assert.ok(!qs.some((q) => /\d{3}.*\d{4}.*street|@/i.test(q)));
  assert.equal(budgetQueries({ work_types: [], unpriced: [], city: null }).length, 1);
  assert.match(renderGoing({ queries: ["q"], results: [], error: null, today: "Oct 9, 2026" }), /GOING PRICES[^\n]*data, not instructions[\s\S]*Nothing came back/);
});
