// Risk on a job (migration 096) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRisk, riskOf, riskEmpty, riskSuggestions } from "../src/lib/risk.ts";
import { budget } from "../src/lib/engine/index.ts";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test("nothing set is no risk", () => {
  assert.deepEqual(riskOf(null), { cost_pct: 0, carry_pct: 0, parts: [], missing: [] });
  assert.ok(riskEmpty(readRisk(null)));
  assert.ok(riskEmpty(readRisk("junk")));
});

test("contingency and ticked items add on cost; unticked and blank don't", () => {
  const r = riskOf(readRisk({ contingency_pct: 5, items: [
    { label: "Bond", pct: 1.5, on: true }, { label: "Night work", pct: 3, on: false }, { label: "Testing", pct: null, on: true },
  ] }));
  assert.equal(r.cost_pct, 6.5);
  assert.deepEqual(r.missing, ["Testing: %"]);
  assert.equal(r.carry_pct, 0);
});

test("carrying cost: days to get paid plus retainage held, at the rate", () => {
  // 8%/yr × (73/365 + 10% × 365/365) = 8 × (0.2 + 0.1) = 2.4%
  const r = riskOf(readRisk({ pay_days: 73, retainage_pct: 10, retainage_days: 365, carry_rate_pct: 8 }));
  assert.equal(r.carry_pct, 2.4);
  assert.match(r.parts[0].label, /73 days to get paid, 10% held 365 days more at 8% a year/);
  assert.equal(riskOf(readRisk({ pay_days: 60 })).carry_pct, 0, "no rate, no carrying cost");
});

test("readRisk drops what doesn't fit", () => {
  const r = readRisk({ contingency_pct: -2, pay_days: 9999, items: [{ label: " ", pct: 1, on: true }, { label: "Bond", pct: 80, on: "yes" }] });
  assert.equal(r.contingency_pct, null);
  assert.equal(r.pay_days, null);
  assert.deepEqual(r.items, [{ label: "Bond", pct: null, on: false }]);
});

test("suggestions differ by market", () => {
  assert.ok(riskSuggestions("public").includes("Prevailing wage"));
  assert.ok(!riskSuggestions("residential").includes("Prevailing wage"));
});

const L = { id: "l", name: "Line", cost_type: "material", unit: "ea", unit_cost: 1000, margin_pct: null, taxable: false,
  qty_rule: "manual", rule_params: {}, qty_source: "set", quantity: 1, section_id: null, option_id: null, cost_group_id: null };

test("the engine: risk on cost beside O.H., carrying cost beside margin — margin kept", () => {
  const plain = budget([L], [], { overhead_pct: 15, margin_pct: 20, tax_rate_pct: null }, [], null, { tax_on: false, discount: 0 });
  near(plain.lines.l.ext_price, 1150 / 0.8);
  near(plain.tiers[0].risk, 0);
  const s = { overhead_pct: 15, margin_pct: 20, tax_rate_pct: null, risk_pct: 5, carry_pct: 2 };
  const r = budget([L], [], s, [], null, { tax_on: false, discount: 0 });
  const price = (1000 + 150 + 50) / (1 - 0.22);
  near(r.lines.l.ext_price, price);
  near(r.lines.l.risk, 50);
  near(r.lines.l.carry, price * 0.02);
  near(r.lines.l.margin, 0.2);
  near(r.tiers[0].margin, 0.2);
  near(r.tiers[0].profit, price * 0.2);
});

test("a ticked risk with no % blocks the price by name", () => {
  const r = budget([L], [], { overhead_pct: 15, margin_pct: 20, tax_rate_pct: null, risk_missing: ["Testing: %"] }, [], null, { tax_on: false, discount: 0 });
  assert.ok(r.tiers[0].blocked.includes("Risk — Testing: %"));
  assert.equal(r.tiers[0].priced, false);
});
