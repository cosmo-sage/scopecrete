import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshQuestion } from "../src/lib/dusty/price-refresh.ts";
import { priceAsk } from "../src/lib/dusty/web.ts";

test("refresh question names items and vendors and sets off the price search", () => {
  const q = refreshQuestion([{ name: "2x4x16 #2 pine (form lumber)", unit: "Each", vendors: ["Home Depot", "Lowe's"] }]);
  assert.match(q, /2x4x16 #2 pine/);
  assert.match(q, /vendor_price/);
  const ask = priceAsk(q);
  assert.ok(ask, "the question triggers WEB PRICES");
  assert.ok(ask.stores.includes("Home Depot"));
});
