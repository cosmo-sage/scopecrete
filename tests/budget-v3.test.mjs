// Budget v3 — Market rate and Actual costs (src/lib/budget-v3.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tabOf, sameUnit, budgetInRateUnit, rateStatus, priceToCost, unitCostFromRate, marketRows, jobRange, scaleOf,
  compareActuals, crewCompare, suggestLine,
} from "../src/lib/budget-v3.ts";

const job = { sqft: 894, lf: null };
const areas = [{ id: "s1", sqft: 804, lf: null }, { id: "s2", sqft: 90, lf: null }];
const line = (o) => ({ id: "l", name: "x", section_id: null, cost_type: "material", qty: null, unit: "EA", unit_cost: null, ext_cost: null, ext_price: null, unit_price: null, ...o });

test("tabs default to the proposed budget", () => {
  assert.equal(tabOf(null), "proposed");
  assert.equal(tabOf("market"), "market");
  assert.equal(tabOf("actuals"), "actuals");
  assert.equal(tabOf("nonsense"), "proposed");
});

test("units match however they are written", () => {
  assert.ok(sameUnit("sf", "SqFt"));
  assert.ok(sameUnit("sf", "Square Feet"));
  assert.ok(sameUnit("cy", "CuYd"));
  assert.ok(sameUnit("day", "Days"));
  assert.ok(!sameUnit("sf", "Ton"));
});

test("the budget in the rate's unit: own unit, or spread over the area", () => {
  const tear = line({ id: "t", section_id: "s1", unit: "SqFt", qty: 804, unit_cost: 0.95, ext_cost: 763.8, unit_price: 1.45, ext_price: 1165.8 });
  assert.equal(budgetInRateUnit({ unit: "sf", kind: "cost" }, [tear], areas, job), 0.95);
  assert.equal(budgetInRateUnit({ unit: "sf", kind: "installed_price" }, [tear], areas, job), 1.45);
  const base = line({ id: "b", section_id: "s1", unit: "Ton", qty: 20, unit_cost: 40, ext_cost: 800, ext_price: 1200 });
  assert.equal(budgetInRateUnit({ unit: "sf", kind: "cost" }, [base], areas, job), 800 / 804);
  const whole = line({ id: "w", unit: "Ton", qty: 20, unit_cost: 40, ext_cost: 894, ext_price: 1200 });
  assert.equal(budgetInRateUnit({ unit: "sf", kind: "cost" }, [whole], areas, job), 1);
  assert.equal(budgetInRateUnit({ unit: "sf", kind: "cost" }, [line({ unit: "Ton" })], areas, job), null); // unpriced
  assert.equal(budgetInRateUnit({ unit: "cy", kind: "cost" }, [whole], areas, job), null); // can't spread yards
});

test("status with 2% tolerance", () => {
  assert.equal(rateStatus(0.99, 1, 2), "inside");
  assert.equal(rateStatus(0.95, 1, 2), "under");
  assert.equal(rateStatus(2.05, 1, 2), "over");
  assert.equal(rateStatus(null, 1, 2), "unpriced");
});

test("Use writes a cost in the line's own unit", () => {
  const tear = line({ id: "t", section_id: "s1", unit: "SqFt", qty: 804, unit_cost: 0.95 });
  assert.equal(unitCostFromRate(1, { unit: "sf", kind: "cost" }, tear, areas, job, { oh: 15, margin: 20 }), 1);
  // An installed price comes back to cost: 2 × 0.8 ÷ 1.15
  assert.equal(unitCostFromRate(2, { unit: "sf", kind: "installed_price" }, tear, areas, job, { oh: 15, margin: 20 }), 1.39);
  assert.equal(unitCostFromRate(2, { unit: "sf", kind: "installed_price" }, tear, areas, job, { oh: null, margin: 20 }), null);
  // Per SF onto a line per ton: $1/SF × 804 SF ÷ 20 tons = $40.20 a ton
  const base = line({ id: "b", section_id: "s1", unit: "Ton", qty: 20, unit_cost: 40 });
  assert.equal(unitCostFromRate(1, { unit: "sf", kind: "cost" }, base, areas, job, { oh: 15, margin: 20 }), 40.2);
  assert.equal(unitCostFromRate(1, { unit: "sf", kind: "cost" }, line({ unit: "Ton", qty: 0 }), areas, job, { oh: 15, margin: 20 }), null);
  assert.ok(Math.abs(priceToCost(10.79, 15, 30) - 6.5678) < 0.001);
});

