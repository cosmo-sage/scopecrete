// Plan Room takeoff maths and title-block reading — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  polygonArea, polygonPerimeter, polylineLength, rectPoints, parseFeet, parsePrintedScale, scaleFromPoints, scaleLabel,
  measurementQty, measurementPerimeter, groupTotals,
} from "../src/lib/takeoff.ts";
import { readSheet, disciplineOf, textLines } from "../src/lib/plan-sheets.ts";
import { budget, ruleQty, takeoffUnit } from "../src/lib/engine/index.ts";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const EIGHTH = 8 / 72; // 1/8" = 1'-0": one point of paper is 8/72 ft

test("printed scales → feet per point", () => {
  near(parsePrintedScale('SCALE: 1/8" = 1\'-0"').ft_per_pt, EIGHTH);
  near(parsePrintedScale("1/4\"=1'-0\"").ft_per_pt, 4 / 72);
  near(parsePrintedScale("3/16\" = 1'").ft_per_pt, (16 / 3) / 72);
  near(parsePrintedScale("1 1/2\" = 1'-0\"").ft_per_pt, (2 / 3) / 72);
  near(parsePrintedScale("SCALE 1\" = 20'").ft_per_pt, 20 / 72);
  near(parsePrintedScale("1\" = 30'-0\"").ft_per_pt, 30 / 72);
  near(parsePrintedScale("SCALE 1:100").ft_per_pt, 100 / 864);
  near(parsePrintedScale("1/8’’ = 1’-0’’").ft_per_pt, EIGHTH); // curly quotes from a PDF
  assert.equal(parsePrintedScale("SCALE: NTS").kind, "none");
  assert.equal(parsePrintedScale("NOT TO SCALE").reason, "not to scale");
  assert.equal(parsePrintedScale("SCALE: AS NOTED").kind, "none");
  assert.equal(parsePrintedScale("FOUNDATION PLAN"), null);
  assert.equal(parsePrintedScale("PHONE 225-555-0100"), null);
});

test("lengths as typed or printed", () => {
  assert.equal(parseFeet("30'"), 30);
  assert.equal(parseFeet("30'-6\""), 30.5);
  assert.equal(parseFeet("30' 6\""), 30.5);
  assert.equal(parseFeet("30 ft"), 30);
  assert.equal(parseFeet("6\""), 0.5);
  assert.equal(parseFeet("30.5"), 30.5);
  near(parseFeet("12'-4 1/2\""), 12 + 4.5 / 12);
  assert.equal(parseFeet("abc"), null);
  assert.equal(parseFeet(""), null);
});

test("a 30×40 ft rectangle at 1/8\" = 1'-0\" is 1,200 SF", () => {
  // 30 ft at 1/8" = 3.75 in = 270 pt; 40 ft = 5 in = 360 pt.
  const r = rectPoints([100, 100], [370, 460]);
  near(polygonArea(r), 270 * 360);
  const q = measurementQty("area", { geometry: r }, { ft_per_pt: EIGHTH, method: "title_block", label: "C-5" });
  assert.ok(q.ok); near(q.qty, 1200);
  // either winding
  near(polygonArea([...r].reverse()), 270 * 360);
});

test("a cutout comes off the area", () => {
  const r = rectPoints([0, 0], [270, 360]);           // 30×40 = 1200 SF
  const hole = rectPoints([72, 72], [72 + 36, 72 + 36]); // 4×4 ft = 16 SF
  const q = measurementQty("area", { geometry: r, cutouts: [hole] }, { ft_per_pt: EIGHTH, method: "manual", label: "C-5" });
  near(q.qty, 1184);
});

test("an area's perimeter: its outline closed, plus every cutout's edge", () => {
  const r = rectPoints([0, 0], [270, 360]);             // 30×40 → 140 LF round it
  near(polygonPerimeter(r), 1260);
  const S = { ft_per_pt: EIGHTH, method: "manual", label: "C-5" };
  near(measurementPerimeter("area", { geometry: r }, S), 140);
  const hole = rectPoints([72, 72], [108, 108]);         // 4×4 ft → 16 LF more
  near(measurementPerimeter("area", { geometry: r, cutouts: [hole] }, S), 156);
  assert.equal(measurementPerimeter("linear", { geometry: r }, S), null);
  assert.equal(measurementPerimeter("area", { geometry: r }, { ft_per_pt: null, method: null, label: "A-1" }), null);
});

