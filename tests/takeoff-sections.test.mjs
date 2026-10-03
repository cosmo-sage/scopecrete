// Takeoff shapes counted in budget sections (migration 069) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionTakeoff, sectionPatch, workTypeFor } from "../src/lib/takeoff-sections.ts";

// 1 pt = 1 ft on "s1"; "s2" has no scale.
const sheets = { s1: { ft_per_pt: 1, method: "manual", label: "A1" }, s2: { ft_per_pt: null, method: null, label: "A2" } };
const params = [
  { id: "drive", name: "Driveway", kind: "area", depth_in: 4 },
  { id: "patio", name: "Patio", kind: "area", depth_in: 4 },
  { id: "curb", name: "Curb", kind: "linear", depth_in: null },
  { id: "bolt", name: "Bollards", kind: "count", depth_in: null },
];
const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const shapes = [
  { id: "a", parameter_id: "drive", sheet_id: "s1", name: null, geometry: sq(0, 0, 20, 40), section_id: "S1" },   // 800
  { id: "b", parameter_id: "patio", sheet_id: "s1", name: null, geometry: sq(0, 0, 10, 10), section_id: "S1" },   // 100
  { id: "c", parameter_id: "curb", sheet_id: "s1", name: null, geometry: [[0, 0], [30, 40]], section_id: "S1" }, // 50 LF, other kind
  { id: "d", parameter_id: "curb", sheet_id: "s1", name: null, geometry: [[0, 0], [0, 12.5]], section_id: "S2" },
  { id: "e", parameter_id: "drive", sheet_id: "s2", name: null, geometry: sq(0, 0, 5, 5), section_id: "S3" },
  { id: "f", parameter_id: "bolt", sheet_id: "s2", name: null, geometry: [[1, 1], [2, 2], [3, 3]], section_id: "S4" },
];
const link = (o = {}) => ({ id: "S", takeoff_sync: true, sqft_override: null, count_qty: null, count_unit: null, length_ft: null, width_ft: null, depth_in: null, ...o });

test("a section's areas add up; another kind is kept but not added", () => {
  const t = sectionTakeoff("S1", shapes, params, sheets);
  assert.equal(t.unit, "SF"); assert.equal(t.total, 900); assert.equal(t.skipped, 1); assert.equal(t.depth_in, 4);
  assert.deepEqual(sectionPatch(link(), t, false), { sqft_override: 900, count_qty: null, count_unit: null, length_ft: null, width_ft: null, depth_in: 4 });
});

test("lengths and counts become the section's count", () => {
  assert.deepEqual(sectionPatch(link(), sectionTakeoff("S2", shapes, params, sheets), false), { count_qty: 12.5, count_unit: "LF", sqft_override: null, length_ft: null });
  // A count needs no scale.
  assert.deepEqual(sectionPatch(link(), sectionTakeoff("S4", shapes, params, sheets), false), { count_qty: 3, count_unit: "EA", sqft_override: null, length_ft: null, width_ft: null });
});

test("a shape on a sheet with no scale leaves the size blank, with the reason", () => {
  const t = sectionTakeoff("S3", shapes, params, sheets);
  assert.equal(t.total, null); assert.match(t.blocked, /A2 scale not set/);
  assert.equal(sectionPatch(link({ sqft_override: 500 }), t, false).sqft_override, null);
});

test("a size typed by hand is never overwritten; an unchanged one writes nothing", () => {
  const t = sectionTakeoff("S1", shapes, params, sheets);
  assert.equal(sectionPatch(link({ takeoff_sync: false }), t, false), null);
  assert.equal(sectionPatch(link({ sqft_override: 900, depth_in: 4 }), t, false), null);
});

test("a section whose last shape was deleted loses the size, not itself; one never linked is left alone", () => {
  const empty = sectionTakeoff("S9", shapes, params, sheets);
  assert.deepEqual(sectionPatch(link({ sqft_override: 900 }), empty, true), { sqft_override: null, count_qty: null, count_unit: null });
  assert.equal(sectionPatch(link({ sqft_override: 900 }), empty, false), null);
});

test("a first guess at the kind of area from the group's name", () => {
  assert.equal(workTypeFor("Front drive", "area"), "driveway");
  assert.equal(workTypeFor("Breakout & pour back", "area"), "demo");
  assert.equal(workTypeFor("Curb & gutter", "linear"), "curb");
  assert.equal(workTypeFor("Thing", "count"), "other");
});
