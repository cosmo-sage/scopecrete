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
