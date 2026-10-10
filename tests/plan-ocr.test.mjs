// OCR of scanned plan sheets — the pure part (src/lib/plan-ocr.ts). `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tilesFor, toItems, mergeItems, titleRegions, scaleFor, ocrText, compactWords, findDimensions, pickTitle, chooseTitles, titleLike } from "../src/lib/plan-ocr.ts";
import { readSheet } from "../src/lib/plan-sheets.ts";

const W = 2445.84, H = 1584.72; // Burgess Ave's 34×22 sheet

test("tiles cover the whole sheet, overlapping, none past the edge", () => {
  const t = tilesFor(W, H, 2, 2400, 64);
  assert.ok(t.length >= 6 && t.length <= 9);
  for (const r of t) { assert.ok(r.x + r.w <= W + 0.01 && r.y + r.h <= H + 0.01); assert.ok(r.w * 2 <= 2400.01 && r.h * 2 <= 2400.01); }
  const right = Math.max(...t.map((r) => r.x + r.w)), bottom = Math.max(...t.map((r) => r.y + r.h));
  assert.ok(Math.abs(right - W) < 0.01 && Math.abs(bottom - H) < 0.01);
});

test("a region's scale fits the device's canvas", () => {
  const [strip] = titleRegions(W, H);
  assert.equal(scaleFor(strip, 3, 2 ** 25), 3, "desktop: 3× fits");
  const phone = scaleFor({ x: 0, y: 0, w: W, h: H }, 3, 2 ** 24);
  assert.ok(phone < 3 && W * H * phone * phone <= 2 ** 24 + 1);
});

test("OCR words land in page points and the title block reads like a digital set", () => {
  // Words as tesseract gives them for the right-hand strip rendered at 3×.
  const [strip] = titleRegions(W, H);
  const s = 3;
  const at = (x, y) => ({ x0: (x - strip.x) * s, y0: (y - strip.y) * s });
  const word = (text, x, y, w, h, confidence = 91) => { const a = at(x, y); return { text, confidence, bbox: { x0: a.x0, y0: a.y0, x1: a.x0 + w * s, y1: a.y0 + h * s } }; };
  const items = toItems([
    word("C-3", 2300, 1500, 70, 28),
    word("SIDEWALK", 2200, 1440, 90, 14), word("PLAN", 2295, 1440, 45, 14),
    word("SCALE:", 2200, 1470, 40, 8), word("1\"", 2245, 1470, 10, 8), word("=", 2258, 1470, 6, 8), word("20'", 2267, 1470, 16, 8),
    word("|~", 2300, 1300, 5, 5, 95), word("faint", 2300, 1200, 20, 8, 12),
  ], strip, s);
  assert.equal(items.length, 7, "junk and low-confidence words dropped");
  assert.ok(Math.abs(items[0].x - 2300) < 0.01 && Math.abs(items[0].y - 1500) < 0.01);
  const r = readSheet(items, W, H);
  assert.equal(r.number, "C-3");
  assert.equal(r.discipline, "C");
  assert.equal(r.title, "SIDEWALK PLAN");
  assert.equal(r.scale?.kind, "scale");
  assert.ok(r.scale && Math.abs(r.scale.ft_per_pt - 20 / 72) < 1e-9, "1\" = 20' read off the scan");
});

test("a word read twice where tiles overlap is kept once — the surer reading", () => {
  const a = { str: "5'-0\"", x: 100, y: 200, w: 30, h: 8, conf: 80 };
  const b = { str: "5'-0\"", x: 100.6, y: 200.3, w: 30, h: 8, conf: 93 };
  const c = { str: "5'-0\"", x: 400, y: 200, w: 30, h: 8, conf: 90 };
  const m = mergeItems([a, b, c]);
  assert.equal(m.length, 2);
  assert.equal(m.find((i) => i.x < 200).conf, 93);
  assert.equal(ocrText(m), "5'-0\" | 5'-0\"", "same row, far apart → one row with a gap mark");
  const row = [["104+55", 100], ["RT.", 140], ["DRIVE", 200], ["39", 300]].map(([str, x]) => ({ str, x, y: 50, w: 22, h: 6, conf: 90 }));
  assert.equal(ocrText(row), "104+55 | RT. | DRIVE | 39", "a table row stays a row");
  assert.deepEqual(compactWords([b])[0], [100.6, 200.3, 30, 8, "5'-0\"", 93]);
});

