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
