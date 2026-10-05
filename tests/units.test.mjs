// Units for Price book items and budget lines (src/lib/units.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUnit, unitChoices } from "../src/lib/units.ts";

test("a unit is trimmed and 1–20 characters", () => {
  assert.equal(cleanUnit("  sq   ft "), "sq ft");
  assert.equal(cleanUnit(""), null);
  assert.equal(cleanUnit("x".repeat(21)), null);
  assert.equal(cleanUnit(4), null);
});

test("the org's units come first, common ones fill in, case never doubles", () => {
  const u = unitChoices(["sq ft", "ea", "Truck"], "day");
  assert.equal(u[0], "day", "the current unit is always offered");
  assert.deepEqual(u.slice(1, 4), ["sq ft", "ea", "Truck"]);
  assert.ok(!u.includes("EA"), "EA is the same as ea");
  assert.ok(!u.includes("Day"), "Day is the same as day");
  assert.ok(u.includes("SY") && u.includes("LF"));
});

import { unitTypeOf, ruleForUnit, ownUnits } from "../src/lib/units.ts";

test("a unit is one of the five types, whatever it was called", () => {
  assert.equal(unitTypeOf("Square Feet"), "SqFt");
  assert.equal(unitTypeOf("SY"), "SqYd");
  assert.equal(unitTypeOf("Linear Feet"), "LnFt");
  assert.equal(unitTypeOf("cu. yd"), "CuYd");
  assert.equal(unitTypeOf("each"), "Each");
  assert.equal(unitTypeOf("Days"), null);
});

test("the unit decides how the quantity is worked out", () => {
  assert.equal(ruleForUnit("SqFt"), "per_sqft");
  assert.equal(ruleForUnit("SqYd"), "per_sqft");
  assert.equal(ruleForUnit("LnFt"), "per_lf_perimeter");
  assert.equal(ruleForUnit("CuYd"), "per_cy");
  assert.equal(ruleForUnit("Each"), "manual");
  assert.equal(ruleForUnit("Days"), "per_day");
  assert.equal(ruleForUnit("Lump Sum"), "per_job");
  assert.equal(ruleForUnit("Truck"), "manual");
  assert.equal(ruleForUnit("Sheet", "per_sheet"), "per_sheet");
  assert.equal(ruleForUnit("Sheet", "manual"), "manual", "a sheet needs the card's coverage");
  assert.equal(ruleForUnit("Sheet", "manual", true), "per_sheet", "a Price book card carries the coverage");
  assert.equal(ruleForUnit("SqFt", "from_takeoff"), "from_takeoff", "measured stays measured");
});

test("the org's own units leave out the five", () => {
  assert.deepEqual(ownUnits(["Each", "Days", "Square Feet", "Lump Sum", "days"]), ["Days", "Lump Sum"]);
});
