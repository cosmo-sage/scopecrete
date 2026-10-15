import test from "node:test";
import assert from "node:assert/strict";
import { measurementQty } from "../src/lib/takeoff.ts";

test("a linear takeoff's cutouts are taken off its length", () => {
  const sheet = { ft_per_pt: 1, method: "manual" };
  const m = { geometry: [[0, 0], [100, 0]], cutouts: [[[10, 0], [30, 0]]] };
  assert.equal(measurementQty("linear", m, sheet).qty, 80);
  assert.equal(measurementQty("linear", { geometry: m.geometry, cutouts: [] }, sheet).qty, 100);
});
