import { test } from "node:test";
import assert from "node:assert/strict";
import { findSelfIdentification, nameBlock, textedEmail } from "../supabase/functions/enrich-contacts/rules.ts";

// Brittany LaRochelle, 2026-10-12: her details in one text, no "this is".
const brittany = {
  id: "m1", kind: "sms", who: "THEM", at: "2026-10-12T16:12:46Z", hasMedia: true,
  text: "Brittany LaRochelle\n8812 David Dr. in Denham Springs\nbritlarochelle@bellsouth.net\nPlease give me an estimate to fix the broken corner of the bottom of my driveway and a separate estimate to fill the grass area I have on the upper side of my driveway.  Thanks!",
};

test("a text that opens with their whole name, then speaks for them, names them", () => {
  assert.equal(nameBlock("Brittany LaRochelle", brittany), true);
  const hit = findSelfIdentification("Brittany LaRochelle", [brittany], []);
  assert.ok(hit);
  assert.equal(hit.turnId, "m1");
  assert.match(hit.quote, /^Brittany LaRochelle \/ 8812 David Dr/);
});

test("not a name block: one word, our side, a transcript, a referral, a name not first", () => {
  assert.equal(nameBlock("Brittany", { ...brittany, text: "Brittany\nmy driveway" }), false);
  assert.equal(nameBlock("Brittany LaRochelle", { ...brittany, who: "US" }), false);
  assert.equal(nameBlock("Brittany LaRochelle", { ...brittany, kind: "call" }), false);
  assert.equal(nameBlock("John Smith", { ...brittany, text: "John Smith\n225-555-0100" }), false);
  assert.equal(nameBlock("John Smith", { ...brittany, text: "Call him\nJohn Smith\nhe needs my help" }), false);
  assert.equal(findSelfIdentification("Britney Lauer", [brittany], []), null);
});

test("the email they texted, once and the same", () => {
  assert.deepEqual(textedEmail([brittany]), { email: "britlarochelle@bellsouth.net", turnId: "m1" });
  const two = { ...brittany, id: "m2", text: "or my husband at bob@example.com" };
  assert.equal(textedEmail([brittany, two]), null);
  assert.equal(textedEmail([{ ...brittany, who: "US" }]), null);
  assert.equal(textedEmail([{ ...brittany, text: "send it to intake-concrete@agentmail.to." }]), null);
  assert.equal(textedEmail([{ ...brittany, text: "Mine is Jo.Doe@Mail.com." }]).email, "jo.doe@mail.com");
});

test("a new job's photos reach two weeks back", async () => {
  const { autoSince } = await import("../src/lib/texted-photos.ts");
  assert.equal(autoSince("2026-10-12T16:50:58Z"), Date.parse("2026-09-28T16:50:58Z"));
  assert.equal(autoSince("not a date"), null);
});
