// The org's layout under a person's own (src/lib/v34/layout.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withOrgLayout, isLayoutKey } from "../src/lib/v34/layout.ts";

test("the org's layout fills what a person hasn't set; their own wins", () => {
  const org = { shelves: [{ id: "a" }], spaces_rail: { order: ["x"] }, theme: "night" };
  assert.deepEqual(withOrgLayout({ theme: "site" }, org), { theme: "site", shelves: [{ id: "a" }], spaces_rail: { order: ["x"] } });
  assert.deepEqual(withOrgLayout({ shelves: [] }, org).shelves, []);
  assert.deepEqual(withOrgLayout({ a: 1 }, null), { a: 1 });
  assert.ok(isLayoutKey("spaces_pins"));
  assert.ok(!isLayoutKey("theme"));
});
