// Editing a sent bid request (migration 124) — `npm test`. The composer reopens on what was sent,
// the vendors already on it get words saying it changed, and an answer before the edit is flagged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickFromShown, shownScopes, bidUpdateText, answeredBeforeEdit } from "../src/lib/bids.ts";

const job = [
  { key: "s1", title: "Driveway", size: "600 SF", lines: [
    { id: "a", name: "Form & finish", unit: "SF", qty: 600, cost_type: "labor" },
    { id: "b", name: "Ready mix", unit: "CY", qty: 8, cost_type: "material" },
  ] },
  { key: "s2", title: "Walk", size: "80 SF", lines: [{ id: "c", name: "Finish", unit: "SF", qty: 80, cost_type: "labor" }] },
  { key: "s3", title: "Apron", size: null, lines: [{ id: "d", name: "Pour", unit: "SF", qty: 50, cost_type: "labor" }] },
];

test("the ticks come back from what was sent, and sending them again gives the same copy", () => {
  const sent = shownScopes(job, { scopes: { s1: true, s2: false, s3: false }, lines: { b: false }, supplied: {}, quantities: true });
  const pick = pickFromShown(job, sent);
  assert.deepEqual(pick.scopes, { s1: true, s2: false, s3: false });
  assert.equal(pick.lines.a, true);
  assert.equal(pick.lines.b, false);
  assert.equal(pick.lines.c, undefined); // a section not sent is left to the starting pick
  assert.deepEqual(shownScopes(job, { ...pick, quantities: true }), sent);
});

test("who supplies a line comes back as sent", () => {
  const sent = shownScopes(job, { scopes: { s1: true }, lines: {}, supplied: { b: false }, quantities: true });
  assert.equal(pickFromShown(job, sent).supplied.b, false);
  const sent2 = shownScopes(job, { scopes: { s1: true }, lines: {}, supplied: { b: true }, quantities: true });
  assert.equal(pickFromShown(job, sent2).supplied.b, true);
});

test("a line added to the budget since is left to the starting pick", () => {
  const sent = shownScopes(job, { scopes: { s1: true }, lines: {}, supplied: {}, quantities: true });
  const grown = [{ ...job[0], lines: [...job[0].lines, { id: "e", name: "Saw cut", unit: "LF", qty: 40, cost_type: "labor" }] }];
  assert.equal(pickFromShown(grown, sent).lines.e, false);
});

test("the update text keeps their link and asks for a new price only when they answered", () => {
  const w = { name: "Kim Lee", org: "Sacco Enterprises", job: "Wilson Driveway", scopes: [], size: null, street: null, pour: null, priceBy: "2026-10-30", url: "https://scopecrete.ai/b/x" };
  const t = bidUpdateText(w);
  assert.match(t, /^Kim — Sacco Enterprises updated the bid request for Wilson Driveway\./);
  assert.match(t, /Same link: https:\/\/scopecrete\.ai\/b\/x/);
  assert.match(t, /Price by Fri, Oct 30\. Same link/);
  assert.doesNotMatch(t, /check your price/);
  assert.match(bidUpdateText({ ...w, answered: true }), /check your price/);
});

test("an answer before the last edit is flagged, one after is not", () => {
  assert.equal(answeredBeforeEdit("2026-10-20T10:00:00Z", "2026-10-23T10:00:00Z"), true);
  assert.equal(answeredBeforeEdit("2026-10-24T10:00:00Z", "2026-10-23T10:00:00Z"), false);
  assert.equal(answeredBeforeEdit(null, "2026-10-23T10:00:00Z"), false);
  assert.equal(answeredBeforeEdit("2026-10-20T10:00:00Z", null), false);
});
