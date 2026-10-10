// Drawings vs pages to read in the Plan Room — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";

test("a drawing is measured, a letter or legal page is read (Burgess Ave, 2026-10-02)", async () => {
  const { isDrawing } = await import("../src/components/v34/plan-room/shared.ts");
  const page = (w, h, extra = {}) => ({ page_w: w, page_h: h, scale_ft_per_pt: null, scale_method: null, ...extra });
  assert.equal(isDrawing(page(2445.84, 1584.72)), true, "34×22 scanned sheet, no scale read — still a drawing");
  assert.equal(isDrawing(page(1224, 792)), true, "11×17 half-size set");
  assert.equal(isDrawing(page(612, 792)), false, "letter spec page");
  assert.equal(isDrawing(page(612, 1008)), false, "legal page");
  assert.equal(isDrawing(page(612, 792, { scale_ft_per_pt: 0.0139, scale_method: "manual" })), true, "Coy scaled it — he measures on it");
});

test("a CAD plot stamp or drawing path is never a sheet title (Holden Pedestrian Bridge)", async () => {
  const { isStampTitle, readSheet } = await import("../src/lib/plan-sheets.ts");
  assert.equal(isStampTitle("Sep 22, 2026 - 12:04pm"), true);
  assert.equal(isStampTitle("F:\\02020\\2300241\\01800\\Site A\\2300241_Standards.dwg [101]"), true);
  assert.equal(isStampTitle("GENERAL NOTES"), false);
  assert.equal(isStampTitle("SITE PLAN - SEPT 2026"), false);
  const r = readSheet([{ str: "Sep 22, 2026 - 12:04pm", x: 2000, y: 1550, w: 120, h: 8 }], 2448, 1584);
  assert.equal(r.title, null);
});
