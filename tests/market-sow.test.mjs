import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionQueries, renderAsks, sanitizeRates } from "../src/lib/draft/rates.ts";
import { typeRanges, sectionRows } from "../src/lib/budget-v3.ts";
import { sowQuestion } from "../src/lib/scope-of-work.ts";

const ask = { key: "s1", name: "Curb Removal", unit: "lf", sow: ["Saw cut ~400 LF of 6\" curb at 15900 Industry Way", "Haul off debris"], notes: "Demo only" };

test("queries carry the section name, never its scope of work or address", () => {
  const q = sectionQueries("Walker, LA", [ask]);
  assert.equal(q.length, 2);
  for (const x of q) { assert.match(x, /Curb Removal/); assert.doesNotMatch(x, /15900|Industry/); }
  assert.match(q[1], /labor material equipment/);
  assert.equal(sectionQueries(null, [ask, ask, ask, ask, ask]).length, 8);
});

test("the model is shown the scope of work and notes", () => {
  const t = renderAsks([ask]);
  assert.match(t, /scope of work:\n  - Saw cut/);
  assert.match(t, /notes: Demo only/);
});

test("new cost types are kept", () => {
  const page = { url: "https://x.com/a", title: "t", text: "Project management runs $2 to $4 per linear foot." };
  const got = sanitizeRates({ rates: [{ step: "s1", what: "management", low: 2, high: 4, unit: "lf", split: "management", kind: "cost", url: page.url, quote: "$2 to $4 per linear foot" }] }, [page], new Set(["s1"]));
  assert.equal(got.rates.length, 1);
  assert.equal(got.rates[0].split, "management");
});

test("ranges by cost type, labor first, SY read per SF", () => {
  const r = (split, low, high, unit = "sf") => ({ step: "a", what: split, low, high, unit, split, kind: "cost", url: "", site: "", quote: "" });
  const out = typeRanges([r("equipment", 1, 2), r("labor", 3, 5), r("labor", 2, 4), r("material", 9, 18, "sy")], "sf");
  assert.deepEqual(out.map((x) => x.split), ["labor", "material", "equipment"]);
  assert.deepEqual([out[0].low, out[0].high, out[0].sources], [2, 5, 2]);
  assert.deepEqual([out[1].low, out[1].high, out[1].unit], [1, 2, "sf"]);
  const rows = sectionRows([{ id: "a", name: "A", origin: null, source_ref: null, sqft: 100, lf: null, count: null, count_unit: null }], [], [r("labor", 3, 5)]);
  assert.equal(rows[0].by_type.length, 1);
});

test("the SOW question asks for start-to-finish from every source", () => {
  const q = sowQuestion("Curb Removal", "Haul off");
  assert.match(q, /start to finish/);
  assert.match(q, /calls, texts/);
  assert.match(q, /takeoffs/);
  assert.match(q, /What it says now:\nHaul off/);
});
