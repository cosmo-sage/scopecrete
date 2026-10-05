// Dusty's hello on an empty chat (src/lib/dusty/hello.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstName, greeting, partOfDay, pickThought, thoughtSource } from "../src/lib/dusty/hello.ts";

test("first name only, never an email", () => {
  assert.equal(firstName("Coy Sacco"), "Coy");
  assert.equal(firstName("  amber "), "Amber");
  assert.equal(firstName("coy@example.com"), null);
  assert.equal(firstName(""), null);
  assert.equal(firstName(null), null);
  assert.equal(firstName("(225) 555-0100"), null);
});

test("greeting uses the name, else the time of day in Central", () => {
  assert.equal(greeting("Coy Sacco", new Date()), "Hey Coy.");
  assert.equal(partOfDay(new Date("2026-10-05T14:00:00Z")), "Morning"); // 9 AM CDT
  assert.equal(partOfDay(new Date("2026-10-05T19:00:00Z")), "Afternoon");
  assert.equal(partOfDay(new Date("2026-10-05T23:30:00Z")), "Evening");
  assert.equal(greeting(null, new Date("2026-10-05T14:00:00Z")), "Morning.");
});

const T = [
  { id: "a", at: "2026-10-05T10:00:00Z", summary: "old one", contact_id: "p1" },
  { id: "b", at: "2026-10-05T12:00:00Z", summary: "new one", contact_id: "p2" },
  { id: "c", at: "2026-10-05T11:00:00Z", summary: "  ", contact_id: "p1" },
];

test("picks the newest, or one about the open person", () => {
  assert.equal(pickThought(T, 0)?.id, "b");
  assert.equal(pickThought(T, 0.99)?.id, "a");
  assert.equal(pickThought(T, 0.5, "p1")?.id, "a");
  assert.equal(pickThought(T, 0, "nobody")?.id, "b");
  assert.equal(pickThought([], 0), null);
});

test("source reads as a tail", () => {
  assert.equal(thoughtSource("From reading Dylan's calls and texts"), "reading Dylan's calls and texts");
  assert.equal(thoughtSource("A dream about today's calls and texts — Amber"), "a dream about today's calls and texts — Amber");
  assert.equal(thoughtSource(null), null);
});
