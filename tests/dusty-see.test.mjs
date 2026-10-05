import test from "node:test";
import assert from "node:assert/strict";
import { seeableMime, SEE_MAX_BYTES } from "../src/lib/dusty/see.ts";

test("photos the model takes are sent as images", () => {
  assert.equal(seeableMime("image/png", "Screenshot.png", 300_000), "image/png");
  assert.equal(seeableMime(null, "IMG_1.JPG", 10), "image/jpeg");
  assert.equal(seeableMime("image/jpeg; charset=binary", "x", 10), "image/jpeg");
});
test("other files and big photos wait for the reader", () => {
  assert.equal(seeableMime("image/heic", "IMG_2.HEIC", 10), null);
  assert.equal(seeableMime("application/pdf", "plans.pdf", 10), null);
  assert.equal(seeableMime("image/png", "big.png", SEE_MAX_BYTES + 1), null);
});
