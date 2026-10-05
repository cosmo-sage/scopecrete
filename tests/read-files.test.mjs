// Dusty reading a file — `npm test`. A suggestion, and a number only if it's written in the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRead, parseReply, readable, numbersIn, clipText } from "../supabase/functions/read-files/rules.ts";

test("numbers written in a document, commas and all", () => {
  const n = numbersIn("4,000 PSI · 6\" slab · $12,480.50 total");
  assert.ok(n.has(4000) && n.has(6) && n.has(12480.5));
});

test("a number not written in the document is dropped; one that is, is kept", () => {
  const r = sanitizeRead({ summary: "Spec for the Parish sidewalk bid.", kind: "spec",
    facts: { psi: 4000, thickness_in: 5, amount: "$12,480.50", bid_due: "2026-10-14", dimensions: ["310 LF"], notes: [] } },
    "Concrete shall be 4,000 psi. Sidewalk 4\" thick. Total $12,480.50. Bids due 10/14/2026.");
  assert.equal(r.facts.psi, 4000);
  assert.equal(r.facts.amount, 12480.5);
  assert.equal(r.facts.thickness_in, undefined);
  assert.match(r.dropped.join("|"), /thickness_in: 5 is not written/);
  assert.equal(r.facts.bid_due, "2026-10-14");
  assert.deepEqual(r.facts.dimensions, ["310 LF"]);
  assert.equal(r.facts.notes, undefined);
});

test("a photo has no text to check against — sane numbers pass, insane ones don't", () => {
  const r = sanitizeRead({ summary: "Cracked driveway apron.", kind: "photo", facts: { psi: 99, thickness_in: 4 } }, null);
  assert.equal(r.facts.thickness_in, 4);
  assert.equal(r.facts.psi, undefined);
  assert.equal(r.kind, "photo");
});

test("no summary, no read; unknown kind becomes null; bad dates dropped", () => {
  assert.equal(sanitizeRead({ summary: "  ", facts: {} }, null), null);
  const r = sanitizeRead({ summary: "x", kind: "banana", facts: { date: "Oct 14" } }, null);
  assert.equal(r.kind, null);
  assert.equal(r.facts.date, undefined);
});

test("reply parsing finds the JSON inside prose", () => {
  assert.deepEqual(parseReply('Sure! {"summary":"a","facts":{}} done'), { summary: "a", facts: {} });
  assert.equal(parseReply("no json"), null);
});

test("what Dusty can read", () => {
  assert.deepEqual(readable("image", "image/jpeg", 1000), { ok: true, as: "image" });
  assert.equal(readable("image", "image/heic", 1000).ok, false);
  assert.equal(readable("image", "image/png", 6 * 1024 * 1024).ok, false);
  assert.deepEqual(readable("pdf", "application/pdf", 4e6), { ok: true, as: "pdf" });
  assert.equal(readable("pdf", "application/pdf", 25007953).ok, false);
  assert.equal(readable("sheet", null, 1).ok, false);
});

test("long documents are clipped from the end", () => {
  const { text, clipped } = clipText("a".repeat(50_000), 40_000);
  assert.equal(text.length, 40_000);
  assert.ok(clipped);
});

