// Bid requests started from budget cost items or by Dusty (2026-10-24) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickFromSeed, seedEmpty, seedCount } from "../src/lib/bids.ts";
import { cleanAction, describe, RECORD_STEPS, RECORD_RULES } from "../src/lib/dusty/plan.ts";

const scopes = [
  { key: "aaaa1111-0000-0000-0000-000000000001", title: "Driveway", size: null, measure: { sf: 600, lf: null, count: null, count_unit: null, depth_in: 4, concrete: true },
    lines: [
      { id: "l1", name: "Form & finish", unit: "SF", qty: 600, cost_type: "labor", item_id: "c1c1c1c1-0000-0000-0000-000000000000" },
      { id: "l2", name: "3000 psi", unit: "CY", qty: 8, cost_type: "material", item_id: "c2c2c2c2-0000-0000-0000-000000000000" },
    ] },
  { key: "bbbb2222-0000-0000-0000-000000000002", title: "Patio", size: null, measure: { sf: 200, lf: null, count: null, count_unit: null, depth_in: 4, concrete: true },
    lines: [{ id: "l3", name: "Form & finish", unit: "SF", qty: 200, cost_type: "labor", item_id: "c1c1c1c1-0000-0000-0000-000000000000" }] },
  { key: "job", title: "Whole job", size: null, lines: [{ id: "l4", name: "Pump day", unit: "Day", qty: 1, cost_type: "equipment", item_id: null }] },
];

test("a cost item's panel ticks that line alone, and its section", () => {
  const p = pickFromSeed(scopes, { lines: ["l2"] });
  assert.deepEqual(p.lines, { l1: false, l2: true, l3: false, l4: false });
  assert.equal(p.scopes[scopes[0].key], true);
  assert.equal(p.scopes[scopes[1].key], false);
  assert.equal(p.scopes.job, false);
  assert.equal(seedCount(p), 1);
});

test("a group's lines", () => {
  const p = pickFromSeed(scopes, { lines: ["l1", "l3"] });
  assert.equal(seedCount(p), 2);
  assert.equal(p.scopes[scopes[1].key], true);
});

test("Dusty's items pick every line of that Price book item", () => {
  const p = pickFromSeed(scopes, { items: ["c1c1c1c1"] });
  assert.deepEqual(p.lines, { l1: true, l2: false, l3: true, l4: false });
});

test("sections and cost types", () => {
  const p = pickFromSeed(scopes, { sections: ["aaaa1111"], groups: ["labor"] });
  assert.deepEqual(p.lines, { l1: true, l2: false, l3: false, l4: false });
  const all = pickFromSeed(scopes, { groups: ["labor"] });
  assert.equal(seedCount(all), 2);
  const sec = pickFromSeed(scopes, { sections: ["bbbb2222"] });
  assert.deepEqual(sec.lines, { l1: false, l2: false, l3: true, l4: false });
  assert.equal(pickFromSeed(scopes, { sections: ["job"] }).lines.l4, true);
});

test("an empty seed is no seed", () => {
  assert.equal(seedEmpty(null), true);
  assert.equal(seedEmpty({ lines: [], groups: [] }), true);
  assert.equal(seedEmpty({ lines: ["l1"] }), false);
});

test("Dusty's bid_request step", () => {
  const job = "11111111-2222-3333-4444-555555555555", v = "66666666-7777-8888-9999-000000000000";
  const a = cleanAction({ do: "bid_request", job, areas: ["AAAA1111", "nope"], groups: ["Labor", "materials", "dirt"], items: [], vendors: [v, "Luis"] });
  assert.deepEqual(a, { do: "bid_request", job, areas: ["aaaa1111"], groups: ["labor", "materials"], items: [], vendors: [v] });
  assert.equal(cleanAction({ do: "bid_request", job: "this job" }), null);
  assert.ok(RECORD_STEPS.has("bid_request"));
  assert.match(describe(a), /you pick who and tap Send/);
  assert.match(describe({ do: "bid_request", job, areas: [], groups: [], items: [], vendors: [] }), /the whole budget/);
  assert.match(RECORD_RULES, /bid_request/);
});
