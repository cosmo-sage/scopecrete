// Which parish a job is in, and its rate — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parishFromAddress, jobTax, addressParts } from "../src/lib/tax.ts";

test("parish from the city", () => {
  assert.equal(parishFromAddress("4550 Nicholson Dr, Baton Rouge, LA 70808"), "East Baton Rouge");
  assert.equal(parishFromAddress("123 Range Ave, Denham Springs, LA"), "Livingston");
  assert.equal(parishFromAddress("West Monroe, Louisiana"), "Ouachita");
  assert.equal(parishFromAddress("1 Main St, Gonzales"), "Ascension");
});

test("a parish named in the address wins", () => {
  assert.equal(parishFromAddress("Hwy 16, Livingston Parish, LA"), "Livingston");
});

test("unknown stays unknown — never a guess", () => {
  assert.equal(parishFromAddress("12 Somewhere Rd, Nowhere, LA"), null);
  assert.equal(parishFromAddress("100 Main St, Jackson, MS"), null);
  assert.equal(parishFromAddress(null), null);
});

test("job rate: override, else the parish's rate, else says what's missing", () => {
  const rates = [{ parish: "East Baton Rouge", rate_pct: 10.5 }];
  assert.deepEqual(jobTax({ tax_rate_source: "override", tax_rate_pct: 9 }, null, rates), { rate: 9, parish: null, source: "override", missing: null });
  assert.equal(jobTax({ address: "Baton Rouge, LA" }, null, rates).rate, 10.5);
  assert.equal(jobTax({ address: null }, "Zachary, LA", rates).rate, 10.5);
  assert.match(jobTax({ address: "Denham Springs, LA" }, null, rates).missing, /no rate for Livingston/);
  assert.match(jobTax({ address: "nowhere" }, null, rates).missing, /parish unknown/);
});

test("TaxLocus's reply → the rate in %, its parts and date; nothing made up", async () => {
  const { readTaxLocus } = await import("../src/lib/tax.ts");
  const r = readTaxLocus({ combined_rate: 0.105, breakdown: [{ name: "LA", rate: 0.05, level: "state" }, { name: "City of Baton Rouge EBRP School District", rate: 0.055, level: "city" }], as_of: "2026-10-04", resolution: "rooftop" },
    "900 N 3rd St, Baton Rouge, LA 70802", "2026-10-04T12:00:00Z");
  assert.equal(r.rate_pct, 10.5);
  assert.deepEqual(r.parts.map((p) => p.rate_pct), [5, 5.5]);
  assert.equal(r.resolution, "rooftop");
  assert.equal(readTaxLocus({ error: "bad_input" }, "x"), null);
  assert.equal(readTaxLocus({ combined_rate: "0.1" }, "x"), null);
});

test("an address in pieces, from fields or a line; no street number, no lookup", async () => {
  const { addressParts } = await import("../src/lib/tax.ts");
  assert.deepEqual(addressParts("14835 Example Ave, Baton Rouge, LA 70816"), { line1: "14835 Example Ave", city: "Baton Rouge", state: "LA", postal_code: "70816", text: "14835 Example Ave, Baton Rouge, LA 70816" });
  assert.deepEqual(addressParts({ line1: "12 Sample Rd", city: "Gonzales", state: "la", zip: null }).text, "12 Sample Rd, Gonzales, LA");
  assert.equal(addressParts("12 Sample Rd, Denham Springs LA 70726").city, "Denham Springs");
  assert.equal(addressParts("near the school, Baton Rouge"), null);
  assert.equal(addressParts("12 Sample Rd"), null, "a street alone can't be placed");
  assert.equal(addressParts(null), null);
});

test("the job's rate: typed, then picked parish, then the lookup for this address, then the parish table", async () => {
  const { jobTax } = await import("../src/lib/tax.ts");
  const lookup = { rate_pct: 10.5, parts: [], as_of: null, resolution: "rooftop", address: "1 A St, Baton Rouge, LA", at: "", source: "TaxLocus" };
  const rates = [{ parish: "East Baton Rouge", rate_pct: 9.95 }];
  assert.equal(jobTax({ address: "1 A St, Baton Rouge, LA", tax_lookup: lookup }, null, rates, "1 A St, Baton Rouge, LA").source, "lookup");
  assert.equal(jobTax({ address: "2 B St, Baton Rouge, LA", tax_lookup: lookup }, null, rates, "2 B St, Baton Rouge, LA").rate, 9.95, "a moved address doesn't use the old lookup");
  assert.equal(jobTax({ address: "1 A St, Baton Rouge, LA", tax_lookup: lookup, tax_parish: "East Baton Rouge" }, null, rates, "1 A St, Baton Rouge, LA").source, "parish");
  assert.equal(jobTax({ tax_rate_pct: 8, tax_rate_source: "override", tax_lookup: lookup }, null, rates).rate, 8);
});

test("an out-of-state job never takes the customer's Louisiana parish", () => {
  assert.equal(addressParts("Wiggins, Mississippi")?.state ?? "MS", "MS");
  const t = jobTax({ tax_rate_pct: null, tax_rate_source: null, tax_parish: null, address: "Wiggins, Mississippi", tax_lookup: null },
    null, [{ parish: "East Baton Rouge", rate_pct: 5 }]);
  assert.equal(t.rate, null);
  assert.match(t.missing, /street address|type the rate/);
});