test("price lines: kept only when the unit price is written in the quote", () => {
  const text = "Angelle Materials — Quote Q-1182\n3000 PSI  CY  42  $148.00  $6,216.00\n#4 Rebar 20' RB-4 EA 120 14.50 1,740.00\nFuel surcharge 25.00";
  const r = sanitizeRead({ summary: "Angelle quote.", kind: "vendor_quote", facts: {}, price_lines: [
    { name: "3000 PSI", sku: null, unit: "CY", unit_cost: 148, qty: 42 },
    { name: "#4 Rebar 20'", sku: "RB-4", unit: "EA", unit_cost: "14.50", qty: 120 },
    { name: "4000 PSI", unit: "CY", unit_cost: 158, qty: null },          // not in the text
    { name: "Line total mistaken", unit: "CY", unit_cost: 6216 / 42 + 1 }, // worked out, not written
    { name: "", unit_cost: 25 },                                            // no name
    { name: "Fuel surcharge", unit: null, unit_cost: 25, qty: 3 },          // qty 3 not written
  ] }, text);
  assert.deepEqual(r.facts.price_lines, [
    { name: "3000 PSI", sku: null, unit: "CY", unit_cost: 148, qty: 42 },
    { name: "#4 Rebar 20'", sku: "RB-4", unit: "EA", unit_cost: 14.5, qty: 120 },
    { name: "Fuel surcharge", sku: null, unit: null, unit_cost: 25, qty: null },
  ]);
  assert.match(r.dropped.join("|"), /price_lines: 2 prices not written/);
  assert.equal(r.facts.price_lines_from_photo, undefined);
});

test("price lines from a photo are marked for checking", () => {
  const r = sanitizeRead({ summary: "Receipt.", kind: "receipt", facts: {}, price_lines: [{ name: "Rebar chairs", unit: "BAG", unit_cost: 18.9 }] }, null);
  assert.equal(r.facts.price_lines.length, 1);
  assert.equal(r.facts.price_lines_from_photo, true);
});

test("a vendor's invoice: who issued it and the tax rate, each only if printed", () => {
  const text = "ACME READY MIX LLC\n1200 Plank Rd, Baton Rouge LA\n(225) 555-0142  orders@acmemix.test\nBILL TO: Sample Customer\n3000 PSI CY 10 $152.00\nShort load fee LOAD 1 $95.00\nSales tax 9.45% $143.64";
  const r = sanitizeRead({ summary: "Ready-mix invoice.", kind: "receipt", facts: {},
    price_lines: [{ name: "3000 PSI", unit: "CY", unit_cost: 152, qty: 10 }, { name: "Short load fee", unit: "LOAD", unit_cost: 95, qty: 1 }],
    vendor_details: { name: "Acme Ready Mix LLC", phone: "225-555-0142", email: "orders@acmemix.test", address: "1200 Plank Rd, Baton Rouge LA" },
    tax_pct: 9.45 }, text);
  assert.deepEqual(r.facts.vendor_details, { name: "Acme Ready Mix LLC", phone: "225-555-0142", email: "orders@acmemix.test", address: "1200 Plank Rd, Baton Rouge LA" });
  assert.equal(r.facts.tax_pct, 9.45);
  assert.equal(r.facts.price_lines.length, 2);

  const bad = sanitizeRead({ summary: "x", facts: {},
    vendor_details: { name: "Other Supply", phone: "225-555-9999", email: "x@y.test", address: "77 Nowhere St" }, tax_pct: 8.5 }, text);
  assert.equal(bad.facts.vendor_details, undefined);
  assert.equal(bad.facts.tax_pct, undefined);
  assert.match(bad.dropped.join("|"), /vendor phone: 225-555-9999 is not written/);
  assert.match(bad.dropped.join("|"), /tax_pct: 8.5 is not written/);

  const photo = sanitizeRead({ summary: "x", facts: {}, vendor_details: { name: "Acme", phone: "555" }, tax_pct: 60 }, null);
  assert.deepEqual(photo.facts.vendor_details, { name: "Acme" });
  assert.equal(photo.facts.tax_pct, undefined);
});

test("tax as printed: an amount and a subtotal, never a rate worked out", () => {
  const text = "Subtotal $3,807.00\nTAX $399.74\nTotal $4,206.74";
  const r = sanitizeRead({ summary: "x", facts: {}, subtotal: 3807, tax_amount: "$399.74", tax_pct: 10.5 }, text);
  assert.equal(r.facts.subtotal, 3807);
  assert.equal(r.facts.tax_amount, 399.74);
  assert.equal(r.facts.tax_pct, undefined);
  assert.match(r.dropped.join("|"), /tax_pct: 10.5 is not written/);
});
