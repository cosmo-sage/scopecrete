import { test } from "node:test";
import assert from "node:assert/strict";
import { labelSpeakers } from "../src/lib/dusty/transcript.ts";

const tx = "+12253782458: Hello.\n+12253782458: This is Corey.\n+12255038837: This is Baton Rouge Concreeter.\n+12255038837: Right?";

test("our line is Coy, the other number the customer", () => {
  assert.equal(labelSpeakers(tx, ["+12253782458", "+12255550000"]),
    "Coy (our line): Hello.\nCoy (our line): This is Coy.\nCustomer: This is Baton Rouge Concreeter.\nCustomer: Right?");
});

test("the other side can be named; Corey on their side is left", () => {
  const out = labelSpeakers("+12255038837: Is Corey there?\n(225) 378-2458: Yes", ["2253782458"], "Vendor");
  assert.equal(out, "Vendor: Is Corey there?\nCoy (our line): Yes");
});

test("a number in the middle of a sentence is not a label", () => {
  assert.equal(labelSpeakers("+12255038837: call me at 2255038837 tomorrow", ["2253782458"]), "Customer: call me at 2255038837 tomorrow");
});

test("search snippets joined on one line", () => {
  assert.equal(labelSpeakers("+12253782458: hi +12255038837: patio", ["+12253782458"]), "Coy (our line): hi Customer: patio");
});
