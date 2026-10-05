// Dusty's prompt builder. `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble, coldContext, scopeLines, DUSTY_SYSTEM } from "../src/lib/dusty/prompt.ts";
import { takeoff } from "../src/lib/engine/index.ts";

test("scope context with no budget says there is no price (catches a guessed price)", () => {
  const s = [{ name: "Shop slab", work_type: "slab", length_ft: 30, width_ft: 40, sqft_override: null, depth_in: 4 }];
  const lines = scopeLines(takeoff(s, null), false).join("\n");
  assert.match(lines, /PRICE: NONE — this job has no budget lines yet/);
  assert.doesNotMatch(lines, /PRICE: \$/);
  assert.match(lines, /1,200 sq ft/);
  assert.doesNotMatch(scopeLines(takeoff(s, null), true).join("\n"), /PRICE/);
});

test("scope context says a missing thickness is NOT SET, never 4 in", () => {
  const s = [{ name: "Apron", work_type: "slab", length_ft: 10, width_ft: 12, sqft_override: null, depth_in: null }];
  const lines = scopeLines(takeoff(s, null), false).join("\n");
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
