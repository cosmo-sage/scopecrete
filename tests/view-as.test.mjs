import { test } from "node:test";
import assert from "node:assert/strict";
import { readViewAs, writeBlocked, viewAsLine, jobsFor } from "../src/lib/view-as.ts";

const id = "1b2c3d4e-0000-4000-8000-00000000abcd";

test("reads only an id from the cookie", () => {
  assert.equal(readViewAs(id), id);
  assert.equal(readViewAs(id.toUpperCase()), id);
  assert.equal(readViewAs(""), null);
  assert.equal(readViewAs(undefined), null);
  assert.equal(readViewAs("x' or 1=1"), null);
});

test("writes are refused while viewing, except switching back and prefs", () => {
  assert.equal(writeBlocked("POST", "/api/jobs", false), false);
  assert.equal(writeBlocked("GET", "/api/jobs", true), false);
  assert.equal(writeBlocked("POST", "/api/jobs", true), true);
  assert.equal(writeBlocked("PATCH", "/api/jobs/abc", true), true);
  assert.equal(writeBlocked("DELETE", "/api/org/members/x", true), true);
  assert.equal(writeBlocked("DELETE", "/api/view-as", true), false);
  assert.equal(writeBlocked("POST", "/api/view-as/", true), false);
  assert.equal(writeBlocked("PATCH", "/api/prefs", true), false);
  assert.equal(writeBlocked("POST", "/api/view-ask", true), true);
});

test("the banner's line", () => {
  assert.equal(viewAsLine("Jeremy Wright", "Onsite estimator"), "Viewing as Jeremy Wright · Onsite estimator");
  assert.equal(viewAsLine(null, "Member"), "Viewing as a teammate · Member");
});

test("jobs an estimator was given", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(jobsFor(rows, null), rows);
  assert.deepEqual(jobsFor(rows, { limited: false, all_jobs: false, job_ids: [] }), rows);
  assert.deepEqual(jobsFor(rows, { limited: true, all_jobs: true, job_ids: [] }), rows);
  assert.deepEqual(jobsFor(rows, { limited: true, all_jobs: false, job_ids: ["b"] }), [{ id: "b" }]);
});
