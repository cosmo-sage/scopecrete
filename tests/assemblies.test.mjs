// Assemblies — `npm test`. What the browser may send, and how one is described.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAssembly, appliesTo } from "../src/lib/assemblies.ts";
import { isReinforcementCard } from "../src/lib/cost-cards.ts";

test("an assembly needs a name; job and work type are real ones or any", () => {
  assert.equal(cleanAssembly({}, false).ok, false);
  const a = cleanAssembly({ name: "  Residential   driveway ", job_type: "residential", work_type: "driveway", auto_load: true }, false);
  assert.deepEqual(a, { ok: true, value: { name: "Residential driveway", job_type: "residential", work_type: "driveway", auto_load: true } });
  assert.equal(cleanAssembly({ name: "x", work_type: "pool" }, false).ok, false);
  assert.equal(cleanAssembly({ name: "x", job_type: "industrial" }, false).ok, false);
  assert.deepEqual(cleanAssembly({ job_type: "" }, true), { ok: true, value: { job_type: null } });
  assert.equal(cleanAssembly({ reinforcement_item_id: "nope" }, true).ok, false);
});

test("what an assembly applies to, said plainly", () => {
  assert.equal(appliesTo({ job_type: "residential", work_type: "driveway" }), "Residential · Driveway");
  assert.equal(appliesTo({ job_type: null, work_type: "patio" }), "Any job · Patio");
  assert.equal(appliesTo({ job_type: "public", work_type: null }), "Loaded by hand");
});

test("reinforcement cards are the ones counted by the sheet, the stick, or a per-yard dose", () => {
  assert.equal(isReinforcementCard({ qty_rule: "per_sheet", rule_params: { sheet_sqft: 45 } }), true);
  assert.equal(isReinforcementCard({ qty_rule: "per_stick", rule_params: {} }), true);
  assert.equal(isReinforcementCard({ qty_rule: "per_cy", rule_params: { per_cy: 1.5 } }), true);
  assert.equal(isReinforcementCard({ qty_rule: "per_cy", rule_params: {} }), false);   // concrete itself
  assert.equal(isReinforcementCard({ qty_rule: "per_sqft", rule_params: {} }), false);
});
