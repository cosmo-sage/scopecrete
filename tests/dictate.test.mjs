// Section dictation guard — `npm test`. The model moves numbers into boxes; it never invents one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { numbersSaid, wasSaid, sanitizeDictation } from "../src/lib/dictate.ts";

const has = (arr, v) => arr.some((x) => Math.abs(x - v) < 1e-9);

test("numbers said as digits and as words", () => {
  const n = numbersSaid("Front drive, twenty four by thirty, four inch, 3000 PSI, 6x6 mesh");
  for (const v of [24, 30, 4, 3000, 6]) assert.ok(has(n, v), `missing ${v}`);
});

test("halves, hundreds and thousands", () => {
  const n = numbersSaid("four and a half inches, one hundred twenty feet, four thousand psi, 5 1/2");
  for (const v of [4.5, 120, 4000, 5.5]) assert.ok(has(n, v), `missing ${v}`);
});

test("feet and inches both said counts: 24 feet 6 → 24.5", () => {
  assert.ok(wasSaid(24.5, numbersSaid("twenty four feet six inches")));
  assert.ok(!wasSaid(25, numbersSaid("twenty four feet six inches")));
});

test("a number the model made up is dropped; the ones said are kept", () => {
  const { patch, dropped } = sanitizeDictation(
    { length_ft: 24, width_ft: 30, depth_in: 4, psi: 3000, work_type: "driveway" },
    "driveway twenty four by thirty", []);
  assert.equal(patch.length_ft, 24);
  assert.equal(patch.width_ft, 30);
  assert.equal(patch.depth_in, undefined);
  assert.equal(patch.psi, undefined);
  assert.equal(patch.work_type, "driveway");
  assert.equal(dropped.length, 2);
});

test("unknown work type and reinforcement are dropped; a known one matches by name", () => {
  const types = [{ id: "m", name: "6x6 10ga wire mesh" }];
  const a = sanitizeDictation({ work_type: "pool", reinforcement: "6x6 mesh" }, "pool with 6x6 mesh", types);
  assert.equal(a.patch.work_type, undefined);
  assert.equal(a.patch.reinforcement_item_id, undefined);
  const b = sanitizeDictation({ reinforcement: "6x6 10ga" }, "6x6 10ga", types);
  assert.equal(b.patch.reinforcement_item_id, "m");
});

test("insane values are dropped even if said", () => {
  const { patch } = sanitizeDictation({ depth_in: 400 }, "four hundred inches", []);
  assert.equal(patch.depth_in, undefined);
});
