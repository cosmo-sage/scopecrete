import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOpenJob, monogram, spaceOf, jobTree, activeTreeRow, fmtPhone, phoneThreads, internalThreads, stageColor,
} from "../src/lib/v34/spaces.ts";

const ID = "0123abcd-0000-4000-8000-123456789abc";

test("open jobs are on the rail; complete, closed and lost are not", () => {
  for (const s of ["lead", "invited", "scoping", "quoted", "won", "scheduled", "in_progress", null]) assert.equal(isOpenJob(s), true, String(s));
  for (const s of ["complete", "closed", "lost"]) assert.equal(isOpenJob(s), false, s);
});

test("monogram takes two words' letters", () => {
  assert.equal(monogram("Wilson Driveway Repair"), "WD");
  assert.equal(monogram("Gulfline"), "GU");
  assert.equal(monogram("2635 Walker High"), "WH");
  assert.equal(monogram(""), "#");
});

test("a job's pages are its Space; everything else is Home", () => {
  assert.deepEqual(spaceOf(`/dashboard/scope/${ID}/plans`), { kind: "job", id: ID });
  assert.deepEqual(spaceOf(`/dashboard/scope/${ID}`), { kind: "job", id: ID });
  assert.deepEqual(spaceOf("/dashboard/scope"), { kind: "home" });
  assert.deepEqual(spaceOf("/dashboard/messages"), { kind: "home" });
});

test("Scope tracker shows once the job is won", () => {
  assert.equal(jobTree(ID, "quoted").some((r) => r.k === "tracker"), false);
  const won = jobTree(ID, "won");
  assert.equal(won.find((r) => r.k === "tracker")?.href, `/dashboard/scope/${ID}?tab=actuals`);
  assert.deepEqual(won.map((r) => r.k), ["summary", "plans", "budget", "market", "proposed", "tracker", "proposal", "files"]);
});

test("the tree row a page is on", () => {
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}/summary`, ""), "summary");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, "?tab=market"), "market");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, "?tab=actuals"), "tracker");
  assert.equal(activeTreeRow(`/dashboard/scope/${ID}`, ""), "proposed");
  assert.equal(activeTreeRow("/dashboard/messages", ""), "");
});

test("one Phone thread per number", () => {
  const rows = phoneThreads([
    { id: "a", name: "Jeremy Wright", phones: [{ phone: "+12255550118", label: null }, { phone: "+12255550119", label: "Office" }], email: null },
    { id: "b", name: null, phones: [{ phone: "+12255550120", label: null }], email: null },
  ]);
  assert.deepEqual(rows.map((r) => r.title), ["Jeremy Wright · Cell", "Jeremy Wright · Office", "(225) 555-0120"]);
  assert.equal(rows[1].href, `/dashboard/messages/a?channel=${encodeURIComponent("phone:+12255550119")}`);
  assert.equal(fmtPhone("+12255550118"), "(225) 555-0118");
  assert.equal(internalThreads([{ id: "a", name: "Jeremy Wright", phones: [], email: null }])[0].href, "/dashboard/messages/a?channel=notes");
});

test("stage colours are theme variables", () => {
  assert.match(stageColor("won"), /^var\(--sc-/);
  assert.match(stageColor("lead"), /^var\(--sc-hiviz\)$/);
});
