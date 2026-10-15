// Find zones — Dusty points, Fill traces (src/lib/plan-zones.ts). `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanZones, toPage, seedTries, judgeTrace, sameZone, groupNameFor, matchGroup } from "../src/lib/plan-zones.ts";

test("the model's read is kept only where it is the shape asked for", () => {
  const r = cleanZones({
    legend: [
      { key: "A", label: "Light duty concrete pavement", thickness_in: 5, pattern: "dots" },
      { key: "B", label: "Standard duty", thickness_in: "6" },
      { key: "A", label: "duplicate" },
      { key: "C", label: "" },
    ],
    zones: [
      { legend: "A", seed: [400, 300], outline: [[350, 250], [450, 250], [450, 350], [350, 350]], confidence: "high" },
      { legend: "B", seed: [600, 700], outline: [[1, 2]] },
      { legend: "Z", seed: [100, 100] },
      { legend: "A", seed: [1200, 100] },
      { legend: "B", seed: "middle" },
    ],
    notes: "  check   the 7\" ",
  });
  assert.equal(r.legend.length, 2);
  assert.equal(r.legend[1].thickness_in, 6);
  assert.equal(r.zones.length, 2);
  assert.equal(r.zones[0].outline.length, 4);
  assert.deepEqual(r.zones[1].outline, []);
  assert.equal(r.zones[1].confidence, "medium");
  assert.equal(r.notes, 'check the 7"');
  assert.equal(cleanZones(null), null);
  assert.equal(cleanZones({}), null);
});

test("thousandths become sheet points; tries ring the seed", () => {
  assert.deepEqual(toPage([500, 250], 2448, 1584), [1224, 396]);
  const t = seedTries([100, 100], 6);
  assert.equal(t.length, 17);
  assert.deepEqual(t[0], [100, 100]);
  assert.ok(Math.abs(t[1][0] - 106) < 1e-9);
});

const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

test("a trace is the zone only when it is about the rough outline's size", () => {
  assert.equal(judgeTrace(sq(0, 0, 100), sq(0, 0, 110), 50), "traced");
  assert.equal(judgeTrace(sq(0, 0, 20), sq(0, 0, 110), 50), "rough"); // stopped at a hatch line
  assert.equal(judgeTrace(sq(0, 0, 400), sq(0, 0, 110), 50), "rough"); // ran out over the lot
  assert.equal(judgeTrace(null, sq(0, 0, 110), 50), "rough");
  assert.equal(judgeTrace(sq(0, 0, 100), [], 50), "traced");
  assert.equal(judgeTrace(null, [], 50), null);
  assert.equal(judgeTrace(sq(0, 0, 5), [], 50), null);
});

test("two seeds in one patch are one zone", () => {
  assert.equal(sameZone(sq(0, 0, 100), sq(1, 1, 99)), true);
  assert.equal(sameZone(sq(0, 0, 100), sq(200, 0, 100)), false);
  assert.equal(sameZone(sq(0, 0, 100), sq(0, 0, 60)), false);
});

test("a legend entry names its group and finds one already there", () => {
  const l = { key: "A", label: "Light duty concrete pavement", thickness_in: 5, pattern: null };
  assert.equal(groupNameFor(l), '5" Light duty concrete pavement');
  assert.equal(groupNameFor({ ...l, label: '7" thick concrete pavement', thickness_in: 7 }), '7" concrete pavement');
  assert.equal(groupNameFor({ ...l, thickness_in: null }), "Light duty concrete pavement");
  const groups = [
    { id: "1", name: "Areas", kind: "area", depth_in: null },
    { id: "2", name: "Light duty paving", kind: "area", depth_in: 5 },
    { id: "3", name: '5" light duty concrete pavement', kind: "linear", depth_in: 5 },
  ];
  assert.equal(matchGroup(l, groups)?.id, "2");
  assert.equal(matchGroup({ ...l, label: "Standard duty", thickness_in: 6 }, groups), null);
  assert.equal(matchGroup(l, [{ id: "9", name: '5" Light Duty  Concrete pavement', kind: "area", depth_in: null }])?.id, "9");
});
