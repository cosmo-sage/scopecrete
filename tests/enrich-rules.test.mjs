// The name suggester's safety checks. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, worthEnriching, renderConversation } from "../src/lib/enrich/rules.ts";

const turn = (id, who, text, extra = {}) => ({ id, kind: "sms", who, at: "2026-09-24T10:00:00Z", text, hasMedia: false, ...extra });
const base = (o = {}) => ({ classification: "customer", direction_of_ask: "they ask our price", confidence: 80,
  proposed_name: null, proposed_company: null, proposed_role: null, project_type: null, scope_summary: null,
  start_timing: null, length_ft: null, width_ft: null, sqft_stated: null, site_hint: null, has_media: false,
  evidence_turn: 1, evidence_message_id: null, evidence_quote: "x", name_reasoning: "", ...o });

test("our own name is never proposed (the 'Hi Coy' bug)", () => {
  const turns = [turn("m1", "THEM", "Hi Coy, what would you charge for a slab?")];
  const { p } = sanitize(base({ proposed_name: "Coy" }), turns);
  assert.equal(p.proposed_name, null);
});

test("a name THEM never wrote is dropped", () => {
  const turns = [turn("m1", "US", "Thanks Amber"), turn("m2", "THEM", "how much for a driveway")];
  const { p } = sanitize(base({ proposed_name: "Amber" }), turns);
  assert.equal(p.proposed_name, null);
});

test("self-identification survives", () => {
  const turns = [turn("m1", "THEM", "It's Amber with The Arts at Jefferson Heights!")];
  const { p } = sanitize(base({ proposed_name: "Amber" }), turns);
  assert.equal(p.proposed_name, "Amber");
});

test("evidence resolves to a real message in THIS conversation, never an invented id", () => {
  const turns = [turn("m1", "THEM", "a"), turn("m2", "THEM", "b")];
  assert.equal(sanitize(base({ evidence_turn: 2 }), turns).p.evidence_message_id, "m2");
  assert.equal(sanitize(base({ evidence_turn: 99 }), turns).p.evidence_message_id, "m1");
});

test("an unknown classification is forced to 'unknown'", () => {
  const { p } = sanitize(base({ classification: "lead" }), [turn("m1", "THEM", "hello there friend")]);
  assert.equal(p.classification, "unknown");
});

test("a silent missed call is not worth a model call", () => {
  assert.equal(worthEnriching([]), false);
  assert.equal(worthEnriching([turn("m1", "THEM", "hi")]), false);
  assert.equal(worthEnriching([turn("m1", "THEM", "What would you charge for a 20x30 patio?")]), true);
});

test("long threads keep the most recent turns", () => {
  const turns = Array.from({ length: 400 }, (_, i) => turn(`m${i}`, "THEM", `message ${i} ${"x".repeat(60)}`));
  const { text } = renderConversation(turns);
  assert.match(text, /message 399/);
  assert.doesNotMatch(text, /message 0 /);
});
