import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTINGS_SECTIONS, settingsSections, settingsSectionOf } from "../src/lib/v34/settings-sections.ts";
import { accessFrom, redirectFor } from "../src/lib/access.ts";

test("every section, or an estimator's two", () => {
  assert.deepEqual(settingsSections(false).map((s) => s.k), ["account", "organization", "lines", "cost-book", "templates", "appearance", "ai", "menus"]);
  assert.deepEqual(settingsSections(true).map((s) => s.k), ["account", "appearance"]);
});

test("the section a path is on", () => {
  assert.equal(settingsSectionOf("/dashboard/settings"), "");
  assert.equal(settingsSectionOf("/dashboard/settings/"), "");
  assert.equal(settingsSectionOf("/dashboard/settings/lines"), "lines");
  assert.equal(settingsSectionOf("/dashboard/settings/nope"), null);
  assert.equal(settingsSectionOf("/dashboard/settings-x"), null);
  assert.equal(settingsSectionOf("/dashboard/scope"), null);
});

test("what an estimator may open matches the sections they are shown", () => {
  const a = accessFrom({ role: "field", pages: [], all_jobs: true, job_ids: [] });
  for (const s of SETTINGS_SECTIONS) assert.equal(redirectFor(a, s.href) === null, !!s.field, s.k);
});
