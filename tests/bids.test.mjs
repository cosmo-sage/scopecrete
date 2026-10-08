// Bid requests (migration 091) — `npm test`. The vendor's copy never carries a
// cost; stats, words, prior rates and totals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTrades, tradeCounts, hasTrade, shownScopes, bidStats, bidText, bidEmail, priorRates, answerTotal, hoursLabel } from "../src/lib/bids.ts";

test("trades are cleaned: known spelling, no repeats, 12 at most", () => {
  assert.deepEqual(cleanTrades(["  flatwork ", "Flatwork", "Rebar  & steel", "", 3, "Saw cutting"]), ["Flatwork", "Rebar & steel", "Saw cutting"]);
  assert.deepEqual(cleanTrades("Pumping, Ready-mix"), ["Pumping", "Ready-mix"]);
  assert.equal(cleanTrades(Array.from({ length: 20 }, (_, i) => `T${i}`)).length, 12);
  assert.deepEqual(cleanTrades(null), []);
});

test("trade counts list the known trades then the org's own", () => {
  const c = tradeCounts([{ trades: ["Flatwork"] }, { trades: ["flatwork", "Saw cutting"] }, { trades: null }]);
  assert.equal(c.find((x) => x.trade === "Flatwork").n, 2);
  assert.equal(c.at(-1).trade, "Saw cutting");
  assert.ok(hasTrade({ trades: ["Flatwork"] }, "FLATWORK"));
});

const SCOPES = [
  { key: "a1", title: "Pour & finish", size: "1,200 SF · 4\"", lines: [
    { id: "l1", name: "Concrete 3,500 psi", unit: "CY", qty: 16.333, cost_type: "material", unit_cost: 168, ext_cost: 2738 },
    { id: "l2", name: "Place, broom finish", unit: "SF", qty: 1200, cost_type: "labor", unit_cost: 2.1 },
  ] },
  { key: "a2", title: "Tear-out", size: null, lines: [{ id: "l3", name: "Break & haul", unit: "SF", qty: 1200, cost_type: "labor" }] },
];

test("the vendor's copy carries no cost, only what was ticked", () => {
  const s = shownScopes(SCOPES, { scopes: { a1: true }, lines: {}, supplied: {} });
  assert.equal(s.length, 1);
  assert.deepEqual(Object.keys(s[0].lines[0]).sort(), ["key", "name", "qty", "supplied", "unit"]);
  assert.equal(JSON.stringify(s).includes("168"), false);
  assert.equal(JSON.stringify(s).includes("2738"), false);
  assert.equal(s[0].lines[0].qty, 16.33);
  assert.equal(s[0].lines[0].supplied, true); // material: the org supplies it
  assert.equal(s[0].lines[1].supplied, false);
});

test("lines left out, supplied flipped, quantities hidden", () => {
  const s = shownScopes(SCOPES, { scopes: { a1: true, a2: true }, lines: { l2: false }, supplied: { l1: false }, quantities: false });
  assert.equal(s[0].lines.length, 1);
  assert.equal(s[0].lines[0].supplied, false);
  assert.equal(s[0].lines[0].qty, null);
  assert.equal(s[0].size, null);
  // A scope with every line left out is dropped.
  assert.equal(shownScopes(SCOPES, { scopes: { a2: true }, lines: { l3: false } }).length, 0);
});

test("stats: answered of sent, median time to a price", () => {
  const t = (h) => new Date(Date.UTC(2026, 9, 1) + h * 3_600_000).toISOString();
  const rows = [
    { sent_at: t(0), answered_at: t(2) }, { sent_at: t(0), answered_at: t(4) }, { sent_at: t(0), answered_at: null },
    { sent_at: null, answered_at: null }, { sent_at: t(0), answered_at: t(1), revoked_at: t(3) },
  ];
  const s = bidStats(rows);
  assert.equal(s.label, "2 of 3 answered");
  assert.equal(s.median_hours, 3);
  assert.equal(s.speed, "median 3h");
  assert.equal(bidStats([]).label, "No requests yet");
  assert.equal(hoursLabel(0.5), "30m");
  assert.equal(hoursLabel(72), "3 days");
});

test("the text names them, the work and the link", () => {
  const w = { name: "Luis Ortega", org: "Sacco Enterprises", job: "Wilson Driveway", scopes: ["Tear-out", "Pour & finish"], size: "1,200 SF",
    street: "4411 Perkins Rd", pour: "2026-10-14", priceBy: "2026-10-10", url: "https://scopecrete.ai/b/abc" };
  const t = bidText(w);
  assert.match(t, /^Luis — Sacco Enterprises has a job for you: Wilson Driveway\./);
  assert.match(t, /Tear-out and pour & finish, 1,200 SF at 4411 Perkins Rd, pour Wed, Oct 14\./);
  assert.match(t, /https:\/\/scopecrete\.ai\/b\/abc/);
  assert.match(t, /by Sat, Oct 10\. No login\.$/);
  assert.match(bidEmail(w).subject, /Wilson Driveway/);
  assert.match(bidText({ ...w, name: null, org: null }), /^We have a job/);
});

test("their rates: last price for the same line and unit; supplied lines skipped", () => {
  const lines = shownScopes(SCOPES, { scopes: { a1: true } })[0].lines;
  const r = priorRates(lines, [
    { at: "2026-09-01", lines: [{ name: "place broom finish", unit: "sf", price: 1.9 }] },
    { at: "2026-09-20", lines: [{ name: "Place, broom finish", unit: "SF", price: 2.1 }, { name: "Concrete 3,500 psi", unit: "CY", price: 150 }] },
  ]);
  assert.deepEqual(r, { l2: 2.1 });
});

test("a price per line adds up; supplied and blank lines don't count", () => {
  const lines = [{ key: "a", name: "x", qty: 1200, unit: "SF", supplied: false }, { key: "b", name: "y", qty: 16, unit: "CY", supplied: true },
    { key: "c", name: "z", qty: null, unit: null, supplied: false }];
  assert.equal(answerTotal(lines, { a: 2.1, b: 150, c: 300 }), 2820);
  assert.equal(answerTotal(lines, {}), null);
});
