// Heard addresses checked against Mapbox (src/lib/address-check.ts) — `npm test`.
// Made-up addresses only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressQuery, houseNumber, mapboxV6Matches, sureMatch } from "../src/lib/address-check.ts";

const feature = (over = {}, mc = { address_number: "matched", street: "matched", confidence: "exact" }) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [-91.05, 30.47] },
  properties: {
    feature_type: "address", name: "1234 Example Avenue",
    context: {
      address: { name: "1234 Example Avenue", address_number: "1234", street_name: "Example Avenue" },
      postcode: { name: "70800" }, place: { name: "Baton Rouge" },
      region: { name: "Louisiana", region_code: "LA" },
    },
    match_code: mc,
    ...over,
  },
});

test("Mapbox v6 answer → address parts", () => {
  const [m] = mapboxV6Matches({ features: [feature()] });
  assert.deepEqual({ line1: m.line1, city: m.city, state: m.state, zip: m.zip, formatted: m.formatted, lat: m.lat, lng: m.lng },
    { line1: "1234 Example Avenue", city: "Baton Rouge", state: "LA", zip: "70800", formatted: "1234 Example Avenue, Baton Rouge, LA 70800", lat: 30.47, lng: -91.05 });
  assert.equal(m.confidence, "exact");
});

test("a street or a town alone is not an address", () => {
  assert.equal(mapboxV6Matches({ features: [feature({ feature_type: "street" })] }).length, 0);
  assert.equal(mapboxV6Matches(null).length, 0);
  assert.equal(mapboxV6Matches({ features: "x" }).length, 0);
});

test("sure only when the said number, the street and the confidence all hold", () => {
  const ok = mapboxV6Matches({ features: [feature()] })[0];
  assert.equal(sureMatch("1234 Exampel Ave, Baton Rouge", ok), true); // misheard spelling, Mapbox matched it
  const high = mapboxV6Matches({ features: [feature({}, { address_number: "matched", street: "matched", confidence: "high" })] })[0];
  assert.equal(sureMatch("1234 Example Ave", high), true);
  const medium = mapboxV6Matches({ features: [feature({}, { address_number: "matched", street: "matched", confidence: "medium" })] })[0];
  assert.equal(sureMatch("1234 Example Ave", medium), false);
  const noStreet = mapboxV6Matches({ features: [feature({}, { address_number: "matched", street: "unmatched", confidence: "high" })] })[0];
  assert.equal(sureMatch("1234 Example Ave", noStreet), false);
  assert.equal(sureMatch("1243 Example Ave", ok), false); // another house
  assert.equal(sureMatch("Example Ave", ok), false);
  assert.equal(sureMatch("1234 Example Ave", null), false);
});

test("the query leaves notes out", () => {
  assert.equal(addressQuery("1234 Example Avenue, Baton Rouge; community property, near office past mailbox"), "1234 Example Avenue, Baton Rouge");
  assert.equal(addressQuery("1234 Example Blvd, Baton Rouge, LA 70800 (Shop)"), "1234 Example Blvd, Baton Rouge, LA 70800");
  assert.equal(addressQuery("1234 Example Ave."), "1234 Example Ave");
  assert.equal(houseNumber("  1234 Example"), "1234");
  assert.equal(houseNumber("Example 1234"), null);
});
