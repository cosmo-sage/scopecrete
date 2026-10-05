// Costing engine tests — `npm test` (node --test; Node strips the .ts types).
//
// Every test here must be able to fail. Each names the wrong implementation
// it exists to catch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { quantities, takeoff, monthlyNut, budget, pickAssembly } from "../src/lib/engine/index.ts";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

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

test("discount touches price only: Gulfline's true 27.7%, not the reported 39.4%", () => {
  // The reference job: cost 24,718, price 38,188, a $4,000 discount — as one
  // budget line priced with no O.H. and the margin that gives 38,188.
  const m = (1 - 24718 / 38188) * 100;
  const line = { id: "a", name: "Reference job", cost_type: "material", unit: "job", unit_cost: 24718, margin_pct: null,
    taxable: false, qty_rule: "per_job", rule_params: {}, qty_source: "rule", quantity: null, section_id: null, option_id: null, cost_group_id: null };
  const b = budget([line], [], { overhead_pct: 0, margin_pct: m, tax_rate_pct: null }, [slab()], null, { tax_on: false, discount: 4000 });
  close(b.tiers[0].cost, 24718, 1e-6);
  close(b.tiers[0].price, 38188, 1e-6);
  close(b.tiers[0].margin, 0.277, 0.001);
  // The old shape — discount as a negative line in BOTH columns — gives 39.4%.
  const wrong = (38188 - 4000 - (24718 - 4000)) / (38188 - 4000);
  close(wrong, 0.394, 0.001);
});

test("assemblies: the exact job type and work type, else any job type, else none", () => {
  const A = [
    { id: "any-drive", job_type: null, work_type: "driveway", auto_load: true },
    { id: "res-drive", job_type: "residential", work_type: "driveway", auto_load: true },
    { id: "res-patio-manual", job_type: "residential", work_type: "patio", auto_load: false },
    { id: "res-anything", job_type: "residential", work_type: null, auto_load: true },
  ];
  assert.equal(pickAssembly(A, "residential", "driveway").id, "res-drive");
  assert.equal(pickAssembly(A, "commercial", "driveway").id, "any-drive");
  assert.equal(pickAssembly(A, null, "driveway").id, "any-drive");
  assert.equal(pickAssembly(A, "residential", "patio"), null);   // only loaded by hand
  assert.equal(pickAssembly(A, "residential", "slab"), null);    // "any work type" never fills on its own
  assert.equal(pickAssembly(A, "residential", null), null);
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
