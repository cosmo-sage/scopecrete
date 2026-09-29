// Price book imports — `npm test`. CSV, column guesses, values, matching.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, findHeader, quoteRows, guessMapping, parseMoney, parsePct, parseBool, mapType, ruleFromUnit, toRows, matchRows } from "../src/lib/price-import.ts";

test("CSV: quotes, embedded commas and newlines, escaped quotes, BOM, CRLF, blank lines", () => {
  const t = '﻿Name,Description,Unit Cost\r\n"Mesh, 6x6","10 ga\nsheets","$12.00"\r\n\r\n"4"" pipe",,3\n';
  assert.deepEqual(parseCsv(t), [["Name", "Description", "Unit Cost"], ["Mesh, 6x6", "10 ga\nsheets", "$12.00"], ['4" pipe', "", "3"]]);
});

test("JobTread-shaped headers map, cost code isn't taken for cost", () => {
  const h = ["Cost Group", "Name", "Description", "Cost Code", "Cost Type", "Unit", "Unit Cost", "Unit Price", "Taxable", "Vendor"];
  const m = guessMapping(h);
  assert.equal(m.group, 0); assert.equal(m.name, 1); assert.equal(m.description, 2); assert.equal(m.cost_code, 3);
  assert.equal(m.cost_type, 4); assert.equal(m.unit, 5); assert.equal(m.unit_cost, 6); assert.equal(m.unit_price, 7);
  assert.equal(m.taxable, 8); assert.equal(m.vendor, 9); assert.equal(m.markup, null); assert.equal(m.sku, null);
});

test("a generic CRM export maps too", () => {
  const m = guessMapping(["Item", "Category", "UOM", "Cost", "Price", "Supplier", "Part #", "Type"]);
  assert.deepEqual([m.name, m.group, m.unit, m.unit_cost, m.unit_price, m.vendor, m.sku, m.cost_type], [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("values", () => {
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("n/a"), "bad");
  assert.equal(parseMoney("-5"), "bad");
  assert.equal(parsePct("30%"), 30);
  assert.equal(parsePct(0.3), 30);
  assert.equal(parsePct("41.77"), 41.77);
  assert.equal(parseBool("Yes"), true); assert.equal(parseBool("exempt"), false); assert.equal(parseBool(""), null);
  assert.deepEqual(mapType("Materials"), { type: "material", known: true });
  assert.deepEqual(mapType("Subcontractor"), { type: "subcontract", known: true });
  assert.deepEqual(mapType("Widgets"), { type: "other", known: false });
  assert.equal(ruleFromUnit("CY"), "per_cy"); assert.equal(ruleFromUnit("SF"), "per_sqft"); assert.equal(ruleFromUnit("LF"), "per_lf_perimeter");
  assert.equal(ruleFromUnit("each"), "manual");
});

test("rows: blank cost stays blank, markup from price, taxed defaults by type, cost code kept, problems named", () => {
  const table = [
    ["Name", "Cost Type", "Unit", "Unit Cost", "Unit Price", "Cost Code"],
    ["3000 psi", "Materials", "CY", "$150.00", "$195.00", "03-300"],
    ["Form & finish", "Labor", "SF", "", "", ""],
    ["", "Labor", "SF", "1", "", ""],
    ["Pump", "Equipment", "", "abc", "", ""],
  ];
  const r = toRows(table, guessMapping(table[0]));
  assert.equal(r[0].unit_cost, 150); assert.equal(r[0].markup_pct, 30); assert.equal(r[0].markup_from, "price");
  assert.equal(r[0].taxable, true); assert.equal(r[0].qty_rule, "per_cy"); assert.equal(r[0].description, "Cost code 03-300");
  assert.equal(r[1].unit_cost, null); assert.equal(r[1].taxable, false); assert.deepEqual(r[1].problems, []);
  assert.deepEqual(r[2].problems, ["no name"]);
  assert.deepEqual(r[3].problems, ["no unit", "unit cost isn't a number"]);
  assert.equal(r[0].line, 1);
});

test("matching: sku first, then name + unit per vendor; new, change, same, skip", () => {
  const cards = [
    { id: "c1", name: "3000 PSI", unit: "cy", unit_cost: 145, vendor_contact_id: "v1", vendor_sku: null },
    { id: "c2", name: "Rebar #4", unit: "stick", unit_cost: 14.5, vendor_contact_id: "v1", vendor_sku: "RB-4" },
    { id: "c3", name: "Old", unit: "ea", unit_cost: 1, vendor_contact_id: "v1", vendor_sku: null, active: false },
  ];
  const table = [
    ["Name", "Unit", "Unit Cost", "SKU", "Vendor"],
    ["3000 psi", "CY", "150", "", "Angelle"],       // change
    ["#4 rebar 20'", "stick", "14.50", "rb-4", "Angelle"], // same, by sku
    ["4000 psi", "cy", "160", "", "Angelle"],       // new
    ["4000 psi", "cy", "161", "", "Angelle"],       // dup in file
    ["3000 psi", "cy", "150", "", "Other Co"],      // new: different vendor
    ["Old", "ea", "1", "", "Angelle"],              // retired card → new
    ["", "cy", "1", "", ""],                        // skip
  ];
  const rows = toRows(table, guessMapping(table[0]));
  const m = matchRows(rows, cards, (r) => (r.vendor === "Angelle" ? "v1" : null));
  assert.deepEqual(m.map((x) => x.status), ["change", "same", "new", "skip", "new", "new", "skip"]);
  assert.equal(m[0].old_cost, 145); assert.equal(m[0].card_id, "c1"); assert.equal(m[1].card_id, "c2");
  assert.equal(m[6].why, "no name");
});

test("header row found under a title line", () => {
  assert.equal(findHeader([["Cost Catalog Export"], ["2026-09-29"], ["Name", "Unit", "Unit Cost"], ["Mesh", "sheet", "12"]]), 2);
  assert.equal(findHeader([["a", "b"], ["c", "d"]]), 0);
});

test("a vendor quote's lines become rows; a line with no unit is skipped by name", () => {
  const rows = quoteRows([{ name: "3000 PSI", sku: null, unit: "CY", unit_cost: 148, qty: 42 }, { name: "Fuel surcharge", unit: null, unit_cost: 25 }]);
  assert.equal(rows[0].qty_rule, "per_cy"); assert.equal(rows[0].cost_type, "material"); assert.equal(rows[0].unit_cost, 148);
  assert.deepEqual(rows[1].problems, ["no unit on the quote"]);
  const m = matchRows(rows, [{ id: "c1", name: "3000 psi", unit: "cy", unit_cost: 145, vendor_contact_id: "v1", vendor_sku: null }], () => "v1");
  assert.deepEqual(m.map((x) => x.status), ["change", "skip"]);
  assert.deepEqual(quoteRows(null), []);
});
