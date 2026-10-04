import { test } from "node:test";
import assert from "node:assert/strict";
import { plainSpeakers } from "../src/lib/speakers.ts";

test("US and THEM become We and Customer (or Vendor); ordinary words stay", () => {
  assert.equal(plainSpeakers("THEM: Can you come Tuesday? US: Yes."), "Customer: Can you come Tuesday? We: Yes.");
  assert.equal(plainSpeakers("US quoted the drive; THEM said it was high"), "We quoted the drive; Customer said it was high");
  assert.equal(plainSpeakers("THEM: send the invoice", "vendor"), "Vendor: send the invoice");
  assert.equal(plainSpeakers("they told us to call them back"), "they told us to call them back");
  assert.equal(plainSpeakers("priced in en-US dollars, US-made rebar"), "priced in en-US dollars, US-made rebar");
  assert.equal(plainSpeakers(null), null);
});
