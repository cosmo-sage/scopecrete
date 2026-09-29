// Costing engine tests — `npm test` (node --test; Node strips the .ts types).
//
// Every test here must be able to fail. Each names the wrong implementation
// it exists to catch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { quantities, takeoff, price, floor, applyDiscount, monthlyNut, reinforcementQty } from "../src/lib/engine/index.ts";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** Gulfline Paving 24-318-1 reference rates (DECISIONS §3). A test fixture, not a default. */
const GULFLINE = {
  concrete_price_per_cy: 236.13, concrete_overage_pct: 3.4,
  shortload_threshold_cy: 5, shortload_pct: 15,
  form_finish_per_sqft: 1.43, demo_per_sqft: 2.0, mobilization_fee: 750,
  sales_tax_pct: 8.08, tax_applies_to: "materials",
  markup_material_pct: 30.61, markup_labor_pct: 41.77, markup_equipment_pct: 30.12,
  owner_fee_pct: 5, estimator_fee_pct: 3, tax_reserve_pct: 3,
  assumed_billable_days: 10, comp_mode: "fixed_draw", comp_monthly_draw: 0,
};
const EMPTY = Object.fromEntries(Object.keys(GULFLINE).map((k) => [k, null]));

const slab = (o = {}) => ({ name: "Shop slab", work_type: "slab", length_ft: 30, width_ft: 40, sqft_override: null, depth_in: 4, ...o });

test("quantities: 30×40 at 4 in is 1,200 sq ft and 14.81 neat yards", () => {
  const q = quantities(slab());
  assert.equal(q.sqft, 1200);
  close(q.cy_neat, 1200 * 4 / 12 / 27);
  assert.deepEqual(q.missing, []);
});

test("quantities: a missing depth stays missing — never 4 in (catches COALESCE(depth_in, 4))", () => {
  const q = quantities(slab({ depth_in: null }));
  assert.equal(q.cy_neat, null);
  assert.deepEqual(q.missing, ["depth"]);
});

test("quantities: sqft override wins over dimensions", () => {
  const q = quantities(slab({ sqft_override: 500, length_ft: null, width_ft: null }));
  assert.equal(q.sqft, 500);
  assert.equal(q.sqft_source, "override");
});

test("quantities: demo has area and no concrete, and does not need a depth", () => {
  const q = quantities({ name: "Tear out", work_type: "demo", length_ft: 10, width_ft: 10, sqft_override: null, depth_in: null });
  assert.equal(q.sqft, 100);
  assert.equal(q.cy_neat, null);
  assert.deepEqual(q.missing, []);
});

test("takeoff: order yards apply waste only when waste is recorded", () => {
  const t1 = takeoff([slab()], null);
  assert.equal(t1.cy_order, null);
  const t2 = takeoff([slab()], 10);
  close(t2.cy_order, t2.cy_neat * 1.1);
});

test("price: with nothing recorded, blocks and names every setting — no number", () => {
  const r = price([slab()], EMPTY);
  assert.equal(r.priced, false);
  assert.ok(r.blocked.includes("Concrete price per yard"));
  assert.ok(r.blocked.includes("Form & finish per sq ft"));
  assert.ok(!("price" in r));
});

test("price: a section missing depth blocks the whole price", () => {
  const r = price([slab(), slab({ name: "Apron", depth_in: null })], GULFLINE);
  assert.equal(r.priced, false);
  assert.ok(r.blocked.some((b) => b.startsWith("Apron: depth")));
});

test("price: labor is by the SQUARE FOOT at 1.43 (catches crew-hour labor)", () => {
  const r = price([slab()], GULFLINE);
  assert.equal(r.priced, true);
  close(r.cost.labor, 1200 * 1.43);
});

test("price: demo labor at 2.00 per sq ft", () => {
  const r = price([slab(), { name: "Tear out", work_type: "demo", length_ft: 20, width_ft: 10, sqft_override: null, depth_in: null }], GULFLINE);
  close(r.cost.labor, 1200 * 1.43 + 200 * 2.0);
});

test("price: markup is per cost type, not one multiplier (catches a global markup)", () => {
  const r = price([slab()], GULFLINE);
  close(r.price.materials, r.cost.materials * 1.3061);
  close(r.price.labor, r.cost.labor * 1.4177);
  close(r.price.equipment, r.cost.equipment * 1.3012);
});

test("price: tax lands on the materials subtotal only (catches tax on the full bid)", () => {
  const r = price([slab()], GULFLINE);
  close(r.cost.tax, r.cost.materials * 0.0808);
  assert.ok(r.cost.tax < r.price.total * 0.0808);
});

test("price: short load applies under the threshold only", () => {
  const small = price([slab({ length_ft: 10, width_ft: 10 })], GULFLINE); // ~1.28 cy
  assert.ok(small.lines.some((l) => l.label.startsWith("Short load")));
  const big = price([slab()], GULFLINE);
  assert.ok(!big.lines.some((l) => l.label.startsWith("Short load")));
});

