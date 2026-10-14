// Dusty's Share button — what it shares. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shareText } from "../src/lib/dusty/share.ts";

const chat = [
  { role: "user", content: "Draft a reply to Ben" },
  { role: "assistant", content: "Here it is.\n\n```scopecrete-plan\n[{\"do\":\"email\",\"mode\":\"reply\",\"conversation\":\"abc\",\"body\":\"Hi Ben\"}]\n```" },
  { role: "user", content: "Thanks" },
  { role: "assistant", content: "Anytime." },
];

test("the last answer alone", () => {
  assert.equal(shareText(chat, "last"), "Anytime.");
  assert.equal(shareText([], "last"), "");
});

test("the whole chat, plan block left out and counted", () => {
  const t = shareText(chat, "chat", "Burgess Ave");
  assert.match(t, /^Burgess Ave\n\nCoy: Draft a reply to Ben\n\nDusty: Here it is\./);
  assert.match(t, /proposed 1 step/);
  assert.doesNotMatch(t, /scopecrete-plan/);
  assert.match(t, /Dusty: Anytime\.$/);
});
