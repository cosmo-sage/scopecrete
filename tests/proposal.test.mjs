// The proposal's maths — `npm test`. Rounded to $50 on the proposal only;
// sell prices add up to the total to the cent; hiding, add-ons, tax, draws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { budget } from "../src/lib/engine/index.ts";
import { priceProposal, roundUp, drawsCheck, fixLastDraw, drawAmount, fillOrg } from "../src/lib/proposal.ts";

const S = { overhead_pct: 15, margin_pct: 20, tax_rate_pct: 10 };
const L = (o) => ({ name: "Line", cost_type: "material", unit: "ea", unit_cost: 100, margin_pct: null, taxable: false,
  qty_rule: "manual", rule_params: {}, qty_source: "set", quantity: 1, section_id: null, option_id: null, cost_group_id: null, ...o });
const areas = [{ id: "a1", name: "Apron", sqft: 528 }, { id: "a2", name: "Sidewalk", sqft: 140 }];
const lines = [
  L({ id: "mix", name: "Ready mix", unit_cost: 1190, section_id: "a1", taxable: true }),
  L({ id: "lab", name: "Labor", cost_type: "labor", unit_cost: 1500, section_id: "a1" }),
  L({ id: "walk", name: "Walk labor", cost_type: "labor", unit_cost: 440, section_id: "a2" }),
  L({ id: "seal", name: "Sealer", unit_cost: 190, section_id: "a2" }),
  L({ id: "mob", name: "Mobilization", cost_type: "equipment", unit_cost: 160 }),
];
const price = (d = {}, opts = { tax_on: true, discount: 0 }, ls = lines) => {
  const res = budget(ls, [], S, [], null, opts);
  return priceProposal(ls, res, res.tiers[0], areas, d);
};
const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("rounds up to the next $50, and only up", () => {
  assert.equal(roundUp(12312), 12350);
  assert.equal(roundUp(12350), 12350);
  assert.equal(roundUp(12350.01), 12400);
  assert.equal(roundUp(0), 0);
});

test("the rounded price is the budget's price rounded; the extra is profit", () => {
  const p = price();
  assert.ok(p.ok);
  // cost 3,480 → +15% = 4,002 → ÷0.8 = 5,002.50 → 5,050
  near(p.cost, 3480); near(p.overhead, 522); near(p.calc, 5002.5);
  assert.equal(p.rounded, 5050);
  near(p.profit, 5050 - 3480 - 522);
  near(p.by_type.labor, 1940); near(p.by_type.material, 1380); near(p.by_type.equipment, 160);
});

test("sell prices add up to the rounded price exactly, to the cent", () => {
  const p = price({ show_tax_line: true });
  const items = p.groups.flatMap((g) => g.items);
  near(items.reduce((a, i) => a + i.sell, 0), 5050, 0.001);
  near(p.subtotal, 5050, 0.001);
  // the tax line: 10% of the taxed line's cost (1,190) — a pass-through
  near(p.tax, 119); near(p.total, 5169);
});

test("tax folded into the groups gives the same total", () => {
  const shown = price({ show_tax_line: true });
  const folded = price({ show_tax_line: false });
  near(folded.total, shown.total, 0.001);
  assert.equal(folded.tax_shown, false);
  // the apron group carries the ready mix's tax
  const apronShown = shown.groups.find((g) => g.key === "a1").sell;
  near(folded.groups.find((g) => g.key === "a1").sell, apronShown + 119);
});

test("a hidden line or group drops out of the total; a hidden price still counts", () => {
  const full = price({ show_tax_line: true });
  const noSeal = price({ show_tax_line: true, linesOff: { seal: true } });
  const sealSell = full.groups.flatMap((g) => g.items).find((i) => i.id === "seal").sell;
  near(noSeal.total, full.total - sealSell);
  const noWalk = price({ show_tax_line: true, groupsOff: { a2: true } });
  near(noWalk.total, full.total - full.groups.find((g) => g.key === "a2").sell);
  const priceHidden = price({ show_tax_line: true, pricesOff: { a1: true, lab: true } });
  near(priceHidden.total, full.total);
  assert.equal(priceHidden.groups.find((g) => g.key === "a1").price_hidden, true);
});

test("an add-on is priced and listed, never in the total, and doesn't change the rounding of the rest", () => {
  const p = price({ show_tax_line: true, addons: ["seal"] });
  // without the sealer: cost 3,290 → ×1.15 ÷0.8 = 4,729.38 → 4,750
  assert.equal(p.rounded, 4750);
  near(p.total, 4750 + 119);
  assert.ok(p.addons_total > 0);
  assert.equal(p.groups.flatMap((g) => g.items).find((i) => i.id === "seal").addon, true);
});

