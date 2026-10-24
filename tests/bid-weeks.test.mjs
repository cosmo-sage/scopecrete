import { test } from "node:test";
import assert from "node:assert/strict";
import { monthWeeks, calendarMonths, cleanWeeks, toggleWeek, weekLabel, weeksSummary, sharedWeeks } from "../src/lib/bid-weeks.ts";

test("weeks of a month by their days", () => {
  const nov = monthWeeks(2026, 11);
  assert.deepEqual(nov.map((w) => [w.n, w.from, w.to]), [[1, 1, 7], [2, 8, 14], [3, 15, 21], [4, 22, 28], [5, 29, 30]]);
  assert.equal(monthWeeks(2026, 2).length, 4);
  assert.equal(monthWeeks(2028, 2).at(-1).to, 29);
});

test("this month and the next three, past weeks marked", () => {
  const c = calendarMonths("2026-10-24");
  assert.deepEqual(c.map((m) => m.label), ["October 2026", "November 2026", "December 2026", "January 2027"]);
  assert.deepEqual(c[0].weeks.map((w) => w.past), [true, true, true, false, false]);
  assert.equal(c[3].weeks[0].key, "2027-01-w1");
});

test("keys cleaned, toggled, put in words", () => {
  assert.deepEqual(cleanWeeks(["2026-11-w3", "bad", "2026-11-w2", "2026-11-w2", 4, "2026-13-w1"]), ["2026-11-w2", "2026-11-w3"]);
  assert.deepEqual(toggleWeek(["2026-11-w2"], "2026-11-w2"), []);
  assert.deepEqual(toggleWeek(["2026-11-w3"], "2026-11-w1"), ["2026-11-w1", "2026-11-w3"]);
  assert.equal(weekLabel("2026-11-w5"), "Nov 29–30");
  assert.match(weeksSummary(["2026-11-w2", "2026-11-w3", "2026-11-w5", "2026-12-w1"]), /Nov( 2026)? wk 2–3, 5 · Dec( 2026)? wk 1/);
  assert.deepEqual(sharedWeeks(["2026-11-w2", "2026-11-w3"], ["2026-11-w3", "2026-12-w1"]), ["2026-11-w3"]);
});

test("a vendor's chat message is an alert to the job's bid request", async () => {
  const { bidMessageAlert } = await import("../src/lib/alerts.ts");
  const a = bidMessageAlert({ id: "m1", bid_request_id: "r1", author_name: "Luis", body: "Wk 2 works", created_at: "2026-10-24T15:00:00Z",
    vendor: { name: "Luis Garcia", phone: null }, request: { job_id: "j1", job: { title: "HPC lot" } } });
  assert.equal(a.id, "bm:m1");
  assert.equal(a.href, "/dashboard/scope/j1/summary?bid=r1");
  assert.match(a.title, /Luis Garcia wrote on your bid request · HPC lot/);
});
