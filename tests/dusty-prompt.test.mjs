// Dusty's prompt builder. `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble, coldContext, scopeLines, DUSTY_SYSTEM } from "../src/lib/dusty/prompt.ts";
import { price, takeoff } from "../src/lib/engine/index.ts";

const EMPTY = Object.fromEntries([
  "concrete_price_per_cy", "concrete_overage_pct", "shortload_threshold_cy", "shortload_pct", "form_finish_per_sqft",
  "demo_per_sqft", "mobilization_fee", "sales_tax_pct", "tax_applies_to", "markup_material_pct", "markup_labor_pct",
  "markup_equipment_pct", "owner_fee_pct", "estimator_fee_pct", "tax_reserve_pct", "assumed_billable_days",
  "comp_mode", "comp_monthly_draw"].map((k) => [k, null]));

test("scope context carries the engine's blocked list and no price (catches a guessed price)", () => {
  const s = [{ name: "Shop slab", work_type: "slab", length_ft: 30, width_ft: 40, sqft_override: null, depth_in: 4 }];
  const lines = scopeLines(takeoff(s, null), price(s, EMPTY), null).join("\n");
  assert.match(lines, /PRICE: NONE — blocked by: .*Concrete price per yard/);
  assert.doesNotMatch(lines, /PRICE: \$/);
  assert.match(lines, /1,200 sq ft/);
});

test("scope context says a missing thickness is NOT SET, never 4 in", () => {
  const s = [{ name: "Apron", work_type: "slab", length_ft: 10, width_ft: 12, sqft_override: null, depth_in: null }];
  const lines = scopeLines(takeoff(s, null), price(s, EMPTY), null).join("\n");
  assert.match(lines, /thickness NOT SET/);
});

test("over budget: oldest lines of a trimmable block go first, and the text says so", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${String(i).padStart(3, "0")} ${"x".repeat(40)}`);
  const a = assemble("A thread", [{ title: "Contact", lines: ["Name: Sample"] }, { title: "Messages", lines, trimmable: true }], 3000);
  assert.equal(a.truncated, true);
  assert.ok(a.text.length < 3400);
  assert.match(a.text, /line 199/);          // newest kept
  assert.doesNotMatch(a.text, /line 000/);   // oldest dropped
  assert.match(a.text, /Name: Sample/);      // untrimmable block kept
  assert.match(a.text, /earliest line\(s\) of "Messages" were left out/);
});

test("within budget nothing is dropped", () => {
  const a = assemble("x", [{ title: "M", lines: ["a", "b"], trimmable: true }], 10000);
  assert.equal(a.truncated, false);
  assert.doesNotMatch(a.text, /Left out/);
});

test("cold context carries no customer data", () => {
  const c = coldContext("Test Org", "2026-09-27");
  assert.equal(c.label, "nothing open");
  assert.doesNotMatch(c.text, /Messages|Contact|PRICE/);
});

test("the fixed system prompt holds the house rules", () => {
  assert.match(DUSTY_SYSTEM, /Never invent a number/);
  assert.match(DUSTY_SYSTEM, /cannot send anything/);
  assert.match(DUSTY_SYSTEM, /direction of the ask/);
});
