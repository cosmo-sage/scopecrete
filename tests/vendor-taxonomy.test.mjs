import { test } from "node:test";
import assert from "node:assert/strict";
import { TRADES } from "../src/lib/bids.ts";
import {
  TRADE_KIND, cleanKinds, cleanTradeList, defaultTrades, groupTrades, kindSlug, renameOnVendor, taxonomyLines, withVendorTrades,
} from "../src/lib/vendor-taxonomy.ts";

test("every app trade has a kind, as migration 129 seeds it", () => {
  for (const t of TRADES) assert.ok(TRADE_KIND[t], t);
  assert.equal(defaultTrades().find((t) => t.name === "Ready-mix").kind, "supplier");
});

test("kindSlug makes a slug and never one taken", () => {
  assert.equal(kindSlug("Ready Mix"), "ready_mix");
  assert.equal(kindSlug("Tools & Fasteners"), "tools_and_fasteners");
  assert.equal(kindSlug("Supplier", ["supplier"]), "supplier_2");
  assert.equal(kindSlug("!!!"), "kind");
});

test("cleanKinds drops blanks and repeats and keeps order", () => {
  const k = cleanKinds([{ slug: "supplier", label: " Supplier " }, { label: "supplier" }, { label: "" }, { label: "Testing labs" }]);
  assert.deepEqual(k, [{ slug: "supplier", label: "Supplier" }, { slug: "testing_labs", label: "Testing labs" }]);
});

test("cleanTradeList keeps a kind only when it exists", () => {
  const t = cleanTradeList([{ name: "Flatwork", kind: "subcontractor" }, { name: "flatwork" }, { name: "Saw cutting", kind: "nope" }], ["subcontractor"]);
  assert.deepEqual(t, [{ name: "Flatwork", kind: "subcontractor" }, { name: "Saw cutting", kind: null }]);
});

test("groupTrades nests trades under kinds, loose ones last", () => {
  const g = groupTrades([{ slug: "a", label: "A" }, { slug: "b", label: "B" }], [{ name: "x", kind: "a" }, { name: "y", kind: "gone" }]);
  assert.deepEqual(g.map((x) => [x.kind?.slug ?? null, x.trades.map((t) => t.name)]), [["a", ["x"]], ["b", []], [null, ["y"]]]);
});

test("withVendorTrades adds trades typed on vendors and counts", () => {
  const t = withVendorTrades([{ name: "Flatwork", kind: "subcontractor" }], [{ trades: ["flatwork", "Saw cutting"] }, { trades: ["Flatwork"] }]);
  assert.deepEqual(t, [{ name: "Flatwork", kind: "subcontractor", n: 2 }, { name: "Saw cutting", kind: null, n: 1 }]);
});

test("renameOnVendor renames, removes and never doubles", () => {
  assert.deepEqual(renameOnVendor(["Flatwork", "Stamping"], "flatwork", "Finishing"), ["Finishing", "Stamping"]);
  assert.deepEqual(renameOnVendor(["Flatwork", "Finishing"], "Flatwork", "Finishing"), ["Finishing"]);
  assert.deepEqual(renameOnVendor(["Flatwork"], "Flatwork", null), []);
});

test("taxonomyLines reads as kind › trades", () => {
  assert.deepEqual(taxonomyLines([{ slug: "s", label: "Supplier" }], [{ name: "Ready-mix", kind: "s" }, { name: "Odd", kind: null }]),
    ["Supplier › Ready-mix", "Other trades › Odd"]);
});
