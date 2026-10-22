import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCover, coverOf, proposalFileName, COVER_COLORS } from "../src/lib/proposal.ts";

test("coverOf fills Field with the first colors when nothing is saved", () => {
  const c = coverOf({});
  assert.equal(c.style, "field");
  assert.equal(c.dark, COVER_COLORS[0].dark ?? c.dark);
  assert.equal(c.lines.length, 3);
});

test("cleanCover keeps only what is valid", () => {
  const c = cleanCover({ style: "pour", dark: "#01224B", accent: "red", tag: "  ", lines: ["A", "B", "C", "D"], x: 1 });
  assert.equal(c.style, "pour");
  assert.equal(c.dark, "#01224B");
  assert.equal(c.accent, undefined);
  assert.equal(c.tag, undefined);
  assert.equal(c.lines.length, 3);
  assert.equal(cleanCover("nope"), undefined);
  assert.equal(cleanCover({ style: "fancy" }), undefined);
});

test("proposalFileName is the title and number, safe for a file", () => {
  assert.equal(proposalFileName("Wilson Driveway: Full / Repair", "SE-26-0013-A"), "Wilson Driveway Full Repair - SE-26-0013-A");
  assert.equal(proposalFileName("", ""), "Proposal");
  assert.ok(proposalFileName("x".repeat(300), "N").length <= 120);
});
