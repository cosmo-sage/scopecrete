// quo-intake's pure helpers. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventIdFor, rescueDirection } from "../supabase/functions/quo-intake/rules.ts";

test("texts and calls are stored under the object id, as the handlers store them", () => {
  assert.equal(eventIdFor("message.received", { id: "EVabc" }, { id: "ACmsg" }), "ACmsg");
  assert.equal(eventIdFor("message.delivered", { id: "EVabc" }, { id: "ACmsg" }), "ACmsg");
  assert.equal(eventIdFor("call.completed", { id: "EVabc" }, { id: "ACcall" }), "ACcall");
});

test("call follow-ups are stored under the envelope id, never the call id", () => {
  assert.equal(eventIdFor("call.summary.completed", { id: "EVsum" }, { callId: "ACcall" }), "EVsum");
  assert.equal(eventIdFor("call.recording.completed", {}, { callId: "ACcall" }), "ACcall:call.recording.completed");
});

test("no id at all is null, so the rescue does not store an unkeyed event", () => {
  assert.equal(eventIdFor("message.received", {}, {}), null);
});

test("rescue direction", () => {
  const us = "+12253782458";
  assert.equal(rescueDirection("message.delivered", {}, null, us), "outbound");
  assert.equal(rescueDirection("message.received", {}, "+12255083258", us), "inbound");
  assert.equal(rescueDirection("message.received", {}, us, us), "outbound");
  assert.equal(rescueDirection("call.completed", { direction: "incoming" }, null, us), "inbound");
  assert.equal(rescueDirection("call.completed", { direction: "outgoing" }, null, us), "outbound");
  assert.equal(rescueDirection("call.summary.completed", {}, null, us), null);
});
