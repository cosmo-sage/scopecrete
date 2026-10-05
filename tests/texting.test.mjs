// Texting through Quo (src/lib/texting.ts, Dusty's text step) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toE164, cleanBody, segments, pickLine, quoError } from "../src/lib/texting.ts";
import { cleanAction, describe, parsePlan, RECORD_STEPS } from "../src/lib/dusty/plan.ts";

test("phone numbers become E.164", () => {
  assert.equal(toE164("(225) 555-0100"), "+12255550100");
  assert.equal(toE164("1-225-555-0100"), "+12255550100");
  assert.equal(toE164("+12255550100"), "+12255550100");
  assert.equal(toE164("555-0100"), null);
  assert.equal(toE164(42), null);
});

test("a text has words and fits", () => {
  assert.deepEqual(cleanBody("  hi \r\n there "), { ok: true, body: "hi \n there" });
  assert.equal(cleanBody("   ").ok, false);
  assert.equal(cleanBody("x".repeat(1601)).ok, false);
});

test("segments count like a carrier", () => {
  assert.equal(segments(""), 0);
  assert.equal(segments("x".repeat(160)), 1);
  assert.equal(segments("x".repeat(161)), 2);
  assert.equal(segments("x".repeat(306)), 2);
  assert.equal(segments("Thursday at 9 — ok?"), 1); // the dash is not GSM: 70 a segment
  assert.equal(segments("—".repeat(71)), 2);
  assert.equal(segments("👍".repeat(70)), 1);
});

const L = (id, provider, extra = {}) => ({ id, phone_e164: `+1225555${id.padStart(4, "0")}`, provider, provider_number_id: null, is_primary: false, active: true, ...extra });
test("the line a text goes from", () => {
  const lines = [L("1", "quo", { is_primary: true }), L("2", "quo"), L("3", "other")];
  assert.equal(pickLine(lines, null, null).line.id, "1");
  assert.equal(pickLine(lines, null, "2").line.id, "2"); // the line they last reached
  assert.equal(pickLine(lines, null, "3").line.id, "1"); // not a Quo line → primary
  assert.equal(pickLine(lines, "2", "1").line.id, "2"); // Coy's pick wins
  assert.equal(pickLine(lines, "3", null).ok, false);   // can't send from a non-Quo line
  assert.equal(pickLine(lines, "9", null).ok, false);
  assert.equal(pickLine([L("1", "quo")], null, null).line.id, "1");
  assert.equal(pickLine([L("1", "quo"), L("2", "quo")], null, null).ok, false); // two, no primary: ask
  assert.equal(pickLine([L("3", "other")], null, null).ok, false);
});

test("Quo's refusals in words", () => {
  assert.match(quoError(401, null), /QUO_API_KEY/);
  assert.match(quoError(402, "Insufficient credits"), /Plans & Billing/);
  assert.match(quoError(400, "Phone number is not registered for A2P 10DLC"), /registration/);
  assert.match(quoError(500, "boom"), /\(500\): boom/);
});

const C = "1b2c3d4e-0000-4000-8000-000000000001";
test("Dusty's text step", () => {
  assert.ok(RECORD_STEPS.has("text"));
  assert.deepEqual(cleanAction({ do: "text", contact: C, body: " See you at 9 " }), { do: "text", contact: C, to: null, body: "See you at 9" });
  assert.equal(cleanAction({ do: "text", contact: C, to: "(225) 555-0100", body: "hi" }).to, "+12255550100");
  assert.equal(cleanAction({ do: "text", contact: C, to: "555", body: "hi" }), null);   // not a number: dropped
  assert.equal(cleanAction({ do: "text", contact: "1b2c3d4e", body: "hi" }), null);   // a short ref is no contact
  assert.equal(cleanAction({ do: "text", contact: C, body: "" }), null);
  const a = cleanAction({ do: "text", contact: C, to: "2255550100", body: "On my way" });
  assert.equal(describe(a, { item: () => null, area: () => "" }), "Text them at (225) 555-0100 through Quo: “On my way”");
  const p = parsePlan(`Here it is.\n\`\`\`scopecrete-plan\n[{"do":"text","contact":"${C}","body":"Thursday at 9?"}]\n\`\`\``);
  assert.equal(p.actions.length, 1);
  assert.equal(p.shown, "Here it is.");
});
