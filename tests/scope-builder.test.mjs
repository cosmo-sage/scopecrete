// The Scope Builder's flow (2026-10-09) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { marketOf, scopeProgress, stepHref } from "../src/lib/scope-builder.ts";

const F = (o = {}) => ({ files: 0, measured: 0, sized_sections: 0, sections: 0, budget_lines: 0, final_proposal: false, sent: false, views: 0, ...o });

test("markets: residential vs commercial and government", () => {
  assert.equal(marketOf("residential"), "residential");
  assert.equal(marketOf("public"), "commercial");
  assert.equal(marketOf(null), "residential");
});

test("a commercial scope needs its plan set, then its takeoff", () => {
  assert.equal(scopeProgress(F(), "commercial").next, "files");
  assert.equal(scopeProgress(F({ files: 3 }), "commercial").next, "takeoffs");
  assert.equal(scopeProgress(F({ files: 3, sized_sections: 2 }), "commercial").next, "takeoffs", "sections alone don't make a plan takeoff");
  assert.equal(scopeProgress(F({ files: 3, measured: 4 }), "commercial").next, "budget");
});

test("a residential scope measured in the field skips files and takeoffs", () => {
  const p = scopeProgress(F({ sized_sections: 2 }), "residential");
  assert.equal(p.next, "budget");
  assert.ok(p.done.files && p.done.takeoffs);
});

test("budget, proposal, sent", () => {
  assert.equal(scopeProgress(F({ sized_sections: 1, budget_lines: 7 }), "residential").next, "proposal");
  assert.equal(scopeProgress(F({ sized_sections: 1, budget_lines: 7, final_proposal: true }), "residential").next, "sent");
  const sent = scopeProgress(F({ sized_sections: 1, budget_lines: 7, final_proposal: true, sent: true, views: 3 }), "residential");
  assert.equal(sent.line, "Proposal sent · opened 3 times");
});

test("each step opens its job view", () => {
  assert.equal(stepHref("j", "files"), "/dashboard/scope/j/files");
  assert.equal(stepHref("j", "takeoffs"), "/dashboard/scope/j/plans");
  assert.equal(stepHref("j", "budget"), "/dashboard/scope/j");
  assert.equal(stepHref("j", "proposal"), "/dashboard/scope/j/proposal");
  assert.equal(stepHref("j", "sent"), "/dashboard/scope/j/summary");
});