test("linear is the polyline length; count needs no scale", () => {
  const pl = [[0, 0], [270, 0], [270, 360]]; // 30 + 40 ft
  near(polylineLength(pl), 630);
  near(measurementQty("linear", { geometry: pl }, { ft_per_pt: EIGHTH, method: "manual", label: "C-5" }).qty, 70);
  const c = measurementQty("count", { geometry: [[1, 1], [2, 2], [3, 3]] }, undefined);
  assert.equal(c.qty, 3);
});

test("no scale → no number, said by sheet", () => {
  const q = measurementQty("area", { geometry: rectPoints([0, 0], [10, 10]) }, { ft_per_pt: null, method: null, label: "A-101" });
  assert.equal(q.ok, false);
  assert.match(q.reason, /A-101 scale not set/);
});

test("calibrating on a known dimension", () => {
  near(scaleFromPoints([0, 0], [270, 0], 30), EIGHTH);
  assert.equal(scaleFromPoints([0, 0], [0, 0], 30), null);
  assert.equal(scaleLabel(EIGHTH), "1/8\" = 1'-0\"");
  assert.equal(scaleLabel(20 / 72), "1\" = 20'");
  assert.equal(scaleLabel(12.4 / 72), "1\" = 12.4'");
});

test("group totals: sum, depth → yards, one unscaled shape blocks the group", () => {
  const sheets = { s1: { ft_per_pt: EIGHTH, method: "manual", label: "C-5" }, s2: { ft_per_pt: null, method: null, label: "C-6" } };
  const params = [{ id: "p1", name: "Slab on grade", kind: "area", depth_in: 6 }, { id: "p2", name: "Curb", kind: "linear", depth_in: null }, { id: "p3", name: "Piers", kind: "count", depth_in: null }];
  const ms = [
    { id: "m1", parameter_id: "p1", sheet_id: "s1", name: "Drive", geometry: rectPoints([0, 0], [270, 360]) },
    { id: "m2", parameter_id: "p1", sheet_id: "s1", name: "Walk", geometry: rectPoints([0, 0], [36, 360]) }, // 4×40 = 160
    { id: "m3", parameter_id: "p2", sheet_id: "s2", name: "Back curb", geometry: [[0, 0], [100, 0]] },
    { id: "m4", parameter_id: "p3", sheet_id: "s2", name: null, geometry: [[1, 1], [5, 5]] },
  ];
  const t = groupTotals(params, ms, sheets);
  near(t.p1.qty, 1360);
  near(t.p1.cy, 1360 * 0.5 / 27);
  near(t.p1.perim_lf, 140 + 88);                        // 30×40 and 4×40
  near(t.p1.parts.find((x) => x.id === "m2").perim_lf, 88);
  assert.equal(t.p2.perim_lf, null);
  assert.equal(t.p3.perim_lf, null);
  assert.equal(t.p2.qty, null);
  assert.match(t.p2.blocked, /C-6 scale not set/);
  assert.equal(t.p3.qty, 2);
  assert.equal(t.p3.cy, null);
});

