// The job budget — `npm test`. Lines from cost cards, priced Coy's way
// (migration 057): price = cost × (1 + O.H.) ÷ (1 − margin).
import { test } from "node:test";
import assert from "node:assert/strict";
import { budget, ruleQty, jobMinimum, quantities } from "../src/lib/engine/index.ts";

const S = { overhead_pct: 15, margin_pct: 20, tax_rate_pct: 10 };
const drive = { id: "s1", name: "Drive", work_type: "driveway", length_ft: 30, width_ft: 20, sqft_override: null, depth_in: 4 };
const L = (o) => ({ id: o.id ?? "l", name: "Line", cost_type: "material", unit: "cy", unit_cost: 100, margin_pct: null,
  taxable: false, qty_rule: "manual", rule_params: {}, qty_source: "rule", quantity: null, section_id: null,
  option_id: null, cost_group_id: null, ...o });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test("each rule counts from the scope; concrete waste is the card's", () => {
  // 30×20×4" = 7.407 neat yd, +5% = 7.78
  assert.equal(ruleQty(L({ qty_rule: "per_cy", rule_params: { waste_pct: 5 } }), [drive], null).qty, 7.78);
  assert.equal(ruleQty(L({ qty_rule: "per_cy", rule_params: { waste_pct: 0 } }), [drive], null).qty, 7.41);
  assert.equal(ruleQty(L({ qty_rule: "per_sqft" }), [drive], null).qty, 600);
  assert.equal(ruleQty(L({ qty_rule: "per_lf_perimeter" }), [drive], null).qty, 100);
  assert.equal(ruleQty(L({ qty_rule: "per_sheet", rule_params: { sheet_sqft: 45 } }), [drive], null).qty, 14);
  // 600 × 2 × 12/18 = 800 lf → 40 sticks of 20'
  assert.equal(ruleQty(L({ qty_rule: "per_stick", rule_params: { spacing_in: 18, stick_ft: 20 } }), [drive], null).qty, 40);
  assert.equal(ruleQty(L({ qty_rule: "per_cy", rule_params: { per_cy: 1.5 } }), [drive], null).qty, 11.2);
  assert.equal(ruleQty(L({ qty_rule: "per_day" }), [drive], 3).qty, 3);
  assert.equal(ruleQty(L({ qty_rule: "per_job" }), [drive], null).qty, 1);
});

test("nothing is assumed: a missing input blocks by name", () => {
  const noDepth = { ...drive, depth_in: null };
  assert.deepEqual(ruleQty(L({ qty_rule: "per_cy", rule_params: { waste_pct: 5 } }), [noDepth], null), { ok: false, missing: ["Drive: depth"] });
  // blank waste on the card is not 0
  assert.deepEqual(ruleQty(L({ qty_rule: "per_cy" }), [drive], null), { ok: false, missing: ["Line: waste % (on the card)"] });
  const bySqft = { ...drive, length_ft: null, width_ft: null, sqft_override: 600 };
  assert.equal(ruleQty(L({ qty_rule: "per_lf_perimeter" }), [bySqft], null).ok, false);
  assert.deepEqual(ruleQty(L({ qty_rule: "per_day" }), [drive], null), { ok: false, missing: ["Days on this job"] });
  assert.equal(ruleQty(L({ qty_rule: "manual" }), [drive], null).ok, false);
  const b = budget([L({ id: "a", unit_cost: null, quantity: 2 })], [], S, [drive], null, { tax_on: false, discount: 0 });
  assert.deepEqual(b.lines.a.blocked, ["Line: unit cost"]);
  assert.equal(b.tiers[0].priced, false);
});

test("a typed quantity wins over the rule", () => {
  assert.deepEqual(ruleQty(L({ qty_rule: "per_cy", qty_source: "set", quantity: 9 }), [drive], null), { ok: true, qty: 9, basis: "set", note: "typed" });
});

test("price = cost × (1 + O.H.) ÷ (1 − margin); a line's margin overrides the job's", () => {
  const b = budget([L({ id: "a", quantity: 10, unit_cost: 100 }), L({ id: "b", quantity: 10, unit_cost: 100, margin_pct: 50 })],
    [], S, [drive], null, { tax_on: false, discount: 0 });
  near(b.lines.a.ext_cost, 1000); near(b.lines.a.overhead, 150);
  near(b.lines.a.ext_price, 1150 / 0.8); near(b.lines.a.unit_price, 143.75);
  near(b.lines.a.margin, 0.2); assert.equal(b.lines.a.margin_from, "job");
  // catches markup-style maths: 1000 × 1.15 × 1.2 = 1380 is NOT a 20% margin
  assert.ok(Math.abs(b.lines.a.ext_price - 1380) > 1);
  assert.equal(b.lines.b.margin_from, "line"); near(b.lines.b.ext_price, 2300);
  const t = b.tiers[0];
  near(t.cost, 2000); near(t.overhead, 300); near(t.total, 1437.5 + 2300); near(t.profit, t.total - 2300);
});

test("no O.H. or margin recorded blocks, by name — never a default", () => {
  const b = budget([L({ id: "a", quantity: 1 })], [], { overhead_pct: null, margin_pct: null, tax_rate_pct: null }, [drive], null, { tax_on: false, discount: 0 });
  assert.ok(b.lines.a.blocked.some((x) => x.startsWith("O.H. %")));
  assert.ok(b.lines.a.blocked.some((x) => x.startsWith("Margin %")));
  assert.equal(b.lines.a.ext_price, null);
});

