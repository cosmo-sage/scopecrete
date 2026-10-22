import { test } from "node:test";
import assert from "node:assert/strict";
import { runEach, bulkLabel, withTrade } from "../src/lib/bulk.ts";

test("runEach runs every id, keeps failures, respects the limit", async () => {
  let live = 0, peak = 0; const steps = [];
  const r = await runEach(["a", "b", "c", "d", "e"], async (id) => {
    live++; peak = Math.max(peak, live);
    await new Promise((res) => setTimeout(res, 5));
    live--;
    if (id === "c") throw new Error("nope");
  }, 2, (d) => steps.push(d));
  assert.deepEqual(r.ok.sort(), ["a", "b", "d", "e"]);
  assert.deepEqual(r.failed, [{ id: "c", error: "nope" }]);
  assert.equal(peak, 2);
  assert.deepEqual(steps, [1, 2, 3, 4, 5]);
});

test("runEach with nothing does nothing", async () => {
  assert.deepEqual(await runEach([], async () => {}), { ok: [], failed: [] });
});

test("bulkLabel", () => {
  assert.equal(bulkLabel({ ok: ["a", "b"], failed: [] }, ["customer", "customers"], "Set {n} to Commercial"), "Set 2 customers to Commercial");
  assert.equal(bulkLabel({ ok: ["a"], failed: [] }, ["job", "jobs"], "Moved {n} to Won"), "Moved 1 job to Won");
  assert.equal(bulkLabel({ ok: ["a"], failed: [{ id: "b", error: "No such job." }] }, ["job", "jobs"], "Moved {n} to Won"),
    "Moved 1 of 2 jobs to Won — 1 couldn't be changed: No such job.");
});

test("withTrade adds once and takes off whatever the case", () => {
  assert.deepEqual(withTrade(["Rebar"], "Pump", true), ["Rebar", "Pump"]);
  assert.deepEqual(withTrade(["Rebar", "pump"], "Pump", true), ["Rebar", "Pump"]);
  assert.deepEqual(withTrade(["Rebar", "Pump"], "pump", false), ["Rebar"]);
  assert.deepEqual(withTrade(null, "Pump", false), []);
});
