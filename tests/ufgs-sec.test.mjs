// UFGS .SEC sections → Price book cards — `npm test`. Never a price; a unit only when stated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUfgsSec, ufgsRows, decodeSec, looksLikeSec, statedUnit, cleanTitle } from "../src/lib/ufgs-sec.ts";
import { sampleCsv, parseCsv, guessMapping, toRows, findHeader } from "../src/lib/price-import.ts";

// Shaped like a SpecsIntact UFGS section (made up for the test, not copied from one).
const SEC = `<?xml version="1.0"?>
<!DOCTYPE SEC SYSTEM "SI.DTD">
<SEC><HDR>USACE / NAVFAC / AFCEC</HDR>
<SCN>SECTION 03 30 00</SCN>
<STL>CAST-IN-PLACE CONCRETE</STL>
<DTE>08/18</DTE>
<NTE><TXT>NOTE: This guide specification covers cast-in-place concrete. Edit to suit.</TXT></NTE>
<PRT><TTL>PART 1   GENERAL</TTL>
<SPT><TTL>REFERENCES</TTL><TXT>The publications listed below form a part of this specification.</TXT>
<RID><ORG>ASTM INTERNATIONAL (ASTM)</ORG><REF>ASTM C150/C150M</REF><RTL>Standard Specification for Portland Cement</RTL></RID></SPT>
<SPT><TTL>UNIT PRICES</TTL>
<SPT><TTL>Cast-in-Place Concrete</TTL><TXT>Concrete will be measured by the cubic yard.</TXT></SPT></SPT>
</PRT>
<PRT><TTL>PART 2   PRODUCTS</TTL>
<SPT><TTL>SYSTEM DESCRIPTION</TTL><TXT>Provide concrete as specified.</TXT></SPT>
<SPT><TTL>MATERIALS</TTL>
<SPT><TTL>Cementitious Materials</TTL>
<SPT><TTL>Portland Cement</TTL><TXT>ASTM C150/C150M, Type [I] [II] [V], low alkali.</TXT></SPT>
<SPT><TTL>[Fly Ash]</TTL><TXT>ASTM C618, Class F.</TXT><NTE><TXT>NOTE: Delete if not used &amp; adjust.</TXT></NTE></SPT>
</SPT>
<SPT><TTL>Aggregates</TTL><TXT>ASTM C33/C33M, size 57.</TXT>
<SPT><TTL>Aggregate Testing</TTL><TXT>Test per ASTM C1260.</TXT></SPT></SPT>
<SPT><TTL>Water</TTL><TXT>Fresh, clean and potable.</TXT></SPT>
<SPT><TTL>Admixtures</TTL>
<LST><ITM>Air-entraining admixture: ASTM C260/C260M.</ITM>
<ITM>Water-reducing admixture: ASTM C494/C494M, Type A.</ITM>
<ITM>Provide admixtures from one manufacturer where practicable.</ITM></LST></SPT>
<SPT><TTL>Vapor Retarder</TTL><TXT>Polyethylene sheeting, 15 mil, ASTM E1745 Class A. Measured by the square foot.</TXT></SPT>
<SPT><TTL>Curing Compound</TTL><TXT>ASTM C309, Type 1-D, 200 pounds per cubic yard is not a unit.</TXT></SPT>
</SPT>
<SPT><TTL>CONCRETE MIXTURE PROPORTIONS</TTL><TXT>Proportion per ACI 211.1.</TXT></SPT>
<SPT><TTL>TESTS, INSPECTIONS, AND VERIFICATIONS</TTL><TXT>Test as specified.</TXT></SPT>
</PRT>
<PRT><TTL>PART 3   EXECUTION</TTL>
<SPT><TTL>PREPARATION</TTL><SPT><TTL>Form Release Agent</TTL><TXT>Not a Part 2 product.</TXT></SPT></SPT>
</PRT>
</SEC>`;

