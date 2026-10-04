import { test } from "node:test";
import assert from "node:assert/strict";
import { cityOf, sortJobs, filterJobs, cityCounts } from "../src/lib/jobs/board-view.ts";

test("the city is the job's own, else the part of the address after the street", () => {
  assert.equal(cityOf({ city: "baton rouge", address: null }), "Baton Rouge");
  assert.equal(cityOf({ city: null, address: "123 Example St, Baton Rouge, LA 70810" }), "Baton Rouge");
  assert.equal(cityOf({ city: null, address: "123 Example St, Denham Springs LA 70726" }), "Denham Springs");
  assert.equal(cityOf({ city: null, address: "123 Example St, Prairieville, LA, USA" }), "Prairieville");
  assert.equal(cityOf({ city: null, address: "123 Example St" }), null);
  assert.equal(cityOf({ city: null, address: "Lot 4, 70810" }), null);
});

const jobs = [
  { title: "Sample Driveway", contact_name: null, address: "1 A St, Baton Rouge, LA", job_type: "residential", created_at: "2026-10-01T00:00:00Z", stage_changed_at: "2026-10-03T00:00:00Z" },
  { title: "Example Patio", contact_name: null, address: "2 B St, Zachary, LA", job_type: "commercial", created_at: "2026-10-02T00:00:00Z", stage_changed_at: null },
  { title: null, contact_name: "Able", address: null, job_type: null, created_at: "2026-09-01T00:00:00Z", stage_changed_at: null },
];

test("sorts by date either way, by last move, and by name", () => {
  assert.deepEqual(sortJobs(jobs, "newest").map((j) => j.title), ["Example Patio", "Sample Driveway", null]);
  assert.deepEqual(sortJobs(jobs, "oldest").map((j) => j.title), [null, "Sample Driveway", "Example Patio"]);
  assert.deepEqual(sortJobs(jobs, "moved").map((j) => j.title), ["Sample Driveway", "Example Patio", null]);
  assert.deepEqual(sortJobs(jobs, "az").map((j) => j.title ?? j.contact_name), ["Able", "Example Patio", "Sample Driveway"]);
});

test("filters by type and city, with none for a blank", () => {
  assert.equal(filterJobs(jobs, { types: ["residential"], cities: [] }).length, 1);
  assert.equal(filterJobs(jobs, { types: ["none"], cities: [] })[0].contact_name, "Able");
  assert.equal(filterJobs(jobs, { types: [], cities: ["Zachary", "none"] }).length, 2);
  assert.deepEqual(cityCounts(jobs).map((c) => c.city), ["Baton Rouge", "Zachary", "none"]);
});
