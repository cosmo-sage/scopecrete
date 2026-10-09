import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGES, ALL_STATUSES, WON_STATUSES, BEFORE_WON, stageOf } from "../src/lib/jobs/stages.ts";

// Mirrors jobs_status_check (migration 034). If a status is added there, it must land in a stage.
const DB_STATUSES = ["invited", "lead", "consultation", "scoping", "quoted", "won", "lost", "scheduled", "in_progress", "complete", "closed"];

test("every database status sits in exactly one stage", () => {
  for (const s of DB_STATUSES) assert.equal(STAGES.filter((st) => st.statuses.includes(s)).length, 1, s);
  assert.deepEqual([...ALL_STATUSES].sort(), [...DB_STATUSES].sort());
});

test("Coy's columns, in order", () => {
  assert.deepEqual(STAGES.map((s) => s.label), ["New lead", "Consultation", "Estimating", "Follow up", "Won", "In progress", "Complete", "Lost"]);
});

test("moving into a stage sets a status that is in it", () => {
  for (const s of STAGES) assert.ok(s.statuses.includes(s.enter), s.k);
});

test("Won holds won and scheduled; In progress is its own column", () => {
  for (const s of ["won", "scheduled"]) assert.equal(stageOf(s).k, "won");
  assert.equal(stageOf("in_progress").k, "wip");
  assert.equal(stageOf(null).k, "new");
});

test("every status is either before the win, won, or lost", () => {
  assert.deepEqual([...BEFORE_WON, ...WON_STATUSES, "lost"].sort(), [...DB_STATUSES].sort());
});
