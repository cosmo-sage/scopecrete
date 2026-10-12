import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionOf, concreteSection, pickPages, buildDigest, DIGEST_NAME } from "../src/lib/specs-digest.ts";

test("sectionOf reads headings, footers and old five-digit numbers", () => {
  assert.equal(sectionOf("SECTION 03 30 00\nCAST-IN-PLACE CONCRETE"), "03 30 00");
  assert.equal(sectionOf("PART 1 GENERAL ...\nReserve Sidewalk 03 30 00 - 5"), "03 30 00");
  assert.equal(sectionOf("SECTION 033000 - CAST-IN-PLACE"), "03 30 00");
  assert.equal(sectionOf("SECTION 03300 CONCRETE"), "03 30 00");
  assert.equal(sectionOf("No section here, 4,000 psi"), null);
});

test("concrete sections: division 03, rigid paving, curbs and walks", () => {
  assert.ok(concreteSection("03 30 00"));
  assert.ok(concreteSection("32 13 13"));
  assert.ok(concreteSection("32 16 23"));
  assert.ok(!concreteSection("32 31 13"));
  assert.ok(!concreteSection("01 10 00"));
  assert.ok(!concreteSection(null));
});

test("pickPages keeps a concrete section whole and carries it over its pages", () => {
  const pages = [
    "SECTION 01 10 00 SUMMARY OF WORK\nThe work includes a concrete sidewalk.",
    "SECTION 03 30 00 CAST-IN-PLACE CONCRETE\nPART 1 GENERAL\n1.1 Section includes formwork.",
    "2.1 MATERIALS\nA. Cement: ASTM C150, Type I. B. Aggregates: ASTM C33.",
    "SECTION 31 23 00 EXCAVATION AND FILL\nExcavate to subgrade.",
    "Concrete sidewalk 4 inches thick, 3000 psi, control joint every 5 feet, expansion joint at curb.",
  ];
  const kept = pickPages("Specs.pdf", pages);
  assert.deepEqual(kept.map((p) => p.page), [2, 3, 5]); // p.5 is earthwork that keeps talking about concrete
  assert.equal(kept[1].section, "03 30 00");
});

test("a page with no section is kept when it keeps talking about concrete", () => {
  const kept = pickPages("Book.pdf", ["Intro page", "Concrete sidewalk, 3000 psi, control joint, curb and gutter."]);
  assert.deepEqual(kept.map((p) => p.page), [2]);
});

test("buildDigest labels each page and says what was left out for room", () => {
  const pages = ["SECTION 03 30 00 CONCRETE\n" + "Concrete mix. ".repeat(50), "More 03 30 00 - 2 text " + "x".repeat(400)];
  const kept = pickPages("Reserve Specs.pdf", pages);
  const full = buildDigest([{ name: "Reserve Specs.pdf", pages: 200, kept }], new Date("2026-10-12T12:00:00Z"));
  assert.match(full.text, /^# Specs - read by Dusty/);
  assert.match(full.text, /## Reserve Specs\.pdf · p\.1 · Section 03 30 00/);
  assert.match(full.text, /2 of 200 pages/);
  assert.equal(full.left, 0);
  const small = buildDigest([{ name: "Reserve Specs.pdf", pages: 200, kept }], new Date(), 1200);
  assert.equal(small.pages, 1);
  assert.match(small.text, /1 more concrete page left out/);
  assert.equal(DIGEST_NAME, "Specs - read by Dusty.md");
});
