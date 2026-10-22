// @email in a thread's text box (src/lib/email-mention.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { atEmail, addressHits } from "../src/lib/email-mention.ts";

test("@email as the last word turns the box into an email", () => {
  assert.equal(atEmail("@email"), "");
  assert.equal(atEmail("Hi Jeremy, the plans are in @email"), "Hi Jeremy, the plans are in");
  assert.equal(atEmail("hi\n@Email"), "hi");
  assert.equal(atEmail("@mail"), "");
  assert.equal(atEmail("coy@email"), null); // part of an address, not the command
  assert.equal(atEmail("@email me later"), null);
  assert.equal(atEmail("hello"), null);
});

const book = [
  { id: "p1", name: "Jeremy Wright", company: "Gulfline Paving", role_label: "Customer", emails: [{ address: "Jeremy.Wright@gulflinepaving.com" }] },
  { id: "p2", name: "Luis", company: null, role_label: "Sub", emails: [] },
];
const mail = [
  { from_address: "admin@saccobuilt.com", from_name: "Coy Sacco", original_from_address: "ben@lacontracting.com", original_from_name: "Ben Bourgeois",
    to_addresses: ["intake-concrete@agentmail.to"], cc_addresses: ["jeremy.wright@gulflinepaving.com"] },
];
const ours = ["intake-concrete@agentmail.to"];

test("Contacts first, then addresses seen on mail, never our inbox, no repeats", () => {
  const all = addressHits("a", book, mail, ours, 20).map((h) => h.email);
  assert.ok(!all.includes("intake-concrete@agentmail.to"));
  assert.equal(new Set(all).size, all.length);
  const j = addressHits("jeremy", book, mail, ours);
  assert.equal(j.length, 1);
  assert.equal(j[0].contact_id, "p1");
  assert.equal(j[0].email, "jeremy.wright@gulflinepaving.com");
  const ben = addressHits("ben bour", book, mail, ours);
  assert.deepEqual(ben.map((h) => [h.email, h.name, h.role]), [["ben@lacontracting.com", "Ben Bourgeois", "Emailed before"]]);
  assert.equal(addressHits("gulfline", book, mail, ours)[0].name, "Jeremy Wright");
  assert.deepEqual(addressHits("", book, mail, ours), []);
});
