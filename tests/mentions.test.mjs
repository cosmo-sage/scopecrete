import { test } from "node:test";
import assert from "node:assert/strict";
import { tagFor, mentionIds, noteParts, plainNote, typingTag, matchMembers, insertTag } from "../src/lib/mentions.ts";

const a = { user_id: "11111111-2222-4333-8444-555555555555", name: "Sam Example", email: "sam@example.com" };
const b = { user_id: "66666666-7777-4888-8999-000000000000", name: null, email: "pat@example.com" };

test("a tag is the name and the member's id, read back once each", () => {
  const body = `Ask ${tagFor(a)} about the pour, and ${tagFor(b)} too. ${tagFor(a)}`;
  assert.equal(tagFor(b), "@[pat](u:66666666-7777-4888-8999-000000000000)");
  assert.deepEqual(mentionIds(body), [a.user_id, b.user_id]);
  assert.equal(plainNote(body), "Ask @Sam Example about the pour, and @pat too. @Sam Example");
  assert.deepEqual(noteParts(`hi ${tagFor(a)}`), [{ text: "hi " }, { text: "@Sam Example", user: a.user_id }]);
});

test("typing @ offers members; an email's @ doesn't", () => {
  assert.deepEqual(typingTag("call @sa", 8), { start: 5, query: "sa" });
  assert.deepEqual(typingTag("@", 1), { start: 0, query: "" });
  assert.equal(typingTag("mail sam@example", 16), null);
  assert.deepEqual(matchMembers([a, b], "ex").map((m) => m.user_id), [a.user_id]);
  assert.deepEqual(matchMembers([a, b], "pat").map((m) => m.user_id), [b.user_id]);
  const r = insertTag("call @sa now", { start: 5, query: "sa" }, a);
  assert.equal(r.text, `call ${tagFor(a)}  now`);
  assert.equal(r.caret, 5 + tagFor(a).length + 1);
});
