// Sheets side by side in Takeoffs — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addPane, cleanCompare, closePane, gridFor, linkedZoom, startPanes } from "../src/lib/sheet-compare.ts";

const all = ["a", "b", "c", "d", "e"];
const base = { panes: ["a", "b"], layout: "side", active: 0, link: false, max: null, split: 0.5 };

test("a compare starts with the current sheet and the next, or the ones ticked", () => {
  assert.deepEqual(startPanes(all, "c", undefined, false), ["c", "d"]);
  assert.deepEqual(startPanes(all, "e", undefined, false), ["e", "a"]);
  assert.deepEqual(startPanes(all, "c", ["e", "a", "c"], false), ["c", "a", "e"]);
  assert.deepEqual(startPanes(all, "a", ["a", "b", "c", "d", "e"], false).length, 4);
  assert.deepEqual(startPanes(all, "a", ["a", "b", "c"], true), ["a", "b"]);
  assert.deepEqual(startPanes(["a"], "a", undefined, false), ["a"]);
});

test("panes added and closed keep the layout and the active pane", () => {
  const three = addPane(base, all, false);
  assert.deepEqual(three.panes, ["a", "b", "c"]);
  assert.equal(three.layout, "three");
  assert.equal(addPane({ ...base, panes: ["a", "b", "c", "d"] }, all, false), null);
  assert.equal(addPane(base, all, true), null);
  const c = closePane({ ...three, active: 2 }, 0);
  assert.deepEqual(c.panes, ["b", "c"]);
  assert.equal(c.active, 1);
  assert.equal(c.layout, "side");
  assert.equal(closePane(base, 1), null);
  assert.equal(closePane({ ...three, active: 1 }, 1).active, 1);
});

test("a saved compare is checked when it is read back", () => {
  const ids = new Set(["a", "b", "c"]);
  assert.equal(cleanCompare(null, ids, false), null);
  assert.equal(cleanCompare({ panes: ["x", "y"] }, ids, false), null);
  const r = cleanCompare({ panes: ["x", "b"], active: 0, layout: "stack", split: 9 }, ids, false);
  assert.deepEqual(r.panes, ["x", "b"]); // a removed sheet stays, shown as removed
  assert.equal(r.active, 1);
  assert.equal(r.split, 0.5);
  assert.equal(r.layout, "stack");
  assert.equal(cleanCompare({ panes: ["a", "b", "c"], layout: "three" }, ids, true).panes.length, 2);
  assert.equal(gridFor(4, "stack"), "four");
});

test("linked panes match feet when both sheets have a scale, else the page", () => {
  const a = { page_w: 2448, scale_ft_per_pt: 20 / 72 };
  const b = { page_w: 2448, scale_ft_per_pt: 40 / 72 };
  // b is drawn at twice the feet per point, so it zooms in twice as far to show a foot as big.
  assert.ok(Math.abs(linkedZoom(1, a, 600, b, 600) - 2) < 1e-9);
  assert.ok(Math.abs(linkedZoom(1.5, a, 600, { ...a }, 600) - 1.5) < 1e-9);
  assert.equal(linkedZoom(2, a, 600, { page_w: 1224, scale_ft_per_pt: null }, 300), 2);
  assert.equal(linkedZoom(6, a, 600, b, 600), 8);
});
