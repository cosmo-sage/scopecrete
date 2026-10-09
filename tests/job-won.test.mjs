import { test } from "node:test";
import assert from "node:assert/strict";
import { contractFor, wonAtFromDay } from "../src/lib/jobs/won.ts";

const now = new Date("2026-10-09T22:00:00Z");

test("a won day is noon Central, today or earlier", () => {
  assert.equal(wonAtFromDay("2026-10-08", now), "2026-10-08T17:00:00.000Z");
  assert.ok(wonAtFromDay("2026-10-09", now));
  assert.equal(wonAtFromDay("2026-10-10", now), null);
  assert.equal(wonAtFromDay("2026-02-30", now), null);
  assert.equal(wonAtFromDay("Oct 8", now), null);
});

const v1 = { id: "a", version: 1, finalized_at: "2026-10-01T15:00:00Z", number: "P-12", total: 6450 };
const v2 = { id: "b", version: 2, finalized_at: "2026-10-05T15:00:00Z", number: "P-12", total: 7000 };

test("the contract is the newest final frozen at or before the win", () => {
  const c = contractFor([v1, v2], "2026-10-03T12:00:00Z");
  assert.equal(c.proposal_id, "a");
  assert.equal(c.contract_total, 6450);
  assert.equal(c.later_version, 2);
  assert.equal(contractFor([v1, v2], "2026-10-06T12:00:00Z").proposal_id, "b");
});

test("no win date yet → the newest final; nothing final before the win → none", () => {
  assert.equal(contractFor([v1, v2], null).version, 2);
  assert.equal(contractFor([v2], "2026-10-02T00:00:00Z"), null);
  assert.equal(contractFor([], null), null);
});

test("signed change orders add to the contract, unsigned don't", () => {
  const c = contractFor([v1], "2026-10-02T00:00:00Z", [{ price: 500, signed_at: "2026-10-08T00:00:00Z" }, { price: 900, signed_at: null }]);
  assert.equal(c.change_orders, 500);
  assert.equal(c.change_order_count, 1);
  assert.equal(c.contract_total, 6950);
});