test("tax: at cost on taxable lines, at the job's rate, only while the switch is on", () => {
  const lines = [L({ id: "a", quantity: 10, unit_cost: 100, taxable: true }), L({ id: "b", cost_type: "labor", quantity: 10, unit_cost: 100 })];
  const on = budget(lines, [], S, [drive], null, { tax_on: true, discount: 0 });
  near(on.tiers[0].tax, 100);                 // 10% of $1,000 material cost, not of price
  near(on.tiers[0].total, 2 * 1437.5 + 100);
  near(on.tiers[0].margin, 0.2);             // tax is a pass-through: margin unchanged
  const off = budget(lines, [], S, [drive], null, { tax_on: false, discount: 0 });
  near(off.tiers[0].tax, 0);
  const noRate = budget(lines, [], { ...S, tax_rate_pct: null, tax_missing: "parish unknown" }, [drive], null, { tax_on: true, discount: 0 });
  assert.ok(noRate.lines.a.blocked.includes("Sales tax for this job (parish unknown)"));
  assert.equal(noRate.lines.b.blocked.length, 0);   // untaxed lines are not held up
});

test("discount touches price only — margin falls, cost stays true (the Gulfline rule)", () => {
  const b = budget([L({ id: "a", quantity: 10, unit_cost: 100 })], [], S, [drive], null, { tax_on: false, discount: 100 });
  near(b.tiers[0].cost, 1000);
  near(b.tiers[0].total, 1337.5);
  near(b.tiers[0].margin, (1337.5 - 1150) / 1337.5);
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
  near(g.total, (1100 * 1.15) / 0.8);
  near(best.total, (1300 * 1.15) / 0.8);
});

test("job minimum = day minimum × days; nothing assumed", () => {
  assert.deepEqual(jobMinimum(1800, 3), { ok: true, minimum: 5400, day_minimum: 1800, days: 3 });
  assert.deepEqual(jobMinimum(1800, null), { ok: false, blocked: ["Days on this job"] });
  assert.equal(jobMinimum(null, 2).ok, false);
});

test("government bid items: an area with no length or width, counted in square yards", () => {
  // Burgess Ave (DOTD): 706-01 Concrete Walk (4" thick) — 1,769.80 SY, entered as its area alone.
  const walk = { id: "w", name: "Concrete Walk", work_type: "sidewalk", length_ft: null, width_ft: null, sqft_override: 1769.8 * 9, depth_in: 4 };
  assert.equal(ruleQty(L({ qty_rule: "per_sqft", unit: "SY" }), [walk], null).qty, 1769.8);
  assert.equal(ruleQty(L({ qty_rule: "per_sqft", unit: "sq yd" }), [walk], null).note, "sq yd");
  near(ruleQty(L({ qty_rule: "per_sqft", unit: "sf" }), [walk], null).qty, 15928.2);
  // 15,928.2 sf × 4" = 196.65 neat yd
  assert.equal(ruleQty(L({ qty_rule: "per_cy", rule_params: { waste_pct: 0 } }), [walk], null).qty, 196.64);
  // A takeoff group in SF feeds an SY card.
  const t = { g: { name: "Walk", unit: "SF", qty: 900, cy: null, blocked: null } };
  assert.equal(ruleQty(L({ qty_rule: "from_takeoff", unit: "SY", takeoff_parameter_id: "g" }), [walk], null, t).qty, 100);
});

test("a section measured by count: an item priced per each takes the count", () => {
  // Burgess Ave NS-MSC-00080 Detectable Warning — 8 EA.
  const dw = { id: "d", name: "Detectable warning", work_type: "other", length_ft: null, width_ft: null, sqft_override: null, depth_in: null, count_qty: 8, count_unit: "EA" };
  const q = quantities(dw);
  assert.equal(q.concrete, false); assert.deepEqual(q.missing, []); assert.equal(q.count, 8);
  assert.deepEqual(ruleQty(L({ qty_rule: "manual", unit: "each", section_id: "d" }), [dw], null), { ok: true, qty: 8, basis: "rule", note: "8 EA on the area" });
  assert.equal(ruleQty(L({ qty_rule: "manual", unit: "EA", section_id: "d", qty_source: "set", quantity: 10 }), [dw], null).qty, 10, "a typed qty wins");
  assert.equal(ruleQty(L({ qty_rule: "manual", unit: "SY", section_id: "d" }), [dw], null).ok, false, "a different unit still needs its qty");
  assert.equal(ruleQty(L({ qty_rule: "per_job", unit: "EA", section_id: "d" }), [dw], null).qty, 1, "once per job stays once");
  const b = budget([L({ id: "x", qty_rule: "manual", unit: "EA", unit_cost: 120, section_id: "d" })], [], S, [dw], null, { tax_on: false, discount: 0 });
  near(b.lines.x.ext_cost, 960);
});

test("a card counted by hand, just added (qty_source set, no qty), takes the area's count", () => {
  const dw = { id: "d", name: "DW", work_type: "other", length_ft: null, width_ft: null, sqft_override: null, depth_in: null, count_qty: 8, count_unit: "EA" };
  assert.equal(ruleQty(L({ qty_rule: "manual", unit: "EA", section_id: "d", qty_source: "set", quantity: null }), [dw], null).qty, 8);
});
