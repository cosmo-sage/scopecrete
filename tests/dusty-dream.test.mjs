// Dusty's dreams — what reaches the model and what reaches the screen. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTurns, sanitizeDreams, scrub } from "../supabase/functions/dusty-dream/rules.ts";

const turns = [
  { id: "m1", contact_id: "c1", who: "Amber", direction: "in", channel: "text", text: "Call me at (225) 555-0114 or amber@art.test", at: "2026-09-20T10:00:00Z" },
  { id: "m2", contact_id: "c1", who: "Amber", direction: "out", channel: "text", text: "Pouring Tuesday, rain or shine", at: "2026-09-20T11:00:00Z" },
  { id: "m3", contact_id: "c2", who: "Luis", direction: "in", channel: "call", text: "Asked if the crew could start early", at: "2026-09-21T09:00:00Z" },
];

test("numbers and emails never reach the model", () => {
  const r = renderTurns(turns);
  assert.doesNotMatch(r, /555|amber@/);
  assert.match(r, /#1 2026-09-20 TEXT AMBER: Call me at \[number\] or \[email\]/);
  assert.match(r, /#2 2026-09-20 TEXT COY:/);
  assert.equal(scrub("+1 225.555.0114"), "[number]");
});

test("dreams keep only clean, past-tense lines tied to real turns", () => {
  const d = sanitizeDreams({ dreams: [
    { text: "Coy promised a pour 'rain or shine' — bold words in Louisiana.", turns: [2] },
    { text: "Luis is on his way right now", turns: [3] },
    { text: "Call Amber at 225-555-0114", turns: [1] },
    { text: "That quote was $4,200", turns: [2] },
    { text: "No turns here" },
    { text: "Two people, one Tuesday.", turns: [1, 3, 99] },
  ] }, turns);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0].message_ids, ["m2"]);
  assert.deepEqual(d[1].contact_ids, ["c1", "c2"]);
});

test("junk answers give nothing", () => {
  assert.deepEqual(sanitizeDreams(null, turns), []);
  assert.deepEqual(sanitizeDreams({ dreams: "x" }, turns), []);
});
