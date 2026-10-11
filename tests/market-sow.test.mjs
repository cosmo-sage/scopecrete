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

test("itemized costs: known types and units, ten at most, keys in order", async () => {
  const { sanitizeItems } = await import("../src/lib/draft/rates.ts");
  const items = sanitizeItems({ items: [
    { name: "Skid steer with breaker rental", cost_type: "equipment", unit: "day", from: "Break out curb" },
    { name: "Equipment operator", cost_type: "labor", unit: "day" },
    { name: "x", cost_type: "labor", unit: "day" },
    { name: "Something", cost_type: "profit", unit: "day" },
    { name: "Equipment operator", cost_type: "labor", unit: "day" },
  ] });
  assert.deepEqual(items.map((i) => [i.key, i.cost_type]), [["i1", "equipment"], ["i2", "labor"]]);
});

test("item searches drop address numbers and private words", async () => {
  const { itemQueries } = await import("../src/lib/draft/rates.ts");
  const q = itemQueries("Walker, LA", [{ key: "i1", name: "Dump truck at 15900 Industry Way", cost_type: "equipment", unit: "day", from: "" }], ["15900 Industry Way", "Gulfline Paving"]);
  assert.equal(q[0], "Dump truck at cost per day Walker, LA 2026");
});

test("the itemizer is told demolition means removal, never installing", async () => {
  const { ITEMIZE_SYSTEM } = await import("../src/lib/draft/rates.ts");
  assert.match(ITEMIZE_SYSTEM, /never installing/);
});

import { deepQueries, sanitizeTotal, renderRollup } from "../src/lib/draft/rates.ts";

test("digging deeper on one cost keeps private words out and asks by its cost type", () => {
  const it = { key: "i1", name: "Skid steer with breaker at 15900 Gulfline", cost_type: "equipment", unit: "day", from: "" };
  const q = deepQueries("Walker, LA", it, ["Gulfline"]);
  assert.equal(q.length, 3);
  for (const x of q) assert.doesNotMatch(x, /15900|Gulfline/);
  assert.match(q[0], /rental rate per day Walker, LA/);
});

test("a section's estimate is kept only when its numbers make sense", () => {
  assert.equal(sanitizeTotal({ low: 900, high: 500 }, "lf"), null);
  assert.equal(sanitizeTotal({ low: "x", high: 5 }, "lf"), null);
  const t = sanitizeTotal({ low: 2400, high: 3800, per_low: 6, per_high: 9.5, basis: "2 days of skid steer" }, "lf");
  assert.deepEqual(t, { low: 2400, high: 3800, unit: "lf", per_low: 6, per_high: 9.5, basis: "2 days of skid steer" });
  assert.equal(sanitizeTotal({ low: 1, high: 2, per_low: 1, per_high: 2 }, null).per_low, null);
  assert.match(renderRollup({ name: "Curb", size: "400 LF" }, [{ key: "i1", name: "Operator", cost_type: "labor", unit: "day", from: "" }], new Map()), /no price found/);
});
