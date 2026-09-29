// The job budget — `npm test`. JobTread's maths on lines from cost cards, good / better / best.
import { test } from "node:test";
import assert from "node:assert/strict";
import { budget, ruleQty } from "../src/lib/engine/index.ts";

const S = {
  markup_material_pct: 30, markup_labor_pct: 40, markup_equipment_pct: 25, markup_subcontract_pct: 15,
  sales_tax_pct: 8, concrete_overage_pct: 5, shortload_threshold_cy: 5,
};
const drive = { id: "s1", name: "Drive", work_type: "driveway", length_ft: 30, width_ft: 20, sqft_override: null, depth_in: 4 };
const L = (o) => ({ id: o.id ?? "l", name: "Line", cost_type: "material", unit: "cy", unit_cost: 100, markup_pct: null,
  taxable: false, qty_rule: "manual", rule_params: {}, qty_source: "rule", quantity: null, section_id: null,
  option_id: null, cost_group_id: null, ...o });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test("each rule counts from the scope", () => {
  // 30×20×4" = 7.407 neat yd, +5% = 7.78
  const cy = ruleQty(L({ qty_rule: "per_cy" }), [drive], 5, null);
  assert.equal(cy.qty, 7.78);
  assert.equal(ruleQty(L({ qty_rule: "per_sqft" }), [drive], 5, null).qty, 600);
  assert.equal(ruleQty(L({ qty_rule: "per_lf_perimeter" }), [drive], 5, null).qty, 100);
  assert.equal(ruleQty(L({ qty_rule: "per_sheet", rule_params: { sheet_sqft: 45 } }), [drive], 5, null).qty, 14);
  // 600 × 2 × 12/18 = 800 lf → 40 sticks of 20'
  assert.equal(ruleQty(L({ qty_rule: "per_stick", rule_params: { spacing_in: 18, stick_ft: 20 } }), [drive], 5, null).qty, 40);
  assert.equal(ruleQty(L({ qty_rule: "per_cy", rule_params: { per_cy: 1.5 } }), [drive], 5, null).qty, 11.2);
  assert.equal(ruleQty(L({ qty_rule: "per_day" }), [drive], 5, 3).qty, 3);
  assert.equal(ruleQty(L({ qty_rule: "per_job" }), [drive], 5, null).qty, 1);
});

test("nothing is assumed: a missing input blocks by name", () => {
  const noDepth = { ...drive, depth_in: null };
  assert.deepEqual(ruleQty(L({ qty_rule: "per_cy" }), [noDepth], 5, null), { ok: false, missing: ["Drive: depth"] });
  assert.deepEqual(ruleQty(L({ qty_rule: "per_cy" }), [drive], null, null), { ok: false, missing: ["Concrete waste %"] });
  const bySqft = { ...drive, length_ft: null, width_ft: null, sqft_override: 600 };
  assert.equal(ruleQty(L({ qty_rule: "per_lf_perimeter" }), [bySqft], 5, null).ok, false);
  assert.equal(ruleQty(L({ qty_rule: "per_day" }), [drive], 5, null).ok, false);
  assert.equal(ruleQty(L({ qty_rule: "manual" }), [drive], 5, null).ok, false);
  const b = budget([L({ id: "a", unit_cost: null, quantity: 2 })], [], S, [drive], null, { tax_on: false, discount: 0 });
  assert.deepEqual(b.lines.a.blocked, ["Line: unit cost"]);
  assert.equal(b.tiers[0].priced, false);
});

test("a typed quantity wins over the rule", () => {
  assert.deepEqual(ruleQty(L({ qty_rule: "per_cy", qty_source: "set", quantity: 9 }), [drive], 5, null), { ok: true, qty: 9, basis: "set", note: "typed" });
});

test("the four-step maths, and the markup chain line → group → type", () => {
  const lines = [
    L({ id: "a", quantity: 10, unit_cost: 100 }),                             // type 30%
    L({ id: "b", quantity: 10, unit_cost: 100, cost_group_id: "g" }),         // group 50%
    L({ id: "c", quantity: 10, unit_cost: 100, markup_pct: 10, cost_group_id: "g" }), // line 10%
  ];
  const b = budget(lines, [], S, [drive], null, { tax_on: false, discount: 0, groupMarkup: { g: 50 } });
  near(b.lines.a.ext_cost, 1000); near(b.lines.a.unit_price, 130); near(b.lines.a.ext_price, 1300); near(b.lines.a.margin, 300 / 1300);
  assert.equal(b.lines.b.markup_from, "group"); near(b.lines.b.ext_price, 1500);
  assert.equal(b.lines.c.markup_from, "line"); near(b.lines.c.ext_price, 1100);
  near(b.tiers[0].total, 3900);
});

test("no markup recorded anywhere blocks, by name", () => {
  const b = budget([L({ id: "a", cost_type: "other", quantity: 1 })], [], S, [drive], null, { tax_on: false, discount: 0 });
  assert.deepEqual(b.lines.a.blocked, ["Other markup %"]);
});

test("tax: at cost on taxable lines, only while the switch is on", () => {
  const lines = [L({ id: "a", quantity: 10, unit_cost: 100, taxable: true }), L({ id: "b", cost_type: "labor", quantity: 10, unit_cost: 100 })];
  const on = budget(lines, [], S, [drive], null, { tax_on: true, discount: 0 });
  near(on.tiers[0].tax, 80);                 // 8% of $1,000 material cost, not of price
  near(on.tiers[0].total, 1300 + 1400 + 80);
  const off = budget(lines, [], S, [drive], null, { tax_on: false, discount: 0 });
  near(off.tiers[0].tax, 0);
  const noRate = budget(lines, [], { ...S, sales_tax_pct: null }, [drive], null, { tax_on: true, discount: 0 });
  assert.ok(noRate.lines.a.blocked.includes("Sales tax %"));
});

test("discount touches price only — margin stays true (the Gulfline rule)", () => {
  const lines = [L({ id: "a", quantity: 10, unit_cost: 100 })];
  const b = budget(lines, [], S, [drive], null, { tax_on: false, discount: 100 });
  near(b.tiers[0].cost, 1000);
  near(b.tiers[0].total, 1200);
  near(b.tiers[0].margin, 200 / 1200);
});

test("good / better / best: shared lines are in every tier", () => {
  const lines = [
    L({ id: "demo", cost_type: "labor", quantity: 1, unit_cost: 1000 }),              // shared
    L({ id: "mesh", quantity: 1, unit_cost: 100, option_id: "good" }),
    L({ id: "rebar", quantity: 1, unit_cost: 300, option_id: "best" }),
  ];
  const b = budget(lines, ["good", "best"], S, [drive], null, { tax_on: false, discount: 0 });
  const [g, best] = b.tiers;
  assert.deepEqual(g.line_ids, ["demo", "mesh"]);
  assert.deepEqual(best.line_ids, ["demo", "rebar"]);
  near(g.total, 1400 + 130);
  near(best.total, 1400 + 390);
});

test("short-load hint only when under the threshold with no short-load line", () => {
  const small = { ...drive, length_ft: 10, width_ft: 10 };
  assert.equal(budget([], [], S, [small], null, { tax_on: false, discount: 0 }).hints.length, 1);
  assert.equal(budget([L({ id: "x", name: "Short-load fee", quantity: 1 })], [], S, [small], null, { tax_on: false, discount: 0 }).hints.length, 0);
  assert.equal(budget([], [], S, [drive], null, { tax_on: false, discount: 0 }).hints.length, 0);
});