test("a discount comes off the price only", () => {
  const p = price({ show_tax_line: true }, { tax_on: true, discount: 250 });
  near(p.total, 5050 + 119 - 250);
  near(p.profit, 5050 - 3480 - 522); // profit shown before the discount, as the budget does
});

test("a blocked budget gives no price, and says why", () => {
  const p = price({}, { tax_on: true, discount: 0 }, [...lines, L({ id: "x", name: "Rebar", unit_cost: null })]);
  assert.equal(p.ok, false);
  assert.ok(p.blocked.some((b) => /Rebar: unit cost/.test(b)));
});

test("draws by % and by $, the gap, and putting the difference on the last draw", () => {
  const total = 5169;
  const res = [{ pct: 10, when: "Deposit" }, { pct: 50, when: "Materials" }, { pct: 40, when: "Completion" }];
  assert.equal(drawsCheck(res, total).ok, true);
  const off = [{ pct: 10, when: "Deposit" }, { amt: 2000, when: "Materials" }, { pct: 40, when: "Completion" }];
  const c = drawsCheck(off, total);
  assert.equal(c.ok, false);
  near(c.gap, 516.9 + 2000 + 2067.6 - total);
  const fixed = fixLastDraw(off, total);
  assert.equal(drawsCheck(fixed, total).ok, true);
  near(drawAmount(fixed[2], total), total - 516.9 - 2000);
  assert.equal(fixLastDraw([], 100)[0].pct, 100);
});

test("templates take the org's name", () => {
  assert.equal(fillOrg("{org} warrants its work.", "Sacco Enterprises"), "Sacco Enterprises warrants its work.");
});

import { parseClauses, plainText, warrantyText, termsText } from "../src/lib/proposal.ts";

test("Dusty's markdown becomes plain text and clauses", () => {
  assert.equal(plainText("## Warranty\n\n**One year** on `workmanship`.\n- cracks excluded"), "Warranty\n\nOne year on workmanship.\ncracks excluded");
  const c = parseClauses("1. **Payment:** 10% down.\n2. **Weather** Rain delays happen.\n\nChanges: In writing only.");
  assert.deepEqual(c, [{ h: "Payment", b: "10% down." }, { h: "Weather", b: "Rain delays happen." }, { h: "Changes", b: "In writing only." }]);
  assert.deepEqual(parseClauses("### 811\nOwner calls 811 first."), [{ h: "811", b: "Owner calls 811 first." }]);
});

test("a template's text with the org's name, and the proposal's own edit wins", () => {
  const tpl = [{ id: "w", kind: "warranty", name: "1-yr", project_types: [], title: "Warranty", body: "{org} warrants it.", clauses: null, starter: true },
    { id: "t", kind: "terms", name: "T", project_types: [], title: "Terms", body: null, clauses: [{ h: "Pay", b: "{org} bills monthly." }], starter: false }];
  const w = warrantyText({ template_id: "w" }, tpl, "Sacco Enterprises");
  assert.equal(w.body, "Sacco Enterprises warrants it."); assert.equal(w.starter, true); assert.equal(w.edited, false);
  const e = warrantyText({ template_id: "w", body: "Mine." }, tpl, "X");
  assert.equal(e.body, "Mine."); assert.equal(e.starter, false); assert.equal(e.title, "Warranty");
  assert.equal(termsText({ template_id: "t" }, tpl, "Sacco").clauses[0].b, "Sacco bills monthly.");
  assert.deepEqual(termsText({ template_id: "t", clauses: [] }, tpl, "Sacco").clauses, []);
});

test("fixing the last draw keeps it a % when the others are %, so a new price still fits", () => {
  const f = fixLastDraw([{ pct: 10, when: "Deposit" }, { pct: 50, when: "Materials" }, { pct: 30, when: "End" }], 5000);
  assert.equal(f[2].pct, 40); assert.equal(f[2].amt, null);
  assert.equal(drawsCheck(f, 7777).ok, true);
});

test("with tax folded in, the lines still add up to their group", () => {
  const p = price({ show_tax_line: false });
  for (const g of p.groups) near(g.items.filter((i) => !i.addon && !i.hidden).reduce((a, i) => a + i.sell, 0), g.sell, 0.001);
});
