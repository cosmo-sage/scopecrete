// Dusty files spam on its own only on evidence in their words. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spamSignal } from "../supabase/functions/enrich-contacts/rules.ts";

const sms = (who, text) => ({ id: `m${Math.random()}`, kind: "sms", who, at: "2026-09-01", text, hasMedia: false });
const PHONE = "+12255550101";

test("real spam from the data is caught, with the line", () => {
  const otp = spamSignal([sms("THEM", "342284 is your Handoff One Time Password.\nGo back to the app")], PHONE);
  assert.equal(otp.kind, "passcode");
  assert.equal(otp.quote, "342284 is your Handoff One Time Password.");
  assert.equal(spamSignal([sms("THEM", "Your code is 55123")], PHONE).kind, "passcode");
  assert.equal(spamSignal([sms("THEM", "Big savings on sealcoat! Reply STOP to opt out")], PHONE).kind, "opt_out");
  assert.equal(spamSignal([sms("THEM", "FINAL NOTICE about your vehicle warranty")], PHONE).kind, "scam");
});

test("a short-code sender is spam evidence", () => {
  assert.equal(spamSignal([sms("THEM", "Your order shipped")], "22395").kind, "short_code");
});

test("ordinary customers and vendors are not", () => {
  for (const t of [
    "Hi Coy, this is Maegan. We tried to run the payment for the website but it failed.",
    "What would you charge for a 20x30 slab? Can you stop by Saturday?",
    "Hey Coy it's Steve from everlasting, still looking for funding on the truck?",
    "Please stop by the office when you can",
    "I need the code for the gate, it's 4411",
  ]) assert.equal(spamSignal([sms("THEM", t)], PHONE), null, t);
});

test("only their words count", () => {
  assert.equal(spamSignal([sms("US", "Reply STOP if you want off my list, ha")], PHONE), null);
});
