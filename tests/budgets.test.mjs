import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestBudgetName, cleanBudgetName } from "../src/lib/budgets.ts";

test("suggests Draft N past what is used", () => {
  assert.equal(suggestBudgetName([null]), "Draft 1");
  assert.equal(suggestBudgetName([]), "Draft 1");
  assert.equal(suggestBudgetName(["Draft 1", "Draft 3"]), "Draft 4");
  assert.equal(suggestBudgetName(["Wilson as quoted", "draft 2"]), "Draft 3");
  assert.equal(suggestBudgetName(["Draft 1"]), "Draft 2");
});

test("a name is one trimmed line of 60 at most", () => {
  assert.equal(cleanBudgetName("  Draft   1 \n"), "Draft 1");
  assert.equal(cleanBudgetName("   "), null);
  assert.equal(cleanBudgetName(4), null);
  assert.equal(cleanBudgetName("x".repeat(80)).length, 60);
});