test("a SpecsIntact section: the group, PART 2's products, no prices, units only when stated", () => {
  assert.ok(looksLikeSec(SEC));
  const s = parseUfgsSec(SEC);
  assert.equal(s.number, "03 30 00");
  assert.equal(s.title, "Cast-in-Place Concrete");
  assert.equal(s.group, "03 30 00 Cast-in-Place Concrete");
  assert.ok(s.part2);
  const names = s.items.map((i) => i.name);
  assert.deepEqual(names, ["Portland Cement", "Fly Ash", "Aggregates", "Water", "Air-entraining admixture", "Water-reducing admixture", "Vapor Retarder", "Curing Compound"]);
  // Part 1 and Part 3 don't leak in; the paperwork and the checks aren't products.
  for (const n of ["Cast-in-Place Concrete", "Form Release Agent", "System Description", "Aggregate Testing", "Concrete Mixture Proportions"]) assert.ok(!names.includes(n), n);
  const fly = s.items.find((i) => i.name === "Fly Ash");
  assert.deepEqual(fly.path, ["Materials", "Cementitious Materials"]);
  assert.equal(fly.text, "ASTM C618, Class F."); // the designer's note is left out
  assert.equal(s.items.find((i) => i.name === "Vapor Retarder").unit, "SF");
  assert.equal(s.items.find((i) => i.name === "Curing Compound").unit, null);
  assert.equal(s.items.find((i) => i.name === "Portland Cement").unit, null);

  const rows = ufgsRows(s);
  assert.equal(rows.length, 8);
  for (const r of rows) {
    assert.equal(r.unit_cost, null);
    assert.equal(r.group, "03 30 00 Cast-in-Place Concrete");
    assert.equal(r.cost_type, "material");
    assert.ok(r.description.startsWith("UFGS 03 30 00 › Materials"));
  }
  const vr = rows.find((r) => r.name === "Vapor Retarder");
  assert.equal(vr.unit, "SF"); assert.deepEqual(vr.problems, []); assert.equal(vr.qty_rule, "per_sqft");
  assert.deepEqual(rows.find((r) => r.name === "Water").problems, ["no unit"]);
});

test("tolerant: lower-case tags, unclosed tags, plain text with numbered headings", () => {
  const loose = `<sec><scn>SECTION 32 13 13<stl>CONCRETE PAVING</stl><prt><ttl>PART 2 PRODUCTS<spt><ttl>2.1 JOINT SEALANT</ttl><txt>ASTM D6690</spt></prt></sec>`;
  const s = parseUfgsSec(loose);
  assert.equal(s.number, "32 13 13");
  assert.equal(s.title, "Concrete Paving");
  assert.deepEqual(s.items.map((i) => i.name), ["Joint Sealant"]);

  const plain = `SECTION 03 11 13\nSTRUCTURAL CAST-IN-PLACE CONCRETE FORMING\n\nPART 1 GENERAL\n1.1 REFERENCES\n\nPART 2 PRODUCTS\n2.1 FORM MATERIALS\n2.1.1 Form Ties\nSnap ties, measured by the each.\n2.1.2 Form Liners\nAs indicated.\n2.2 QUALITY CONTROL\n\nPART 3 EXECUTION\n3.1 FORMWORK\n`;
  const p = parseUfgsSec(plain);
  assert.equal(p.number, "03 11 13");
  assert.equal(p.title, "Structural Cast-in-Place Concrete Forming");
  assert.deepEqual(p.items.map((i) => [i.name, i.unit, i.path.join("/")]), [["Form Ties", "EA", "Form Materials"], ["Form Liners", null, "Form Materials"]]);

  const none = parseUfgsSec("<SEC><SCN>SECTION 01 33 00</SCN><STL>SUBMITTAL PROCEDURES</STL><PRT><TTL>PART 1 GENERAL</TTL></PRT></SEC>");
  assert.equal(none.part2, false); assert.deepEqual(none.items, []);
  assert.equal(looksLikeSec("Name,Unit,Cost\nMesh,sheet,12"), false);
});

test("bytes, units and titles", () => {
  assert.equal(decodeSec(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), "A");
  assert.equal(decodeSec(new Uint8Array([0x93, 0x41, 0x94])), "“A”"); // Windows-1252 quotes
  assert.equal(decodeSec(new Uint8Array([0xff, 0xfe, 0x41, 0x00])), "A");
  assert.equal(statedUnit("Payment will be made per linear foot of curb."), "LF");
  assert.equal(statedUnit("Unit of measure: square yard."), "SY");
  assert.equal(statedUnit("Cement content 520 pounds per cubic yard."), null);
  assert.equal(cleanTitle("2.1.3 PORTLAND CEMENT."), "Portland Cement");
  assert.equal(cleanTitle("ASTM C150 TYPE OF CEMENT"), "ASTM C150 Type of Cement");
});

test("the sample CSV reads back with every column matched and no problems", () => {
  const t = parseCsv(sampleCsv());
  const h = findHeader(t);
  assert.equal(h, 0);
  const m = guessMapping(t[0]);
  for (const k of ["group", "name", "description", "cost_type", "unit", "unit_cost", "markup", "taxable", "vendor", "sku"]) assert.notEqual(m[k], null, k);
  const rows = toRows(t, m);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.problems), [[], [], []]);
  assert.deepEqual(rows.map((r) => r.cost_type), ["material", "labor", "equipment"]);
  assert.equal(rows[0].description, 'Delivered, 4" slump');
});
