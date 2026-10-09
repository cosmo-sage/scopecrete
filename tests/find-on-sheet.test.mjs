// Where a section's line is written on its sheet — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findOnSheet, quotedLine } from "../src/lib/find-on-sheet.ts";

const REF = 'C3.0, C8.0 · "THICKENED PAVEMENT EDGE REF. SHEET C8.0 FOR DETAILS"';

test("the quoted line is read off the bid reference", () => {
  assert.equal(quotedLine(REF), "THICKENED PAVEMENT EDGE REF. SHEET C8.0 FOR DETAILS");
  assert.equal(quotedLine('C7.0 · "6" x 6" x 6\'CONC. PARKING LOG ANCHORED WITH REBAR #5 REBAR 12" LONG"'), '6" x 6" x 6\'CONC. PARKING LOG ANCHORED WITH REBAR #5 REBAR 12" LONG');
  assert.equal(quotedLine("C3.0"), null);
  assert.equal(quotedLine(null), null);
});

test("a label on two lines is one box; a second copy elsewhere is another", () => {
  const items = [
    { str: "THICKENED PAVEMENT EDGE", x: 100, y: 200, w: 90, h: 6 },
    { str: "REF. SHEET C8.0 FOR DETAILS", x: 100, y: 208, w: 100, h: 6 },
    { str: "THICKENED PAVEMENT EDGE", x: 600, y: 50, w: 90, h: 6 },
    { str: "REF. SHEET C8.0 FOR DETAILS", x: 600, y: 58, w: 100, h: 6 },
    { str: "CONSTRUCTION JOINT", x: 300, y: 300, w: 80, h: 6 },
  ];
  const hits = findOnSheet(items, quotedLine(REF));
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.words === h.of));
  assert.ok(hits[0].y < hits[1].y);
  assert.ok(hits[1].x < 100 && hits[1].w > 100);
});

test("one word per run still matches when the words sit together", () => {
  const items = ["THICKENED", "PAVEMENT", "EDGE"].map((s, i) => ({ str: s, x: 10 + i * 40, y: 10, w: 35, h: 5 }));
  assert.equal(findOnSheet(items, "THICKENED PAVEMENT EDGE").length, 1);
});

test("stray words of the line scattered over the sheet are no match", () => {
  const items = [
    { str: "PAVEMENT", x: 10, y: 10, w: 35, h: 5 },
    { str: "EDGE", x: 500, y: 400, w: 20, h: 5 },
    { str: "DETAILS", x: 900, y: 50, w: 30, h: 5 },
  ];
  assert.deepEqual(findOnSheet(items, quotedLine(REF)), []);
});

test("quote marks and inch marks don't stop a match", () => {
  const items = [{ str: "6” x 6” x 6’ CONC. PARKING LOG", x: 0, y: 0, w: 120, h: 6 }, { str: "ANCHORED WITH REBAR #5 REBAR 12” LONG", x: 0, y: 8, w: 140, h: 6 }];
  assert.equal(findOnSheet(items, '6" x 6" x 6\'CONC. PARKING LOG ANCHORED WITH REBAR #5 REBAR 12" LONG').length, 1);
});
