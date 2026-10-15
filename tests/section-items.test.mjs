import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionItemsQuestion } from "../src/lib/dusty/section-items.ts";
test("section items question names the section and the asks", () => {
  const q = sectionItemsQuestion("5in light duty", "a1b2c3d4");
  assert.match(q, /"5in light duty" \(area a1b2c3d4\)/);
  assert.match(q, /fuel surcharge/); assert.match(q, /wire mesh or rebar/); assert.match(q, /update_item/);
  assert.match(sectionItemsQuestion(" ", null), /"this section" from/);
});
