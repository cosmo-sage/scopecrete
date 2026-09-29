// Dusty reading a file — `npm test`. A suggestion, and a number only if it's written in the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRead, parseReply, readable, numbersIn, clipText } from "../supabase/functions/read-files/rules.ts";

test("numbers written in a document, commas and all", () => {
  const n = numbersIn("4,000 PSI · 6\" slab · $12,480.50 total");
  assert.ok(n.has(4000) && n.has(6) && n.has(12480.5));
});

test("a number not written in the document is dropped; one that is, is kept", () => {
  const r = sanitizeRead({ summary: "Spec for the Parish sidewalk bid.", kind: "spec",
    facts: { psi: 4000, thickness_in: 5, amount: "$12,480.50", bid_due: "2026-10-14", dimensions: ["310 LF"], notes: [] } },
    "Concrete shall be 4,000 psi. Sidewalk 4\" thick. Total $12,480.50. Bids due 10/14/2026.");
  assert.equal(r.facts.psi, 4000);
  assert.equal(r.facts.amount, 12480.5);
  assert.equal(r.facts.thickness_in, undefined);
  assert.match(r.dropped.join("|"), /thickness_in: 5 is not written/);
  assert.equal(r.facts.bid_due, "2026-10-14");
  assert.deepEqual(r.facts.dimensions, ["310 LF"]);
  assert.equal(r.facts.notes, undefined);
});

test("a photo has no text to check against — sane numbers pass, insane ones don't", () => {
  const r = sanitizeRead({ summary: "Cracked driveway apron.", kind: "photo", facts: { psi: 99, thickness_in: 4 } }, null);
  assert.equal(r.facts.thickness_in, 4);
  assert.equal(r.facts.psi, undefined);
  assert.equal(r.kind, "photo");
});

test("no summary, no read; unknown kind becomes null; bad dates dropped", () => {
  assert.equal(sanitizeRead({ summary: "  ", facts: {} }, null), null);
  const r = sanitizeRead({ summary: "x", kind: "banana", facts: { date: "Oct 14" } }, null);
  assert.equal(r.kind, null);
  assert.equal(r.facts.date, undefined);
});

test("reply parsing finds the JSON inside prose", () => {
  assert.deepEqual(parseReply('Sure! {"summary":"a","facts":{}} done'), { summary: "a", facts: {} });
  assert.equal(parseReply("no json"), null);
});

test("what Dusty can read", () => {
  assert.deepEqual(readable("image", "image/jpeg", 1000), { ok: true, as: "image" });
  assert.equal(readable("image", "image/heic", 1000).ok, false);
  assert.equal(readable("image", "image/png", 6 * 1024 * 1024).ok, false);
  assert.deepEqual(readable("pdf", "application/pdf", 9e7), { ok: true, as: "pdf" });
  assert.equal(readable("sheet", null, 1).ok, false);
});

test("long documents are clipped from the end", () => {
  const { text, clipped } = clipText("a".repeat(50_000), 40_000);
  assert.equal(text.length, 40_000);
  assert.ok(clipped);
});
