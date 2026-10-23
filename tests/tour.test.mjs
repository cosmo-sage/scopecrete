// The first-login tour (src/lib/v34/tour.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tourSteps, seenTours, markSeen, autoTour, placeBubble } from "../src/lib/v34/tour.ts";

const JOB = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";

test("shell tour: desktop with Spaces walks rail, drawer, search, alerts, Dusty, settings", () => {
  const ids = tourSteps("shell", { layout: "desktop", spaces: true, name: "Jeremy Wright" }).map((s) => s.id);
  assert.deepEqual(ids, ["welcome", "rail", "home", "drawer", "search", "alerts", "dusty", "settings", "done"]);
});

test("shell tour: phone starts with the talk bar, has no docked Dusty, opens the Spaces", () => {
  const steps = tourSteps("shell", { layout: "phone", spaces: true });
  const ids = steps.map((s) => s.id);
  assert.equal(ids[1], "talk");
  assert.ok(!ids.includes("dusty"));
  assert.ok(steps.find((s) => s.id === "rail").spaces);
});

test("shell tour: old menu has its own steps", () => {
  const ids = tourSteps("shell", { layout: "desktop", spaces: false }).map((s) => s.id);
  assert.deepEqual(ids, ["welcome", "menu", "dusty", "done"]);
});

test("welcome greets by first name, never an email or number", () => {
  assert.match(tourSteps("shell", { layout: "desktop", spaces: true, name: "Jeremy Wright" })[0].title, /Jeremy$/);
  assert.equal(tourSteps("shell", { layout: "desktop", spaces: true, name: "jw@x.com" })[0].title, "Welcome to ScopeCrete");
  assert.equal(tourSteps("shell", { layout: "desktop", spaces: true, name: null })[0].title, "Welcome to ScopeCrete");
});

test("sample data: welcome says so and the last card opens the sample job", () => {
  const steps = tourSteps("shell", { layout: "desktop", spaces: true, sample: { job_id: JOB } });
  assert.match(steps[0].body, /sample/);
  assert.equal(steps.at(-1).cta.href, `/dashboard/scope/${JOB}/summary`);
  const none = tourSteps("shell", { layout: "desktop", spaces: true });
  assert.equal(none.at(-1).cta, undefined);
  assert.doesNotMatch(none[0].body, /sample customer/);
});

test("job tour", () => {
  const ids = tourSteps("job", { layout: "phone", spaces: true }).map((s) => s.id);
  assert.deepEqual(ids, ["job-welcome", "job-views", "job-name", "job-dusty", "job-done"]);
});

test("seen tours read and mark", () => {
  assert.deepEqual(seenTours(null), []);
  assert.deepEqual(seenTours(["shell", "x", "job"]), ["shell", "job"]);
  assert.deepEqual(markSeen(["shell"], "shell"), ["shell"]);
  assert.deepEqual(markSeen("junk", "job"), ["job"]);
});

test("autoTour: shell first anywhere on the dashboard, then job on a job page", () => {
  assert.equal(autoTour("/dashboard", []), "shell");
  assert.equal(autoTour(`/dashboard/scope/${JOB}/summary`, []), "shell");
  assert.equal(autoTour("/login", []), null);
  assert.equal(autoTour(`/dashboard/scope/${JOB}/summary`, ["shell"]), "job");
  assert.equal(autoTour("/dashboard/scope", ["shell"]), null);
  assert.equal(autoTour(`/dashboard/scope/${JOB}/summary`, ["shell", "job"]), null);
});

test("placeBubble: below, above, side, centre, always on screen", () => {
  const view = { width: 400, height: 800 }, b = { width: 300, height: 150 };
  assert.equal(placeBubble({ top: 50, left: 20, width: 100, height: 40 }, b, view).side, "below");
  assert.equal(placeBubble({ top: 700, left: 20, width: 100, height: 40 }, b, view).side, "above");
  const side = placeBubble({ top: 0, left: 0, width: 60, height: 800 }, { width: 200, height: 150 }, view);
  assert.equal(side.side, "right");
  assert.equal(placeBubble(null, b, view).side, "center");
  const p = placeBubble({ top: 50, left: 380, width: 20, height: 20 }, b, view);
  assert.ok(p.left + b.width <= view.width - 10 && p.left >= 10);
});

test("autoTour: Takeoffs and the Budget each get their own tour after the job one", () => {
  const sj = ["shell", "job"];
  assert.equal(autoTour(`/dashboard/scope/${JOB}/plans`, ["shell"]), "job");
  assert.equal(autoTour(`/dashboard/scope/${JOB}/plans`, sj), "takeoffs");
  assert.equal(autoTour(`/dashboard/scope/${JOB}`, sj), "budget");
  assert.equal(autoTour(`/dashboard/scope/${JOB}/`, sj), "budget");
  assert.equal(autoTour(`/dashboard/scope/${JOB}/files`, sj), null);
  assert.equal(autoTour(`/dashboard/scope/${JOB}/plans`, [...sj, "takeoffs"]), null);
  assert.equal(autoTour(`/dashboard/scope/${JOB}`, [...sj, "budget"]), null);
  assert.deepEqual(seenTours(["takeoffs", "budget", "nope"]), ["takeoffs", "budget"]);
});

test("Takeoffs and Budget tours: phone and desktop find their parts by the page's own labels", () => {
  for (const kind of ["takeoffs", "budget"]) {
    for (const layout of ["phone", "desktop"]) {
      const steps = tourSteps(kind, { layout, spaces: true });
      assert.ok(steps.length >= 6, `${kind} ${layout}`);
      assert.equal(steps[0].targets, undefined);
      assert.equal(steps.at(-1).targets, undefined);
      assert.match(steps.at(-1).body, /Take the tour again/);
    }
  }
  const phone = tourSteps("takeoffs", { layout: "phone", spaces: true });
  assert.deepEqual(phone.find((s) => s.id === "tk-tools").targets, ['[aria-label="Measuring tools"]']);
  const desk = tourSteps("takeoffs", { layout: "desktop", spaces: true });
  assert.deepEqual(desk.find((s) => s.id === "tk-tools").targets, ['[aria-label="Takeoff tools"]']);
  assert.doesNotMatch(phone.find((s) => s.id === "tk-sheets").body, /compare/);
  // The budget's drawer step slides the Work Spaces out on a phone only under the new navigation.
  assert.equal(tourSteps("budget", { layout: "phone", spaces: false }).find((s) => s.id === "bd-tools").spaces, false);
});
