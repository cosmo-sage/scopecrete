// Matching a receipt to the Price book — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normVendor, phoneDigits, matchVendor, itemTokens, matchItem } from "../src/lib/vendor-match.ts";

const V = [
  { id: "ang", name: "Angelle Materials", phone: "+12255550101" },
  { id: "gulf", name: "Gulf Steel, LLC", phone: null, phones: ["(225) 555-0199"] },
  { id: "rm1", name: "Ready Mix One", phone: null },
  { id: "rm2", name: "Ready Mix Two", phone: null },
];

test("vendor names and phones fold to one form", () => {
  assert.equal(normVendor("Angelle Materials, L.L.C."), "angelle materials");
  assert.equal(normVendor("The Gulf Steel Co."), "gulf steel");
  assert.equal(phoneDigits("+1 (225) 555-0101"), "2255550101");
  assert.equal(phoneDigits("555-0101"), null);
});

test("a receipt's vendor: printed phone first, then the name, never a guess between two", () => {
  assert.deepEqual(matchVendor({ name: "Somebody Else", phone: "225.555.0101" }, V), { id: "ang", how: "phone" });
  assert.deepEqual(matchVendor({ name: "GULF STEEL LLC" }, V), { id: "gulf", how: "name" });
  assert.deepEqual(matchVendor({ phone: "225-555-0199" }, V), { id: "gulf", how: "phone" });
  assert.deepEqual(matchVendor({ name: "Angelle" }, V), { id: "ang", how: "name" });
  assert.equal(matchVendor({ name: "Ready Mix" }, V), null);          // two could be it: ask
  assert.equal(matchVendor({ name: "Buzzi Unicem" }, V), null);
  assert.equal(matchVendor({}, V), null);
});

test("item words and numbers: 3,000 PSI is 3000 psi", () => {
  assert.deepEqual(itemTokens("3,000 PSI Ready-Mix"), ["3000", "psi", "ready", "mix"]);
  assert.deepEqual(itemTokens("#4 Rebar 20'"), ["no", "4", "rebar", "20"]);
});

test("a line's item: vendor item # first, then the name, then a close name with the same numbers", () => {
  const items = [
    { id: "c3000", name: "3000 psi ready mix", sources: [{ vendor_contact_id: "ang", vendor_sku: "RM3000" }] },
    { id: "c4000", name: "4000 psi ready mix" },
    { id: "short", name: "Short load fee" },
    { id: "old", name: "Fuel surcharge", active: false },
  ];
  assert.deepEqual(matchItem({ name: "Concrete", sku: "rm3000" }, items, "ang"), { id: "c3000", how: "sku" });
  assert.deepEqual(matchItem({ name: "3,000 PSI Ready Mix" }, items, "ang"), { id: "c3000", how: "name" });
  assert.deepEqual(matchItem({ name: "3000 PSI concrete ready mix" }, items, "ang"), { id: "c3000", how: "close" });
  assert.equal(matchItem({ name: "5000 psi ready mix" }, items, "ang"), null);     // numbers differ
  assert.equal(matchItem({ name: "Short Load Fee" }, items, "ang")?.id, "short");
  assert.equal(matchItem({ name: "Short Load Fee (under 5 CY)" }, items, "ang"), null); // "5" is a number the item lacks
  assert.equal(matchItem({ name: "Fuel surcharge" }, items, "ang"), null);          // retired doesn't match
});

test("Angelle Concrete Group on the invoice is Angelle Materials in the app — by email domain, or a first word only it has", async () => {
  const { matchVendor } = await import("../src/lib/vendor-match.ts");
  const vs = [{ id: "am", name: "Angelle Materials", phone: null }, { id: "bz", name: "Buzzi Ready Mix", phone: null }];
  assert.deepEqual(matchVendor({ name: "ANGELLE CONCRETE GROUP, LLC", email: "billing@angellematerials.com" }, vs), { id: "am", how: "email" });
  assert.deepEqual(matchVendor({ name: "ANGELLE CONCRETE GROUP, LLC" }, vs), { id: "am", how: "name" });
  assert.equal(matchVendor({ name: "Ready Mix Co" }, vs), null);              // "ready" is not distinctive
  assert.deepEqual(matchVendor({ email: "Sales@Buzzi.com", name: null }, [{ id: "x", name: "Joe", phone: null, email: "sales@buzzi.com" }]), { id: "x", how: "email" });
});

test("repeated ticket lines fold into one row per item and price", async () => {
  const { collapseLines, taxRateFrom } = await import("../src/lib/vendor-match.ts");
  const L = (sku, name, unit, unit_cost, qty) => ({ sku, name, unit, unit_cost, qty });
  const out = collapseLines([
    L("8006", "7.0 BAG PG CONCRETE MIX 20%", "CY", 155, 10), L("MR6", "MIDRANGE 6\" SLUMP", "CY", 4, 10), L("2", "FUEL_SURCHARGE", "EA", 50, 1),
    L("8006", "7.0 BAG PG CONCRETE MIX 20%", "CY", 155, 10), L("MR6", "MIDRANGE 6\" SLUMP", "CY", 4, 10), L("2", "FUEL_SURCHARGE", "EA", 50, 1),
    L("8006", "7.0 BAG PG CONCRETE MIX 20%", "CY", 155, 3), L("8006", "7.0 BAG PG CONCRETE MIX 20%", "CY", 150, 2),
  ]);
  assert.deepEqual(out.map((l) => [l.sku, l.unit_cost, l.qty, l.times]), [["8006", 155, 23, 3], ["MR6", 4, 20, 2], ["2", 50, 2, 2], ["8006", 150, 2, 1]]);
  assert.equal(taxRateFrom(3807, 399.74), 10.5);
  assert.equal(taxRateFrom(null, 5), null);
});
