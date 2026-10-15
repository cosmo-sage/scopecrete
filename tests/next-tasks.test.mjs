import { test } from "node:test";
import assert from "node:assert/strict";
import { sameTask, dedupeTasks, shortTask, repeatsStep } from "../src/lib/next-tasks.ts";
import { sameTask as readerSame } from "../supabase/functions/enrich-contacts/rules.ts";

// Gulfline's HPC parking lot card, 2026-10-15.
const pairs = [
  ["Confirm AERIAL 2 = demo only on the plan", "Answer the demo-only question on AERIAL 2", true],
  ["Send the walkway repair price", "Send the driveway repair price", false],
  ["Reply to Jeremy on the Chase bollard quote", "Send a price for 6 bollards + 1 ADA sign at the Gonzalez Chase", false],
  ["Send the walkway price", "Send the walkway price.", true],
  ["Call back", "Call back", true],
];

test("same to-do, worded twice", () => {
  for (const [a, b, want] of pairs) {
    assert.equal(sameTask(a, b), want, `${a} / ${b}`);
    assert.equal(readerSame(a, b), want, `reader: ${a} / ${b}`);
  }
});

test("the first of each is kept", () => {
  const got = dedupeTasks([{ title: "Confirm AERIAL 2 = demo only on the plan" }, { title: "Answer the demo-only question on AERIAL 2" }, { title: "Reply to Jeremy on the Chase bollard quote" }]);
  assert.deepEqual(got.map((t) => t.title), ["Confirm AERIAL 2 = demo only on the plan", "Reply to Jeremy on the Chase bollard quote"]);
});

test("fewer words", () => {
  assert.equal(shortTask("Confirm whether proposal covers only curb demo per Jeremy's 10/11 clarification"), "Confirm proposal covers only curb demo");
  assert.equal(shortTask("Answer Jeremy's project-confusion question (#7) and clarify which project needs stump grinding"), "Answer Jeremy's project-confusion question and clarify which project needs stump grinding");
  assert.equal(shortTask("Send the walkway price"), "Send the walkway price");
  assert.ok(repeatsStep("Finish scoping LaRochelle Driveway Repair: check their photos, measure it, then build the budget"));
  assert.ok(!repeatsStep("Send the price"));
});
