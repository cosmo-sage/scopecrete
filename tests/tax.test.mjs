// Which parish a job is in, and its rate — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parishFromAddress, jobTax } from "../src/lib/tax.ts";

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