test("from_takeoff in the budget: the group's total in the card's unit", () => {
  assert.equal(takeoffUnit("sq ft"), "SF");
  assert.equal(takeoffUnit("LF"), "LF");
  assert.equal(takeoffUnit("cy"), "CY");
  assert.equal(takeoffUnit("bag"), null);
  const takeoff = {
    p1: { name: "Slab on grade", unit: "SF", qty: 1360, cy: 1360 * 0.5 / 27, perim_lf: 228, blocked: null },
    p2: { name: "Curb", unit: "LF", qty: null, cy: null, blocked: "sheet C-6 scale not set" },
    p4: { name: "Walk", unit: "SF", qty: 200, cy: null, blocked: null },
  };
  const L = (o) => ({ id: "l", name: "Line", cost_type: "labor", unit: "sf", unit_cost: 2, margin_pct: null, taxable: false,
    qty_rule: "from_takeoff", rule_params: {}, qty_source: "rule", quantity: null, section_id: null, option_id: null, cost_group_id: null, ...o });
  const a = ruleQty(L({ takeoff_parameter_id: "p1" }), [], null, takeoff);
  assert.ok(a.ok); assert.equal(a.qty, 1360); assert.match(a.note, /Slab on grade/);
  const y = ruleQty(L({ takeoff_parameter_id: "p1", unit: "cy" }), [], null, takeoff);
  near(y.qty, 25.19, 0.005);
  const blocked = ruleQty(L({ takeoff_parameter_id: "p2", unit: "lf" }), [], null, takeoff);
  assert.equal(blocked.ok, false); assert.match(blocked.missing[0], /Curb — sheet C-6 scale not set/);
  const noDepth = ruleQty(L({ takeoff_parameter_id: "p4", unit: "cy" }), [], null, takeoff);
  assert.match(noDepth.missing[0], /depth/);
  // An LF card on an area group counts the edge round it (form & finish by the foot).
  const edge = ruleQty(L({ takeoff_parameter_id: "p1", unit: "lf" }), [], null, takeoff);
  assert.ok(edge.ok); assert.equal(edge.qty, 228); assert.match(edge.note, /perimeter/);
  const noEdge = ruleQty(L({ takeoff_parameter_id: "p4", unit: "lf" }), [], null, takeoff);
  assert.match(noEdge.missing[0], /perimeter/);
  const wrong = ruleQty(L({ takeoff_parameter_id: "p1", unit: "ea" }), [], null, takeoff);
  assert.match(wrong.missing[0], /measured in SF/);
  const gone = ruleQty(L({ takeoff_parameter_id: "zzz" }), [], null, takeoff);
  assert.match(gone.missing[0], /removed/);
  // Through budget(): re-measuring moves the line.
  const S = { overhead_pct: 15, margin_pct: 20, tax_rate_pct: null };
  const b1 = budget([L({ id: "x", takeoff_parameter_id: "p1" })], [], S, [], null, { tax_on: false, discount: 0, takeoff });
  near(b1.lines.x.ext_cost, 2720);
  const b2 = budget([L({ id: "x", takeoff_parameter_id: "p1" })], [], S, [], null, { tax_on: false, discount: 0, takeoff: { ...takeoff, p1: { ...takeoff.p1, qty: 1500 } } });
  near(b2.lines.x.ext_cost, 3000);
});

// --- title blocks ------------------------------------------------------------

const W = 2592, H = 1728; // 36×24 in sheet
const I = (str, x, y, h = 10) => ({ str, x, y, w: str.length * h * 0.5, h });

test("reads a civil sheet's title block", () => {
  const items = [
    I("OAK GLEN SUBDIVISION PHASE 2", 2200, 200, 14),
    I("SHEET TITLE", 2200, 1450, 7),
    I("PAVING & DRAINAGE PLAN", 2200, 1470, 16),
    I("SCALE:", 2200, 1540, 8), I("1\" = 20'", 2240, 1540, 8),
    I("DATE: 09/12/2026", 2200, 1560, 8),
    I("SHEET", 2200, 1600, 7),
    I("C-5", 2250, 1640, 36),
    I("(225) 555-0100", 2200, 1700, 7),
    // drawing notes elsewhere
    I("DETAIL 3", 400, 900, 12), I("1/4\" = 1'-0\"", 400, 915, 8),
  ];
  const r = readSheet(items, W, H);
  assert.equal(r.number, "C-5");
  assert.equal(r.discipline, "C");
  assert.equal(r.title, "PAVING & DRAINAGE PLAN");
  near(r.scale.ft_per_pt, 20 / 72); // the title block's scale wins over a detail's
});

test("several scales and none in the title block → the Scale tool decides", () => {
  const items = [
    I("DETAILS", 2300, 1470, 16), I("S5.1", 2300, 1640, 30),
    I("1/4\" = 1'-0\"", 400, 900, 8), I("3/4\" = 1'-0\"", 1200, 900, 8),
  ];
  const r = readSheet(items, W, H);
  assert.equal(r.number, "S5.1");
  assert.equal(r.discipline, "S");
  assert.equal(r.scale, null);
  assert.match(r.scale_note, /2 different scales/);
});

test("a page with no title block says so", () => {
  const r = readSheet([I("Hello", 100, 100)], W, H);
  assert.equal(r.number, null);
  assert.equal(r.title, null);
  assert.equal(r.scale, null);
  assert.equal(r.discipline, "other");
});

test("discipline prefixes and split text lines", () => {
  assert.equal(disciplineOf("A-101"), "A");
  assert.equal(disciplineOf("FP1.0"), "FP");
  assert.equal(disciplineOf("X-1"), "other");
  const lines = textLines([I("1/8\"", 10, 100), I("=", 40, 100.5), I("1'-0\"", 55, 99.8), I("NEXT", 10, 130)]);
  assert.equal(lines[0].text, "1/8\" = 1'-0\"");
  assert.equal(lines.length, 2);
});
