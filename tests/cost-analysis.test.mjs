// The budget's Cost Analysis — `npm test`. Sums of the engine's own line results,
// spread over SF / SY / LF, and the crew's profit per day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, crewMath, perUnit, bucketOf } from "../src/lib/cost-analysis.ts";

const near = (a, b, d = 0.01) => assert.ok(Math.abs(a - b) < d, `${a} ≈ ${b}`);
const L = (id, cost_type, section_id, ext_cost, overhead, ext_price) =>
  ({ id, name: id, cost_type, section_id, qty: 1, unit: "EA", unit_cost: ext_cost, ext_cost, overhead, ext_price });

// Wilson's driveway, the brief's sample: 894 SF, $9,650.
const wilson = [
  L("mix", "material", "d", 2480, 372, 3296),
  L("crew", "labor", "d", 2320, 348, 3083),
  L("bobcat", "equipment", "d", 620, 93, 824),
  L("dump", "other", null, 873, 131, 2447),
];
const drive = [{ id: "d", name: "Drive", sqft: 894, lf: null }];

test("rows by cost type; misc is 'other'; subcontract only when there is one", () => {
  const a = analyse(wilson, drive, { section: "all", tax: 0, discount: 0 });
  assert.deepEqual(a.rows.map((r) => r.label), ["Materials", "Labor", "Equipment", "Miscellaneous"]);
  assert.equal(bucketOf("weird"), "other");
  const b = analyse([...wilson, L("sub", "subcontract", "d", 100, 15, 150)], drive, { section: "all", tax: 0, discount: 0 });
  assert.ok(b.rows.some((r) => r.label === "Subcontract"));
});

test("gross = price − discount − direct; net = gross − O.H.", () => {
  const a = analyse(wilson, drive, { section: "all", tax: 330, discount: 0 });
  assert.equal(a.direct, 6293);
  assert.equal(a.overhead, 944);
  assert.equal(a.price, 9650);
  assert.equal(a.gross, 3357);
  assert.equal(a.net, 2413);
  assert.equal(a.total, 9980);
  near(a.margin, 0.25, 0.001);
  near(perUnit(a.price, a.units.sf), 10.79);
  near(perUnit(a.price, a.units.sy), 97.15);
  const d = analyse(wilson, drive, { section: "all", tax: 0, discount: 150 });
  assert.equal(d.gross, 3207);
  assert.equal(d.net, 2263);
});

test("one section leaves out whole-job costs, tax and discount; LF areas spread by LF", () => {
  const areas = [...drive, { id: "c", name: "Curb", sqft: 215, lf: 430 }];
  const ls = [...wilson, L("curb", "labor", "c", 1290, 194, 1700)];
  const d = analyse(ls, areas, { section: "d", tax: 300, discount: 50 });
  assert.equal(d.direct, 5420);
  assert.equal(d.tax, 0);
  assert.equal(d.units.sf, 894);
  assert.equal(d.units.lf, 0);
  const c = analyse(ls, areas, { section: "c", tax: 0, discount: 0 });
  assert.equal(c.units.lf, 430);
  assert.equal(c.units.sf, 0);
  near(perUnit(c.direct, c.units.lf), 3);
  const all = analyse(ls, areas, { section: "all", tax: 0, discount: 0 });
  assert.equal(all.units.sf, 894, "a curb's plan area is not counted in $/SF");
  assert.equal(all.units.lf, 430);
});

test("an unpriced line is left out and listed", () => {
  const a = analyse([...wilson, L("pump", "equipment", "d", null, null, null)], drive, { section: "all", tax: 0, discount: 0 });
  assert.equal(a.unpriced.length, 1);
  assert.equal(a.direct, 6293);
});

test("crew of 4 for 2 days: man-hours, SF a day, labor per hour, profit per day", () => {
  const a = analyse(wilson, drive, { section: "all", tax: 0, discount: 0 });
  const c = crewMath({ size: 4, days: 2, hours: null }, a);
  assert.equal(c.ok, true);
  assert.equal(c.hours, 8);
  assert.equal(c.manDays, 8);
  assert.equal(c.manHours, 64);
  assert.equal(c.sfPerDay, 447);
  near(c.laborPerHour, 36.25);
  near(c.grossPerDay, 1678.5);
  near(c.netPerDay, 1206.5);
  near(c.netPerManDay, 301.63);
  const n = crewMath({ size: null, days: 2, hours: 10 }, a);
  assert.deepEqual(n.needs, ["crew size"]);
  near(n.netPerDay, 1206.5);
  assert.equal(n.manHours, null);
});
