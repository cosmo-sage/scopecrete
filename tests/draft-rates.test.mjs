// Going rates for a draft budget — kept only as the pages state them.
// Synthetic pages and prices, not real quotes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rateQueries, sanitizeRates } from "../src/lib/draft/rates.ts";

const pages = [
  { url: "https://example.com/driveway", title: "Driveway cost", text: "A concrete driveway costs $8 to $12 per square foot installed in most of the South." },
  { url: "https://example.org/mix", title: "Ready mix", text: "Ready-mix runs about $165 per cubic yard delivered." },
];
const rate = (o) => ({ step: "job", what: "driveway installed", low: 8, high: 12, unit: "sf", split: "all", kind: "installed_price",
  url: "https://example.com/driveway", quote: "costs $8 to $12 per square foot installed", ...o });

test("a rate in its page's words is kept", () => {
  const { rates, dropped } = sanitizeRates({ rates: [rate(), rate({ step: "concrete", low: 165, high: 165, unit: "cy", kind: "cost", url: "https://example.org/mix", quote: "about $165 per cubic yard" })] }, pages);
  assert.equal(dropped, 0);
  assert.equal(rates.length, 2);
  assert.equal(rates[1].site, "example.org");
});

test("made-up pages, quotes and numbers are dropped", () => {
  const bad = [
    rate({ url: "https://elsewhere.com/x" }),
    rate({ quote: "costs $9 to $14 per square foot installed" }),
    rate({ high: 15 }),
    rate({ unit: "acre" }),
    rate({ step: "pizza" }),
    rate({ low: 12, high: 8 }),
  ];
  const { rates, dropped } = sanitizeRates({ rates: bad }, pages);
  assert.equal(rates.length, 0);
  assert.equal(dropped, 6);
  assert.deepEqual(sanitizeRates("nonsense", pages).rates, []);
});

test("searches carry the work and the city, never more than four", () => {
  const q = rateQueries("Baton Rouge, LA", ["demo", "concrete", "finishing", "base", "reinforcement"]);
  assert.equal(q.length, 4);
  assert.ok(q.every((x) => x.includes("Baton Rouge, LA")));
  assert.equal(rateQueries(null, ["base"]).length, 2);
});

test("section searches: the section's own words and unit, the city, at most four", async () => {
  const { sectionQueries, sanitizeRates } = await import("../src/lib/draft/rates.ts");
  const q = sectionQueries("Gonzales, LA", [
    { key: "s1", name: "Thickened pavement edge", unit: "lf" }, { key: "s2", name: "Parking log", unit: "each" },
    { key: "s3", name: "x", unit: "sf" }, { key: "s4", name: "y", unit: "sf" }, { key: "s5", name: "z", unit: "sf" },
  ]);
  assert.equal(q.length, 4);
  assert.equal(q[0], "Thickened pavement edge installed cost per linear foot Gonzales, LA 2026");
  assert.equal(q[1], "Parking log concrete installed cost each Gonzales, LA 2026");
  const results = [{ url: "https://a.com/p", title: "t", text: "Wheel stops run $45 to $90 each installed." }];
  const got = sanitizeRates({ rates: [{ step: "s2", what: "wheel stop", low: 45, high: 90, unit: "each", split: "all", kind: "installed_price", url: "https://a.com/p", quote: "Wheel stops run $45 to $90 each installed." },
    { step: "demo", what: "x", low: 45, high: 90, unit: "each", split: "all", kind: "installed_price", url: "https://a.com/p", quote: "Wheel stops run $45 to $90 each installed." }] }, results, new Set(["s1", "s2"]));
  assert.equal(got.rates.length, 1); assert.equal(got.dropped, 1);
});