test("dimensions as plans print them", () => {
  const d = findDimensions("5'-0\" CONC. SIDEWALK\nDRIVE 6\" THICK  12' - 6\"\nSEE 1/2\" JOINT");
  assert.deepEqual(d.map((x) => [x.text, x.feet]), [["5'-0\"", 5], ["6\"", 0.5], ["12' - 6\"", 12.5]], "the 2 of 1/2\" is not a dimension");
  assert.equal(d[0].line, "5'-0\" CONC. SIDEWALK");
  assert.deepEqual(findDimensions("4’-6” WALK").map((x) => x.feet), [4.5], "curly marks");
  assert.deepEqual(findDimensions("7' 13\""), [], "13 inches is not a dimension");
});

test("a sideways title block: the biggest words, not the logo or the labels", () => {
  // Burgess Ave sheet 3's right edge, turned (sizes as read).
  const it = (str, x, y, h) => ({ str, x, y, w: str.length * h * 0.6, h, conf: 90 });
  const items = [it("DOTD", 300, 10, 22), it("PARISH", 40, 60, 5), it("LIVINGSTON", 80, 60, 9),
    it("SUMMARY", 60, 120, 12), it("TABLES", 116, 120, 12), it("STATE", 60, 200, 5), it("PROJECT", 90, 200, 5), it("H.015211", 140, 200, 9)];
  assert.equal(pickTitle(items)?.text, "SUMMARY TABLES");
});

test("a title is what changes from sheet to sheet, not the logo on all of them", () => {
  const sheet = (id, own) => ({ id, cands: [{ text: "B FORTE", h: 20 }, { text: "BURGESS AVE SIDEWALK", h: 14 }, ...(own ? [{ text: own, h: 12 }] : [])] });
  const set = [sheet("a", "SUMMARY TABLES"), sheet("b", "TYPICAL SECTIONS"), sheet("c", "PLAN AND PROFILE"), sheet("e", "PLAN AND PROFILE"), sheet("d", null)];
  const t = chooseTitles(set);
  assert.equal(t.get("a"), "SUMMARY TABLES");
  assert.equal(t.get("c"), "PLAN AND PROFILE", "a title on two of five sheets is still a title");
  assert.equal(t.get("d"), null, "nothing but boilerplate → no title, not the logo");
});

test("Burgess Ave's real title blocks: sideways, the seal and the repeats left out", () => {
  // Candidates as read off sheets 1, 3 and 11 (flat ones from the seal; sideways ones up the edge).
  const set = [
    { id: "1", cands: [{ text: "SIDEWALKS, GRADING, DRAINAGE STRUCTURES AND", h: 11.7 }, { text: "TITLE SHEET LAYOUT MAP", h: 11.7, turned: true }, { text: "LIVINGSTON", h: 11.7, turned: true }, { text: "BURGESS AVE SIDEWALK", h: 10.3, turned: true }] },
    { id: "3", cands: [{ text: "KRESTENT. BR", h: 8.3 }, { text: "SUMMARY TABLES", h: 12.3, turned: true }, { text: "LIVINGSTON", h: 11.7, turned: true }, { text: "BURGESS AVE SIDEWALK", h: 8.3, turned: true }] },
    { id: "11", cands: [{ text: "KRESTEN T. BROWN", h: 8.3 }, { text: "PROFILE", h: 12.3, turned: true }, { text: "LIVINGSTON", h: 11.7, turned: true }, { text: "BURGESS AVE SIDEWALK", h: 8.3, turned: true }] },
  ];
  const t = chooseTitles(set);
  assert.deepEqual([t.get("1"), t.get("3"), t.get("11")], ["TITLE SHEET LAYOUT MAP", "SUMMARY TABLES", "PROFILE"]);
});

test("the seal is never a title", () => {
  const it = (str, x, y, h) => ({ str, x, y, w: str.length * h * 0.6, h, conf: 90 });
  assert.equal(pickTitle([it("ENGINES,", 0, 0, 18), it("REGISTERED", 0, 30, 6)]), null);
  assert.equal(pickTitle([it("TITLE", 0, 0, 12), it("SHEET", 40, 0, 12), it("LAYOUT", 160, 0, 12), it("MAP", 210, 0, 12)])?.text, "TITLE SHEET LAYOUT MAP");
});

