import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanThreadColors, withThreadColor, bucketThread, boxColor } from "../src/lib/v34/thread-colors.ts";

const ID = "11111111-2222-3333-4444-555555555555";

test("only known threads and #rrggbb colours are kept", () => {
  assert.deepEqual(cleanThreadColors({ personal: "#6a55b0", all: "#000000", [ID]: "#1e5aa8", spam: "red", x: "#123456" }), { personal: "#6A55B0", [ID]: "#1E5AA8" });
  assert.deepEqual(cleanThreadColors(null), {});
  assert.deepEqual(cleanThreadColors(["#123456"]), {});
});

test("a change sets or clears one thread", () => {
  const a = withThreadColor({}, "vendors", "#2a8c8c");
  assert.deepEqual(a, { vendors: "#2A8C8C" });
  assert.deepEqual(withThreadColor(a, "vendors", null), {});
  assert.deepEqual(withThreadColor(a, "nope", "#123456"), a);
});

test("a box takes the person's bucket, or the open thread Coy coloured", () => {
  assert.equal(bucketThread("personal"), "personal");
  assert.equal(bucketThread(null), "unsorted");
  assert.equal(boxColor("all", {}, "personal"), "var(--sc-bucket-personal)");
  assert.equal(boxColor("all", { all: "#123456" }, "vendor"), "var(--sc-bucket-vendor)");
  assert.equal(boxColor(ID, { [ID]: "#9B4F8C" }, "customer"), "#9B4F8C");
  assert.equal(boxColor(ID, {}, "customer"), "var(--sc-bucket-customer)");
});
