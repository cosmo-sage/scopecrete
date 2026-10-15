import test from "node:test";
import assert from "node:assert/strict";
import { sizeTotals, sizePatch, readSizeRow } from "../src/lib/section-sizes.ts";

test("area rows add up, each at its own thickness", () => {
  const t = sizeTotals([
    { mode: "dims", length_ft: 30, width_ft: 40, depth_in: 4 },   // 1200 SF, 14.81 CY
    { mode: "area", sqft: 600, depth_in: 6 },                     // 600 SF, 11.11 CY
  ]);
  assert.equal(t.kind, "SF");
  assert.equal(t.total, 1800);
  assert.equal(t.cy, 25.93);
  assert.ok(Math.abs(t.depth_in - 4.67) < 0.01);
  const p = sizePatch(t);
  assert.equal(p.sqft_override, 1800);
  assert.equal(p.length_ft, null);
});

test("a row with no thickness leaves the yards blank, not guessed", () => {
  const t = sizeTotals([{ mode: "area", sqft: 100, depth_in: 4 }, { mode: "area", sqft: 100 }]);
  assert.equal(t.total, 200);
  assert.equal(t.cy, null);
  assert.equal(t.depth_in, null);
});

test("takeoffs add in as one more row", () => {
  const t = sizeTotals([{ mode: "area", sqft: 100, depth_in: 4 }], { unit: "SF", total: 224, depth_in: 4 });
  assert.equal(t.total, 324);
  assert.equal(t.cy, 4);
  assert.equal(t.depth_in, 4);
});

test("linear rows: LF, equivalent width and depth give the same yards", () => {
  const t = sizeTotals([
    { mode: "linear", qty: 100, width_in: 12, depth_in: 18 },
    { mode: "linear", qty: 50, width_in: 24, depth_in: 24 },
  ]);
  assert.equal(t.total, 150);
  const yards = (100 * 1 * 1.5 + 50 * 2 * 2) / 27;
  assert.ok(Math.abs(t.cy - yards) < 0.01);
  const back = t.total * t.width_ft * (t.depth_in / 12) / 27;
  assert.ok(Math.abs(back - yards) < 0.02);
});

test("a row of another kind is kept but not added", () => {
  const t = sizeTotals([{ mode: "area", sqft: 100 }, { mode: "count", qty: 3, label: "Bollards" }]);
  assert.equal(t.total, 100);
  assert.match(t.notes[0], /Bollards/);
});

test("counts add in their unit", () => {
  const t = sizeTotals([{ mode: "count", qty: 3, unit: "ea" }, { mode: "count", qty: 2 }]);
  assert.equal(t.total, 5);
  assert.equal(sizePatch(t).count_unit, "EA");
});

test("rows are checked", () => {
  assert.equal(readSizeRow({ mode: "nope" }).ok, false);
  assert.equal(readSizeRow({ mode: "area", sqft: -3 }).ok, false);
  assert.equal(readSizeRow({ mode: "area", sqft: 10, depth_in: 400 }).ok, false);
  assert.deepEqual(readSizeRow({ mode: "area", sqft: "10", label: " Apron " }).row.label, "Apron");
});
