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

import { DEFAULT_SHELVES, cleanShelves, homeShelves, moveToShelf, nudge } from "../src/lib/v34/spaces.ts";

test("Home's default shelves; Logs and Roadmap left for Settings; the rest on More", () => {
  const pages = ["dashboard", "scopebuilder", "scope", "map", "camera", "contacts", "customers", "pricebook", "vendors", "files", "logs", "admin", "roadmap"];
  const s = homeShelves(null, pages);
  assert.deepEqual(s.map((x) => x.name), ["Buckets", "Scope Builder", "Toolbox", "More"]);
  assert.deepEqual(s[0].pages, ["customers", "contacts", "vendors", "scope"]);
  assert.deepEqual(s[2].pages, ["map", "camera", "pricebook", "files"]);
  assert.deepEqual(s[3].pages, ["dashboard", "admin"]);
  assert.ok(!s.flatMap((x) => x.pages).includes("logs"));
});

test("Coy's own shelves: renamed, added, a page only once, unknown pages dropped", () => {
  const saved = [{ id: "buckets", name: " People ", pages: ["customers", "customers", "nope"] }, { id: "s1", name: "Field", pages: ["camera", "map"] }, { id: "s1", name: "dup", pages: [] }, { name: "no id" }];
  const s = homeShelves(saved, ["customers", "camera", "map", "files"]);
  assert.deepEqual(s, [{ id: "buckets", name: "People", pages: ["customers"] }, { id: "s1", name: "Field", pages: ["camera", "map"] }, { id: "more", name: "More", pages: ["files"] }]);
  assert.equal(cleanShelves("x"), null);
  assert.deepEqual(cleanShelves([]), []);
});

test("moving a page between shelves, and nudging order", () => {
  const m = moveToShelf(DEFAULT_SHELVES, "map", "buckets");
  assert.deepEqual(m[0].pages.at(-1), "map");
  assert.ok(!m[2].pages.includes("map"));
  assert.deepEqual(nudge([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(nudge([1, 2, 3], 0, -1), [1, 2, 3]);
});