test("market rows: one per step with a rate or a line, installed prices preferred", () => {
  const rates = [
    { step: "demo", what: "Tear-out", low: 1, high: 2, unit: "sf", split: "all", kind: "installed_price", url: "u1", site: "homeguide.com", quote: "$1–$2 per sq ft" },
    { step: "demo", what: "Tear-out", low: 1.5, high: 3, unit: "sf", split: "all", kind: "installed_price", url: "u2", site: "angi.com", quote: "$1.50 to $3" },
    { step: "demo", what: "Breaker rental", low: 90, high: 120, unit: "day", split: "equipment", kind: "cost", url: "u3", site: "hd.com", quote: "$90-$120/day" },
    { step: "concrete", what: "Ready mix", low: 150, high: 180, unit: "cy", split: "material", kind: "cost", url: "u4", site: "x.com", quote: "$150–$180 per yard" },
    { step: "job", what: "Driveway", low: 8, high: 14, unit: "sf", split: "all", kind: "installed_price", url: "u5", site: "y.com", quote: "$8 to $14" },
    { step: "job", what: "Driveway", low: 9, high: 12, unit: "sf", split: "all", kind: "installed_price", url: "u6", site: "z.com", quote: "$9-$12" },
  ];
  const lines = [
    line({ id: "t", section_id: "s1", unit: "SqFt", qty: 804, unit_cost: 0.95, ext_cost: 763.8, unit_price: 1.45, ext_price: 1165.8 }),
    line({ id: "c", section_id: "s1", unit: "CuYd", qty: 11, unit_cost: 165, ext_cost: 1815, unit_price: 250, ext_price: 2750 }),
  ];
  const steps = [
    { key: "demo", label: "Tear-out", line_ids: ["t"] }, { key: "concrete", label: "Concrete", line_ids: ["c"] },
    { key: "base", label: "Base", line_ids: [] }, { key: "forming", label: "Forming", line_ids: [] },
  ];
  const rows = marketRows(steps, rates, lines, areas, job);
  assert.deepEqual(rows.map((r) => r.step), ["demo", "concrete"]);
  const demo = rows[0];
  assert.equal(demo.kind, "installed_price");
  assert.equal(demo.low, 1); assert.equal(demo.high, 3);
  assert.equal(demo.mine, 1.45); assert.equal(demo.status, "inside");
  assert.equal(demo.more.length, 2); // the other installed rate, then the rental
  assert.equal(rows[1].mine, 165); assert.equal(rows[1].status, "inside");
  const jr = jobRange(rates);
  assert.deepEqual(jr, { low: 8, high: 14, typical: 10.75, sources: 2 });
  const sc = scaleOf([8, 14, 10.79]);
  assert.ok(sc.min < 8 && sc.max > 14);
  assert.equal(scaleOf([null, undefined]), null);
});

test("actuals: unfiled lines held at budget; change orders and unbudgeted costs in the direct", () => {
  const lines = [
    { id: "m1", name: "Ready mix", cost_type: "material", section_id: "s1", ext_cost: 1512 },
    { id: "m2", name: "Mesh", cost_type: "material", section_id: "s1", ext_cost: 300 },
    { id: "lab", name: "Form & finish", cost_type: "labor", section_id: "s1", ext_cost: 1536 },
    { id: "eq", name: "Skid steer", cost_type: "equipment", section_id: null, ext_cost: 620 },
    { id: "per", name: "Permit", cost_type: "other", section_id: null, ext_cost: 300 },
  ];
  const c = (o) => ({ id: Math.random().toString(), line_id: null, file_id: null, kind: "typed", vendor: null, amount: 0, man_hours: null, rate: null, note: null, spent_on: null, paid_at: null, ...o });
  const costs = [
    c({ line_id: "m1", kind: "receipt", vendor: "Valley Ready Mix", amount: 1000 }),
    c({ line_id: "m1", kind: "receipt", vendor: "Valley Ready Mix", amount: 634 }),
    c({ line_id: "lab", kind: "time_log", amount: 1560, man_hours: 65, rate: 24 }),
    c({ line_id: "eq", amount: 880 }),
    c({ line_id: null, amount: 45, vendor: "Fuel" }),
  ];
  const cos = [{ id: "co", name: "Extra apron", note: null, price: 420, cost: 280, signed_at: "2026-10-01" }];
  const s = compareActuals(lines, costs, cos, { price: 6000, discount: 0, overhead: 640, net: 1092 });
  const mat = s.categories.find((x) => x.bucket === "material");
  assert.equal(mat.budget, 1812);
  assert.equal(mat.actual, 1634 + 300); // mesh held at budget
  assert.equal(mat.unfiled, 1);
  assert.equal(s.budgetDirect, 4268);
  assert.equal(s.actualDirect, 1634 + 300 + 1560 + 880 + 300 + 45 + 280);
  assert.equal(s.soldPrice, 6420);
  assert.equal(s.actualNet, 6420 - s.actualDirect - 640);
  assert.equal(s.unbudgeted.length, 1);
  assert.equal(s.filed, 3); assert.equal(s.lines, 5);
  // Categories add up to the direct cost (less unbudgeted and change orders).
  assert.equal(s.categories.reduce((a, x) => a + x.actual, 0), s.actualDirect - 45 - 280);
  const over = compareActuals(lines, costs, cos, { price: 6000, discount: 0, overhead: 640, net: 1092 }, "over");
  assert.deepEqual(over.categories.flatMap((x) => x.lines.map((r) => r.line.id)), ["m1", "lab", "eq"]);
  const nf = compareActuals(lines, costs, cos, { price: 6000, discount: 0, overhead: 640, net: 1092 }, "not_filed");
  assert.deepEqual(nf.categories.flatMap((x) => x.lines.map((r) => r.line.id)), ["m2", "per"]);
});

test("crew: man-hours, labor per man-hour, net a day", () => {
  const k = crewCompare({ size: 4, days: 2, hours: 8 }, { size: 4, days: 2.5, hours: 8.2 }, 1968, 894, 2135);
  assert.equal(k.manHours.budget, 64);
  assert.equal(k.manHours.actual, 82);
  assert.equal(k.laborPerManHour, 24);
  assert.equal(k.netPerDay, 854);
  assert.equal(crewCompare({ size: null, days: 2, hours: null }, { size: null, days: null, hours: null }, 0, null, 0).manHours.budget, null);
});

test("a receipt's line is suggested only on real overlap", () => {
  const lines = [{ id: "d", name: "Dumpster 20 yd", cost_type: "other", section_id: null, ext_cost: 485 }, { id: "p", name: "Permit", cost_type: "other", section_id: null, ext_cost: 300 }];
  assert.equal(suggestLine({ vendor: "Gilton", words: "20 yd dumpster rental" }, lines), "d");
  assert.equal(suggestLine({ vendor: "Shell", words: "fuel" }, lines), null);
});
