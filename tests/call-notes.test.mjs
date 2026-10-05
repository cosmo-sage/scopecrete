// Notes on a live call attach to the call once it arrives — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { callForNote, windowFromPayload, quoteQuestion } from "../src/lib/call-notes.ts";

const calls = [
  { id: "a", start: "2026-10-02T20:41:18Z", end: "2026-10-02T20:49:07Z" },
  { id: "b", start: "2026-10-02T20:54:16Z", end: "2026-10-02T20:59:19Z" },
];

test("a note written during a call is that call's", () => {
  assert.equal(callForNote("2026-10-02T20:45:00Z", calls), "a");
  assert.equal(callForNote("2026-10-02T20:56:00Z", calls), "b");
});

test("opened as it rang, or finished just after hanging up", () => {
  assert.equal(callForNote("2026-10-02T20:40:00Z", calls), "a"); // 78 s before it rang
  assert.equal(callForNote("2026-10-02T21:10:00Z", calls), "b"); // 11 min after
});

test("during the next call beats the tail of the last one", () => {
  // 20:55 is 6 min after call a ended (inside its tail) and during call b.
  assert.equal(callForNote("2026-10-02T20:55:00Z", calls), "b");
});

test("outside every window it stays a plain note", () => {
  assert.equal(callForNote("2026-10-02T20:30:00Z", calls), null);
  assert.equal(callForNote("2026-10-02T21:20:00Z", calls), null);
  assert.equal(callForNote("not a date", calls), null);
  assert.equal(callForNote("2026-10-02T20:45:00Z", [{ id: "x", start: "2026-10-02T20:50:00Z", end: "2026-10-02T20:40:00Z" }]), null);
});

test("Quo's payload gives the window; without both ends there is none", () => {
  assert.deepEqual(windowFromPayload({ createdAt: "2026-10-02T20:54:16.822Z", completedAt: "2026-10-02T20:59:19+00:00" }),
    { start: "2026-10-02T20:54:16.822Z", end: "2026-10-02T20:59:19+00:00" });
  assert.deepEqual(windowFromPayload({ data: { object: { createdAt: "2026-10-02T20:54:16Z", completedAt: "2026-10-02T20:59:19Z" } } }),
    { start: "2026-10-02T20:54:16Z", end: "2026-10-02T20:59:19Z" });
  assert.equal(windowFromPayload({ createdAt: "2026-10-02T20:54:16Z" }), null);
  assert.equal(windowFromPayload(null), null);
});

test("the quote question names the caller and the call", () => {
  const q = quoteQuestion("Raynette Holloway", "2026-10-02T20:54:16Z");
  assert.match(q, /Raynette Holloway \(Fri, Oct 2, 3:54 PM\)/);
  assert.match(q, /Plan Room/);
});
