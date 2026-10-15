// The bid request revamp (Coy, 2026-10-15): sections with what they measure, the job's
// totals, no days, and a labor sub's pick. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shownScopes, jobTotals, measureLabel, defaultPick, laborVendor, isTimeUnit, answerTotal, TRADES } from "../src/lib/bids.ts";

const M = (m) => ({ sf: null, lf: null, count: null, count_unit: null, depth_in: null, concrete: false, ...m });
const scopes = [
  { key: "a", title: "6\" Standard duty", size: "18,299.64 SF · 6\"", measure: M({ sf: 18299.64, depth_in: 6, concrete: true }),
    lines: [{ id: "l1", name: "Class 6A4000 concrete", unit: "Cubic Yards", qty: 338, cost_type: "material" }] },
  { key: "b", title: "Limestone base", size: "18,299.64 SF", measure: M({ sf: 18299.64 }), lines: [] },
  { key: "c", title: "Concrete curb", size: "1,866.99 LF", measure: M({ lf: 1866.99, depth_in: 6, concrete: true }),
    lines: [{ id: "l2", name: "Form and Finish - Pin-on Curb", unit: "Days", qty: 9, cost_type: "labor" }] },
  { key: "d", title: "Handicap ramps", size: "4 EA", measure: M({ count: 4, count_unit: "EA", concrete: true }), lines: [] },
  { key: "job", title: "Whole job", size: null, lines: [
    { id: "l3", name: "Labor - Form and Finish, 6in", unit: "Man-days", qty: 60, cost_type: "labor" },
    { id: "l4", name: "Geotextile fabric", unit: "SY", qty: 4494.19, cost_type: "material" }] },
];

test("days, man-days and hours are time units; SF, LF and EA are not", () => {
  for (const u of ["Days", "day", "Man-days", "man days", "hrs", "Hours", "week", "MD"]) assert.ok(isTimeUnit(u), u);
  for (const u of ["SF", "LF", "EA", "Cubic Yards", "SY", null, "Each"]) assert.ok(!isTimeUnit(u), String(u));
});

test("a line in days goes with no quantity or unit; measures ride along; a section with no lines still shows", () => {
  const all = Object.fromEntries(scopes.map((s) => [s.key, true]));
  const out = shownScopes(scopes, { scopes: all });
  const curb = out.find((s) => s.key === "c");
  assert.equal(curb.lines[0].qty, null);
  assert.equal(curb.lines[0].unit, null);
  assert.equal(curb.measure.lf, 1866.99);
  assert.ok(out.find((s) => s.key === "b"), "the base shows with its SF");
  assert.equal(out.find((s) => s.key === "job").lines.find((l) => l.key === "l4").qty, 4494.19);
  assert.ok(!JSON.stringify(out).includes("cost_type"));
  // Quantities off: no measures either.
  assert.ok(shownScopes(scopes, { scopes: all, quantities: false }).every((s) => !s.measure));
});

test("job totals: area counts pours only, LF and counts apart", () => {
  const out = shownScopes(scopes, { scopes: Object.fromEntries(scopes.map((s) => [s.key, true])) });
  const t = jobTotals(out);
  assert.equal(t.sf, 18299.64);
  assert.equal(t.sy, 2033.29);
  assert.equal(t.lf, 1866.99);
  assert.deepEqual(t.counts, [{ unit: "EA", n: 4 }]);
  assert.deepEqual(jobTotals([{}, { measure: null }]), { sf: null, sy: null, lf: null, counts: [] });
});

test("a section's measure reads SF and SY, LF, or a count, with its thickness", () => {
  assert.equal(measureLabel(M({ sf: 2583.81, depth_in: 7 })), "2,583.81 SF · 287.09 SY · 7\" thick");
  assert.equal(measureLabel(M({ lf: 1866.99, depth_in: 6 })), "1,866.99 LF · 6\" thick");
  assert.equal(measureLabel(M({ count: 4, count_unit: "EA" })), "4 EA");
  assert.equal(measureLabel(null), null);
});

test("a labor sub starts with every labor line and no materials; sections still in", () => {
  const p = defaultPick(scopes, true);
  assert.deepEqual(p.lines, { l1: false, l2: true, l3: true, l4: false });
  assert.equal(p.scopes.a, true);
  assert.equal(p.scopes.job, true);
  const q = defaultPick(scopes, false);
  assert.ok(Object.values(q.lines).every(Boolean));
  const shown = shownScopes(scopes, { ...p });
  assert.deepEqual(shown.find((s) => s.key === "job").lines.map((l) => l.key), ["l3"]);
});

test("who prices labor: the Labor trade, or a sub", () => {
  assert.ok(TRADES.includes("Labor"));
  assert.ok(laborVendor({ trades: ["labor"] }));
  assert.ok(laborVendor({ trades: [], subtype: "subcontractor" }));
  assert.ok(!laborVendor({ trades: ["Ready-mix"], subtype: "supplier" }));
});

test("a price on a line in days counts once, not times the hidden days", () => {
  assert.equal(answerTotal([{ key: "x", name: "Form", qty: 9, unit: "Days", supplied: false }], { x: 4000 }), 4000);
});
