// A vendor's portal (migration 126) — `npm test`. Where each of their bid requests stands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorStage, groupPortalBids } from "../src/lib/bids.ts";

const base = { token: "t".repeat(32), job: "Driveway", address: null, price_by: null, pour_date: null, sent_at: "2026-10-20T15:00:00Z",
  answered_at: null, total: null, outcome: null, outcome_at: null, job_status: "invited", archived: false, closed: false };
const today = "2026-10-23";

test("Coy's mark wins over everything", () => {
  assert.deepEqual(vendorStage({ ...base, outcome: "awarded", job_status: "lost" }, today), { group: "won", label: "You got it" });
  assert.equal(vendorStage({ ...base, outcome: "not_chosen", answered_at: "2026-10-21" }, today).group, "lost");
});

test("a lost, archived or closed job is not won", () => {
  assert.equal(vendorStage({ ...base, job_status: "lost" }, today).label, "The job didn't go ahead");
  assert.equal(vendorStage({ ...base, archived: true }, today).group, "lost");
  assert.equal(vendorStage({ ...base, closed: true }, today).label, "Closed");
});

test("open: waiting, priced, or past its day", () => {
  assert.equal(vendorStage(base, today).label, "Waiting for your price");
  assert.match(vendorStage({ ...base, price_by: "2026-10-20" }, today).label, /passed/);
  assert.equal(vendorStage({ ...base, price_by: "2026-10-23" }, today).label, "Waiting for your price");
  assert.match(vendorStage({ ...base, answered_at: "2026-10-21", job_status: "won" }, today).label, /we won the job/);
  assert.equal(vendorStage({ ...base, answered_at: "2026-10-21" }, today).group, "open");
});

test("grouped in order", () => {
  const g = groupPortalBids([base, { ...base, outcome: "awarded" }, { ...base, job_status: "lost" }, { ...base, job: "Patio" }], today);
  assert.equal(g.open.length, 2); assert.equal(g.won.length, 1); assert.equal(g.lost.length, 1);
  assert.equal(g.open[1].job, "Patio");
});
