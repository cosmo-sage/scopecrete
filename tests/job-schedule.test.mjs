import { test } from "node:test";
import assert from "node:assert/strict";
import { validDay, workEnd, statusForSchedule, daysUntil, whenLabel, dayLabel, comingUp } from "../src/lib/jobs/schedule.ts";

test("a day is a real calendar date", () => {
  assert.equal(validDay("2026-10-14"), "2026-10-14");
  assert.equal(validDay("2026-02-30"), null);
  assert.equal(validDay("Oct 14"), null);
  assert.equal(validDay(null), null);
});

test("the end counts work days, Mon–Fri", () => {
  assert.equal(workEnd("2026-10-14", 1), "2026-10-14"); // Wed
  assert.equal(workEnd("2026-10-14", 3), "2026-10-16"); // Wed → Fri
  assert.equal(workEnd("2026-10-16", 3), "2026-10-20"); // Fri → Tue
  assert.equal(workEnd("2026-10-17", 1), "2026-10-19"); // a Saturday start is Monday's work
  assert.equal(workEnd("2026-10-14", 2.5), "2026-10-16"); // part days round up
  assert.equal(workEnd("2026-10-14", null), "2026-10-14");
  assert.equal(workEnd("bad", 3), null);
});

test("a start moves Won to Scheduled and back", () => {
  assert.equal(statusForSchedule("won", true), "scheduled");
  assert.equal(statusForSchedule("scheduled", false), "won");
  assert.equal(statusForSchedule("scheduled", true), null);
  assert.equal(statusForSchedule("in_progress", false), null);
  assert.equal(statusForSchedule("quoted", true), null);
});

test("when labels", () => {
  assert.equal(daysUntil("2026-10-14", "2026-10-09"), 5);
  assert.equal(whenLabel("2026-10-09", "2026-10-09"), "today");
  assert.equal(whenLabel("2026-10-10", "2026-10-09"), "tomorrow");
  assert.equal(whenLabel("2026-10-14", "2026-10-09"), "in 5 days");
  assert.equal(whenLabel("2026-10-08", "2026-10-09"), "started yesterday");
  assert.equal(dayLabel("2026-10-14"), "Wed, Oct 14");
});

test("coming up: won or scheduled with a start, soonest first, a missed start kept a week", () => {
  const j = (id, status, start) => ({ id, title: id, status, scheduled_start: start, scheduled_end: null });
  const out = comingUp([j("a", "scheduled", "2026-10-20"), j("b", "scheduled", "2026-10-12"), j("c", "in_progress", "2026-10-11"),
    j("d", "won", null), j("e", "scheduled", "2026-09-01"), j("f", "scheduled", "2026-10-05")], "2026-10-09");
  assert.deepEqual(out.map((x) => x.id), ["f", "b", "a"]);
});
