// Details clipped off the plans — markers, the model's read, and the quantities. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detailMarker, readDetailMarker, validBox, clipScale, cleanDetailRead, detailSummary, detailUses, detailQuantities, lapFt } from "../src/lib/plan-details.ts";

const SHEET = "0b6a1c2e-1111-4222-8333-444455556666";

test("a clip's marker round-trips, anything else is not a clip", () => {
  const m = detailMarker({ sheet_id: SHEET, x: 100.04, y: 50, w: 300.26, h: 200 });
  assert.equal(m, `plan_detail:${SHEET}#100,50,300.3,200`);
  assert.deepEqual(readDetailMarker(m), { sheet_id: SHEET, x: 100, y: 50, w: 300.3, h: 200 });
  assert.equal(readDetailMarker("message_media:abc"), null);
  assert.equal(readDetailMarker(`plan_detail:${SHEET}#1,2,0,4`), null);
  assert.equal(readDetailMarker(null), null);
});

test("a box must sit on the page and be more than a speck", () => {
  assert.deepEqual(validBox({ x: 10, y: 10, w: 100, h: 50 }, { w: 2448, h: 1584 }), { x: 10, y: 10, w: 100, h: 50 });
  assert.equal(validBox({ x: 10, y: 10, w: 4, h: 50 }), null);
  assert.equal(validBox({ x: 2400, y: 10, w: 100, h: 50 }, { w: 2448, h: 1584 }), null);
  assert.equal(validBox({ x: "1", y: 0, w: 100, h: 100 }), null);
  assert.equal(clipScale({ x: 0, y: 0, w: 200, h: 100 }), 6);
  assert.equal(clipScale({ x: 0, y: 0, w: 1200, h: 100 }), 2);
  assert.equal(clipScale({ x: 0, y: 0, w: 4800, h: 100 }), 1);
});

const GRADE_BEAM = {
  title: "TYP. GRADE BEAM 3/S-501", kind: "grade_beam",
  width_in: { value: 12, quote: "1'-0\"" }, depth_in: { value: 24, quote: "2'-0\"" },
  slab_in: { value: 4, quote: "4\" SLAB" }, psi: { value: 3000, quote: "3000 PSI" },
  bars: [
    { count: 3, size: "#5", run: "continuous", where: "top", quote: "(3) #5 CONT. TOP" },
    { count: 3, size: 5, run: "continuous", where: "bottom", quote: "(3) #5 CONT. BOT." },
    { size: 3, spacing_in: 12, run: "tie", length_in: 66, quote: "#3 TIES @ 12\" O.C." },
    { size: 4, run: "continuous", quote: "" }, // no quote → dropped
    { size: 2, run: "continuous", quote: "#2" }, // no such bar → dropped
  ],
  mesh: [{ spec: "6x6 W1.4xW1.4", quote: "6x6 W1.4xW1.4 WWF" }, { spec: "x" }],
  notes: ["CHAMFER EDGES", 7],
  ignore: "me",
};

test("the read keeps what has a quote and fits a drawing", () => {
  const d = cleanDetailRead(GRADE_BEAM);
  assert.equal(d.kind, "grade_beam");
  assert.equal(d.bars.length, 3);
  assert.equal(d.bars[0].size, 5);
  assert.equal(d.bars[2].spacing_in, 12);
  assert.equal(d.mesh.length, 1);
  assert.deepEqual(d.notes, ["CHAMFER EDGES"]);
  assert.equal(cleanDetailRead({ width_in: { value: 900, quote: "75'" } }).width_in, null);
  assert.equal(cleanDetailRead({ width_in: { value: 12 } }).width_in, null);
  assert.equal(cleanDetailRead("nope"), null);
  assert.match(detailSummary(d), /12" wide × 24" deep · 4" slab · 3000 psi · \(3\) #5 cont\. top/);
});

test("Use offers the section's own fields: beam width and depth on an LF section, thickness on an area", () => {
  const d = cleanDetailRead(GRADE_BEAM);
  const lin = detailUses(d, { mode: "linear", lf: 430, sqft: null });
  assert.deepEqual(lin.find((u) => u.key === "width").patch, { width_ft: 12 });
  assert.deepEqual(lin.find((u) => u.key === "depth").patch, { depth_in: 24 });
  const area = detailUses(d, { mode: "area", lf: null, sqft: 1200 });
  assert.deepEqual(area.find((u) => u.key === "depth").patch, { depth_in: 4 });
  assert.ok(area.find((u) => u.key === "rebar").patch.rebar.includes("6x6 W1.4xW1.4"));
});

test("quantities from 430 LF of 12\" × 24\" grade beam", () => {
  const d = cleanDetailRead(GRADE_BEAM);
  const { lines, missing } = detailQuantities(d, { mode: "linear", lf: 430, sqft: null });
  const by = (l) => lines.find((x) => x.label.startsWith(l));
  assert.equal(by("Concrete").qty, 31.85); // 430 × 1 × 2 / 27
  // #5: lap 40 × 5/8" = 25" ≈ 2.083'; (430 − 2.083) / (20 − 2.083) = 23.88 → 24 a line, × 3
  assert.equal(by("#5 continuous (top)").qty, 72);
  assert.equal(by("#3 ties").qty, 431); // 430 × 12 / 12 + 1
  assert.match(by("#3 ties").basis, /2371 LF of bar/);
  assert.ok(missing.some((m) => m.includes("mesh")));
  near(lapFt(5), 25 / 12);
});

test("a slab grid and mesh need the area", () => {
  const d = cleanDetailRead({ slab_in: { value: 5, quote: "5\"" }, bars: [{ size: 4, spacing_in: 18, run: "each_way", quote: "#4 @ 18\" E.W." }], mesh: [{ spec: "6x6 W2.9xW2.9", quote: "6x6 W2.9" }] });
  const { lines, missing } = detailQuantities(d, { mode: "area", lf: null, sqft: 1000 });
  assert.equal(missing.length, 0);
  assert.equal(lines.find((l) => l.label === "Slab concrete").qty, 15.43);
  assert.equal(lines.find((l) => l.label.startsWith("#4")).qty, 73); // 1333 LF × (1 + 1.667/20) / 20 = 72.2
  assert.equal(lines.find((l) => l.label.startsWith("Mesh")).qty, 24);
  assert.equal(detailQuantities(d, { mode: "area", lf: null, sqft: null }).missing.length, 2);
});

function near(a, b, eps = 1e-9) { assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`); }
