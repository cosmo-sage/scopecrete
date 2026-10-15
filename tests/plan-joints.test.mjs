// Find joints — control joints read off a vector plan (src/lib/plan-joints.ts). `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { strokesFromOps, controlLayer, controlLabel, legendBox, sampleStyle, jointSegments, joinRuns, splitByZone, zoneLabel, jointGroup, findJoints } from "../src/lib/plan-joints.ts";

const OPS = { save: 10, restore: 11, transform: 12, setLineWidth: 2, setStrokeRGBColor: 58, setGState: 9, constructPath: 91, stroke: 20, closeStroke: 21, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, fill: 22, beginMarkedContentProps: 70, beginMarkedContent: 69, endMarkedContent: 71, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
const path = (op, ...pts) => [OPS.constructPath, [op, [Float32Array.from(pts.flatMap((p, i) => [i ? 1 : 0, p[0], p[1]]))], null]];

test("strokes come out of the operator list in page points, with their CAD layer", () => {
  const ops = [
    [OPS.beginMarkedContentProps, ["OC", { id: "7R" }]],
    [OPS.setLineWidth, [0.5]],
    [OPS.save, null], [OPS.transform, [2, 0, 0, 2, 0, 0]],
    path(OPS.stroke, [0, 0], [10, 0]),
    [OPS.restore, null],
    [OPS.endMarkedContent, null],
    path(OPS.fill, [0, 0], [5, 5]),
    path(OPS.stroke, [1, 1], [1, 9]),
  ];
  // The viewport's transform flips y on a 100 pt tall page.
  const s = strokesFromOps(ops.map((o) => o[0]), ops.map((o) => o[1]), OPS, [1, 0, 0, -1, 0, 100], { "7R": "C-PRKG-JNTS-CONTROL" });
  assert.equal(s.length, 2);
  assert.equal(s[0].layer, "C-PRKG-JNTS-CONTROL");
  assert.equal(s[0].lw, 1);
  assert.deepEqual(s[0].segs, [[[0, 100], [20, 100]]]);
  assert.equal(s[1].layer, null);
  assert.deepEqual(s[1].segs[0], [[1, 99], [1, 91]]);
});

test("the control joint layer is found by its name, never an expansion or construction joint's", () => {
  assert.equal(controlLayer(["C-PRKG-JNTS-E", "C-PRKG-JNTS-CONSTR", "C-PRKG-JNTS-CONTROL", "HATCH"]), "C-PRKG-JNTS-CONTROL");
  assert.equal(controlLayer(["Xref|CONC-JOINT-CTRL"]), "Xref|CONC-JOINT-CTRL");
  assert.equal(controlLayer(["SAWCUT"]), "SAWCUT");
  assert.equal(controlLayer(["C-PRKG-JNTS-E", "C-ANNO-CONTROL-JOINT-TXT", "C-PVMT-CONC"]), null);
});

const dashes = (x0, y, n, dash = 18, gap = 9) => Array.from({ length: n }, (_, i) => [[x0 + i * (dash + gap), y], [x0 + i * (dash + gap) + dash, y]]);

test("dashes on one line join into a run, gaps and all; a big gap or a step sideways doesn't", () => {
  const segs = [...dashes(0, 50, 4), ...dashes(200, 50, 2), [[0, 60], [18, 60]]];
  // One dash drawn backwards still joins.
  segs.push([[126, 50], [108, 50]]);
  const runs = joinRuns(segs).sort((a, b) => b.dashes - a.dashes);
  assert.equal(runs.length, 3);
  assert.equal(runs[0].dashes, 5);
  assert.ok(Math.abs(runs[0].a[0] - 0) < 1e-6 && Math.abs(runs[0].b[0] - 126) < 1e-6);
  const v = joinRuns([[[5, 0], [5, 18]], [[5, 27], [5, 45]]]);
  assert.equal(v.length, 1);
  assert.ok(Math.abs(Math.hypot(v[0].b[0] - v[0].a[0], v[0].b[1] - v[0].a[1]) - 45) < 1e-6);
});

const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

test("a run is cut where it passes into another zone; the legend's sample is left out", () => {
  const zones = [{ key: "a", label: '5"', poly: sq(0, 0, 100), holes: [] }, { key: "b", label: '6"', poly: [[100, 0], [300, 0], [300, 100], [100, 100]], holes: [] }];
  const p = splitByZone([{ a: [10, 50], b: [250, 50], dashes: 9 }, { a: [500, 500], b: [600, 500], dashes: 4 }], zones, { skip: { x0: 480, y0: 480, x1: 700, y1: 520 } });
  assert.equal(p.length, 2);
  assert.equal(p[0].zone, "a");
  assert.equal(p[1].zone, "b");
  assert.ok(Math.abs(p[0].b[0] - 100) < 2 && Math.abs(p[1].b[0] - 250) < 1e-6);
  const none = splitByZone([{ a: [10, 500], b: [90, 500], dashes: 3 }], zones);
  assert.equal(none[0].zone, null);
  const holed = splitByZone([{ a: [10, 50], b: [90, 50], dashes: 3 }], [{ ...zones[0], holes: [sq(40, 40, 20)] }]);
  assert.deepEqual(holed.map((q) => q.zone), ["a", null, "a"]);
});

const text = [
  { str: "LEGEND", x: 2000, y: 180, w: 60, h: 12 },
  { str: "7\" THICK CONCRETE PAVEMENT", x: 2075, y: 660, w: 150, h: 12 },
  { str: "CONTROL JOINT", x: 2075, y: 704, w: 97, h: 12 },
  { str: "EXPANSION JOINT", x: 2075, y: 731, w: 100, h: 12 },
  { str: "12. CONTROL JOINT SPACING SHALL …", x: 1840, y: 1200, w: 300, h: 12 },
];

test("the legend's label, its box and its sample's style", () => {
  const lab = controlLabel(text);
  assert.equal(lab.str, "CONTROL JOINT");
  const box = legendBox(lab, text);
  assert.ok(box.x1 < 2075 && box.x0 < 1800 && box.y0 < 660 && box.y1 > 743 && box.y1 < 1200);
  const sample = { layer: null, lw: 0.84, color: "#000000", segs: dashes(1960, 710, 6, 9, 5) };
  const solid = { layer: null, lw: 1.44, color: "#000000", segs: [[[1960, 737], [2060, 737]]] };
  assert.deepEqual(sampleStyle([sample, solid], lab), { lw: 0.84, color: "#000000", dash: 9 });
});

test("with no layer the legend's sample decides; with neither it says why", () => {
  const sample = { layer: null, lw: 0.84, color: "#000000", segs: dashes(1960, 710, 6, 9, 5) };
  const plan = { layer: null, lw: 0.84, color: "#000000", segs: [...dashes(100, 400, 10), [[100, 450], [102.2, 450]]] };
  const hatch = { layer: null, lw: 0.6, color: "#000000", segs: dashes(100, 420, 10) };
  const r = jointSegments([sample, plan, hatch], text, []);
  assert.equal(r.how, "legend");
  assert.equal(r.segs.filter((s) => s[0][1] === 400).length, 10);
  assert.equal(r.segs.some((s) => s[0][1] === 450 || s[0][1] === 420), false);
  const all = findJoints([sample, plan, hatch], text, [], []);
  assert.equal(all.ok, true);
  assert.equal(all.pieces.length, 1); // the sample sits in the legend box
  const none = findJoints([hatch], [], [], []);
  assert.equal(none.ok, false);
  assert.match(none.reason, /no control joint layer/);
});

test("zones are named by thickness; the joints' group is found by its name", () => {
  assert.equal(zoneLabel('5" Light duty concrete pavement', 5), '5"');
  assert.equal(zoneLabel("6 in standard duty", null), '6"');
  const groups = [{ id: "1", name: "Areas", kind: "area" }, { id: "2", name: "Control Joints - Concrete Cutting", kind: "linear" }, { id: "3", name: "Saw cut", kind: "linear" }];
  assert.equal(jointGroup(groups).id, "2");
  assert.equal(jointGroup(groups.filter((g) => g.id !== "2")).id, "3");
  assert.equal(jointGroup([groups[0]]), null);
});