test("the review and initials boxes are not titles", () => {
  const it = (str, x, y, h) => ({ str, x, y, w: str.length * h * 0.6, h, conf: 90 });
  assert.equal(pickTitle([it("[Review", 0, 0, 13), it("KTB", 60, 0, 13), it("TITLE", 0, 40, 11), it("SHEET", 42, 40, 11)])?.text, "TITLE SHEET");
  for (const t of ["DESIGN JBC", "CHECK KTB", "DETAIL MLM", "SERIES OF 1"]) assert.equal(pickTitle([it(t, 0, 0, 12)]), null, t);
  assert.equal(pickTitle([it("CONCRETE", 0, 0, 12), it("DETAILS", 70, 0, 12)])?.text, "CONCRETE DETAILS", "a details sheet keeps its title");
});

test("Holden's standard-plan sheet: the stacked title above the sign-off row, not the names in it", async () => {
  const { titleCandidates, nearSignOff, inTitleCorner } = await import("../src/lib/plan-ocr.ts");
  // Words as OCR read them off page 18 (2448 × 1584 pt), title block at 80% across and down.
  const w = (str, x, y, ww, h) => ({ str, x, y, w: ww, h, conf: 90 });
  const items = [
    w("STANDARD", 1954, 1208, 53, 9), w("a", 2010, 1208, 30, 19), w("NOC.", 2049, 1208, 17, 9), w("DATED", 2116, 1208, 31, 9),
    w("STORM", 1983, 1269, 53, 13), w("WATER", 2049, 1269, 51, 13), w("POLLUTION", 2114, 1269, 87, 13),
    w("PREVENTION", 2017, 1287, 98, 13), w("PLAN", 2128, 1287, 39, 13),
    w("BEST", 1963, 1306, 40, 13), w("MANAGEMENT", 2015, 1306, 107, 13), w("PRACTICES", 2135, 1306, 86, 13),
    w("ENGINEERING", 2033, 1354, 69, 9), w("DIVISION", 2110, 1354, 42, 9),
    w("CITY", 1948, 1384, 20, 9), w("OF", 1974, 1384, 13, 9), w("BATON", 1993, 1384, 30, 9), w("ROUGE", 2030, 1384, 32, 9),
    w("DESIGNED", 1953, 1397, 44, 8), w("DRAWN", 2038, 1397, 30, 8), w("CHECKED", 2112, 1397, 42, 8), w("APPROVED", 2189, 1397, 48, 8),
    w("G.", 1947, 1410, 10, 9), w("CHENG", 1965, 1410, 35, 9), w("G.", 2021, 1410, 10, 9), w("VANNICE", 2038, 1410, 44, 9),
  ];
  const cands = titleCandidates(items).filter((c) => inTitleCorner(c, 2448, 1584) || nearSignOff(c, items, 1584));
  assert.equal(cands[0]?.text, "STORM WATER POLLUTION PREVENTION PLAN BEST MANAGEMENT PRACTICES");
  assert.ok(!cands.some((c) => /CHENG|VANNICE|STANDARD/.test(c.text)), "names and the standard-plan label are no title");
});

test("names and fragments are no title", () => {
  for (const t of ["G. CHENG", "G. CHENG G. VANNICE G. CHENG |T. STEPHENS", "R.BROADBENT| G. VANNICE", "TYPE OF CONSTRUCTION:", "DETAILS ON THIS SHEET NOT TO SCALE", "EVISIONS", "HEIGHT)"])
    assert.equal(titleLike(t), false, t);
  assert.equal(titleLike("FOUNDATION DETAILS"), true);
});

test("a stacked title with a boilerplate line is boilerplate", () => {
  const sheet = (id, own) => ({ id, cands: [{ text: `${own} CITY OF BATON ROUGE`, h: 13, lines: [own, "CITY OF BATON ROUGE"] }, { text: own, h: 13 }, { text: "CITY OF BATON ROUGE", h: 13 }] });
  const t = chooseTitles([sheet("a", "PROFILE"), sheet("b", "GENERAL NOTES"), sheet("c", "FOUNDATION DETAILS")]);
  assert.equal(t.get("c"), "FOUNDATION DETAILS");
});
