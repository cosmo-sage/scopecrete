// Proposal numbers — SE-26-0001-A. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { orgInitials, versionLetter, centralYear, formatProposalNumber, jobSequences, numberer, isNewNumber } from "../src/lib/proposal-number.ts";

test("initials from the org's name", () => {
  assert.equal(orgInitials("Sacco Enterprises"), "SE");
  assert.equal(orgInitials("Sacco Enterprises, LLC"), "SE");
  assert.equal(orgInitials("gulfline paving inc."), "GP");
  assert.equal(orgInitials("A B C D E F"), "ABCD");
  assert.equal(orgInitials("O'Brien & Sons 2 Concrete"), "OSC");
  assert.equal(orgInitials(""), "P");
  assert.equal(orgInitials(null), "P");
  assert.equal(orgInitials("LLC"), "L");
});

test("version letters", () => {
  assert.deepEqual([1, 2, 26, 27, 28, 52, 53, 702, 703].map(versionLetter), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  assert.equal(versionLetter(0), "A");
});

test("the year is Central time", () => {
  assert.equal(centralYear("2027-01-01T03:00:00Z"), 2026); // still New Year's Eve in Baton Rouge
  assert.equal(centralYear("2027-01-01T07:00:00Z"), 2027);
});

test("format", () => {
  assert.equal(formatProposalNumber({ initials: "SE", year: 2026, seq: 1 }, 1), "SE-26-0001-A");
  assert.equal(formatProposalNumber({ initials: "SE", year: 2026, seq: 12 }, 3), "SE-26-0012-C");
  assert.equal(formatProposalNumber({ initials: "SE", year: 2026, seq: 12345 }, 1), "SE-26-12345-A");
  assert.ok(isNewNumber("SE-26-0001-A"));
  assert.ok(!isNewNumber("P-3"));
});

test("jobs numbered by their first proposal, per year, fixed order", () => {
  const rows = [
    { job_id: "b", created_at: "2026-10-03T22:58:15Z" },
    { job_id: "a", created_at: "2026-10-01T02:52:38Z" },
    { job_id: "b", created_at: "2026-10-04T01:44:37Z" }, // v2 doesn't move b
    { job_id: "d", created_at: "2026-10-05T00:00:00Z" },
    { job_id: "c", created_at: "2026-10-05T00:00:00Z" }, // same instant: by id
    { job_id: "e", created_at: "2027-01-02T18:00:00Z" },
  ];
  const s = jobSequences(rows);
  assert.deepEqual(s.get("a"), { year: 2026, seq: 1 });
  assert.deepEqual(s.get("b"), { year: 2026, seq: 2 });
  assert.deepEqual(s.get("c"), { year: 2026, seq: 3 });
  assert.deepEqual(s.get("d"), { year: 2026, seq: 4 });
  assert.deepEqual(s.get("e"), { year: 2027, seq: 1 });
  // A later job never moves an earlier one.
  const more = jobSequences([...rows, { job_id: "f", created_at: "2026-12-01T00:00:00Z" }]);
  for (const k of ["a", "b", "c", "d", "e"]) assert.deepEqual(more.get(k), s.get(k));
  assert.deepEqual(more.get("f"), { year: 2026, seq: 5 });
});

test("numberer: a job with no proposal yet gets the next place this year", () => {
  const n = numberer("Sacco Enterprises", [{ job_id: "a", created_at: "2026-10-01T02:52:38Z" }], new Date("2026-10-10T12:00:00Z"));
  assert.equal(n.number("a", 2), "SE-26-0001-B");
  assert.equal(n.number("new", 1), "SE-26-0002-A");
});
