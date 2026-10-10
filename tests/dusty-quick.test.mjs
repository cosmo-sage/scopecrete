// Dusty's quick selects and status line (src/lib/dusty/quick.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { quickFor, statusDetail } from "../src/lib/dusty/quick.ts";

test("each page gets its own quick selects, 7 at most", () => {
  const job = quickFor("/dashboard/scope/abc/budget");
  assert.equal(job[0].label, "Daily brief");
  assert.ok(job.some((q) => q.label === "Price this job" && q.more && !q.ask), "› items go in the box, not sent");
  assert.ok(job.length <= 7);
  assert.equal(quickFor("/dashboard/")[1].label, "What needs me");
  assert.equal(quickFor("/dashboard/messages/xyz?channel=notes")[0].label, "New text");
  assert.ok(quickFor("/dashboard/messages/xyz").some((q) => q.label === "Summarize this thread"));
  assert.equal(quickFor("/dashboard/customers/c1")[2].label, "Make a job from this");
  assert.equal(quickFor("/dashboard/contacts")[0].create, "contact");
  assert.ok(quickFor("/dashboard/price-book").length > 0, "the Price book has its own");
  assert.ok(!quickFor("/dashboard/scope").some((q) => q.label === "Price this job"), "the Jobs board is not a job");
  assert.equal(quickFor("/dashboard/vendors").find((q) => q.label === "Bill")?.create, "bill");
  for (const q of [...job, ...quickFor("/dashboard")]) assert.ok(q.ask || q.more || q.create, q.label);
});

test("the status line says what is real", () => {
  assert.equal(statusDetail("idle", { about: "Wilson Driveway", quick: true }), "Ask about Wilson Driveway, or pick something above");
  assert.equal(statusDetail("idle", {}), "Ask anything about your business");
  assert.equal(statusDetail("listening", { desktop: true }), "Go on — Ctrl + Enter sends it");
  assert.equal(statusDetail("listening", { hearing: true }), "writing down your voice note");
  assert.equal(statusDetail("thinking", { about: "Wilson Driveway" }), "Wilson Driveway");
  assert.equal(statusDetail("done", { note: "Applied 3 steps" }), "Applied 3 steps");
  assert.equal(statusDetail("warn", {}), "couldn't answer — try again");
});
