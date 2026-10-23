// Bid requests from the design handoff (2026-10-23) — `npm test`. Groups, what to send with a bid,
// the bids side by side, and a vendor's price into the budget's unit cost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOf, groupLines, groupState, cleanRequirements, shownScopes, compareBids, budgetUnitCost, lineExt } from "../src/lib/bids.ts";

test("a line's group follows its cost type", () => {
  assert.equal(groupOf("labor"), "labor");
  assert.equal(groupOf("material"), "materials");
  assert.equal(groupOf("equipment"), "equipment");
  assert.equal(groupOf("subcontract"), "other");
  assert.equal(groupOf(null), "other");
});

test("lines come back in Labor · Materials · Equipment · Other order; old ones in one unnamed group", () => {
  const g = groupLines([{ k: 1, group: "materials" }, { k: 2, group: "labor" }, { k: 3 }, { k: 4, group: "labor" }]);
  assert.deepEqual(g.map((x) => x.group), ["labor", "materials", "other"]);
  assert.deepEqual(g[0].lines.map((l) => l.k), [2, 4]);
  assert.deepEqual(groupLines([{ k: 1 }, { k: 2 }]).map((x) => x.group), [null]);
  assert.deepEqual(groupLines([]), []);
});

test("a group's tick is all, some or none", () => {
  const on = (k) => k === "a";
  assert.equal(groupState(["a"], on), "all");
  assert.equal(groupState(["a", "b"], on), "some");
  assert.equal(groupState(["b"], on), "none");
});

test("requirements are trimmed, 80 characters, 8 at most, no repeats", () => {
  assert.deepEqual(cleanRequirements([" W-9 ", "w-9", "", 4, "Insurance certificate"]), ["W-9", "Insurance certificate"]);
  assert.equal(cleanRequirements(Array.from({ length: 12 }, (_, i) => `R${i}`)).length, 8);
  assert.equal(cleanRequirements(["x".repeat(200)])[0].length, 80);
  assert.deepEqual(cleanRequirements(null), []);
});

const SCOPES = [
  { key: "a1", title: "Pour & finish", size: "1,200 SF", lines: [
    { id: "l1", name: "Concrete", unit: "CY", qty: 16, cost_type: "material" },
    { id: "l2", name: "Place, finish", unit: "SF", qty: 1200, cost_type: "labor" },
    { id: "l3", name: "Crew days", unit: "Days", qty: 2, cost_type: "labor" },
  ] },
];
const shown = shownScopes(SCOPES, { scopes: { a1: true }, lines: {}, supplied: { l1: true } });

test("the vendor's copy carries each line's group", () => {
  assert.deepEqual(shown[0].lines.map((l) => l.group), ["materials", "labor", "labor"]);
});

test("bids side by side: missing, low, section and whole totals, the cheapest complete", () => {
  const c = compareBids(shown, [
    { id: "a", name: "Ace", lines: [{ key: "l2", price: 2 }, { key: "l3", price: 800 }], total: null },
    { id: "b", name: "Bo", lines: [{ key: "l2", price: 1 }], total: null },
    { id: "c", name: "Cy", lines: null, total: 5000 },
    { id: "d", name: "Di", lines: [{ key: "l2", price: 2.2 }, { key: "l3", price: 900 }], total: null },
  ]);
  const s = c.sections[0];
  const finish = s.lines.find((l) => l.key === "l2");
  assert.equal(finish.cells[0].ext, 2400);
  assert.equal(finish.cells[1].low, true); // 1 < 0.6 × median(2, 2.2)
  assert.equal(finish.cells[0].low, false);
  const days = s.lines.find((l) => l.key === "l3");
  assert.equal(days.cells[0].ext, 800); // a time line is one price
  assert.equal(days.cells[1].missing, true);
  assert.equal(days.cells[2].missing, false); // one total: not by line
  assert.equal(s.lines.find((l) => l.key === "l1").cells[0].missing, false); // supplied
  assert.deepEqual(s.totals, [3200, 1200, null, 3540]);
  assert.deepEqual(s.full, [true, false, false, true]);
  assert.equal(s.low, 0);
  assert.deepEqual(c.totals, [3200, 1200, 5000, 3540]);
  assert.equal(c.low, 0); // Bo is cheaper but left a line out
});

test("a vendor's price into the budget's unit cost", () => {
  assert.equal(budgetUnitCost({ qty: 1200, unit: "SF" }, 2, 1150), 2);
  assert.equal(budgetUnitCost({ qty: null, unit: "Days" }, 800, 2), 400);
  assert.equal(budgetUnitCost({ qty: null, unit: "LS" }, 800, null), 800);
  assert.equal(lineExt({ qty: 3, unit: "EA" }, 10.005), 30.02);
});
