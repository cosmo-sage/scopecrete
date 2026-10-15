import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorCompareQuestion } from "../src/lib/dusty/vendor-compare.ts";

test("names the item, each vendor's price and asks for vendor_price steps", () => {
  const q = vendorCompareQuestion("Expansion joint 1/2\"", "LF", [{ name: "Angelle", price: 1.2, website: "angelle.com" }, { name: "Casco", price: null }], "Casco");
  assert.match(q, /Expansion joint/);
  assert.match(q, /Angelle: \$1\.20\/LF · angelle\.com/);
  assert.match(q, /Casco: no price yet/);
  assert.match(q, /Also look at: Casco/);
  assert.match(q, /vendor_price/);
});
test("no vendors on file", () => {
  assert.match(vendorCompareQuestion("Mesh", null, []), /none on file yet/);
});
