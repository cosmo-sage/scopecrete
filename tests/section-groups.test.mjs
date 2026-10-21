import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionGroups, groupOrder } from "../src/lib/section-groups.ts";

test("default groups", () => {
  assert.deepEqual(sectionGroups(undefined), ["labor", "material", "equipment"]);
  assert.deepEqual(sectionGroups(["equipment", "nope", "equipment", "labor"]), ["equipment", "labor"]);
  assert.deepEqual(sectionGroups([]), []);
});
test("order adds present types after defaults", () => {
  assert.deepEqual(groupOrder(["labor", "material", "equipment"], ["other", "labor"]), ["labor", "material", "equipment", "other"]);
});
