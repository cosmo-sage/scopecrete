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

test("a version the customer signed on its link is the contract, whatever the dates", () => {
  const finals = [
    { id: "v1", version: 1, finalized_at: "2026-10-01T15:00:00Z", number: "P-1", total: 6000 },
    { id: "v2", version: 2, finalized_at: "2026-10-03T15:00:00Z", number: "P-2", total: 6450 },
  ];
  const c = contractFor(finals, "2026-10-05T17:00:00Z", [], [{ proposal_id: "v1", name: "Jeremy Wright", at: "2026-10-04T18:00:00Z" }]);
  assert.equal(c.version, 1);
  assert.equal(c.total, 6000);
  assert.deepEqual(c.signed, { name: "Jeremy Wright", at: "2026-10-04T18:00:00Z" });
  assert.equal(c.later_version, 2);
  // A signature on a version that isn't a final here is ignored; marked by hand there's none.
  assert.equal(contractFor(finals, "2026-10-05T17:00:00Z", [], [{ proposal_id: "zz", name: "X", at: null }]).signed, null);
  assert.equal(contractFor(finals, "2026-10-05T17:00:00Z").signed, null);
});

test("signed with add-ons, the contract is the total they signed for", () => {
  const finals = [{ id: "v1", version: 1, finalized_at: "2026-10-01T15:00:00Z", number: "P-1", total: 6000 }];
  const c = contractFor(finals, null, [{ price: 500, signed_at: "2026-10-06T00:00:00Z" }], [{ proposal_id: "v1", name: "A", at: "2026-10-02T00:00:00Z", total: 6450 }]);
  assert.equal(c.total, 6450);
  assert.equal(c.contract_total, 6950);
  // A signature from before 099 carries no total of its own: the proposal's.
  assert.equal(contractFor(finals, null, [], [{ proposal_id: "v1", name: "A", at: null, total: null }]).total, 6000);
});
