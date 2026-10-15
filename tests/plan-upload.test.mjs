// Add plans — names and scales picked before Save (JobTread's way) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";

test("a sheet's name is its number and title, and splits back", async () => {
  const { sheetName, splitName, placeholderName } = await import("../src/lib/plan-upload.ts");
  assert.equal(sheetName("C3.0", "PAVING AND JOINTING PLAN"), "C3.0 PAVING AND JOINTING PLAN");
  assert.equal(sheetName(null, "SITE PLAN"), "SITE PLAN");
  assert.equal(sheetName(null, null), "");
  assert.deepEqual(splitName("C3.0 PAVING AND JOINTING PLAN"), { number: "C3.0", title: "PAVING AND JOINTING PLAN" });
  assert.deepEqual(splitName("a2.1 - Floor plan"), { number: "A2.1", title: "Floor plan" });
  assert.deepEqual(splitName("FP-1"), { number: "FP-1", title: null });
  assert.deepEqual(splitName("PAVING PLAN"), { number: null, title: "PAVING PLAN" });
  assert.deepEqual(splitName("Site 2 grading"), { number: null, title: "Site 2 grading" });
  assert.deepEqual(splitName("   "), { number: null, title: null });
  assert.equal(placeholderName("Plans.pdf", 4), "Plans.pdf (4)");
});

test("the printed scale is picked; Save sets it as the title block's", async () => {
  const { scaleValue, choicesFor, scaleToSave, SCALE_CHOICES, NO_SCALE } = await import("../src/lib/plan-upload.ts");
  const { parsePrintedScale } = await import("../src/lib/takeoff.ts");
  const eng = parsePrintedScale(`SCALE: 1" = 20'`);
  const v = scaleValue(eng);
  assert.equal(SCALE_CHOICES.find((c) => c.value === v)?.label, `1" = 20'`);
  assert.deepEqual(scaleToSave(v, eng), { scale_ft_per_pt: eng.ft_per_pt, scale_method: "title_block" });
  const arch = parsePrintedScale(`1/8" = 1'-0"`);
  assert.equal(SCALE_CHOICES.find((c) => c.value === scaleValue(arch))?.label, `1/8" = 1'-0"`);
  // Coy picks another scale than the one printed — his own, "manual".
  const other = SCALE_CHOICES.find((c) => c.label === `1" = 40'`);
  assert.deepEqual(scaleToSave(other.value, eng), { scale_ft_per_pt: 40 / 72, scale_method: "manual" });
  // An odd printed scale is offered first in its own words.
  const odd = parsePrintedScale(`1" = 25'`);
  assert.equal(choicesFor(odd)[0].label, `1" = 25'`);
  assert.equal(choicesFor(eng).length, SCALE_CHOICES.length);
  // Not to scale, and nothing picked.
  assert.equal(scaleValue(parsePrintedScale("N.T.S.")), NO_SCALE);
  assert.deepEqual(scaleToSave(NO_SCALE, null), { scale_ft_per_pt: null, scale_method: "none" });
  assert.equal(scaleValue(null), "");
  assert.equal(scaleToSave("", eng), null);
});
