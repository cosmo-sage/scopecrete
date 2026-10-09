// Business cards (src/lib/business-card.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCard } from "../src/lib/business-card.ts";

test("a card keeps what has the right shape", () => {
  const c = readCard({ name: " Amber  Lee ", company: "Art Apartments", title: "Property Manager",
    phones: [{ number: "(225) 446-2212", label: "cell" }, { number: "225.446.2212", label: "office" }, { number: "225-555-0101", label: "Fax" }, { number: "446-2212" }],
    emails: ["Amber@ArtApts.com", "not an email"], address: "4411 Perkins Rd", city: "Baton Rouge", state: "la", zip: "70808", website: "artapts.com" });
  assert.equal(c.name, "Amber Lee");
  assert.deepEqual(c.phones, [{ number: "(225) 446-2212", label: "Mobile" }]);
  assert.deepEqual(c.emails, [{ address: "amber@artapts.com", label: "" }]);
  assert.equal(c.state, "LA");
  assert.equal(c.zip, "70808");
});

test("nothing printed is nothing", () => {
  const c = readCard({ name: "null", phones: "x", emails: null, zip: "7080" });
  assert.equal(c.name, null);
  assert.deepEqual(c.phones, []);
  assert.deepEqual(c.emails, []);
  assert.equal(c.zip, null);
  assert.equal(readCard(null).company, null);
});
