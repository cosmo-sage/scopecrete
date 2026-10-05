// Contacts — the book (src/lib/contacts-book.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookRole, matchesBook, phoneE164, cleanEmail, readNewContact, sortBook, rankBook, formatNumber } from "../src/lib/contacts-book.ts";

const entry = (o = {}) => ({
  name: "Amber Lee", company: "Art Apartments", address: "4411 Perkins Rd, Baton Rouge", customer_name: "Art Apartments", role_label: "Cust. contact",
  phones: [{ number: "+12254462212", label: "Office" }], emails: [{ address: "amber@artapts.com", label: null }], ...o,
});

test("numbers read as E.164, or not at all", () => {
  assert.equal(phoneE164("(225) 446-2212"), "+12254462212");
  assert.equal(phoneE164("1 225 446 2212"), "+12254462212");
  assert.equal(phoneE164("+44 20 7946 0958"), "+442079460958");
  assert.equal(phoneE164("446-2212"), null);
  assert.equal(phoneE164(null), null);
  assert.equal(formatNumber("+12254462212"), "(225) 446-2212");
});

test("emails are trimmed, lower-cased and checked", () => {
  assert.equal(cleanEmail("  Amber@ArtApts.com "), "amber@artapts.com");
  assert.equal(cleanEmail("amber@"), null);
  assert.equal(cleanEmail(""), null);
});

test("a new contact needs a name or a way to reach them", () => {
  assert.equal(readNewContact({}).ok, false);
  assert.equal(readNewContact({ name: "  " }).ok, false);
  assert.equal(readNewContact({ company: "LA Contracting" }).ok, true);
  assert.equal(readNewContact({ phones: [{ number: "2254462212" }] }).ok, true);
});

test("a bad number or email is an error by name, never dropped", () => {
  const r = readNewContact({ name: "Amber", phones: [{ number: "555-01" }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /555-01/);
  const e = readNewContact({ name: "Amber", emails: [{ address: "amber at artapts" }] });
  assert.equal(e.ok, false);
});

test("numbers and emails fold duplicates and keep their labels; blanks are skipped", () => {
  const r = readNewContact({
    name: "Amber", phones: [{ number: "(225) 446-2212", label: "Office" }, { number: "225.446.2212" }, { number: "" }],
    emails: [{ address: "AMBER@artapts.com", label: "Work" }, { address: "amber@artapts.com" }], state: "la",
  });
  assert.ok(r.ok);
  assert.deepEqual(r.contact.phones, [{ number: "+12254462212", label: "Office" }]);
  assert.deepEqual(r.contact.emails, [{ address: "amber@artapts.com", label: "Work" }]);
  assert.equal(r.contact.state, "LA");
  assert.equal(r.contact.bucket, null);
});

test("only customer, vendor or personal can be filed on the way in; a kind only for a vendor", () => {
  assert.equal(readNewContact({ name: "x", bucket: "spam" }).contact.bucket, null);
  assert.equal(readNewContact({ name: "x", bucket: "customer", subtype: "supplier" }).contact.subtype, null);
  assert.equal(readNewContact({ name: "x", bucket: "vendor", subtype: "supplier" }).contact.subtype, "supplier");
});

test("the book shows a role only once someone filed them", () => {
  const base = { contact_subtype: null, customer_id: null, is_primary_on_customer: false, customer_people: 0 };
  assert.equal(bookRole({ ...base, contact_type: "customer", shown: false }), "unsorted");
  assert.equal(bookRole({ ...base, contact_type: "customer", shown: true }), "customer");
  assert.equal(bookRole({ ...base, contact_type: "vendor", contact_subtype: "subcontractor", shown: true }), "sub");
  assert.equal(bookRole({ ...base, contact_type: "customer", shown: true, customer_id: "c", customer_people: 2 }), "contact");
  assert.equal(bookRole({ ...base, contact_type: "customer", shown: true, customer_id: "c", customer_people: 2, is_primary_on_customer: true }), "customer");
});

test("a search matches every word, anywhere on them", () => {
  assert.ok(matchesBook(entry(), "amber"));
  assert.ok(matchesBook(entry(), "art apartments"));
  assert.ok(matchesBook(entry(), "artapts.com"));
  assert.ok(matchesBook(entry(), "perkins"));
  assert.ok(matchesBook(entry(), "office"));
  assert.ok(matchesBook(entry(), "amber perkins"));
  assert.ok(!matchesBook(entry(), "amber wilson"));
  assert.ok(matchesBook(entry(), ""));
});

test("digits find a number however it's typed", () => {
  assert.ok(matchesBook(entry(), "4462"));
  assert.ok(matchesBook(entry(), "(225) 446-2212"));
  assert.ok(matchesBook(entry(), "446-2212"));
  assert.ok(!matchesBook(entry(), "4463"));
  assert.ok(!matchesBook(entry(), "22"), "two digits are too few to mean a number");
});

test("A–Z puts nameless people last; Recent is newest touch first", () => {
  const rows = [
    { name: null, company: null, last_contacted: "2026-10-05", created_at: null },
    { name: "zed", company: null, last_contacted: "2026-09-01", created_at: null },
    { name: "Amber", company: null, last_contacted: null, created_at: "2026-10-01" },
  ];
  assert.deepEqual(sortBook(rows, "az").map((r) => r.name), ["Amber", "zed", null]);
  assert.deepEqual(sortBook(rows, "recent").map((r) => r.name), [null, "Amber", "zed"]);
});

test("a name that starts with the search comes first", () => {
  const rows = [{ name: "Dylan Ambers", company: null }, { name: "Amber Lee", company: null }];
  assert.deepEqual(rankBook(rows, "amber").map((r) => r.name), ["Amber Lee", "Dylan Ambers"]);
});
