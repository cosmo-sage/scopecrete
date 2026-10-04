// Cost cards — `npm test`. What a card from the browser may say, and what a card still needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCard, cardGaps, defaultTaxable } from "../src/lib/cost-cards.ts";

test("a full card is cleaned, money strings read as numbers", () => {
  const r = cleanCard({ name: " Ready mix  3000 psi ", cost_type: "material", qty_rule: "per_cy", unit: "", unit_cost: "$236.13",
    markup_pct: "30.61%", price_as_of: "2026-09-29", price_source: "quote", rule_params: { per_cy: 5, junk: 9 } });
  assert.equal(r.ok, true);
  assert.equal(r.card.name, "Ready mix 3000 psi");
  assert.equal(r.card.unit, "cy");            // from the rule, since none was typed
  assert.equal(r.card.unit_cost, 236.13);
  assert.equal(r.card.markup_pct, 30.61);
  assert.equal(r.card.taxable, true);         // materials default to taxed
  assert.deepEqual(r.card.rule_params, { per_cy: 5 });
});

test("a blank unit cost is kept as blank — never a number nobody entered", () => {
  const r = cleanCard({ name: "Form & finish", cost_type: "labor", qty_rule: "per_sqft", unit_cost: "" });
  assert.equal(r.ok, true);
  assert.equal(r.card.unit_cost, null);
  assert.equal(r.card.taxable, false);
  assert.deepEqual(cardGaps({ unit_cost: null, qty_rule: "per_sqft", rule_params: {} }), ["unit cost"]);
});

test("bad input is refused with a reason", () => {
  assert.equal(cleanCard({ name: "", cost_type: "material" }).ok, false);
  assert.equal(cleanCard({ name: "x", cost_type: "concrete" }).ok, false);
  assert.equal(cleanCard({ name: "x", cost_type: "labor", unit_cost: -2 }).ok, false);
  assert.equal(cleanCard({ name: "x", cost_type: "labor", vendor_contact_id: "nope" }).ok, false);
  assert.equal(cleanCard({ name: "x", cost_type: "labor", price_as_of: "Sept" }).ok, false);
  assert.equal(cleanCard({ name: "x", cost_type: "material", qty_rule: "per_sheet", rule_params: { sheet_sqft: 0 } }).ok, false);
});

test("a PATCH checks only what was sent", () => {
  const r = cleanCard({ unit_cost: "12.50" }, true);
  assert.deepEqual(r, { ok: true, card: { unit_cost: 12.5 } });
});

test("what a rebar or mesh card still needs is named", () => {
  assert.deepEqual(cardGaps({ unit_cost: 14.5, qty_rule: "per_stick", rule_params: { stick_ft: 20 } }), ["bar spacing"]);
  assert.deepEqual(cardGaps({ unit_cost: 110, qty_rule: "per_sheet", rule_params: {} }), ["what one sheet covers"]);
  assert.equal(defaultTaxable("equipment"), false);
});
