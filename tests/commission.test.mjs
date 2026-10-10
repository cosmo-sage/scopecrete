import { test } from "node:test";
import assert from "node:assert/strict";
import { commissionOf, commissionSplit } from "../src/lib/commission.ts";

test("commission: saved %, else the old split, else 0", () => {
  assert.equal(commissionOf({ commission_pct: 40 }, "20_80"), 40);
  assert.equal(commissionOf({}, "20_80"), 20);
  assert.equal(commissionOf({}, "30_70"), 30);
  assert.equal(commissionOf(null, "none"), 0);
  assert.equal(commissionOf({ commission_pct: 0 }, "30_70"), 0);
});

test("commission: the partner gets the %, the rest is kept", () => {
  assert.deepEqual(commissionSplit(1000, 20), { partner: 200, kept: 800 });
  assert.deepEqual(commissionSplit(1000, 0), { partner: 0, kept: 1000 });
});
