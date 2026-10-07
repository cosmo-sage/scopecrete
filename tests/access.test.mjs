import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFrom, can, menuPages, redirectFor, accessSummary, FULL_ACCESS } from "../src/lib/access.ts";

const J1 = "8541550a-3c7e-479b-8304-17248dc48b2a";
const J2 = "31268694-3176-49d1-8226-0ab26673b1a7";

test("owners and members have everything", () => {
  for (const role of ["owner", "member", "billing", null]) {
    const a = accessFrom({ role, pages: ["files"], job_ids: [J1] });
    assert.deepEqual(a, FULL_ACCESS);
    assert.equal(can(a, "budget"), true);
    assert.equal(menuPages(a), null);
    assert.equal(redirectFor(a, "/dashboard/messages"), null);
  }
  assert.deepEqual(accessFrom(null), FULL_ACCESS);
});

test("an estimator keeps only the pages they were given, unknown ones dropped", () => {
  const a = accessFrom({ role: "field", pages: ["plan_room", "cash"], all_jobs: false, job_ids: [J1] });
  assert.equal(a.limited, true);
  assert.deepEqual(a.pages, ["plan_room"]);
  assert.equal(can(a, "plan_room"), true);
  assert.equal(can(a, "budget"), false);
  assert.deepEqual(menuPages(a), ["scope", "roadmap"]);
  assert.deepEqual(menuPages({ ...a, pages: ["files"] }), ["scope", "files", "roadmap"]);
});

test("an estimator is sent to the board from anywhere else", () => {
  const a = accessFrom({ role: "field", pages: ["files"], all_jobs: false, job_ids: [J1] });
  assert.equal(redirectFor(a, "/dashboard"), "/dashboard/scope");
  assert.equal(redirectFor(a, "/dashboard/messages/abc"), "/dashboard/scope");
  assert.equal(redirectFor(a, "/dashboard/customers"), "/dashboard/scope");
  assert.equal(redirectFor(a, "/dashboard/scope"), null);
  assert.equal(redirectFor(a, "/dashboard/roadmap"), null);
  assert.equal(redirectFor(a, "/dashboard/files"), null);
  assert.equal(redirectFor({ ...a, pages: [] }, "/dashboard/files"), "/dashboard/scope");
});

test("a job: only theirs; the Plan Room only with the page; never the proposal", () => {
  const a = accessFrom({ role: "field", pages: ["files"], all_jobs: false, job_ids: [J1] });
  assert.equal(redirectFor(a, `/dashboard/scope/${J1}`), null);
  assert.equal(redirectFor(a, `/dashboard/scope/${J2}`), "/dashboard/scope");
  assert.equal(redirectFor(a, `/dashboard/scope/${J1}/plans`), `/dashboard/scope/${J1}`);
  assert.equal(redirectFor({ ...a, pages: ["plan_room"] }, `/dashboard/scope/${J1}/plans`), null);
  assert.equal(redirectFor(a, `/dashboard/scope/${J1}/proposal`), `/dashboard/scope/${J1}`);
  assert.equal(redirectFor({ ...a, pages: ["files", "plan_room", "budget"] }, `/dashboard/scope/${J1}/summary`), `/dashboard/scope/${J1}`);
  assert.equal(redirectFor(FULL_ACCESS, `/dashboard/scope/${J1}/summary`), null);
  assert.equal(redirectFor({ ...a, all_jobs: true }, `/dashboard/scope/${J2}`), null);
});

test("the summary line", () => {
  assert.equal(accessSummary({ pages: ["files", "plan_room"], all_jobs: false, job_ids: [J1] }), "1 job · Photos & files, Takeoffs");
  assert.equal(accessSummary({ pages: [], all_jobs: true, job_ids: [] }), "every job · the job page only");
  assert.equal(accessSummary({ pages: ["budget"], all_jobs: false, job_ids: [J1, J2] }), "2 jobs · Budget");
});

test("an access request is cleaned before it reaches the database", async () => {
  const { readAccess } = await import("../src/lib/access.ts");
  const r = readAccess({ role: "field", contact_id: J1, pages: ["files", "cash", "files"], all_jobs: "yes", job_ids: [J1, "nope", J1] });
  assert.deepEqual(r, { role: "field", contact_id: J1, pages: ["files"], all_jobs: false, job_ids: [J1] });
  assert.equal(readAccess({ role: "superadmin" }).role, null);
  assert.deepEqual(readAccess(null), { role: null, contact_id: null, pages: [], all_jobs: false, job_ids: [] });
});