test("discount touches price only: Gulfline's true 27.7%, not the reported 39.4%", () => {
  // The reference job: price 38,188, cost 24,718, $4,000 discount.
  const d = applyDiscount(24718, 38188, 4000);
  close(d.margin, 0.277, 0.001);
  // The old shape — discount as a negative line in BOTH columns — gives 39.4%.
  const wrong = (38188 - 4000 - (24718 - 4000)) / (38188 - 4000);
  close(wrong, 0.394, 0.001);
  assert.notEqual(Math.round(d.margin * 1000), Math.round(wrong * 1000));
  assert.equal(d.cost, 24718);
});

test("discount: negative is refused (schema CHECK discount_amount >= 0)", () => {
  assert.throws(() => applyDiscount(100, 200, -5));
  const r = price([slab()], GULFLINE, { discount: -5 });
  assert.equal(r.priced, false);
});

test("floor: a divisor, not a subtraction — (hard + share) / 0.89", () => {
  const oh = [{ label: "Truck note", amount: 3500, cadence: "monthly", active: true }];
  const f = floor(10000, GULFLINE, oh, 3);
  assert.equal(f.ok, true);
  close(f.nut_share, 3500 / 10 * 3);
  close(f.floor, (10000 + 1050) / 0.89);
  assert.ok(Math.abs(f.floor - (10000 + 1050) * 0.89) > 1);
});

test("floor: fixed_draw raises it; pct_profit does not", () => {
  const oh = [{ label: "Nut", amount: 3500, cadence: "monthly", active: true }];
  const withDraw = floor(10000, { ...GULFLINE, comp_monthly_draw: 4500 }, oh, 2);
  const pct = floor(10000, { ...GULFLINE, comp_mode: "pct_profit", comp_monthly_draw: 4500 }, oh, 2);
  close(withDraw.nut_share, (3500 + 4500) / 10 * 2);
  close(pct.nut_share, 3500 / 10 * 2);
});

test("floor: blocks without crew days or overhead", () => {
  const f = floor(10000, GULFLINE, [], null);
  assert.equal(f.ok, false);
  assert.ok(f.blocked.includes("Crew days on this job"));
  assert.ok(f.blocked.some((b) => b.startsWith("Monthly overhead")));
});

test("monthly nut: quarterly ÷3, annual ÷12, one-time and inactive excluded", () => {
  close(monthlyNut([
    { label: "a", amount: 300, cadence: "monthly", active: true },
    { label: "b", amount: 900, cadence: "quarterly", active: true },
    { label: "c", amount: 1200, cadence: "annual", active: true },
    { label: "d", amount: 5000, cadence: "one_time", active: true },
    { label: "e", amount: 999, cadence: "monthly", active: false },
  ]), 300 + 300 + 100);
});

// ---------------------------------------------------------------- reinforcement

const MESH = { id: "m", name: "6x6 10ga mesh", kind: "mesh", unit: "sheet", unit_cost: 12.5, sheet_sqft: 45 };
const REBAR = { id: "r", name: "#4 @ 18", kind: "rebar", unit: "stick", unit_cost: 9, spacing_in: 18, stick_ft: 20, lap_pct: 10 };
const FIBER = { id: "f", name: "Fiber", kind: "fiber", unit: "lb", unit_cost: 6, per_cy: 1.5 };

test("reinforcement: mesh is whole sheets — 1,200 sq ft at 45 a sheet is 27", () => {
  const r = reinforcementQty(quantities(slab()), MESH);
  assert.ok(r.ok); assert.equal(r.qty, 27); assert.equal(r.unit, "sheet");
});

test("reinforcement: rebar grid both ways, lap, to 20 ft sticks", () => {
  // 1,200 sf × 2 × (12/18) × 1.1 = 1,760 ft → 88 sticks
  const r = reinforcementQty(quantities(slab()), REBAR);
  assert.ok(r.ok); assert.equal(r.qty, 88); assert.equal(r.unit, "stick");
});

test("reinforcement: fiber by the yard, needs depth", () => {
  const r = reinforcementQty(quantities(slab()), FIBER);
  assert.ok(r.ok); close(r.qty, Math.ceil((1200 * 4 / 12 / 27) * 1.5 * 10) / 10);
  const no = reinforcementQty(quantities(slab({ depth_in: null })), FIBER);
  assert.equal(no.ok, false);
});

test("reinforcement: a missing number on the type blocks the price and is named — never assumed", () => {
  const p = price([slab({ reinforcement_type_id: "m" })], GULFLINE, { reinforcement: [{ ...MESH, sheet_sqft: null }] });
  assert.equal(p.priced, false);
  assert.ok(p.blocked.some((b) => /sheet covers/.test(b)));
});

test("reinforcement: priced as a material — marked up and taxed with materials", () => {
  const without = price([slab()], GULFLINE);
  const withMesh = price([slab({ reinforcement_type_id: "m" })], GULFLINE, { reinforcement: [MESH] });
  assert.ok(without.priced && withMesh.priced);
  close(withMesh.cost.materials - without.cost.materials, 27 * 12.5);
  close(withMesh.price.materials - without.price.materials, 27 * 12.5 * (1 + 30.61 / 100));
  assert.ok(without.excluded.some((e) => /none chosen/.test(e)));
  assert.ok(!withMesh.excluded.some((e) => /none chosen/.test(e)));
});
